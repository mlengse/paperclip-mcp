import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  IssueIdSchema,
  handleApiError,
  StatusSchema,
  PrioritySchema,
  composeDescription,
} from "./validation.js";
import { PaperclipApiError } from "../errors.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatIssueList,
  formatSingleIssue,
  formatGenericList,
  formatResult,
  applyCharLimit,
  paginate,
} from "./format.js";

const ListIssuesInput = z
  .object({
    status: z
      .string()
      .optional()
      .describe("Comma-separated status values (e.g. 'todo,in_progress')"),
    assigneeAgentId: z.string().optional().describe("Filter by assignee agent ID"),
    projectId: z.string().optional().describe("Filter by project ID"),
    goalId: z.string().optional().describe("Filter by goal ID"),
    labelId: z.string().optional().describe("Filter by label ID"),
    q: z.string().optional().describe("Full-text search query"),
    limit: PaginationLimitSchema.describe("Maximum number of issues to return (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe(
      "Number of issues to skip before returning results (default 0)"
    ),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const IssueIdInput = IssueIdSchema.strict();

const GetHeartbeatContextInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-42)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetIssueInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-42)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

// Some MCP clients serialize array parameters as a JSON-encoded string.
// This preprocess normalizes both forms before Zod validates the array.
const jsonArrayPreprocess = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

const CheckoutIssueInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
    expectedStatuses: z
      .preprocess(jsonArrayPreprocess, z.array(z.string()))
      .optional()
      .describe(
        "Expected statuses for atomic validation — checkout fails with 409 if current status is not in this list"
      ),
  })
  .strict();

const UpdateIssueInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
    status: StatusSchema.optional().describe("New status"),
    comment: z.string().optional().describe("Comment to add alongside the update"),
    priority: PrioritySchema.optional().describe("New priority level"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description (markdown)"),
    assigneeAgentId: z
      .string()
      .nullable()
      .optional()
      .describe("Assignee agent UUID; null to unassign"),
    assigneeUserId: z
      .string()
      .nullable()
      .optional()
      .describe("Assignee user UUID; null to unassign"),
    goalId: z.string().nullable().optional().describe("Goal UUID; null to unlink"),
    projectId: z.string().nullable().optional().describe("Project UUID; null to unlink"),
    parentId: z.string().nullable().optional().describe("Parent issue UUID; null to unlink"),
    billingCode: z
      .string()
      .nullable()
      .optional()
      .describe("Billing code for cost tracking; null to clear"),
    labelIds: z
      .preprocess(jsonArrayPreprocess, z.array(z.string()))
      .optional()
      .describe("Label UUIDs to set (replaces existing set); pass [] to clear all labels"),
    executionRunId: z
      .string()
      .nullable()
      .optional()
      .describe("Execution run ID holding the checkout lock; pass null to clear a stale lock"),
    executionLockedAt: z
      .string()
      .nullable()
      .optional()
      .describe("ISO timestamp of when the execution lock was acquired; pass null to clear"),
  })
  .strict();

const CreateIssueInput = z
  .object({
    title: z.string().min(1).describe("Issue title"),
    description: z.string().optional().describe("Issue description (markdown)"),
    status: StatusSchema.optional().describe("Initial status (default: backlog)"),
    priority: PrioritySchema.optional().describe("Priority level"),
    parentId: z.string().optional().describe("Parent issue UUID"),
    goalId: z.string().optional().describe("Goal UUID to link the issue to"),
    projectId: z.string().optional().describe("Project UUID to associate"),
    assigneeAgentId: z.string().optional().describe("Assignee agent UUID"),
    billingCode: z.string().optional().describe("Billing code for cost tracking"),
    labelIds: z
      .preprocess(jsonArrayPreprocess, z.array(z.string()))
      .optional()
      .describe("Label UUIDs to apply"),
    inheritExecutionWorkspaceFromIssueId: z
      .string()
      .optional()
      .describe("Link to an existing execution workspace (for follow-up tasks on same checkout)"),
  })
  .strict();

