import type { ToolDefinition } from "./index.js";
import { validate, NoInput } from "./validation.js";

export const dashboardTools: ToolDefinition[] = [
  {
    name: "paperclip_get_dashboard",
    description:
      "Return the company-level health summary including active goals, projects, issues by status, and agent workload.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    async handler(args, client) {
      validate(NoInput, args);
      const data = await client.get<unknown>(`/api/companies/${client.companyId}/dashboard`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
];
