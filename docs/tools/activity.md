# Activity & Costs

Tools for querying activity logs, cost summaries, per-agent and per-project cost breakdowns, and reporting cost events.

---

## paperclip_get_activity

Get the audit trail activity feed for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `agentId`         | `string`               | no       | Filter by agent ID                                                         |
| `entityType`      | `string`               | no       | Filter by entity type (e.g. issue, approval)                               |
| `entityId`        | `string`               | no       | Filter by entity ID                                                        |
| `limit`           | `integer`              | no       | Max events per page (1–100, default 50)                                    |
| `offset`          | `integer`              | no       | Number of events to skip (default 0)                                       |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: ActivityEvent[], total, count, offset, limit, has_more, next_offset }. Each item: id, agentId, entityType, entityId, action, occurredAt, metadata.

**Examples**

- Use when: auditing what an agent did on a specific issue or reviewing recent company actions
- Don't use when: you need issue comments — use paperclip_list_comments instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_cost_summary

Get a rolled-up cost summary for the current company across all agents and projects.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Object with total cost in cents, breakdown by period, and per-agent/per-project aggregates.

**Examples**

- Use when: checking overall spend before requesting a budget override approval
- Don't use when: you need per-agent costs — use paperclip_get_costs_by_agent for a per-agent breakdown

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_costs_by_agent

Get LLM token costs broken down by agent for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Array of per-agent cost records: agentId, agentName, totalCents, tokenCounts.

**Examples**

- Use when: identifying which agent is consuming the most budget this period
- Don't use when: you need project-level costs — use paperclip_get_costs_by_project instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_costs_by_project

Get LLM token costs broken down by project for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Array of per-project cost records: projectId, projectName, totalCents, tokenCounts.

**Examples**

- Use when: comparing spend across projects to prioritise budget allocation
- Don't use when: you need agent-level costs — use paperclip_get_costs_by_agent instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_report_cost_event

Report an agent's token usage and cost event to Paperclip for budget tracking.

**Inputs**

| Parameter      | Type      | Required | Description                                      |
| -------------- | --------- | -------- | ------------------------------------------------ |
| `agentId`      | `string`  | yes      | ID of the agent that incurred the cost           |
| `provider`     | `string`  | yes      | LLM provider name (e.g. anthropic, openai)       |
| `model`        | `string`  | yes      | Model name (e.g. claude-sonnet-4-6)              |
| `inputTokens`  | `integer` | yes      | Number of input tokens consumed                  |
| `outputTokens` | `integer` | yes      | Number of output tokens generated                |
| `costCents`    | `number`  | yes      | Total cost in cents                              |
| `occurredAt`   | `string`  | yes      | ISO 8601 timestamp of when the cost was incurred |

**Returns**

Returns the created cost event record: id, agentId, provider, model, costCents, occurredAt.

**Examples**

- Use when: recording a completed LLM API call for spend analytics and budget enforcement
- Don't use when: you want a cost summary — use paperclip_get_cost_summary or paperclip_get_costs_by_agent

**Errors**

- 400: validation failure → check costCents ≥ 0, occurredAt is valid ISO 8601, tokens are integers
- 401: authentication failed → check PAPERCLIP_API_KEY

**Annotations**

`closedWorld`

---
