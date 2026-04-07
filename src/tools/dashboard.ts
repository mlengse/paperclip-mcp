import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolDefinition } from "./index.js";

const NoInput = z.object({});

function validate<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new McpError(ErrorCode.InvalidParams, result.error.message);
  }
  return result.data;
}

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
      const data = await client.get<unknown>(
        `/api/companies/${client.companyId}/dashboard`,
      );
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
];
