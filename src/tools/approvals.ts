import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, handleApiError } from "./validation.js";

const ApprovalIdInput = z.object({
  approvalId: z.string().min(1).describe("Approval UUID"),
});

const ListApprovalsInput = z.object({
  status: z.string().optional().describe("Filter by status (e.g. 'pending,approved')"),
});

const CreateApprovalInput = z.object({
  title: z.string().min(1).describe("Approval request title"),
  description: z.string().optional().describe("Description / justification (markdown)"),
  linkedIssueIds: z.array(z.string()).optional().describe("Issue UUIDs to link to this approval"),
});

const ApprovalCommentInput = z.object({
  approvalId: z.string().min(1).describe("Approval UUID"),
  body: z.string().min(1).describe("Comment body (markdown)"),
});

const RejectInput = z.object({
  approvalId: z.string().min(1).describe("Approval UUID"),
  reason: z.string().optional().describe("Reason for rejection"),
});

const RequestRevisionInput = z.object({
  approvalId: z.string().min(1).describe("Approval UUID"),
  feedback: z.string().optional().describe("Feedback on what needs to change"),
});

const ResubmitInput = z.object({
  approvalId: z.string().min(1).describe("Approval UUID"),
  comment: z.string().optional().describe("Summary of changes made"),
});

const CreateAgentHireInput = z.object({
  name: z.string().min(1).describe("Agent display name"),
  role: z.string().min(1).describe("Agent role (e.g. engineer, cto)"),
  title: z.string().optional().describe("Job title"),
  capabilities: z.string().optional().describe("Free-text capability description"),
  goalId: z.string().optional().describe("Goal UUID to link the hire to"),
  projectId: z.string().optional().describe("Project UUID to associate"),
});

export const approvalTools: ToolDefinition[] = [
  {
    name: "paperclip_list_approvals",
    description:
      "List approval requests for the current company. Optionally filter by status (comma-separated).",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Comma-separated status values (e.g. 'pending,approved')",
        },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(ListApprovalsInput, args);
        const params = new URLSearchParams();
        if (input.status) params.set("status", input.status);
        const qs = params.toString();
        const path = `/api/companies/${client.companyId}/approvals${qs ? `?${qs}` : ""}`;
        const data = await client.get<unknown>(path);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_approval",
    description: "Get a single approval request by ID, including its status and linked issues.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval UUID" },
      },
      required: ["approvalId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId } = validate(ApprovalIdInput, args);
        const data = await client.get<unknown>(`/api/approvals/${approvalId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_approval",
    description:
      "Create a new approval request. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Approval request title" },
        description: { type: "string", description: "Description / justification (markdown)" },
        linkedIssueIds: {
          type: "array",
          items: { type: "string" },
          description: "Issue UUIDs to link to this approval",
        },
      },
      required: ["title"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateApprovalInput, args);
        const body: Record<string, unknown> = { title: input.title };
        if (input.description !== undefined) body.description = input.description;
        if (input.linkedIssueIds !== undefined) body.linkedIssueIds = input.linkedIssueIds;
        const data = await client.post<unknown>(
          `/api/companies/${client.companyId}/approvals`,
          body
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_approve",
    description: "Approve an approval request. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval UUID" },
      },
      required: ["approvalId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId } = validate(ApprovalIdInput, args);
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/approve`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_reject",
    description: "Reject an approval request. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval UUID" },
        reason: { type: "string", description: "Reason for rejection" },
      },
      required: ["approvalId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId, reason } = validate(RejectInput, args);
        const body: Record<string, unknown> = {};
        if (reason !== undefined) body.reason = reason;
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/reject`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_request_revision",
    description:
      "Request a revision on a pending approval. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval UUID" },
        feedback: { type: "string", description: "Feedback on what needs to change" },
      },
      required: ["approvalId"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId, feedback } = validate(RequestRevisionInput, args);
        const body: Record<string, unknown> = {};
        if (feedback !== undefined) body.feedback = feedback;
        const data = await client.post<unknown>(
          `/api/approvals/${approvalId}/request-revision`,
          body
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_resubmit_approval",
    description:
      "Resubmit an approval request after addressing revision feedback. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval UUID" },
        comment: { type: "string", description: "Summary of changes made" },
      },
      required: ["approvalId"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId, comment } = validate(ResubmitInput, args);
        const body: Record<string, unknown> = {};
        if (comment !== undefined) body.comment = comment;
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/resubmit`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_list_approval_comments",
    description: "List comments on an approval request.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval UUID" },
      },
      required: ["approvalId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId } = validate(ApprovalIdInput, args);
        const data = await client.get<unknown>(`/api/approvals/${approvalId}/comments`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_add_approval_comment",
    description:
      "Post a markdown comment on an approval request. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval UUID" },
        body: { type: "string", description: "Comment body (markdown)" },
      },
      required: ["approvalId", "body"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId, body } = validate(ApprovalCommentInput, args);
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/comments`, { body });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_agent_hire",
    description:
      "Create an agent hire request (triggers the approval and onboarding flow). Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent display name" },
        role: { type: "string", description: "Agent role (e.g. engineer, cto)" },
        title: { type: "string", description: "Job title" },
        capabilities: { type: "string", description: "Free-text capability description" },
        goalId: { type: "string", description: "Goal UUID to link the hire to" },
        projectId: { type: "string", description: "Project UUID to associate" },
      },
      required: ["name", "role"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateAgentHireInput, args);
        const body: Record<string, unknown> = { name: input.name, role: input.role };
        if (input.title !== undefined) body.title = input.title;
        if (input.capabilities !== undefined) body.capabilities = input.capabilities;
        if (input.goalId !== undefined) body.goalId = input.goalId;
        if (input.projectId !== undefined) body.projectId = input.projectId;
        const data = await client.post<unknown>(
          `/api/companies/${client.companyId}/agent-hires`,
          body
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
