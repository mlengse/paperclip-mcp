import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, IssueIdSchema, handleApiError } from "./validation.js";
import { PaperclipApiError } from "../errors.js";

const ListIssuesInput = z.object({
  status: z.string().optional(),
  assigneeAgentId: z.string().optional(),
  projectId: z.string().optional(),
  goalId: z.string().optional(),
  labelId: z.string().optional(),
  q: z.string().optional(),
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
      "List issues for the current company. Optionally filter by status (comma-separated), assigneeAgentId, projectId, goalId, labelId, or full-text search query.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Comma-separated status values (e.g. 'todo,in_progress')",
        },
        assigneeAgentId: { type: "string", description: "Filter by assignee agent ID" },
        projectId: { type: "string", description: "Filter by project ID" },
        goalId: { type: "string", description: "Filter by goal ID" },
        labelId: { type: "string", description: "Filter by label ID" },
        q: { type: "string", description: "Full-text search query" },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
        const data = await client.get<unknown>(path);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_issue",
    description: "Get a single issue by ID, including its full details and ancestors.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-20)" },
      },
      required: ["issueId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier" },
      },
      required: ["issueId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID to check out" },
        expectedStatuses: {
          type: "array",
          items: { type: "string" },
          description: "Expected current statuses (e.g. ['todo', 'backlog'])",
        },
      },
      required: ["issueId"],
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
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

        // Stale executionRunId with no active holder: release the lock and retry once.
        // If release or retry fails, surface the original 409 unchanged.
        try {
          await client.post<unknown>(`/api/issues/${issueId}/release`);
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
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID to release" },
      },
      required: ["issueId"],
    },
    annotations: { idempotentHint: true, openWorldHint: false },
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
      "Update an issue's status, priority, title, description, assignee, goal, project, parent, billing code, or add a comment. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID to update" },
        status: { type: "string", description: "New status value" },
        comment: { type: "string", description: "Comment to post alongside the update" },
        priority: { type: "string", description: "New priority value" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description (markdown)" },
        assigneeAgentId: {
          type: ["string", "null"],
          description: "Reassign to agent ID, or null to unassign",
        },
        assigneeUserId: {
          type: ["string", "null"],
          description: "Reassign to board/human user ID, or null to unassign",
        },
        goalId: {
          type: ["string", "null"],
          description: "Move issue to a different goal, or null to unlink",
        },
        projectId: {
          type: ["string", "null"],
          description: "Move issue to a different project, or null to unlink",
        },
        parentId: {
          type: ["string", "null"],
          description: "Reparent issue (make sub-task of another), or null to unparent",
        },
        billingCode: {
          type: ["string", "null"],
          description: "Cross-team billing attribution, or null to clear",
        },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to apply to the issue (replaces existing labels)",
        },
      },
      required: ["issueId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Issue title (required)" },
        description: { type: "string", description: "Issue description (markdown)" },
        status: { type: "string", description: "Initial status (default: todo)" },
        priority: { type: "string", description: "Priority level" },
        parentId: { type: "string", description: "Parent issue ID (required for subtasks)" },
        goalId: { type: "string", description: "Goal ID to link the issue to" },
        projectId: { type: "string", description: "Project ID to assign to" },
        assigneeAgentId: { type: "string", description: "Agent ID to assign to" },
        billingCode: { type: "string", description: "Cross-team billing attribution code" },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to apply to the new issue",
        },
        inheritExecutionWorkspaceFromIssueId: {
          type: "string",
          description:
            "Link to an existing execution workspace (for follow-up tasks on same checkout/worktree)",
        },
      },
      required: ["title"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
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
