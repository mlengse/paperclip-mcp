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
import { companyTools } from "./company.js";
import { pluginTools } from "./plugins.js";
import { secretTools } from "./secrets.js";
import { runTools } from "./runs.js";
export { validate as validateInput } from "./validation.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /**
   * JSON Schema object produced eagerly via `toJsonSchema(ZodSchema)` in each tool module.
   *
   * The Zod schema is the actual source of truth for runtime validation (see `validate()` in
   * validation.ts); this field is the pre-computed client-facing schema sent to MCP clients.
   *
   * Deviation from stage plan: the plan specified `inputSchema: z.ZodTypeAny` with conversion
   * at registration time. Eager module-load conversion is simpler for a stdio server that loads
   * 103 tools once and never reloads. Stage 2+ should continue to work directly on the
   * module-local Zod schema variables (e.g. `const ListIssuesSchema = z.object({...})`),
   * not on `ToolDefinition.inputSchema`.
   */
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
  ...companyTools,
  ...pluginTools,
  ...secretTools,
  ...runTools,
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
    const toolName = request.params.name;
    const tool = toolMap.get(toolName);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
    try {
      return await tool.handler(request.params.arguments ?? {}, client);
    } catch (err) {
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Paperclip MCP unhandled error in ${toolName}: ${message}\n`);
      return {
        isError: true,
        content: [{ type: "text", text: `Paperclip MCP error in ${toolName}: ${message}` }],
      };
    }
  });
}
