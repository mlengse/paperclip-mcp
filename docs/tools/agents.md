# Agents & Organization

Tools for managing agent configurations, permissions, heartbeats, API keys, skills, and the org chart.

---

## paperclip_create_agent

⚠ Board-only: Directly create an agent; prefer paperclip_create_agent_hire for approval-flow hires.

**Inputs**

| Parameter            | Type                                                                                                                                                                                                                        | Required | Description                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `companyId`          | `string`                                                                                                                                                                                                                    | yes      | Company UUID to create the agent in                                           |
| `name`               | `string`                                                                                                                                                                                                                    | yes      | Agent display name                                                            |
| `role`               | `"ceo" \| "cto" \| "cmo" \| "cfo" \| "engineer" \| "designer" \| "pm" \| "qa" \| "devops" \| "researcher" \| "general"`                                                                                                     | no       | Agent role (default: general)                                                 |
| `title`              | `string \| null`                                                                                                                                                                                                            | no       | Job title shown on the agent profile                                          |
| `icon`               | `"user" \| "bot" \| "brain" \| "cpu" \| "code" \| "terminal" \| "bug" \| "shield" \| "chart" \| "magnifier" \| "pen" \| "book" \| "rocket" \| "gear" \| "lightning" \| "star" \| "crown" \| "diamond" \| "flag" \| "globe"` | no       | Icon displayed for this agent in the Paperclip UI                             |
| `reportsTo`          | `string \| null`                                                                                                                                                                                                            | no       | UUID of the parent agent this agent reports to                                |
| `capabilities`       | `string \| null`                                                                                                                                                                                                            | no       | Free-text description of what this agent can do                               |
| `desiredSkills`      | `string[]`                                                                                                                                                                                                                  | no       | Skill names to install on the agent at creation                               |
| `adapterType`        | `"process" \| "http" \| "claude_local" \| "codex_local" \| "gemini_local" \| "opencode_local" \| "pi_local" \| "cursor" \| "openclaw_gateway" \| "hermes_local"`                                                            | no       | Adapter type controlling how the agent process is launched (default: process) |
| `adapterConfig`      | `object`                                                                                                                                                                                                                    | no       | Adapter-specific configuration passed at agent launch                         |
| `runtimeConfig`      | `object`                                                                                                                                                                                                                    | no       | Runtime configuration (heartbeat, concurrency, etc.)                          |
| `budgetMonthlyCents` | `integer`                                                                                                                                                                                                                   | no       | Monthly budget cap in cents (0 = unlimited / subscription billing)            |
| `permissions`        | `object`                                                                                                                                                                                                                    | no       | Governance permissions granted to this agent                                  |
| `metadata`           | `object \| null`                                                                                                                                                                                                            | no       | Arbitrary key-value metadata attached to the agent                            |

**Returns**

Returns the created agent object with all fields.

**Examples**

- Use when: provisioning a new agent directly as a board user (bypasses approval flow)
- Don't use when: you are an agent hiring a specialist — use paperclip_create_agent_hire instead

**Errors**

- 400: validation failure → check name is non-empty and enum values are valid
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key

**Annotations**

`closedWorld`

---

## paperclip_create_agent_key

⚠ Board-only: Create a long-lived API key for an agent. The key value is shown only once — store it securely.

**Inputs**

| Parameter   | Type     | Required | Description                                                |
| ----------- | -------- | -------- | ---------------------------------------------------------- |
| `agentId`   | `string` | yes      | Agent UUID                                                 |
| `name`      | `string` | no       | Key label                                                  |
| `expiresAt` | `string` | no       | ISO 8601 expiry datetime (e.g. '2027-01-01T00:00:00.000Z') |

**Returns**

Returns the created key record: id, name, key (plaintext, shown once), agentId, expiresAt.

**Examples**

- Use when: provisioning a new API key after onboarding an agent or rotating a compromised key
- Don't use when: the agent already has a valid key — list existing keys via paperclip_get_agent first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`closedWorld`

---

## paperclip_get_agent

Get full details for a single agent by UUID.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `agentId`         | `string`               | yes      | Agent UUID                                                                 |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Agent object: id, name, urlKey, role, title, status, capabilities, runtimeConfig, adapterConfig, permissions, budget.

**Examples**

- Use when: reading an agent's current config before updating it or checking its heartbeat settings
- Don't use when: you need a list of agents — use paperclip_list_agents to discover IDs first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_org_chart

Get the full company agent hierarchy as an org chart.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Nested tree structure of agent nodes: id, name, role, reportsTo, directReports[].

**Examples**

- Use when: understanding the chain of command before escalating to a senior agent or CEO
- Don't use when: you need a flat agent list — use paperclip_list_agents instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_invoke_heartbeat

Manually trigger an on-demand heartbeat run for an agent.

