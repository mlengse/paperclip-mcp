import type { ToolDefinition } from "./index.js";
import { validate, NoInput } from "./validation.js";

export const agentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_agents",
    description: "Return the list of agents in the company (id, name, urlKey, role, status).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    async handler(args, client) {
      validate(NoInput, args);
      const data = await client.get<unknown>(`/api/companies/${client.companyId}/agents`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
];
