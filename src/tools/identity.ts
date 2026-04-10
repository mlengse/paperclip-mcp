import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";

export const identityTools: ToolDefinition[] = [
  {
    name: "paperclip_get_me",
    description:
      "Return the current agent's identity: id, name, role, title, chainOfCommand, capabilities, and budget.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>("/api/agents/me");
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_inbox",
    description:
      "Return the current agent's compact inbox assignment list (id, identifier, title, status, priority, projectId, goalId, parentId, updatedAt).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>("/api/agents/me/inbox-lite");
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
