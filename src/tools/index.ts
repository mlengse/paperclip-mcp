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
import { labelTools } from "./labels.js";
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
  /** Set to true when the underlying API endpoint requires board (human-user) authentication.
   *  Agent callers will always receive HTTP 403 from these endpoints. */
  boardOnlyHint?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  handler: (args: unknown, client: PaperclipClient) => Promise<ToolResult>;
}

export const ALL_TOOLS: ToolDefinition[] = [
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
  ...labelTools,
];

export function registerAllTools(server: Server): void {
  const client = new PaperclipClient();
  const toolMap = new Map(ALL_TOOLS.map((t) => [t.name, t]));

  if (toolMap.size !== ALL_TOOLS.length) {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const tool of ALL_TOOLS) {
      if (seen.has(tool.name)) duplicates.push(tool.name);
      else seen.add(tool.name);
    }
    throw new Error(`Duplicate tool names detected at registration: ${duplicates.join(", ")}`);
  }

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
