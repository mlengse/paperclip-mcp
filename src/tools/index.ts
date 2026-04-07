import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PaperclipClient } from "../client.js";
import { identityTools } from "./identity.js";
import { issueTools } from "./issues.js";
import { commentTools } from "./comments.js";
import { documentTools } from "./documents.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown, client: PaperclipClient) => Promise<ToolResult>;
}

export function validateInput<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new McpError(ErrorCode.InvalidParams, result.error.message);
  }
  return result.data;
}

const ALL_TOOLS: ToolDefinition[] = [...identityTools, ...issueTools, ...commentTools, ...documentTools];

export function registerAllTools(server: Server): void {
  const client = new PaperclipClient();
  const toolMap = new Map(ALL_TOOLS.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`,
      );
    }
    return tool.handler(request.params.arguments ?? {}, client);
  });
}
