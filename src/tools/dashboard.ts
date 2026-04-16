import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import { ResponseFormatSchema, formatJson, formatDashboard, applyCharLimit } from "./format.js";

const GetDashboardInput = z
  .object({
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

export const dashboardTools: ToolDefinition[] = [
  {
    name: "paperclip_get_dashboard",
    description: composeDescription({
      summary:
        "Return the company-level health summary including goals, projects, issues, and agent workload.",
      args: [
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
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
    inputSchema: toJsonSchema(GetDashboardInput),
    annotations: { title: "Get company dashboard", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt } = validate(GetDashboardInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/dashboard`);
        const text = (fmt ?? "markdown") === "json" ? formatJson(data) : formatDashboard(data);
        const hint = "Response too large. Use filters (agentId, projectId) to narrow results.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_dashboard" });
      }
    },
  },
];