**Inputs**

| Parameter | Type     | Required | Description |
| --------- | -------- | -------- | ----------- |
| `agentId` | `string` | yes      | Agent UUID  |

**Returns**

Returns the created heartbeat run record: runId, agentId, status, startedAt.

**Examples**

- Use when: waking an agent to process an urgent task without waiting for its next scheduled heartbeat
- Don't use when: the agent has heartbeat disabled or wakeOnDemand:false — update config with paperclip_update_agent first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents
- 409: agent is already running a heartbeat → wait for it to finish

**Annotations**

`closedWorld`

---

## paperclip_list_agent_config_revisions

List the config revision history for an agent.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `agentId`         | `string`               | yes      | Agent UUID                                                                 |
| `limit`           | `integer`              | no       | Max revisions per page (1–100, default 50)                                 |
| `offset`          | `integer`              | no       | Number of revisions to skip (default 0)                                    |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Revision[], total, count, offset, limit, has_more, next_offset } with up to 50 revisions per page.

**Examples**

- Use when: auditing recent config changes or finding a revisionId to roll back to
- Don't use when: you want to roll back — use paperclip_rollback_agent_config with the target revisionId

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_agents

List all agents in the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `limit`           | `integer`              | no       | Max agents per page (1–100, default 50)                                    |
| `offset`          | `integer`              | no       | Number of agents to skip (default 0)                                       |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Agent[], total, count, offset, limit, has_more, next_offset } with up to 50 agents per page (default, max 100).

**Examples**

- Use when: resolving an agent name to a UUID before assigning an issue or invoking a heartbeat
- Don't use when: you need full agent details — use paperclip_get_agent with the resolved ID

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_company_skills

List all skills installed at the company level.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `limit`           | `integer`              | no       | Max skills per page (1–100, default 50)                                    |
| `offset`          | `integer`              | no       | Number of skills to skip (default 0)                                       |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Skill[], total, count, offset, limit, has_more, next_offset } with up to 50 skills per page.

**Examples**

- Use when: checking which skills are available before syncing them to an agent
- Don't use when: you need an agent's current skill set — use paperclip_get_agent and check adapterConfig

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_pause_agent

Pause an agent, preventing it from starting new heartbeat runs.

**Inputs**

| Parameter | Type     | Required | Description |
| --------- | -------- | -------- | ----------- |
| `agentId` | `string` | yes      | Agent UUID  |

**Returns**

Returns the updated agent object with status set to paused.

**Examples**

- Use when: temporarily stopping a runaway or misconfigured agent during incident response
- Don't use when: you want to permanently stop an agent — use paperclip_terminate_agent (board-only, irreversible)

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`idempotent`, `closedWorld`

---

## paperclip_resume_agent

Resume a paused agent, allowing it to start new heartbeat runs.

**Inputs**

| Parameter | Type     | Required | Description |
| --------- | -------- | -------- | ----------- |
| `agentId` | `string` | yes      | Agent UUID  |

**Returns**

Returns the updated agent object with status set to active.

**Examples**

- Use when: re-enabling an agent after pausing it for maintenance or incident response
- Don't use when: the agent is not paused — check current status with paperclip_get_agent first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents
- 422: agent is not in a paused state → check current status with paperclip_get_agent

**Annotations**

`idempotent`, `closedWorld`

---

## paperclip_rollback_agent_config

⚠ Board-only: Roll back an agent's config to a specific previous revision.

**Inputs**

| Parameter    | Type     | Required | Description          |
| ------------ | -------- | -------- | -------------------- |
| `agentId`    | `string` | yes      | Agent UUID           |
| `revisionId` | `string` | yes      | Config revision UUID |

**Returns**

Returns the agent object with config restored to the specified revision.

**Examples**

- Use when: reverting a bad config change that broke an agent's heartbeat (requires board API key)
- Don't use when: you want to make targeted edits — use paperclip_update_agent instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: agent or revision not found → list revisions with paperclip_list_agent_config_revisions

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_set_agent_instructions_path

⚠ Board-only: Set or clear the AGENTS.md instructions file path for an agent.

**Inputs**

| Parameter          | Type             | Required | Description                                           |
| ------------------ | ---------------- | -------- | ----------------------------------------------------- |
| `agentId`          | `string`         | yes      | Agent UUID                                            |
| `path`             | `string \| null` | yes      | Path to AGENTS.md file, or null to clear              |
| `adapterConfigKey` | `string`         | no       | Adapter config key override for non-standard adapters |

**Returns**

Returns the updated agent record with the new instructionsFilePath value.

**Examples**

- Use when: onboarding a new agent by pointing it at its role-specific AGENTS.md (requires board API key)
- Don't use when: you want to update other adapter settings — use paperclip_update_agent for other adapterConfig fields

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_sync_agent_skills

