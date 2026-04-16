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

const ListCommentsInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
    after: z
      .string()
      .optional()
      .describe(
        "Comment ID cursor — returns only comments posted after this ID. " +
          "Note: the server-side `after` param is broken (returns 500); this tool implements a client-side workaround."
      ),
    order: z.enum(["asc", "desc"]).optional().describe("Sort order (default: asc)"),
    limit: PaginationLimitSchema.describe("Max comments per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of comments to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const AddCommentInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
    body: z.string().min(1).describe("Comment body (markdown)"),
  })
  .strict();

interface Comment {
  id: string;
  [key: string]: unknown;
}

const GetCommentInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
    commentId: z.string().min(1).describe("Comment UUID to fetch"),
  })
  .strict();

export const commentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_comments",
    description: composeDescription({
      summary: "List comments on an issue, with optional cursor-based incremental fetching.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        "- after: string (optional) — Comment UUID cursor; returns only comments after this ID (client-side workaround active — server after param returns 500)",
        '- order: "asc" | "desc" (optional) — Sort order (default: asc)',
        "- limit: number (optional) — Max comments per page (1–100, default 50)",
        "- offset: number (optional) — Number of comments to skip (default 0)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: Comment[], total, count, offset, limit, has_more, next_offset }. When `after` is used, total reflects the filtered (post-cursor) count.",
      examples: {
        useWhen: "reading new @-mention comments since the last heartbeat using the `after` cursor",
        dontUseWhen: "you need a single comment by ID — use paperclip_get_comment instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
        "- 500: server error on the `after` cursor path → tool automatically applies a client-side workaround",
      ],
    }),
    inputSchema: toJsonSchema(ListCommentsInput),
    annotations: { title: "List issue comments", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(ListCommentsInput, args);
        const fmt = input.response_format ?? "markdown";
        const hint =
          "Response too large. Use limit/offset or the `after` cursor to narrow results.";

        if (input.after) {
          // Client-side workaround: server-side `after` cursor returns HTTP 500.
          // Fetch all comments in ascending order, filter locally, then paginate.
          const path = `/api/issues/${input.issueId}/comments?order=asc&limit=500`;
          const all = await client.get<Comment[]>(path);
          const idx = all.findIndex((c) => c.id === input.after);
          const filtered = idx >= 0 ? all.slice(idx + 1) : all;
          const envelope = paginate(filtered, { limit: input.limit, offset: input.offset });
          const text =
            fmt === "json"
              ? formatJson(envelope)
              : formatGenericList(envelope.items, "Comments", envelope);
          return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
        }

        // Server respects `limit` (confirmed: ?limit=2 returns ≤ 2 items).
        // Server ignores `offset` (confirmed: ?offset=1 returns same set as ?offset=0).
        // Strategy: send `limit` upstream to reduce payload size; apply `offset` client-side.
        // Belt-and-suspenders: paginate() re-enforces limit in case the server returns more.
        const params = new URLSearchParams();
        if (input.order) params.set("order", input.order);
        if (input.limit !== undefined) params.set("limit", String(input.limit));
        const qs = params.toString();
        const path = `/api/issues/${input.issueId}/comments${qs ? `?${qs}` : ""}`;
        const all = await client.get<unknown[]>(path);
        const envelope = paginate(all, { limit: input.limit, offset: input.offset });
        const text =
          fmt === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Comments", envelope);
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_list_comments",
          resource: "comment",
          hint: "500 with an `after` cursor is a known Paperclip API bug; try without the cursor or use limit/offset pagination",
        });
      }
    },
  },
  {
    name: "paperclip_add_comment",
    description: composeDescription({
      summary:
        "Post a markdown comment on an issue. Run ID header injected automatically for audit trail.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- body: string — Comment body in markdown (example: "@QA — ready for review on PAP-42. Changes: ...")',
      ],
      returns: "Returns the created comment object: id, body, authorId, authorType, createdAt.",
      examples: {
        useWhen: "posting @-mention handoffs (e.g. @QA ready for review, @Engineer changes needed)",
        dontUseWhen:
          "you also need to update issue fields — use paperclip_update_issue with a `comment` field instead",
      },
      errors: [
        "- 400: validation failure → ensure body is non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
      ],
    }),
    inputSchema: toJsonSchema(AddCommentInput),
    annotations: { title: "Post comment on issue", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, body } = validate(AddCommentInput, args);
        const data = await client.post<unknown>(`/api/issues/${issueId}/comments`, { body });
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_add_comment", resource: "comment" });
      }
    },
  },
  {
    name: "paperclip_get_comment",
    description: composeDescription({
      summary: "Fetch a single comment by ID, typically the triggering comment from a wake event.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- commentId: string — Comment UUID (example: "cmt_abc123")',
      ],
      returns: "Returns the comment object: id, body, authorId, authorType, createdAt.",
      examples: {
        useWhen:
          "PAPERCLIP_WAKE_COMMENT_ID is set — read the exact comment that triggered the @-mention wake",
        dontUseWhen: "you need all comments on an issue — use paperclip_list_comments instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: comment or issue not found → verify both issueId and commentId",
      ],
    }),
    inputSchema: toJsonSchema(GetCommentInput),
    annotations: { title: "Get comment by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, commentId } = validate(GetCommentInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/comments/${commentId}`);
        const hint =
          "Server response too large. This comment may have an unusually long body or attachment data.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_comment", resource: "comment" });
      }
    },
  },
];