export const issueTools: ToolDefinition[] = [
  {
    name: "paperclip_list_issues",
    description: composeDescription({
      summary: "List issues for the current company with filtering and pagination.",
      args: [
        '- status: string (optional) — Comma-separated statuses (example: "todo,in_progress")',
        '- assigneeAgentId: string (optional) — Filter by assignee agent UUID (example: "agt_abc")',
        "- projectId: string (optional) — Filter by project UUID",
        "- goalId: string (optional) — Filter by goal UUID",
        "- labelId: string (optional) — Filter by label UUID",
        '- q: string (optional) — Full-text search query (example: "auth bug")',
        "- limit: integer (optional) — Max results to return, 1–100 (default 50)",
        "- offset: integer (optional) — Skip N results for pagination (default 0)",
      ],
      returns:
        "Pagination envelope { items: Issue[], total, count, offset, limit, has_more, next_offset } with up to 50 issues per page (default, max 100).",
      examples: {
        useWhen: "scanning the board for todo issues assigned to a specific agent",
        dontUseWhen: "you need a single issue's full details — use paperclip_get_issue instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListIssuesInput),
    annotations: { title: "List issues", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(ListIssuesInput, args);
        const params = new URLSearchParams();
        if (input.status) params.set("status", input.status);
        if (input.assigneeAgentId) params.set("assigneeAgentId", input.assigneeAgentId);
        if (input.projectId) params.set("projectId", input.projectId);
        if (input.goalId) params.set("goalId", input.goalId);
        if (input.labelId) params.set("labelId", input.labelId);
        if (input.q) params.set("q", input.q);
        const qs = params.toString();
        const path = `/api/companies/${client.companyId}/issues${qs ? `?${qs}` : ""}`;
        const all = await client.get<unknown[]>(path);
        const envelope = paginate(all, { limit: input.limit, offset: input.offset });
        const fmt = input.response_format ?? "markdown";
        const text =
          fmt === "json" ? formatJson(envelope) : formatIssueList(envelope.items, envelope);
        const hint = "Use filters (projectId, status, assigneeAgentId, offset) to narrow results.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_issues", resource: "issue" });
      }
    },
  },
  {
    name: "paperclip_get_issue",
    description: composeDescription({
      summary: "Get a single issue by ID, including full details and ancestor chain.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Issue object: id, identifier, title, description, status, priority, assigneeAgentId, projectId, goalId, parentId, labelIds, executionRunId, ancestors, createdAt, updatedAt.",
      examples: {
        useWhen: "reading a specific issue's full state before making changes",
        dontUseWhen:
          "you need a list of issues — use paperclip_list_issues or paperclip_get_inbox instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
      ],
    }),
    inputSchema: toJsonSchema(GetIssueInput),
    annotations: { title: "Get issue by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, response_format: fmt } = validate(GetIssueInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}`);
        const text = (fmt ?? "markdown") === "json" ? formatJson(data) : formatSingleIssue(data);
        const hint = "Entity response too large. This entity may have oversized fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_issue", resource: "issue" });
      }
    },
  },
  {
    name: "paperclip_get_heartbeat_context",
    description: composeDescription({
      summary:
        "Get compact heartbeat context for an issue: state, ancestors, goal/project, and comment cursor.",
      args: ['- issueId: string — Issue ID or identifier (example: "PAP-42")'],
      returns:
        "Compact context object: issue state, ancestor summaries, goal/project info, lastCommentId cursor for incremental comment fetching.",
      examples: {
        useWhen:
          "orienting yourself on an issue at the start of a heartbeat run without loading all comments",
        dontUseWhen: "you need the full issue record — use paperclip_get_issue for complete fields",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
      ],
    }),
    inputSchema: toJsonSchema(GetHeartbeatContextInput),
    annotations: { title: "Get issue heartbeat context", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, response_format: fmt } = validate(GetHeartbeatContextInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/heartbeat-context`);
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(data)
            : formatGenericList(data, "Heartbeat Context");
        const hint = "Entity response too large. This entity may have oversized fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_heartbeat_context" });
      }
    },
  },
  {
    name: "paperclip_checkout_issue",
    description: composeDescription({
      summary: "Claim an issue for work by checking it out to the current agent.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- expectedStatuses: string[] (optional) — Checkout fails if current status not in list (example: ["todo"])',
      ],
      returns: "Returns the updated issue object with executionRunId set to the current run.",
      examples: {
        useWhen:
          "claiming an assigned issue before starting work — pass expectedStatuses to guard kanban column",
        dontUseWhen: "you only need to read the issue — use paperclip_get_issue instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
        "- 409: conflict — issue is checked out by another agent or status mismatch → do NOT retry; post a wake-mismatch comment and exit",
        "- 422: invalid state transition → issue may already be in a terminal state",
      ],
    }),
    inputSchema: toJsonSchema(CheckoutIssueInput),
    annotations: {
      title: "Check out issue for work",
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { issueId, expectedStatuses } = validate(CheckoutIssueInput, args);
        const body: Record<string, unknown> = { agentId: client.agentId };
        if (expectedStatuses) body["expectedStatuses"] = expectedStatuses;

        const writeHint = "Server response too large; the operation likely succeeded.";
        let conflictErr: PaperclipApiError | undefined;
        try {
          const data = await client.post<unknown>(`/api/issues/${issueId}/checkout`, body);
          return {
            content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), writeHint) }],
          };
        } catch (err) {
          if (!(err instanceof PaperclipApiError) || err.status !== 409) throw err;
          conflictErr = err;
        }

        // Parse the 409 body to distinguish a stale execution lock from an active hold.
        // The API returns details.checkoutRunId=null when no agent actively holds the checkout.
        const details = (conflictErr.body as Record<string, unknown>)?.["details"];
        const checkoutRunId = (details as Record<string, unknown> | undefined)?.["checkoutRunId"];

        // Active holder — propagate 409 immediately without attempting release.
        if (checkoutRunId !== null) throw conflictErr;

        // Stale executionRunId with no active holder: release the lock, verify it was
        // actually cleared, then retry checkout once. If release fails, surface original 409.
        let releaseBody: Record<string, unknown>;
        try {
          releaseBody = await client.post<Record<string, unknown>>(
            `/api/issues/${issueId}/release`
          );
        } catch {
          throw conflictErr;
        }

        // Verify the release actually cleared executionRunId before retrying checkout.
        // The platform release endpoint may return 200 without clearing the lock in the
        // database (PAP-125). Detect this by inspecting the release response body.
        const runIdAfterRelease = releaseBody["executionRunId"];
        if (runIdAfterRelease !== null && runIdAfterRelease !== undefined) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  `Auto-release returned 200 but executionRunId is still set (${runIdAfterRelease}). ` +
                  `The server-side release endpoint did not clear the lock. ` +
                  `Manual board intervention required.`,
              },
            ],
          };
        }

        // Lock is confirmed cleared — retry checkout once.
        try {
          const data = await client.post<unknown>(`/api/issues/${issueId}/checkout`, body);
          return {
            content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), writeHint) }],
          };
        } catch {
          throw conflictErr;
        }
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_checkout_issue", resource: "issue" });
      }
    },
  },
  // idempotentHint omitted — a double-release may return 409; verify against live API in Stage 8b and update if confirmed idempotent.
  {
    name: "paperclip_release_issue",
    description: composeDescription({
      summary: "Release a checked-out issue back to the board without marking it done.",
      args: ['- issueId: string — Issue ID or identifier (example: "PAP-42")'],
      returns: "Returns the updated issue object with executionRunId cleared.",
      examples: {
        useWhen:
          "abandoning work mid-run due to a blocker or wake-mismatch; issue returns to assignable state",
        dontUseWhen:
          "you finished the work — use paperclip_update_issue with status:'in_review' or 'done' instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
        "- 409: issue is not checked out by the current agent → check current issue state with paperclip_get_issue",
      ],
    }),
    inputSchema: toJsonSchema(IssueIdInput),
    annotations: { title: "Release issue checkout", openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId } = validate(IssueIdInput, args);
        const data = await client.post<unknown>(`/api/issues/${issueId}/release`);
        const hint = "Server response too large; the operation likely succeeded.";
        return { content: [{ type: "text", text: applyCharLimit(formatResult(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_release_issue", resource: "issue" });
      }
    },
  },
  {
    name: "paperclip_update_issue",
    description: composeDescription({
      summary:
        "Update one or more fields on an issue; optionally attach a comment in the same call.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        "- status: enum — backlog|todo|in_progress|in_review|done|blocked|cancelled",
        "- priority: enum — critical|high|medium|low",
        "- title: string — New title",
        "- description: string — New description (markdown)",
        "- comment: string — Comment to post with this update",
        "- assigneeAgentId: string|null — Agent UUID; null to unassign",
        "- assigneeUserId: string|null — User UUID; null to unassign",
        "- goalId: string|null — Goal UUID; null to unlink",
        "- projectId: string|null — Project UUID; null to unlink",
        "- parentId: string|null — Parent issue UUID; null to detach",
        "- billingCode: string|null — Billing code; null to clear",
        "- labelIds: string[] — Replaces label set; [] clears all",
        "- executionRunId: string|null — null to clear stale run lock",
        "- executionLockedAt: string|null — ISO lock timestamp; null to clear",
      ],
      returns: "Returns the updated issue object with all fields.",
      examples: {
        useWhen: "transitioning an issue to in_review and posting a @QA comment in one call",
        dontUseWhen: "you need to claim the issue — use paperclip_checkout_issue first",
      },
      errors: [
        "- 400: validation failure → check status/priority enum values and field types",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
        "- 422: invalid state transition → check current status with paperclip_get_issue",
      ],
    }),
    inputSchema: toJsonSchema(UpdateIssueInput),
    annotations: {
      title: "Update issue fields",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { issueId, ...rest } = validate(UpdateIssueInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/issues/${issueId}`, body);
        const text = applyCharLimit(
          JSON.stringify(data),
          "Server response too large; the operation likely succeeded."
        );
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_update_issue", resource: "issue" });
      }
    },
  },
  {
    name: "paperclip_create_issue",
    description: composeDescription({
      summary: "Create a new issue in the current company.",
      args: [
        "- title: string — Issue title (required)",
        "- description: string (optional) — Issue description (markdown)",
        "- status: enum (optional) — Initial status; pass 'backlog' explicitly (API default is todo)",
        "- priority: enum (optional) — Priority: critical | high | medium | low",
        "- parentId: string (optional) — Parent issue UUID for sub-tasks",
        "- goalId: string (optional) — Goal UUID to link the issue",
        "- projectId: string (optional) — Project UUID to associate",
        "- assigneeAgentId: string (optional) — Assignee agent UUID",
        "- billingCode: string (optional) — Billing code for cost tracking",
        "- labelIds: string[] (optional) — Label UUIDs to apply",
        "- inheritExecutionWorkspaceFromIssueId: string (optional) — Inherit workspace from another issue",
      ],
      returns:
        "Returns the created issue object with all fields including the assigned identifier (e.g. PAP-42).",
      examples: {
        useWhen:
          "filing a new bug, MCP tool failure, or gap discovered mid-run for Scrum Master to triage",
        dontUseWhen: "the issue already exists — use paperclip_update_issue to modify it",
      },
      errors: [
        "- 400: validation failure → ensure title is non-empty and status/priority are valid enums",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: referenced goalId or projectId not found → verify with paperclip_list_goals or paperclip_list_projects",
      ],
    }),
    inputSchema: toJsonSchema(CreateIssueInput),
    annotations: { title: "Create new issue", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateIssueInput, args);
        const body: Record<string, unknown> = { title: input.title };
        if (input.description !== undefined) body["description"] = input.description;
        if (input.status !== undefined) body["status"] = input.status;
        if (input.priority !== undefined) body["priority"] = input.priority;
        if (input.parentId !== undefined) body["parentId"] = input.parentId;
        if (input.goalId !== undefined) body["goalId"] = input.goalId;
        if (input.projectId !== undefined) body["projectId"] = input.projectId;
        if (input.assigneeAgentId !== undefined) body["assigneeAgentId"] = input.assigneeAgentId;
        if (input.billingCode !== undefined) body["billingCode"] = input.billingCode;
        if (input.labelIds !== undefined) body["labelIds"] = input.labelIds;
        if (input.inheritExecutionWorkspaceFromIssueId !== undefined)
          body["inheritExecutionWorkspaceFromIssueId"] = input.inheritExecutionWorkspaceFromIssueId;
        const data = await client.post<unknown>(`/api/companies/${client.companyId}/issues`, body);
        const text = applyCharLimit(
          JSON.stringify(data),
          "Server response too large; the operation likely succeeded."
        );
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_create_issue", resource: "issue" });
      }
    },
  },
];
