import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, NoInput } from "./validation.js";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

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
    description: "List all labels for the current company.",
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "List company labels", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/labels`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_label",
    description:
      "Create a new label for the current company. Use to establish the label taxonomy before applying labels to issues.",
    inputSchema: toJsonSchema(CreateLabelInput),
    annotations: { title: "Create company label", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateLabelInput, args);
        const body: Record<string, unknown> = { name: input.name };
        if (input.color !== undefined) body["color"] = input.color;
        const data = await client.post<unknown>(`/api/companies/${client.companyId}/labels`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
