import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, handleApiError } from "./validation.js";

const ListCommentsInput = z.object({
  issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
  after: z
    .string()
    .optional()
    .describe(
      "Comment ID cursor — returns only comments posted after this ID. " +
        "Note: the server-side `after` param is broken (returns 500); this tool implements a client-side workaround."
    ),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order (default: asc)"),
});

const AddCommentInput = z.object({
  issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
  body: z.string().min(1).describe("Comment body (markdown)"),
});

interface Comment {
  id: string;
  [key: string]: unknown;
}

const GetCommentInput = z.object({
  issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
  commentId: z.string().min(1).describe("Comment UUID to fetch"),
});

export const commentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_comments",
    description:
      "List comments for an issue. Supports cursor-based incremental fetching via the `after` parameter. " +
      "When `after` is provided, a client-side workaround is used because the server-side `after` cursor " +
      "returns HTTP 500. The tool fetches up to 500 comments in ascending order and filters client-side.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-21)" },
        after: {
          type: "string",
          description:
            "Comment ID cursor — returns only comments posted after this ID. " +
            "Client-side workaround active (server-side cursor is broken).",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order (default: asc)",
        },
      },
      required: ["issueId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(ListCommentsInput, args);

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
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        const params = new URLSearchParams();
        if (input.order) params.set("order", input.order);
        const qs = params.toString();
        const path = `/api/issues/${input.issueId}/comments${qs ? `?${qs}` : ""}`;
        const data = await client.get<unknown>(path);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_add_comment",
    description:
      "Post a markdown comment on an issue. Run ID header is injected automatically for audit trail.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-21)" },
        body: { type: "string", description: "Comment body (markdown)" },
      },
      required: ["issueId", "body"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, body } = validate(AddCommentInput, args);
        const data = await client.post<unknown>(`/api/issues/${issueId}/comments`, { body });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_comment",
    description:
      "Fetch a single comment by ID. Use this when PAPERCLIP_WAKE_COMMENT_ID is set to read the exact comment that triggered an issue_comment_mentioned wake.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-21)" },
        commentId: { type: "string", description: "Comment UUID to fetch" },
      },
      required: ["issueId", "commentId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, commentId } = validate(GetCommentInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/comments/${commentId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
