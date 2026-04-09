import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";

export const agentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_agents",
    description: "Return the list of agents in the company (id, name, urlKey, role, status).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/agents`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
