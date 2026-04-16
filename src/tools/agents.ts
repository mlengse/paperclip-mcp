import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatAgentList,
  formatOrgChart,
  formatGenericList,
  applyCharLimit,
  paginate,
} from "./format.js";

const AgentIdInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
  })
  .strict();

const ListAgentsInput = z
  .object({
    limit: PaginationLimitSchema.describe("Max agents per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of agents to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetAgentInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetOrgChartInput = z
  .object({
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
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

const ListAgentConfigRevisionsInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    limit: PaginationLimitSchema.describe("Max revisions per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of revisions to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const ListCompanySkillsInput = z
  .object({
    limit: PaginationLimitSchema.describe("Max skills per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of skills to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
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
    description: composeDescription({
      summary: "List all agents in the current company.",
      returns:
        "Pagination envelope { items: Agent[], total, count, offset, limit, has_more, next_offset } with up to 50 agents per page (default, max 100).",
      examples: {
        useWhen:
          "resolving an agent name to a UUID before assigning an issue or invoking a heartbeat",
        dontUseWhen: "you need full agent details — use paperclip_get_agent with the resolved ID",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListAgentsInput),
    annotations: { title: "List company agents", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt, limit, offset } = validate(ListAgentsInput, args);
        const all = await client.get<unknown[]>(`/api/companies/${client.companyId}/agents`);
        const envelope = paginate(all, { limit, offset });
        const hint = "Response too large. Use limit/offset to page through agents.";
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatAgentList(envelope.items, envelope);
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_agents", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_get_agent",
    description: composeDescription({
      summary: "Get full details for a single agent by UUID.",
      args: ['- agentId: string — Agent UUID (example: "agt_abc123")'],
      returns:
        "Agent object: id, name, urlKey, role, title, status, capabilities, runtimeConfig, adapterConfig, permissions, budget.",
      examples: {
        useWhen:
          "reading an agent's current config before updating it or checking its heartbeat settings",
        dontUseWhen: "you need a list of agents — use paperclip_list_agents to discover IDs first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
    }),
    inputSchema: toJsonSchema(GetAgentInput),
    annotations: { title: "Get agent by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, response_format: fmt } = validate(GetAgentInput, args);
        const data = await client.get<unknown>(
          `/api/agents/${agentId}?companyId=${client.companyId}`
        );
        const text = (fmt ?? "markdown") === "json" ? formatJson(data) : formatAgentList([data]);
        const hint = "Entity response too large. This entity may have oversized fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_agent", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_update_agent",
    description: composeDescription({
      summary:
        "Update an agent's name, title, capabilities, status, heartbeat, runtime, or adapter config.",
      args: [
        '- agentId: string — Agent UUID (example: "agt_abc123")',
        "- name: string (optional) — New display name",
        "- title: string (optional) — New job title",
        "- capabilities: string (optional) — Updated capability description",
        "- status: string (optional) — New status (e.g. active, paused)",
        "- runtimeConfig.heartbeat.enabled: boolean (optional) — Enable/disable scheduled heartbeats",
        "- runtimeConfig.heartbeat.intervalSec: integer (optional) — Heartbeat interval in seconds",
        "- runtimeConfig.heartbeat.cooldownSec: integer (optional) — Min seconds between runs",
        "- runtimeConfig.heartbeat.maxConcurrentRuns: integer (optional) — Max concurrent runs",
        "- adapterConfig.model: string (optional) — LLM model identifier",
        "- adapterConfig.maxTurnsPerRun: integer (optional) — Max LLM turns per run",
        "- adapterConfig.timeoutSec: integer (optional) — Hard timeout in seconds",
        "- adapterConfig.instructionsFilePath: string (optional) — Path to AGENTS.md",
      ],
      returns: "Returns the updated agent object with all fields.",
      examples: {
        useWhen: "adjusting an agent's heartbeat interval or updating its capabilities description",
        dontUseWhen:
          "you need to update permissions — use paperclip_update_agent_permissions (board-only) instead",
      },
      errors: [
        "- 400: validation failure → check field types and enum values",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
    }),
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
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_update_agent", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_update_agent_permissions",
    description: composeDescription({
      summary:
        "Update an agent's governance permissions (canAssignTasks, canCreateAgents). Both fields required.",
      args: [
        '- agentId: string — Agent UUID (example: "agt_abc123")',
        "- canAssignTasks: boolean — Allow this agent to assign tasks to other agents",
        "- canCreateAgents: boolean — Allow this agent to create new agents (reserved for CEO by governance policy)",
      ],
      returns: "Returns the updated permissions object: agentId, canAssignTasks, canCreateAgents.",
      examples: {
        useWhen: "granting or revoking an agent's ability to assign tasks after a board decision",
        dontUseWhen: "you need to update config fields — use paperclip_update_agent instead",
      },
      errors: [
        "- 400: both canAssignTasks and canCreateAgents are required → supply both even if one is unchanged",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
      boardOnly: true,
    }),
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
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_update_agent_permissions",
          resource: "agent",
        });
      }
    },
  },
  {
    name: "paperclip_pause_agent",
    description: composeDescription({
      summary: "Pause an agent, preventing it from starting new heartbeat runs.",
      args: ['- agentId: string — Agent UUID (example: "agt_abc123")'],
      returns: "Returns the updated agent object with status set to paused.",
      examples: {
        useWhen: "temporarily stopping a runaway or misconfigured agent during incident response",
        dontUseWhen:
          "you want to permanently stop an agent — use paperclip_terminate_agent (board-only, irreversible)",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
    }),
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: { title: "Pause agent", idempotentHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId } = validate(AgentIdInput, args);
        const data = await client.post<unknown>(`/api/agents/${agentId}/pause`);
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_pause_agent", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_resume_agent",
    description: composeDescription({
      summary: "Resume a paused agent, allowing it to start new heartbeat runs.",
      args: ['- agentId: string — Agent UUID (example: "agt_abc123")'],
      returns: "Returns the updated agent object with status set to active.",
      examples: {
        useWhen: "re-enabling an agent after pausing it for maintenance or incident response",
        dontUseWhen:
          "the agent is not paused — check current status with paperclip_get_agent first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify ID with paperclip_list_agents",
        "- 422: agent is not in a paused state → check current status with paperclip_get_agent",
      ],
    }),
    inputSchema: toJsonSchema(AgentIdInput),
    annotations: { title: "Resume paused agent", idempotentHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId } = validate(AgentIdInput, args);
        const data = await client.post<unknown>(`/api/agents/${agentId}/resume`);
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_resume_agent", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_invoke_heartbeat",
    description: composeDescription({
      summary: "Manually trigger an on-demand heartbeat run for an agent.",
      args: ['- agentId: string — Agent UUID (example: "agt_abc123")'],
      returns: "Returns the created heartbeat run record: runId, agentId, status, startedAt.",
      examples: {
        useWhen:
          "waking an agent to process an urgent task without waiting for its next scheduled heartbeat",
        dontUseWhen:
          "the agent has heartbeat disabled or wakeOnDemand:false — update config with paperclip_update_agent first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify ID with paperclip_list_agents",
        "- 409: agent is already running a heartbeat → wait for it to finish",
      ],
    }),
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
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_invoke_heartbeat" });
      }
    },
  },
  {
    name: "paperclip_terminate_agent",
    description: composeDescription({
      summary: "Permanently deactivate an agent. This action is irreversible.",
      args: ['- agentId: string — Agent UUID (example: "agt_abc123")'],
      returns: "Returns the terminated agent record with status set to terminated.",
      examples: {
        useWhen: "decommissioning an agent that is no longer needed (requires board API key)",
        dontUseWhen: "you want a temporary stop — use paperclip_pause_agent instead (reversible)",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
      boardOnly: true,
    }),
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
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_terminate_agent", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_create_agent_key",
    description: composeDescription({
      summary:
        "Create a long-lived API key for an agent. The key value is shown only once — store it securely.",
      args: [
        '- agentId: string — Agent UUID (example: "agt_abc123")',
        '- name: string (optional) — Key label for identification (example: "prod-key")',
        '- expiresAt: string (optional) — ISO 8601 expiry datetime (example: "2027-01-01T00:00:00.000Z")',
      ],
      returns:
        "Returns the created key record: id, name, key (plaintext, shown once), agentId, expiresAt.",
      examples: {
        useWhen:
          "provisioning a new API key after onboarding an agent or rotating a compromised key",
        dontUseWhen:
          "the agent already has a valid key — list existing keys via paperclip_get_agent first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
      boardOnly: true,
    }),
    inputSchema: toJsonSchema(CreateAgentKeyInput),
    annotations: { title: "Create agent API key", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, ...rest } = validate(CreateAgentKeyInput, args);
        const body: Record<string, unknown> = {};
        if (rest.name !== undefined) body.name = rest.name;
        if (rest.expiresAt !== undefined) body.expiresAt = rest.expiresAt;
        const data = await client.post<unknown>(`/api/agents/${agentId}/keys`, body);
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_create_agent_key" });
      }
    },
  },
  {
    name: "paperclip_list_agent_config_revisions",
    description: composeDescription({
      summary: "List the config revision history for an agent.",
      args: ['- agentId: string — Agent UUID (example: "agt_abc123")'],
      returns:
        "Pagination envelope { items: Revision[], total, count, offset, limit, has_more, next_offset } with up to 50 revisions per page.",
      examples: {
        useWhen: "auditing recent config changes or finding a revisionId to roll back to",
        dontUseWhen:
          "you want to roll back — use paperclip_rollback_agent_config with the target revisionId",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
    }),
    inputSchema: toJsonSchema(ListAgentConfigRevisionsInput),
    annotations: {
      title: "List agent config revisions",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const {
          agentId,
          response_format: fmt,
          limit,
          offset,
        } = validate(ListAgentConfigRevisionsInput, args);
        const all = await client.get<unknown[]>(`/api/agents/${agentId}/config-revisions`);
        const envelope = paginate(all, { limit, offset });
        const hint = "Use limit/offset to page through config revisions.";
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Config Revisions", envelope);
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_list_agent_config_revisions",
          resource: "agent",
        });
      }
    },
  },
  {
    name: "paperclip_rollback_agent_config",
    description: composeDescription({
      summary: "Roll back an agent's config to a specific previous revision.",
      args: [
        '- agentId: string — Agent UUID (example: "agt_abc123")',
        '- revisionId: string — Config revision UUID to restore (example: "rev_xyz789")',
      ],
      returns: "Returns the agent object with config restored to the specified revision.",
      examples: {
        useWhen:
          "reverting a bad config change that broke an agent's heartbeat (requires board API key)",
        dontUseWhen: "you want to make targeted edits — use paperclip_update_agent instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: agent or revision not found → list revisions with paperclip_list_agent_config_revisions",
      ],
      boardOnly: true,
    }),
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
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_rollback_agent_config", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_set_agent_instructions_path",
    description: composeDescription({
      summary: "Set or clear the AGENTS.md instructions file path for an agent.",
      args: [
        '- agentId: string — Agent UUID (example: "agt_abc123")',
        '- path: string | null — Absolute path to the AGENTS.md file; null to clear (example: "/home/user/.agents/engineer/AGENTS.md")',
        "- adapterConfigKey: string (optional) — Override adapter config key for non-standard adapters",
      ],
      returns: "Returns the updated agent record with the new instructionsFilePath value.",
      examples: {
        useWhen:
          "onboarding a new agent by pointing it at its role-specific AGENTS.md (requires board API key)",
        dontUseWhen:
          "you want to update other adapter settings — use paperclip_update_agent for other adapterConfig fields",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
      boardOnly: true,
    }),
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
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_set_agent_instructions_path",
          resource: "agent",
        });
      }
    },
  },
  {
    name: "paperclip_get_org_chart",
    description: composeDescription({
      summary: "Get the full company agent hierarchy as an org chart.",
      returns: "Nested tree structure of agent nodes: id, name, role, reportsTo, directReports[].",
      examples: {
        useWhen: "understanding the chain of command before escalating to a senior agent or CEO",
        dontUseWhen: "you need a flat agent list — use paperclip_list_agents instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(GetOrgChartInput),
    annotations: { title: "Get company org chart", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt } = validate(GetOrgChartInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/org`);
        const text = (fmt ?? "markdown") === "json" ? formatJson(data) : formatOrgChart(data);
        const hint = "Response too large. Use filters (role, status) to narrow results.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_org_chart" });
      }
    },
  },
  {
    name: "paperclip_sync_agent_skills",
    description: composeDescription({
      summary:
        "Sync an agent's installed skills to match the desired list, adding or removing as needed.",
      args: [
        '- agentId: string — Agent UUID (example: "agt_abc123")',
        '- desiredSkills: string[] — Skill names to install; skills not in this list are removed (example: ["paperclip-hire-agent"])',
      ],
      returns: "Returns the sync result: added[], removed[], current[] skill lists.",
      examples: {
        useWhen: "onboarding a new agent or updating its skill set after a role change",
        dontUseWhen:
          "you only want to check installed skills — use paperclip_get_agent and inspect adapterConfig.paperclipSkillSync",
      },
      errors: [
        "- 400: validation failure → check desiredSkills is a non-empty array of valid skill names",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify ID with paperclip_list_agents",
      ],
    }),
    inputSchema: toJsonSchema(SyncAgentSkillsInput),
    annotations: { title: "Sync agent skills", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { agentId, desiredSkills } = validate(SyncAgentSkillsInput, args);
        const data = await client.post<unknown>(`/api/agents/${agentId}/skills/sync`, {
          desiredSkills,
        });
        return {
          content: [
            {
              type: "text",
              text: applyCharLimit(
                JSON.stringify(data),
                "Server response too large; the operation likely succeeded."
              ),
            },
          ],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_sync_agent_skills", resource: "agent" });
      }
    },
  },
  {
    name: "paperclip_list_company_skills",
    description: composeDescription({
      summary: "List all skills installed at the company level.",
      returns:
        "Pagination envelope { items: Skill[], total, count, offset, limit, has_more, next_offset } with up to 50 skills per page.",
      examples: {
        useWhen: "checking which skills are available before syncing them to an agent",
        dontUseWhen:
          "you need an agent's current skill set — use paperclip_get_agent and check adapterConfig",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListCompanySkillsInput),
    annotations: { title: "List company skills", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt, limit, offset } = validate(ListCompanySkillsInput, args);
        const all = await client.get<unknown[]>(`/api/companies/${client.companyId}/skills`);
        const envelope = paginate(all, { limit, offset });
        const hint = "Use limit/offset to page through company skills.";
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Company Skills", envelope);
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_company_skills" });
      }
    },
  },
];
