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

export const agentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_agents",
    description:
      "Return the list of agents in the company (id, name, urlKey, role, status).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    async handler(args, client) {
      validate(NoInput, args);
      const data = await client.get<unknown>(
        `/api/companies/${client.companyId}/agents`,
      );
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
];
