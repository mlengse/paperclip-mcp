import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatGenericList,
  applyCharLimit,
  paginate,
} from "./format.js";

// ---------------------------------------------------------------------------
// Shared optional filter params for feedback trace list endpoints
// ---------------------------------------------------------------------------

const sharedFilters = {
  targetType: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by target type (e.g. 'issue', 'comment')"),
  vote: z.string().min(1).optional().describe("Filter by vote value (e.g. 'up', 'down')"),
  status: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by trace status (e.g. 'pending', 'resolved')"),
  from: z
    .string()
    .datetime()
    .optional()
    .describe("ISO 8601 datetime — return traces created at or after this timestamp"),
  to: z
    .string()
    .datetime()
    .optional()
    .describe("ISO 8601 datetime — return traces created at or before this timestamp"),
  sharedOnly: z.boolean().optional().describe("When true, return only traces marked as shared"),
  includePayload: z
    .boolean()
    .optional()
    .describe("When true, include full trace payload in response"),
};

// ---------------------------------------------------------------------------
// paperclip_list_feedback_traces
// ---------------------------------------------------------------------------

const ListFeedbackTracesInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID"),
    ...sharedFilters,
    projectId: z.string().min(1).optional().describe("Filter by project UUID"),
    issueId: z.string().min(1).optional().describe("Filter by issue ID or identifier"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
    limit: PaginationLimitSchema.describe("Max traces per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of traces to skip (default 0)"),
  })
  .strict();

// ---------------------------------------------------------------------------
// paperclip_list_issue_feedback_traces
// ---------------------------------------------------------------------------

const ListIssueFeedbackTracesInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-42)"),
    ...sharedFilters,
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
    limit: PaginationLimitSchema.describe("Max traces per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of traces to skip (default 0)"),
  })
  .strict();

// ---------------------------------------------------------------------------
// paperclip_get_feedback_trace_bundle
// ---------------------------------------------------------------------------

