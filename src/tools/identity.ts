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
    async handler(args, client) {
      validate(NoInput, args);
      const data = await client.get<unknown>("/api/agents/me");
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
    async handler(args, client) {
      validate(NoInput, args);
      const data = await client.get<unknown>("/api/agents/me/inbox-lite");
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
];
