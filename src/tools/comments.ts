import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, handleApiError } from "./validation.js";

const ListCommentsInput = z.object({
  issueId: z.string().min(1),
  after: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

const AddCommentInput = z.object({
  issueId: z.string().min(1),
  body: z.string().min(1),
});

export const commentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_comments",
    description:
      "List comments for an issue. Supports cursor-based incremental fetching via the `after` parameter.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-21)" },
        after: {
          type: "string",
          description: "Comment ID cursor — returns only comments posted after this ID",
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
        const params = new URLSearchParams();
        if (input.after) params.set("after", input.after);
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
];
