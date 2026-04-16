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

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const ListLabelsInput = z
  .object({
    limit: PaginationLimitSchema.describe("Max labels per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of labels to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const CreateLabelInput = z
  .object({
    name: z.string().min(1).describe("Label name (e.g. 'source:agent', 'type:bug')"),
    color: z
      .string()
      .regex(HEX_COLOR_REGEX, "Must be a valid 6-digit hex color string (e.g. '#6366f1')")
      .optional()
      .describe("6-digit hex color string (e.g. '#6366f1')"),
  })
  .strict();

export const labelTools: ToolDefinition[] = [
  {
    name: "paperclip_list_labels",
    description: composeDescription({
      summary: "List all labels defined for the current company.",
      args: [
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: Label[], total, count, offset, limit, has_more, next_offset }. Each item: id, name, color (hex), createdAt.",
      examples: {
        useWhen:
          "bootstrapping the label taxonomy at the start of a run to build a name→UUID cache",
        dontUseWhen: "you already have the label UUID — pass it directly to the relevant tool",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListLabelsInput),
    annotations: { title: "List company labels", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt, limit, offset } = validate(ListLabelsInput, args);
        const all = await client.get<unknown[]>(`/api/companies/${client.companyId}/labels`);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Labels", envelope);
        const hint =
          "Response too large. Use limit/offset to page. The company has an unusually large number of labels.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_label",
    description: composeDescription({
      summary: "Create a new label for the current company.",
      args: [
        '- name: string — Label name, typically namespaced (example: "source:agent")',
        '- color: string (optional) — 6-digit hex color (example: "#6366f1")',
      ],
      returns: "Returns the created label object: id, name, color, createdAt.",
      examples: {
        useWhen:
          "seeding a missing taxonomy label (e.g. source:agent, type:bug) during Label Bootstrap",
        dontUseWhen:
          "the label already exists — use paperclip_list_labels to check before creating",
      },
      errors: [
        "- 400: validation failure → check name is non-empty and color is valid hex if supplied",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 409: label name already exists → fetch existing ID from paperclip_list_labels",
      ],
    }),
    inputSchema: toJsonSchema(CreateLabelInput),
    annotations: { title: "Create company label", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateLabelInput, args);
        const body: Record<string, unknown> = { name: input.name };
        if (input.color !== undefined) body["color"] = input.color;
        const data = await client.post<unknown>(`/api/companies/${client.companyId}/labels`, body);
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
