import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolDefinition } from "./index.js";

function validate<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new McpError(ErrorCode.InvalidParams, result.error.message);
  }
  return result.data;
}

const ListIssuesInput = z.object({
  status: z.string().optional(),
  assigneeAgentId: z.string().optional(),
  projectId: z.string().optional(),
  q: z.string().optional(),
});

const IssueIdInput = z.object({
  issueId: z.string().min(1),
});

const CheckoutIssueInput = z.object({
  issueId: z.string().min(1),
  expectedStatuses: z.array(z.string()).optional(),
});

const UpdateIssueInput = z.object({
  issueId: z.string().min(1),
  status: z.string().optional(),
  comment: z.string().optional(),
  priority: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  assigneeAgentId: z.string().nullable().optional(),
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
});

export const issueTools: ToolDefinition[] = [
  {
    name: "paperclip_list_issues",
    description:
      "List issues for the current company. Optionally filter by status (comma-separated), assigneeAgentId, projectId, or full-text search query.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Comma-separated status values (e.g. 'todo,in_progress')",
        },
        assigneeAgentId: { type: "string", description: "Filter by assignee agent ID" },
        projectId: { type: "string", description: "Filter by project ID" },
        q: { type: "string", description: "Full-text search query" },
      },
      required: [],
    },
    async handler(args, client) {
      const input = validate(ListIssuesInput, args);
      const params = new URLSearchParams();
      if (input.status) params.set("status", input.status);
      if (input.assigneeAgentId) params.set("assigneeAgentId", input.assigneeAgentId);
      if (input.projectId) params.set("projectId", input.projectId);
      if (input.q) params.set("q", input.q);
      const qs = params.toString();
      const path = `/api/companies/${client.companyId}/issues${qs ? `?${qs}` : ""}`;
      const data = await client.get<unknown>(path);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
    async handler(args, client) {
      const { issueId } = validate(IssueIdInput, args);
      const data = await client.get<unknown>(`/api/issues/${issueId}`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
    async handler(args, client) {
      const { issueId } = validate(IssueIdInput, args);
      const data = await client.get<unknown>(`/api/issues/${issueId}/heartbeat-context`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
    async handler(args, client) {
      const { issueId, expectedStatuses } = validate(CheckoutIssueInput, args);
      const body: Record<string, unknown> = {};
      if (expectedStatuses) body["expectedStatuses"] = expectedStatuses;
      const data = await client.post<unknown>(`/api/issues/${issueId}/checkout`, body);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
    async handler(args, client) {
      const { issueId } = validate(IssueIdInput, args);
      const data = await client.post<unknown>(`/api/issues/${issueId}/release`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
  {
    name: "paperclip_update_issue",
    description:
      "Update an issue's status, priority, title, description, assignee, or add a comment. Run ID header is injected automatically.",
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
      },
      required: ["issueId"],
    },
    async handler(args, client) {
      const { issueId, ...rest } = validate(UpdateIssueInput, args);
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) body[k] = v;
      }
      const data = await client.patch<unknown>(`/api/issues/${issueId}`, body);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
      },
      required: ["title"],
    },
    async handler(args, client) {
      const input = validate(CreateIssueInput, args);
      const body: Record<string, unknown> = { title: input.title };
      if (input.description !== undefined) body["description"] = input.description;
      if (input.status !== undefined) body["status"] = input.status;
      if (input.priority !== undefined) body["priority"] = input.priority;
      if (input.parentId !== undefined) body["parentId"] = input.parentId;
      if (input.goalId !== undefined) body["goalId"] = input.goalId;
      if (input.projectId !== undefined) body["projectId"] = input.projectId;
      if (input.assigneeAgentId !== undefined) body["assigneeAgentId"] = input.assigneeAgentId;
      const data = await client.post<unknown>(`/api/companies/${client.companyId}/issues`, body);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
];