const GetFeedbackTraceBundleInput = z
  .object({
    traceId: z.string().min(1).describe("Feedback trace UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSharedParams(
  params: URLSearchParams,
  input: {
    targetType?: string;
    vote?: string;
    status?: string;
    from?: string;
    to?: string;
    sharedOnly?: boolean;
    includePayload?: boolean;
  }
): void {
  if (input.targetType !== undefined) params.set("targetType", input.targetType);
  if (input.vote !== undefined) params.set("vote", input.vote);
  if (input.status !== undefined) params.set("status", input.status);
  if (input.from !== undefined) params.set("from", input.from);
  if (input.to !== undefined) params.set("to", input.to);
  if (input.sharedOnly !== undefined) params.set("sharedOnly", String(input.sharedOnly));
  if (input.includePayload !== undefined)
    params.set("includePayload", String(input.includePayload));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const feedbackTools: ToolDefinition[] = [
  {
    name: "paperclip_list_feedback_traces",
    description: composeDescription({
      boardOnly: true,
      summary:
        "List feedback traces for the company, with optional filters for type, vote, status, project, issue, date range, and payload inclusion.",
      args: [
        "- companyId: string — Company UUID",
        "- targetType: string (optional) — Filter by target type",
        "- vote: string (optional) — Filter by vote value",
        "- status: string (optional) — Filter by trace status",
        "- projectId: string (optional) — Filter by project UUID",
        "- issueId: string (optional) — Filter by issue ID",
        "- from: string (optional) — ISO 8601 datetime lower bound",
        "- to: string (optional) — ISO 8601 datetime upper bound",
        "- sharedOnly: boolean (optional) — Return only shared traces",
        "- includePayload: boolean (optional) — Include full trace payload",
        "- response_format: 'markdown' | 'json' (optional, default: markdown)",
        "- limit: number (optional) — Max per page, 1–100 (default 50)",
        "- offset: number (optional) — Items to skip (default 0)",
      ],
      returns:
        "Pagination envelope { items: FeedbackTrace[], total, count, offset, limit, has_more, next_offset }.",
      examples: {
        useWhen: "auditing feedback across the company or filtering by issue, vote, or date range",
        dontUseWhen:
          "you need traces for a single issue — use paperclip_list_issue_feedback_traces",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → board-only endpoint, requires board API key",
      ],
    }),
    inputSchema: toJsonSchema(ListFeedbackTracesInput),
    annotations: {
      title: "List feedback traces",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const {
          companyId,
          targetType,
          vote,
          status,
          projectId,
          issueId,
          from,
          to,
          sharedOnly,
          includePayload,
          response_format: fmt,
          limit,
          offset,
        } = validate(ListFeedbackTracesInput, args);
        const params = new URLSearchParams();
        buildSharedParams(params, {
          targetType,
          vote,
          status,
          from,
          to,
          sharedOnly,
          includePayload,
        });
        if (projectId !== undefined) params.set("projectId", projectId);
        if (issueId !== undefined) params.set("issueId", issueId);
        const qs = params.toString();
        const url = `/api/companies/${companyId}/feedback-traces${qs ? `?${qs}` : ""}`;
        const all = await client.get<unknown[]>(url);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Feedback Traces", envelope);
        const hint =
          "Response too large. Use limit/offset to page, or filter by targetType, vote, projectId, or issueId.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_list_feedback_traces",
          resource: "feedback_trace",
        });
      }
    },
  },
  {
    name: "paperclip_list_issue_feedback_traces",
    description: composeDescription({
      boardOnly: true,
      summary: "List feedback traces scoped to a single issue, with optional filters.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- targetType: string (optional) — Filter by target type (example: "comment")',
        '- vote: string (optional) — Filter by vote value (example: "up", "down")',
        '- status: string (optional) — Filter by trace status (example: "pending", "resolved")',
        "- from: string (optional) — ISO 8601 datetime lower bound (createdAt >=)",
        "- to: string (optional) — ISO 8601 datetime upper bound (createdAt <=)",
        "- sharedOnly: boolean (optional) — Return only shared traces",
        "- includePayload: boolean (optional) — Include full trace payload in response",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
        "- limit: number (optional) — Max traces per page, 1–100 (default 50)",
        "- offset: number (optional) — Number of traces to skip (default 0)",
      ],
      returns:
        "Pagination envelope { items: FeedbackTrace[], total, count, offset, limit, has_more, next_offset }.",
      examples: {
        useWhen: "inspecting all feedback traces attached to a specific issue",
        dontUseWhen:
          "you need traces across the company — use paperclip_list_feedback_traces instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → board-only endpoint, requires board API key",
        "- 404: issue not found → verify issueId with paperclip_list_issues",
      ],
    }),
    inputSchema: toJsonSchema(ListIssueFeedbackTracesInput),
    annotations: {
      title: "List issue feedback traces",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const {
          issueId,
          targetType,
          vote,
          status,
          from,
          to,
          sharedOnly,
          includePayload,
          response_format: fmt,
          limit,
          offset,
        } = validate(ListIssueFeedbackTracesInput, args);
        const params = new URLSearchParams();
        buildSharedParams(params, {
          targetType,
          vote,
          status,
          from,
          to,
          sharedOnly,
          includePayload,
        });
        const qs = params.toString();
        const url = `/api/issues/${issueId}/feedback-traces${qs ? `?${qs}` : ""}`;
        const all = await client.get<unknown[]>(url);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Issue Feedback Traces", envelope);
        const hint =
          "Response too large. Use limit/offset to page, or filter by targetType, vote, or date range.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_list_issue_feedback_traces",
          resource: "feedback_trace",
        });
      }
    },
  },
  {
    name: "paperclip_get_feedback_trace_bundle",
    description: composeDescription({
      boardOnly: true,
      summary: "Fetch the full bundle for a single feedback trace by its UUID.",
      args: [
        '- traceId: string — Feedback trace UUID (example: "ft_abc123")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Feedback trace bundle object: traceId, events[], metadata, and related context fields.",
      examples: {
        useWhen: "retrieving the complete payload and event history for a specific feedback trace",
        dontUseWhen:
          "you need to browse traces — use paperclip_list_feedback_traces or paperclip_list_issue_feedback_traces",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → board-only endpoint, requires board API key",
        "- 404: trace not found → verify traceId with paperclip_list_feedback_traces",
      ],
    }),
    inputSchema: toJsonSchema(GetFeedbackTraceBundleInput),
    annotations: {
      title: "Get feedback trace bundle",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { traceId, response_format: fmt } = validate(GetFeedbackTraceBundleInput, args);
        const data = await client.get<unknown>(`/api/feedback-traces/${traceId}/bundle`);
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(data)
            : formatGenericList([data], "Feedback Trace Bundle");
        const hint =
          "Response too large. Use response_format 'json' to get raw output, or request a specific traceId.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_get_feedback_trace_bundle",
          resource: "feedback_trace",
        });
      }
    },
  },
];
