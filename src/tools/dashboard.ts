import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  NoInput,
  handleApiError,
  composeDescription,
} from "./validation.js";

export const dashboardTools: ToolDefinition[] = [
  {
    name: "paperclip_get_dashboard",
    description: composeDescription({
      summary:
        "Return the company-level health summary including goals, projects, issues, and agent workload.",
      returns:
        "Object with: goals (array), projects (array), issuesByStatus (object: counts per status), agentWorkload (array: agent name + active issue count).",
      examples: {
        useWhen: "getting a quick board-level overview of company health or sprint progress",
        dontUseWhen:
          "you need issue details — use paperclip_list_issues or paperclip_get_issue instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
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
