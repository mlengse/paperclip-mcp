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

const CreateAgentKeyInput = z.object({
  agentId: z.string().min(1).describe("Agent UUID"),
  name: z.string().optional().describe("Key label"),
  expiresAt: z.string().optional().describe("ISO 8601 expiry date"),
});

const ConfigRevisionInput = z.object({
  agentId: z.string().min(1).describe("Agent UUID"),
  revisionId: z.string().min(1).describe("Config revision UUID"),
});

const SetInstructionsPathInput = z.object({
  agentId: z.string().min(1).describe("Agent UUID"),
  path: z.string().nullable().describe("Path to AGENTS.md file, or null to clear"),
  adapterConfigKey: z
    .string()
    .optional()
    .describe("Adapter config key override for non-standard adapters"),
});

const jsonArrayPreprocess = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

const SyncAgentSkillsInput = z.object({
  agentId: z.string().min(1).describe("Agent UUID"),
  desiredSkills: z
    .preprocess(jsonArrayPreprocess, z.array(z.string()))
    .describe("List of skill names to sync onto the agent"),
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
        const data = await client.get<unknown>(
          `/api/agents/${agentId}?companyId=${client.companyId}`
        );
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
  {
    name: "paperclip_terminate_agent",
    description:
      "Permanently deactivate an agent. WARNING: This action is irreversible. The agent cannot be reactivated after termination. Run ID header is injected automatically.",
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
        const data = await client.post<unknown>(`/api/agents/${agentId}/terminate`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_agent_key",
    description:
      "Create a long-lived API key for an agent. Returns the key value — store it securely, it will not be shown again. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
        name: { type: "string", description: "Key label (optional)" },
        expiresAt: { type: "string", description: "ISO 8601 expiry date (optional)" },
      },
      required: ["agentId"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, ...rest } = validate(CreateAgentKeyInput, args);
        const body: Record<string, unknown> = {};
        if (rest.name !== undefined) body.name = rest.name;
        if (rest.expiresAt !== undefined) body.expiresAt = rest.expiresAt;
        const data = await client.post<unknown>(`/api/agents/${agentId}/keys`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_list_agent_config_revisions",
    description: "List config revision history for an agent.",
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
        const data = await client.get<unknown>(`/api/agents/${agentId}/config-revisions`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_rollback_agent_config",
    description:
      "Rollback an agent's config to a previous revision. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
        revisionId: { type: "string", description: "Config revision UUID to rollback to" },
      },
      required: ["agentId", "revisionId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, revisionId } = validate(ConfigRevisionInput, args);
        const data = await client.post<unknown>(
          `/api/agents/${agentId}/config-revisions/${revisionId}/rollback`
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_set_agent_instructions_path",
    description:
      "Set or clear the AGENTS.md instructions file path for an agent. Send null to clear. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
        path: {
          type: ["string", "null"],
          description: "Path to AGENTS.md file, or null to clear",
        },
        adapterConfigKey: {
          type: "string",
          description: "Adapter config key override for non-standard adapters (optional)",
        },
      },
      required: ["agentId", "path"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, path, adapterConfigKey } = validate(SetInstructionsPathInput, args);
        const body: Record<string, unknown> = { path };
        if (adapterConfigKey !== undefined) body.adapterConfigKey = adapterConfigKey;
        const data = await client.patch<unknown>(`/api/agents/${agentId}/instructions-path`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_org_chart",
    description: "Get the full company agent hierarchy (org chart).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/org`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_sync_agent_skills",
    description:
      "Sync the desired skill set for an agent, adding or removing skills as needed. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
        desiredSkills: {
          type: "array",
          items: { type: "string" },
          description: "Complete list of skill names the agent should have",
        },
      },
      required: ["agentId", "desiredSkills"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, desiredSkills } = validate(SyncAgentSkillsInput, args);
        const data = await client.post<unknown>(`/api/agents/${agentId}/skills/sync`, {
          desiredSkills,
        });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_list_company_skills",
    description: "List all skills installed in the company.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/skills`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
