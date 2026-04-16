import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, NoInput, handleApiError } from "./validation.js";

export const dashboardTools: ToolDefinition[] = [
  {
    name: "paperclip_get_dashboard",
    description:
      "Return the company-level health summary including active goals, projects, issues by status, and agent workload.",
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "Get company dashboard", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/dashboard`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
