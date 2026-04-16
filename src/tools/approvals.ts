import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  handleApiError,
  ApprovalTypeSchema,
  composeDescription,
} from "./validation.js";
import { ResponseFormatSchema, formatJson, formatGenericList, applyCharLimit } from "./format.js";

const ApprovalIdInput = z
  .object({
    approvalId: z.string().min(1).describe("Approval UUID"),
  })
  .strict();

const ListApprovalsInput = z
  .object({
    status: z.string().optional().describe("Filter by status (e.g. 'pending,approved')"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetApprovalInput = z
  .object({
    approvalId: z.string().min(1).describe("Approval UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const ListApprovalCommentsInput = z
  .object({
    approvalId: z.string().min(1).describe("Approval UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const CreateApprovalInput = z
  .object({
    type: ApprovalTypeSchema.describe(
      "Approval type: hire_agent | approve_ceo_strategy | budget_override_required"
    ),
    payload: z
      .record(z.string(), z.unknown())
      .describe("Type-specific payload object (required by the API)"),
    requestedByAgentId: z
      .string()
      .optional()
      .describe("Agent UUID of the requester (defaults to caller)"),
  })
  .strict();

const ApprovalCommentInput = z
  .object({
    approvalId: z.string().min(1).describe("Approval UUID"),
    body: z.string().min(1).describe("Comment body (markdown)"),
  })
  .strict();

const RejectInput = z
  .object({
    approvalId: z.string().min(1).describe("Approval UUID"),
    reason: z.string().optional().describe("Reason for rejection"),
  })
  .strict();

const RequestRevisionInput = z
  .object({
    approvalId: z.string().min(1).describe("Approval UUID"),
    feedback: z.string().optional().describe("Feedback on what needs to change"),
  })
  .strict();

const ResubmitInput = z
  .object({
    approvalId: z.string().min(1).describe("Approval UUID"),
    comment: z.string().optional().describe("Summary of changes made"),
  })
  .strict();

const CreateAgentHireInput = z
  .object({
    name: z.string().min(1).describe("Agent display name"),
    role: z.string().min(1).describe("Agent role (e.g. engineer, cto)"),
    title: z.string().optional().describe("Job title"),
    capabilities: z.string().optional().describe("Free-text capability description"),
    goalId: z.string().optional().describe("Goal UUID to link the hire to"),
    projectId: z.string().optional().describe("Project UUID to associate"),
  })
  .strict();

export const approvalTools: ToolDefinition[] = [
  {
    name: "paperclip_list_approvals",
    description: composeDescription({
      summary: "List approval requests for the current company.",
      args: [
        '- status: string (optional) — Comma-separated status filter (example: "pending,approved")',
      ],
      returns:
        "Array of approval objects: id, type, status, payload, requestedByAgentId, createdAt.",
      examples: {
        useWhen: "scanning for pending approval requests before escalating or following up",
        dontUseWhen: "you need a single approval's details — use paperclip_get_approval instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListApprovalsInput),
    annotations: { title: "List approval requests", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(ListApprovalsInput, args);
        const params = new URLSearchParams();
        if (input.status) params.set("status", input.status);
        const qs = params.toString();
        const path = `/api/companies/${client.companyId}/approvals${qs ? `?${qs}` : ""}`;
        const data = await client.get<unknown>(path);
        const fmt = input.response_format ?? "markdown";
        const text = fmt === "json" ? formatJson(data) : formatGenericList(data, "Approvals");
        const hint = "Response too large. Filter by status to narrow results.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_approval",
    description: composeDescription({
      summary:
        "Get a single approval request by ID. Linked issues are not included in this response.",
      args: ['- approvalId: string — Approval UUID (example: "apr_abc123")'],
      returns:
        "Approval object: id, type, status, payload, requestedByAgentId, createdAt, updatedAt.",
      examples: {
        useWhen:
          "checking the current status or payload of a specific approval before acting on it",
        dontUseWhen:
          "you need a list of approvals — use paperclip_list_approvals with a status filter",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: approval not found → verify ID with paperclip_list_approvals",
      ],
    }),
    inputSchema: toJsonSchema(GetApprovalInput),
    annotations: { title: "Get approval request by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId, response_format: fmt } = validate(GetApprovalInput, args);
        const data = await client.get<unknown>(`/api/approvals/${approvalId}`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList([data], "Approval");
        const hint = "Response too large.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_approval",
    description: composeDescription({
      summary: "Create a new approval request for board review.",
      args: [
        "- type: enum — hire_agent | approve_ceo_strategy | budget_override_required",
        "- payload: object — Type-specific payload (e.g. for hire_agent: { name, role, capabilities })",
        "- requestedByAgentId: string (optional) — Override requester agent UUID (defaults to caller)",
      ],
      returns:
        "Returns the created approval object: id, type, status:'pending', payload, createdAt.",
      examples: {
        useWhen: "submitting a hire request or budget override request for board review",
        dontUseWhen:
          "you want to use the streamlined hire flow — use paperclip_create_agent_hire instead",
      },
      errors: [
        "- 400: validation failure → ensure type is a valid enum and payload matches the type schema",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
      ],
    }),
    inputSchema: toJsonSchema(CreateApprovalInput),
    annotations: { title: "Create approval request", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateApprovalInput, args);
        const body: Record<string, unknown> = { type: input.type, payload: input.payload };
        if (input.requestedByAgentId !== undefined)
          body.requestedByAgentId = input.requestedByAgentId;
        const data = await client.post<unknown>(
          `/api/companies/${client.companyId}/approvals`,
          body
        );
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_approve",
    description: composeDescription({
      summary: "Approve a pending approval request, triggering the associated workflow.",
      args: ['- approvalId: string — Approval UUID (example: "apr_abc123")'],
      returns: "Returns the updated approval with status:'approved' and approvedAt timestamp.",
      examples: {
        useWhen:
          "approving a hire_agent or budget_override request after board review (requires board API key)",
        dontUseWhen:
          "you want to reject or request changes — use paperclip_reject or paperclip_request_revision instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: approval not found → verify ID with paperclip_list_approvals",
        "- 422: approval is not in pending state → check current status with paperclip_get_approval",
      ],
      boardOnly: true,
    }),
    inputSchema: toJsonSchema(ApprovalIdInput),
    annotations: { title: "Approve approval request", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId } = validate(ApprovalIdInput, args);
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/approve`);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_reject",
    description: composeDescription({
      summary: "Reject a pending approval request with an optional reason.",
      args: [
        '- approvalId: string — Approval UUID (example: "apr_abc123")',
        "- reason: string (optional) — Human-readable reason for rejection",
      ],
      returns: "Returns the updated approval with status:'rejected' and rejectedAt timestamp.",
      examples: {
        useWhen: "denying a hire or budget request after board review (requires board API key)",
        dontUseWhen:
          "you want the requester to revise and resubmit — use paperclip_request_revision instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: approval not found → verify ID with paperclip_list_approvals",
        "- 422: approval is not in pending state → check current status with paperclip_get_approval",
      ],
      boardOnly: true,
    }),
    inputSchema: toJsonSchema(RejectInput),
    annotations: { title: "Reject approval request", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { approvalId, reason } = validate(RejectInput, args);
        const body: Record<string, unknown> = {};
        if (reason !== undefined) body.reason = reason;
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/reject`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_request_revision",
    description: composeDescription({
      summary:
        "Request a revision on a pending approval, returning it to the requester for changes.",
      args: [
        '- approvalId: string — Approval UUID (example: "apr_abc123")',
        "- feedback: string (optional) — Specific feedback on what needs to change",
      ],
      returns: "Returns the updated approval with status:'revision_requested'.",
      examples: {
        useWhen:
          "asking an agent to revise a hire proposal before board approval (requires board API key)",
        dontUseWhen: "you want to outright deny the request — use paperclip_reject instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: approval not found → verify ID with paperclip_list_approvals",
        "- 422: approval is not in a revisable state → check current status with paperclip_get_approval",
      ],
      boardOnly: true,
    }),
    inputSchema: toJsonSchema(RequestRevisionInput),
    annotations: {
      title: "Request revision on approval",
      destructiveHint: false,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { approvalId, feedback } = validate(RequestRevisionInput, args);
        const body: Record<string, unknown> = {};
        if (feedback !== undefined) body.feedback = feedback;
        const data = await client.post<unknown>(
          `/api/approvals/${approvalId}/request-revision`,
          body
        );
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_resubmit_approval",
    description: composeDescription({
      summary: "Resubmit an approval request after addressing revision feedback.",
      args: [
        '- approvalId: string — Approval UUID (example: "apr_abc123")',
        "- comment: string (optional) — Summary of changes made since last submission",
      ],
      returns: "Returns the updated approval with status:'pending' for board re-review.",
      examples: {
        useWhen: "submitting a revised hire proposal after the board requested changes",
        dontUseWhen:
          "the approval is already pending or approved — check status with paperclip_get_approval first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: approval not found → verify ID with paperclip_list_approvals",
        "- 422: approval is not in revision_requested state → check current status with paperclip_get_approval",
      ],
    }),
    inputSchema: toJsonSchema(ResubmitInput),
    annotations: {
      title: "Resubmit approval after revision",
      destructiveHint: false,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { approvalId, comment } = validate(ResubmitInput, args);
        const body: Record<string, unknown> = {};
        if (comment !== undefined) body.comment = comment;
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/resubmit`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_list_approval_comments",
    description: composeDescription({
      summary: "List comments on an approval request.",
      args: ['- approvalId: string — Approval UUID (example: "apr_abc123")'],
      returns: "Array of comment objects: id, body, authorId, authorType, createdAt.",
      examples: {
        useWhen: "reading board feedback before resubmitting an approval",
        dontUseWhen:
          "you need approval metadata — use paperclip_get_approval for status, type, and payload",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: approval not found → verify ID with paperclip_list_approvals",
      ],
    }),
    inputSchema: toJsonSchema(ListApprovalCommentsInput),
    annotations: {
      title: "List approval comments",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { approvalId, response_format: fmt } = validate(ListApprovalCommentsInput, args);
        const data = await client.get<unknown>(`/api/approvals/${approvalId}/comments`);
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(data)
            : formatGenericList(data, "Approval Comments");
        const hint =
          "Response too large. This approval may have an unusually high number of comments.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_add_approval_comment",
    description: composeDescription({
      summary: "Post a markdown comment on an approval request.",
      args: [
        '- approvalId: string — Approval UUID (example: "apr_abc123")',
        '- body: string — Comment body in markdown (example: "Revised per board feedback: ...")',
      ],
      returns: "Returns the created comment object: id, body, authorId, authorType, createdAt.",
      examples: {
        useWhen: "adding context to an approval request or responding to board revision feedback",
        dontUseWhen:
          "you also want to change the approval status — use paperclip_resubmit_approval or paperclip_approve",
      },
      errors: [
        "- 400: validation failure → ensure body is non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: approval not found → verify ID with paperclip_list_approvals",
      ],
    }),
    inputSchema: toJsonSchema(ApprovalCommentInput),
    annotations: {
      title: "Post comment on approval",
      destructiveHint: false,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { approvalId, body } = validate(ApprovalCommentInput, args);
        const data = await client.post<unknown>(`/api/approvals/${approvalId}/comments`, { body });
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_agent_hire",
    description: composeDescription({
      summary:
        "Create an agent hire request, triggering the governance approval and onboarding flow.",
      args: [
        '- name: string — Agent display name (example: "DevOps Agent")',
        '- role: string — Agent role identifier (example: "devops")',
        "- title: string (optional) — Job title",
        "- capabilities: string (optional) — Free-text capability description",
        "- goalId: string (optional) — Goal UUID to link the hire",
        "- projectId: string (optional) — Project UUID to associate",
      ],
      returns: "Returns the created hire request object with a pending approval linked.",
      examples: {
        useWhen: "CEO agent initiating a new specialist hire after board approves the proposal",
        dontUseWhen:
          "you need a generic approval — use paperclip_create_approval with type:'hire_agent' for custom payloads",
      },
      errors: [
        "- 400: validation failure → ensure name and role are non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: only the CEO agent has canCreateAgents permission → verify agent governance config",
      ],
    }),
    inputSchema: toJsonSchema(CreateAgentHireInput),
    annotations: {
      title: "Create agent hire request",
      destructiveHint: false,
      openWorldHint: false,
    },
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
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
