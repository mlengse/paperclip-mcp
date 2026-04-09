import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";

const AgentIdInput = z.object({
  agentId: z.string().min(1).describe("Agent UUID"),
});

const UpdateAgentInput = z.object({
  agentId: z.string().min(1).describe("Agent UUID"),
  name: z.string().optional().describe("New display name"),
  title: z.string().optional().describe("New job title"),
  capabilities: z.string().optional().describe("Updated capability description"),
  status: z.string().optional().describe("New status (e.g. active, paused)"),
});

export const agentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_agents",
    description: "Return the list of agents in the company (id, name, urlKey, role, status).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/agents`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_agent",
    description: "Get full details for a single agent by ID.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
      },
      required: ["agentId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId } = validate(AgentIdInput, args);
        const data = await client.get<unknown>(`/api/agents/${agentId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_agent",
    description:
      "Update an agent's name, title, capabilities, or status. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
        name: { type: "string", description: "New display name" },
        title: { type: "string", description: "New job title" },
        capabilities: { type: "string", description: "Updated capability description" },
        status: { type: "string", description: "New status (e.g. active, paused)" },
      },
      required: ["agentId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, ...rest } = validate(UpdateAgentInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/agents/${agentId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_pause_agent",
    description: "Pause an agent, preventing it from starting new heartbeat runs.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
      },
      required: ["agentId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId } = validate(AgentIdInput, args);
        const data = await client.post<unknown>(`/api/agents/${agentId}/pause`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_resume_agent",
    description: "Resume a paused agent, allowing it to start new heartbeat runs.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
      },
      required: ["agentId"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId } = validate(AgentIdInput, args);
        const data = await client.post<unknown>(`/api/agents/${agentId}/resume`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_invoke_heartbeat",
    description:
      "Manually trigger a heartbeat run for an agent. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
      },
      required: ["agentId"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId } = validate(AgentIdInput, args);
        const data = await client.post<unknown>(`/api/agents/${agentId}/heartbeat/invoke`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
