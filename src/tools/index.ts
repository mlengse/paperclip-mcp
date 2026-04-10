import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { identityTools } from "./identity.js";
import { issueTools } from "./issues.js";
import { commentTools } from "./comments.js";
import { documentTools } from "./documents.js";
import { agentTools } from "./agents.js";
import { dashboardTools } from "./dashboard.js";
import { approvalTools } from "./approvals.js";
import { goalTools } from "./goals.js";
import { projectTools } from "./projects.js";
import { activityTools } from "./activity.js";
import { routineTools } from "./routines.js";
import { attachmentTools } from "./attachments.js";
export { validate as validateInput } from "./validation.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  handler: (args: unknown, client: PaperclipClient) => Promise<ToolResult>;
}

const ALL_TOOLS: ToolDefinition[] = [
  ...identityTools,
  ...issueTools,
  ...commentTools,
  ...documentTools,
  ...agentTools,
  ...dashboardTools,
  ...approvalTools,
  ...goalTools,
  ...projectTools,
  ...activityTools,
  ...routineTools,
  ...attachmentTools,
];

export function registerAllTools(server: Server): void {
  const client = new PaperclipClient();
  const toolMap = new Map(ALL_TOOLS.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      ...(annotations ? { annotations } : {}),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
    return tool.handler(request.params.arguments ?? {}, client);
  });
}
