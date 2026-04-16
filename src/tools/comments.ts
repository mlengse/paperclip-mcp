import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import { ResponseFormatSchema, formatJson, formatGenericList, applyCharLimit } from "./format.js";

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
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Array of comment objects: id, body, authorId, authorType, createdAt. When `after` is set, response includes _note about the client-side workaround.",
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

        if (input.after) {
          // Client-side workaround: server-side `after` cursor returns HTTP 500.
          // Fetch all comments in ascending order and filter locally.
          const path = `/api/issues/${input.issueId}/comments?order=asc&limit=500`;
          const all = await client.get<Comment[]>(path);
          const idx = all.findIndex((c) => c.id === input.after);
          const filtered = idx >= 0 ? all.slice(idx + 1) : all;
          const result = {
            _note:
              "Client-side cursor workaround active: server-side `after` param is broken (HTTP 500). " +
              "Fetched up to 500 comments and filtered locally.",
            comments: filtered,
          };
          const text =
            fmt === "json" ? formatJson(result) : formatGenericList(filtered, "Comments");
          const hint = "Response too large. Use the `after` cursor to fetch fewer comments.";
          return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
        }

        const params = new URLSearchParams();
        if (input.order) params.set("order", input.order);
        const qs = params.toString();
        const path = `/api/issues/${input.issueId}/comments${qs ? `?${qs}` : ""}`;
        const data = await client.get<unknown>(path);
        const text = fmt === "json" ? formatJson(data) : formatGenericList(data, "Comments");
        const hint = "Response too large. Use the `after` cursor to fetch fewer comments.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
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
        return handleApiError(err);
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
        const hint = "Server response too large.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
