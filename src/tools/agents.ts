import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, NoInput, handleApiError } from "./validation.js";

const AgentIdInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
  })
  .strict();

const UpdateAgentInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    name: z.string().optional().describe("New display name"),
    title: z.string().optional().describe("New job title"),
    capabilities: z.string().optional().describe("Updated capability description"),
    status: z.string().optional().describe("New status (e.g. active, paused)"),
    runtimeConfig: z
      .object({
        heartbeat: z
          .object({
            enabled: z.boolean().optional().describe("Enable or disable scheduled heartbeats"),
            intervalSec: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Heartbeat interval in seconds"),
            cooldownSec: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .describe("Minimum seconds between heartbeat runs"),
            maxConcurrentRuns: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Maximum concurrent heartbeat runs allowed"),
            wakeOnDemand: z
              .boolean()
              .optional()
              .describe("Allow on-demand heartbeat invocation via the invoke endpoint"),
          })
          .strict()
          .optional()
          .describe("Heartbeat scheduling settings"),
      })
      .strict()
      .optional()
      .describe("Agent runtime configuration"),
    adapterConfig: z
      .object({
        model: z.string().optional().describe("LLM model identifier (e.g. claude-sonnet-4-6)"),
        cwd: z.string().optional().describe("Working directory for the agent process"),
        maxTurnsPerRun: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum LLM turns per heartbeat run"),
        timeoutSec: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Hard timeout in seconds for a heartbeat run"),
        graceSec: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Grace period in seconds before hard termination after timeout"),
        instructionsFilePath: z
          .string()
          .optional()
          .describe("Path to the AGENTS.md instructions file"),
        instructionsRootPath: z
          .string()
          .optional()
          .describe("Root path used for resolving relative instruction paths"),
        instructionsBundleMode: z
          .string()
          .optional()
          .describe("Instruction bundling mode (e.g. concat, merge)"),
        dangerouslySkipPermissions: z
          .boolean()
          .optional()
          .describe("Skip permission checks — dangerous, use only in trusted sandboxes"),
        paperclipSkillSync: z
          .object({
            desiredSkills: z
              .array(z.string())
              .optional()
              .describe("Skill names the agent should have installed"),
          })
          .strict()
          .optional()
          .describe("Paperclip skill auto-sync configuration"),
      })
      .strict()
      .optional()
      .describe("Adapter configuration for the agent process"),
  })
  .strict();

const UpdateAgentPermissionsInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    canAssignTasks: z.boolean().describe("Allow this agent to assign tasks to other agents"),
    canCreateAgents: z
      .boolean()
      .describe("Allow this agent to create new agents (reserved for CEO by governance policy)"),
  })
  .strict();

const CreateAgentKeyInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    name: z.string().optional().describe("Key label"),
    expiresAt: z
      .string()
      .datetime({
        message: "Must be a valid ISO 8601 datetime string (e.g. '2027-01-01T00:00:00.000Z')",
      })
      .optional()
      .describe("ISO 8601 expiry datetime (e.g. '2027-01-01T00:00:00.000Z')"),
  })
  .strict();

const ConfigRevisionInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    revisionId: z.string().min(1).describe("Config revision UUID"),
  })
  .strict();

const SetInstructionsPathInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    path: z.string().nullable().describe("Path to AGENTS.md file, or null to clear"),
    adapterConfigKey: z
      .string()
      .optional()
      .describe("Adapter config key override for non-standard adapters"),
  })
  .strict();

const jsonArrayPreprocess = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

const SyncAgentSkillsInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    desiredSkills: z
      .preprocess(jsonArrayPreprocess, z.array(z.string()))
      .describe("List of skill names to sync onto the agent"),
  })
  .strict();

export const agentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_agents",
    description: "Return the list of agents in the company (id, name, urlKey, role, status).",
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "List company agents", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: { title: "Get agent by ID", readOnlyHint: true, openWorldHint: false },
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
      "Update an agent's name, title, capabilities, status, heartbeat/runtime config, or adapter config. Run ID header is injected automatically. For permissions, use paperclip_update_agent_permissions.",
    inputSchema: toJsonSchema(UpdateAgentInput),
    annotations: {
      title: "Update agent configuration",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    name: "paperclip_update_agent_permissions",
    description:
      "⚠ Board-only: Update an agent's permissions (canAssignTasks, canCreateAgents). Both fields are required — the API enforces this. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(UpdateAgentPermissionsInput),
    annotations: {
      title: "Update agent permissions",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { agentId, canAssignTasks, canCreateAgents } = validate(
          UpdateAgentPermissionsInput,
          args
        );
        const data = await client.patch<unknown>(`/api/agents/${agentId}/permissions`, {
          canAssignTasks,
          canCreateAgents,
        });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_pause_agent",
    description: "Pause an agent, preventing it from starting new heartbeat runs.",
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: { title: "Pause agent", idempotentHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: { title: "Resume paused agent", idempotentHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: {
      title: "Invoke agent heartbeat manually",
      destructiveHint: false,
      openWorldHint: false,
    },
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
      "⚠ Board-only: Permanently deactivate an agent. WARNING: This action is irreversible. The agent cannot be reactivated after termination. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: {
      title: "Terminate agent permanently",
      destructiveHint: true,
      openWorldHint: false,
    },
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
      "⚠ Board-only: Create a long-lived API key for an agent. Returns the key value — store it securely, it will not be shown again. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(CreateAgentKeyInput),
    annotations: { title: "Create agent API key", destructiveHint: false, openWorldHint: false },
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
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: {
      title: "List agent config revisions",
      readOnlyHint: true,
      openWorldHint: false,
    },
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
      "⚠ Board-only: Rollback an agent's config to a previous revision. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(ConfigRevisionInput),
    annotations: {
      title: "Rollback agent config revision",
      destructiveHint: true,
      openWorldHint: false,
    },
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
      "⚠ Board-only: Set or clear the AGENTS.md instructions file path for an agent. Send null to clear. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(SetInstructionsPathInput),
    annotations: {
      title: "Set agent instructions file path",
      destructiveHint: true,
      openWorldHint: false,
    },
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "Get company org chart", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(SyncAgentSkillsInput),
    annotations: { title: "Sync agent skills", destructiveHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "List company skills", readOnlyHint: true, openWorldHint: false },
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