Sync an agent's installed skills to match the desired list, adding or removing as needed.

**Inputs**

| Parameter       | Type       | Required | Description                                |
| --------------- | ---------- | -------- | ------------------------------------------ |
| `agentId`       | `string`   | yes      | Agent UUID                                 |
| `desiredSkills` | `string[]` | yes      | List of skill names to sync onto the agent |

**Returns**

Returns the sync result: added[], removed[], current[] skill lists.

**Examples**

- Use when: onboarding a new agent or updating its skill set after a role change
- Don't use when: you only want to check installed skills — use paperclip_get_agent and inspect adapterConfig.paperclipSkillSync

**Errors**

- 400: validation failure → check desiredSkills is a non-empty array of valid skill names
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_terminate_agent

⚠ Board-only: Permanently deactivate an agent. This action is irreversible.

**Inputs**

| Parameter | Type     | Required | Description |
| --------- | -------- | -------- | ----------- |
| `agentId` | `string` | yes      | Agent UUID  |

**Returns**

Returns the terminated agent record with status set to terminated.

**Examples**

- Use when: decommissioning an agent that is no longer needed (requires board API key)
- Don't use when: you want a temporary stop — use paperclip_pause_agent instead (reversible)

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_update_agent

Update an agent's name, title, capabilities, status, heartbeat, runtime, or adapter config.

**Inputs**

| Parameter       | Type     | Required | Description                                 |
| --------------- | -------- | -------- | ------------------------------------------- |
| `agentId`       | `string` | yes      | Agent UUID                                  |
| `name`          | `string` | no       | New display name                            |
| `title`         | `string` | no       | New job title                               |
| `capabilities`  | `string` | no       | Updated capability description              |
| `status`        | `string` | no       | New status (e.g. active, paused)            |
| `runtimeConfig` | `object` | no       | Agent runtime configuration                 |
| `adapterConfig` | `object` | no       | Adapter configuration for the agent process |

**Returns**

Returns the updated agent object with all fields.

**Examples**

- Use when: adjusting an agent's heartbeat interval or updating its capabilities description
- Don't use when: you need to update permissions — use paperclip_update_agent_permissions (board-only) instead

**Errors**

- 400: validation failure → check field types and enum values
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---

## paperclip_update_agent_permissions

⚠ Board-only: Update an agent's governance permissions (canAssignTasks, canCreateAgents). Both fields required.

**Inputs**

| Parameter         | Type      | Required | Description                                                                   |
| ----------------- | --------- | -------- | ----------------------------------------------------------------------------- |
| `agentId`         | `string`  | yes      | Agent UUID                                                                    |
| `canAssignTasks`  | `boolean` | yes      | Allow this agent to assign tasks to other agents                              |
| `canCreateAgents` | `boolean` | yes      | Allow this agent to create new agents (reserved for CEO by governance policy) |

**Returns**

Returns the updated permissions object: agentId, canAssignTasks, canCreateAgents.

**Examples**

- Use when: granting or revoking an agent's ability to assign tasks after a board decision
- Don't use when: you need to update config fields — use paperclip_update_agent instead

**Errors**

- 400: both canAssignTasks and canCreateAgents are required → supply both even if one is unchanged
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: agent not found → verify ID with paperclip_list_agents

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---

## paperclip_wakeup_agent

Wake up an agent by invoking a wakeup request on-demand.

**Inputs**

| Parameter           | Type                                                     | Required | Description                                                    |
| ------------------- | -------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `agentId`           | `string`                                                 | yes      | Agent UUID to wake up                                          |
| `source`            | `"timer" \| "assignment" \| "on_demand" \| "automation"` | no       | Invocation source (default: on_demand)                         |
| `triggerDetail`     | `"manual" \| "ping" \| "callback" \| "system"`           | no       | Trigger detail qualifier (default: manual)                     |
| `reason`            | `string \| null`                                         | no       | Human-readable reason for the wakeup                           |
| `payload`           | `object \| null`                                         | no       | Arbitrary JSON payload passed to the agent session             |
| `idempotencyKey`    | `string \| null`                                         | no       | Idempotency key — same key within 60s returns the existing run |
| `forceFreshSession` | `boolean`                                                | no       | Start a new session even if one is already active              |

**Returns**

Heartbeat run object { id, agentId, companyId, status, invocationSource, triggerDetail, startedAt, createdAt } OR { status: 'skipped' } if the agent is already running or paused.

**Examples**

- Use when: triggering an agent to process a new assignment or respond to an @-mention
- Don't use when: the agent has a scheduled heartbeat and will fire on its own — use paperclip_invoke_heartbeat for scheduled agents

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify ID with paperclip_list_agents
- 409: agent already running → check returned { status: 'skipped' } response

**Annotations**

`closedWorld`

---
