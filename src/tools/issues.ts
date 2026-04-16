import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, IssueIdSchema, handleApiError } from "./validation.js";
import { PaperclipApiError } from "../errors.js";

const ISSUES_MAX_LIMIT = 100;
const ISSUES_DEFAULT_LIMIT = 50;

const ListIssuesInput = z.object({
  status: z.string().optional().describe("Comma-separated status values (e.g. 'todo,in_progress')"),
  assigneeAgentId: z.string().optional().describe("Filter by assignee agent ID"),
  projectId: z.string().optional().describe("Filter by project ID"),
  goalId: z.string().optional().describe("Filter by goal ID"),
  labelId: z.string().optional().describe("Filter by label ID"),
  q: z.string().optional().describe("Full-text search query"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(ISSUES_MAX_LIMIT)
    .default(ISSUES_DEFAULT_LIMIT)
    .optional()
    .describe(
      `Maximum number of issues to return (1–${ISSUES_MAX_LIMIT}, default ${ISSUES_DEFAULT_LIMIT})`
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .optional()
    .describe("Number of issues to skip before returning results (default 0)"),
});

const IssueIdInput = IssueIdSchema;

// Some MCP clients serialize array parameters as a JSON-encoded string.
// This preprocess normalizes both forms before Zod validates the array.
const jsonArrayPreprocess = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

const CheckoutIssueInput = z.object({
  issueId: z.string().min(1),
  expectedStatuses: z.preprocess(jsonArrayPreprocess, z.array(z.string())).optional(),
});

const UpdateIssueInput = z.object({
  issueId: z.string().min(1),
  status: z.string().optional(),
  comment: z.string().optional(),
  priority: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  assigneeAgentId: z.string().nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  billingCode: z.string().nullable().optional(),
  labelIds: z.preprocess(jsonArrayPreprocess, z.array(z.string())).optional(),
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
});

const CreateIssueInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  parentId: z.string().optional(),
  goalId: z.string().optional(),
  projectId: z.string().optional(),
  assigneeAgentId: z.string().optional(),
  billingCode: z.string().optional(),
  labelIds: z.preprocess(jsonArrayPreprocess, z.array(z.string())).optional(),
  inheritExecutionWorkspaceFromIssueId: z
    .string()
    .optional()
    .describe("Link to an existing execution workspace (for follow-up tasks on same checkout)"),
});

export const issueTools: ToolDefinition[] = [
  {
    name: "paperclip_list_issues",
    description:
      "List issues for the current company with client-side pagination. " +
      "Optionally filter by status (comma-separated), assigneeAgentId, projectId, goalId, labelId, or full-text search query. " +
      `Use limit (max ${ISSUES_MAX_LIMIT}, default ${ISSUES_DEFAULT_LIMIT}) and offset to page through results. ` +
      "Returns { issues, total, limit, offset } where total is the unsliced count so clients can detect truncation.",
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
        const limit = input.limit ?? ISSUES_DEFAULT_LIMIT;
        const offset = input.offset ?? 0;
        const issues = all.slice(offset, offset + limit);
        return {
          content: [
            { type: "text", text: JSON.stringify({ issues, total: all.length, limit, offset }) },
          ],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_issue",
    description: "Get a single issue by ID, including its full details and ancestors.",
    inputSchema: toJsonSchema(IssueIdInput),
    annotations: { title: "Get issue by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId } = validate(IssueIdInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_heartbeat_context",
    description:
      "Get compact heartbeat context for an issue: state, ancestor summaries, goal/project info, and comment cursor metadata.",
    inputSchema: toJsonSchema(IssueIdInput),
    annotations: { title: "Get issue heartbeat context", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId } = validate(IssueIdInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/heartbeat-context`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_checkout_issue",
    description:
      "Checkout an issue to claim it for work. Returns 409 if owned by another agent — do not retry.",
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

        let conflictErr: PaperclipApiError | undefined;
        try {
          const data = await client.post<unknown>(`/api/issues/${issueId}/checkout`, body);
          return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
          return { content: [{ type: "text", text: JSON.stringify(data) }] };
        } catch {
          throw conflictErr;
        }
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_release_issue",
    description: "Release a checked-out issue without marking it done.",
    inputSchema: toJsonSchema(IssueIdInput),
    annotations: { title: "Release issue checkout", idempotentHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId } = validate(IssueIdInput, args);
        const data = await client.post<unknown>(`/api/issues/${issueId}/release`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_issue",
    description:
      "Update an issue's status, priority, title, description, assignee, goal, project, parent, billing code, execution lock fields, or add a comment. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(UpdateIssueInput),
    annotations: { title: "Update issue fields", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, ...rest } = validate(UpdateIssueInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/issues/${issueId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_issue",
    description:
      "Create a new issue. companyId is injected from auth config. Run ID header is injected automatically.",
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
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
