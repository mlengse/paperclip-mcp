# MCP Tools Reference

Paperclip MCP exposes Paperclip control plane operations as MCP tools. Tools are registered at server startup and callable by any MCP-compatible host (Claude Code, Cursor, etc.).

## Tool structure

Each tool follows this pattern:

- **Name** — snake_case identifier used by the MCP host
- **Description** — shown in the tool list to the agent
- **Input schema** — JSON Schema for validated parameters
- **Handler** — makes the corresponding Paperclip API call and returns structured text

Input validation uses [Zod](https://zod.dev). Invalid parameters return an `InvalidParams` MCP error before the API is called.

Results are returned as `content[0].text` containing JSON-serialised API response bodies.

---

## Tool groups

| Group                           | Tools                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Identity](#identity-tools)     | `paperclip_get_me`, `paperclip_get_inbox`                                                                                                                                                                                                                                                |
| [Issues](#issue-tools)          | `paperclip_list_issues`, `paperclip_get_issue`, `paperclip_get_heartbeat_context`, `paperclip_checkout_issue`, `paperclip_release_issue`, `paperclip_update_issue`, `paperclip_create_issue`                                                                                             |
| [Comments](#comment-tools)      | `paperclip_list_comments`, `paperclip_add_comment`                                                                                                                                                                                                                                       |
| [Documents](#document-tools)    | `paperclip_list_documents`, `paperclip_get_document`, `paperclip_upsert_document`, `paperclip_delete_document`, `paperclip_get_document_revisions`                                                                                                                                       |
| [Agents](#agent-tools)          | `paperclip_list_agents`, `paperclip_get_agent`, `paperclip_update_agent`, `paperclip_pause_agent`, `paperclip_resume_agent`, `paperclip_invoke_heartbeat`, `paperclip_terminate_agent`, `paperclip_create_agent_key`, `paperclip_list_agent_config_revisions`, `paperclip_rollback_agent_config`, `paperclip_set_agent_instructions_path`, `paperclip_get_org_chart`, `paperclip_sync_agent_skills`, `paperclip_list_company_skills` |
| [Dashboard](#dashboard-tools)   | `paperclip_get_dashboard`                                                                                                                                                                                                                                                                |
| [Approvals](#approval-tools)    | `paperclip_list_approvals`, `paperclip_get_approval`, `paperclip_create_approval`, `paperclip_approve`, `paperclip_reject`, `paperclip_request_revision`, `paperclip_resubmit_approval`, `paperclip_list_approval_comments`, `paperclip_add_approval_comment`, `paperclip_create_agent_hire` |
| [Goals](#goal-tools)            | `paperclip_list_goals`, `paperclip_get_goal`, `paperclip_create_goal`, `paperclip_update_goal`                                                                                                                                                                                           |
| [Projects](#project-tools)      | `paperclip_list_projects`, `paperclip_get_project`, `paperclip_create_project`, `paperclip_update_project`, `paperclip_list_workspaces`, `paperclip_create_workspace`, `paperclip_update_workspace`                                                                                      |
| [Activity](#activity-tools)     | `paperclip_get_activity`, `paperclip_get_cost_summary`, `paperclip_get_costs_by_agent`, `paperclip_get_costs_by_project`                                                                                                                                                                 |
| [Routines](#routine-tools)      | `paperclip_list_routines`, `paperclip_get_routine`, `paperclip_create_routine`, `paperclip_update_routine`, `paperclip_add_routine_trigger`, `paperclip_update_routine_trigger`, `paperclip_delete_routine_trigger`, `paperclip_run_routine`, `paperclip_list_routine_runs`              |
| [Attachments](#attachment-tools)| `paperclip_list_attachments`, `paperclip_upload_attachment`, `paperclip_download_attachment`, `paperclip_delete_attachment`                                                                                                                                                              |

---

## Identity tools

### `paperclip_get_me`

Return the current agent's identity.

**Input:** none

**Output fields:**

| Field                | Type   | Description                         |
| -------------------- | ------ | ----------------------------------- |
| `id`                 | string | Agent UUID                          |
| `name`               | string | Agent display name                  |
| `role`               | string | Agent role (e.g. `engineer`, `cto`) |
| `title`              | string | Job title                           |
| `chainOfCommand`     | array  | Ordered list of manager agents      |
| `capabilities`       | string | Free-text capability description    |
| `budgetMonthlyCents` | number | Monthly spend cap in cents          |
| `spentMonthlyCents`  | number | Spend so far this month             |

**Example:**

```
Prompt: "Who am I in Paperclip?"

Tool call: paperclip_get_me {}

Result:
{
  "id": "4cb0474f-2dce-4da3-af69-fc4ee0c68577",
  "name": "TechWriter",
  "role": "engineer",
  "title": "Technical Writer",
  "chainOfCommand": [
    { "id": "...", "name": "CTO", "role": "cto" }
  ],
  "capabilities": "Owns all documentation in docs/...",
  "budgetMonthlyCents": 0,
  "spentMonthlyCents": 0
}
```

**Errors:** 401 if the API key is invalid or missing.

---

### `paperclip_get_inbox`

Return the current agent's compact assignment list.

**Input:** none

**Output:** Array of assignment objects.

| Field        | Type           | Description                       |
| ------------ | -------------- | --------------------------------- |
| `id`         | string         | Issue UUID                        |
| `identifier` | string         | Human-readable ID (e.g. `PAP-15`) |
| `title`      | string         | Issue title                       |
| `status`     | string         | Current status                    |
| `priority`   | string         | Priority level                    |
| `projectId`  | string         | Owning project UUID               |
| `goalId`     | string         | Linked goal UUID                  |
| `parentId`   | string \| null | Parent issue UUID                 |
| `updatedAt`  | string         | ISO 8601 timestamp                |
| `activeRun`  | object \| null | Current run info if in_progress   |

**Example:**

```
Prompt: "What am I assigned to?"

Tool call: paperclip_get_inbox {}

Result:
[
  {
    "id": "e06ab575-...",
    "identifier": "PAP-15",
    "title": "Write MCP tools API reference documentation",
    "status": "in_progress",
    "priority": "high",
    "updatedAt": "2026-04-08T00:00:00.000Z",
    "activeRun": { "id": "...", "status": "running" }
  }
]
```

**Errors:** 401 if the API key is invalid or missing.

---

## Issue tools

### `paperclip_list_issues`

List issues for the current company with optional filters.

**Input:**

| Parameter         | Type   | Required | Description                                                               |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------- |
| `status`          | string | No       | Comma-separated status values (e.g. `todo,in_progress`)                   |
| `assigneeAgentId` | string | No       | Filter by assignee agent UUID                                             |
| `projectId`       | string | No       | Filter by project UUID                                                    |
| `q`               | string | No       | Full-text search query (matches title, identifier, description, comments) |

**Output:** Array of issue objects (same shape as `paperclip_get_issue` but without ancestor chain).

**Example:**

```
Prompt: "Show me all in-progress issues in project abc123."

Tool call: paperclip_list_issues {
  "status": "in_progress",
  "projectId": "abc123"
}

Result:
[
  { "id": "...", "identifier": "PAP-14", "title": "...", "status": "in_progress", ... },
  ...
]
```

**Errors:** 401 on auth failure.

---

### `paperclip_get_issue`

Get a single issue by ID, including full details and its ancestor chain.

**Input:**

| Parameter | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier (e.g. `PAP-15`) |

**Output:** Full issue object including `ancestors` array (parent → grandparent → ...).

**Example:**

```
Prompt: "Get the details for PAP-15."

Tool call: paperclip_get_issue { "issueId": "PAP-15" }

Result:
{
  "id": "e06ab575-...",
  "identifier": "PAP-15",
  "title": "Write MCP tools API reference documentation",
  "description": "...",
  "status": "in_progress",
  "priority": "high",
  "ancestors": [
    { "id": "...", "identifier": "PAP-9", "title": "Documentation and Technical Writer" }
  ]
}
```

**Errors:** 404 if the issue does not exist; 401 on auth failure.

---

### `paperclip_get_heartbeat_context`

Get a compact context snapshot for an issue — suitable for agent heartbeats without loading the full comment thread.

**Input:**

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `issueId` | string | Yes      | Issue UUID or identifier |

**Output:**

| Field           | Type           | Description                                                |
| --------------- | -------------- | ---------------------------------------------------------- |
| `issue`         | object         | Core issue fields (status, priority, assignee, etc.)       |
| `ancestors`     | array          | Summarised parent chain                                    |
| `project`       | object         | Owning project name and status                             |
| `goal`          | object         | Linked goal title and status                               |
| `commentCursor` | object         | `totalComments`, `latestCommentId`, `latestCommentAt`      |
| `wakeComment`   | object \| null | The comment that triggered the current wake, if applicable |

**Example:**

```
Prompt: "Give me heartbeat context for PAP-15."

Tool call: paperclip_get_heartbeat_context { "issueId": "PAP-15" }

Result:
{
  "issue": { "id": "...", "status": "in_progress", "priority": "high", ... },
  "ancestors": [{ "id": "...", "identifier": "PAP-9", "title": "..." }],
  "project": { "name": "Paperclip MCP", "status": "in_progress" },
  "goal": { "title": "Create MCP to consume Paperclip API...", "status": "active" },
  "commentCursor": { "totalComments": 2, "latestCommentId": "...", "latestCommentAt": "..." },
  "wakeComment": null
}
```

**Errors:** 404 if issue not found; 401 on auth failure.

---

### `paperclip_checkout_issue`

Claim an issue for work. Sets status to `in_progress` and locks it to the current agent.

**Input:**

| Parameter          | Type     | Required | Description                                                         |
| ------------------ | -------- | -------- | ------------------------------------------------------------------- |
| `issueId`          | string   | Yes      | Issue UUID or identifier                                            |
| `expectedStatuses` | string[] | No       | Guard against unexpected current state (e.g. `["todo", "backlog"]`) |

**Output:** Updated issue object with `checkoutRunId` and `startedAt` set.

**Important:** Returns `409 Conflict` if another agent has already checked out the issue. Do not retry a 409 — pick a different task.

**Example:**

```
Prompt: "Check out PAP-15 so I can work on it."

Tool call: paperclip_checkout_issue {
  "issueId": "PAP-15",
  "expectedStatuses": ["todo", "backlog"]
}

Result:
{
  "id": "...",
  "identifier": "PAP-15",
  "status": "in_progress",
  "checkoutRunId": "69c3445d-...",
  "startedAt": "2026-04-08T00:00:00.000Z"
}
```

**Errors:**

| Condition                                  | Behaviour                     |
| ------------------------------------------ | ----------------------------- |
| Issue already checked out by another agent | `409 Conflict` — do not retry |
| Issue not in `expectedStatuses`            | `409 Conflict`                |
| Issue not found                            | `404 Not Found`               |
| Auth failure                               | `401 Unauthorized`            |

---

### `paperclip_release_issue`

Release a checked-out issue back to its prior state without marking it done.

**Input:**

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `issueId` | string | Yes      | Issue UUID or identifier |

**Output:** Updated issue object with checkout cleared.

**Example:**

```
Prompt: "Release PAP-15 — I can't finish it this run."

Tool call: paperclip_release_issue { "issueId": "PAP-15" }

Result:
{ "id": "...", "identifier": "PAP-15", "status": "todo", ... }
```

**Errors:** 404 if issue not found; 401 on auth failure.

---

### `paperclip_update_issue`

Update an issue's fields and optionally post a comment in the same request. The run ID header is injected automatically for audit trail.

**Input:**

| Parameter         | Type           | Required | Description                                                                     |
| ----------------- | -------------- | -------- | ------------------------------------------------------------------------------- |
| `issueId`         | string         | Yes      | Issue UUID or identifier                                                        |
| `status`          | string         | No       | New status (`todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`) |
| `comment`         | string         | No       | Markdown comment to post alongside the update                                   |
| `priority`        | string         | No       | New priority (`critical`, `high`, `medium`, `low`)                              |
| `title`           | string         | No       | New title                                                                       |
| `description`     | string         | No       | New description (markdown)                                                      |
| `assigneeAgentId` | string \| null | No       | Reassign to agent UUID, or `null` to unassign                                   |

At least one optional field must be provided.

**Output:** Updated issue object.

**Example:**

```
Prompt: "Mark PAP-15 as done with a summary comment."

Tool call: paperclip_update_issue {
  "issueId": "PAP-15",
  "status": "done",
  "comment": "All tools documented. Reference covers all 16 tools in `src/index.ts`."
}

Result:
{
  "id": "...",
  "identifier": "PAP-15",
  "status": "done",
  "completedAt": "2026-04-08T00:00:00.000Z"
}
```

**Errors:** 404 if issue not found; 401 on auth failure; 409 if a status transition is invalid.

---

### `paperclip_create_issue`

Create a new issue. The `companyId` is injected from auth config. The run ID header is injected automatically.

**Input:**

| Parameter         | Type   | Required | Description                               |
| ----------------- | ------ | -------- | ----------------------------------------- |
| `title`           | string | Yes      | Issue title                               |
| `description`     | string | No       | Issue description (markdown)              |
| `status`          | string | No       | Initial status (default: `todo`)          |
| `priority`        | string | No       | Priority level (default: `medium`)        |
| `parentId`        | string | No       | Parent issue UUID — required for subtasks |
| `goalId`          | string | No       | Goal UUID to link the issue to            |
| `projectId`       | string | No       | Project UUID to assign                    |
| `assigneeAgentId` | string | No       | Agent UUID to assign on creation          |

**Output:** Created issue object.

**Example:**

```
Prompt: "Create a subtask under PAP-15 to add code examples."

Tool call: paperclip_create_issue {
  "title": "Add code examples to tools reference",
  "parentId": "e06ab575-...",
  "goalId": "467f800f-...",
  "projectId": "b368fc4b-..."
}

Result:
{
  "id": "a1b2c3d4-...",
  "identifier": "PAP-27",
  "title": "Add code examples to tools reference",
  "status": "todo",
  "parentId": "e06ab575-..."
}
```

**Errors:** 400 on invalid input; 401 on auth failure; 404 if parent/project/goal not found.

---

## Comment tools

### `paperclip_list_comments`

List comments on an issue. Supports cursor-based incremental fetching for efficient heartbeat runs.

**Input:**

| Parameter | Type                | Required | Description                                                      |
| --------- | ------------------- | -------- | ---------------------------------------------------------------- |
| `issueId` | string              | Yes      | Issue UUID or identifier (e.g. `PAP-21`)                         |
| `after`   | string              | No       | Comment UUID cursor — returns only comments posted after this ID |
| `order`   | `"asc"` \| `"desc"` | No       | Sort order (default: `asc`)                                      |

**Output:** Array of comment objects.

| Field           | Type           | Description        |
| --------------- | -------------- | ------------------ |
| `id`            | string         | Comment UUID       |
| `body`          | string         | Markdown content   |
| `authorAgentId` | string \| null | Posting agent UUID |
| `authorUserId`  | string \| null | Posting user UUID  |
| `createdAt`     | string         | ISO 8601 timestamp |

**Example:**

```
Prompt: "Show me new comments on PAP-15 since comment abc."

Tool call: paperclip_list_comments {
  "issueId": "PAP-15",
  "after": "abc-comment-id",
  "order": "asc"
}

Result:
[
  {
    "id": "cde82d45-...",
    "body": "Please start on the tools reference.",
    "authorAgentId": "959ce36e-...",
    "createdAt": "2026-04-07T22:41:42.255Z"
  }
]
```

**Errors:** 404 if issue not found; 401 on auth failure.

---

### `paperclip_add_comment`

Post a markdown comment on an issue. The run ID header is injected automatically for audit trail.

**Input:**

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `issueId` | string | Yes      | Issue UUID or identifier |
| `body`    | string | Yes      | Comment body (markdown)  |

**Output:** Created comment object (same shape as entries from `paperclip_list_comments`).

**Example:**

```
Prompt: "Post a status update on PAP-15."

Tool call: paperclip_add_comment {
  "issueId": "PAP-15",
  "body": "## Update\n\nStarting on the tools reference now."
}

Result:
{
  "id": "f1e2d3c4-...",
  "body": "## Update\n\nStarting on the tools reference now.",
  "authorAgentId": "4cb0474f-...",
  "createdAt": "2026-04-08T00:00:00.000Z"
}
```

**Errors:** 404 if issue not found; 401 on auth failure.

---

## Document tools

### `paperclip_list_documents`

List all documents attached to an issue (e.g. `plan`, `notes`).

**Input:**

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `issueId` | string | Yes      | Issue UUID or identifier |

**Output:** Array of document metadata objects.

| Field              | Type   | Description                  |
| ------------------ | ------ | ---------------------------- |
| `key`              | string | Document key (e.g. `plan`)   |
| `title`            | string | Display title                |
| `format`           | string | Always `markdown` currently  |
| `latestRevisionId` | string | UUID of the current revision |
| `updatedAt`        | string | ISO 8601 timestamp           |

**Example:**

```
Prompt: "What documents are attached to PAP-15?"

Tool call: paperclip_list_documents { "issueId": "PAP-15" }

Result:
[
  {
    "key": "plan",
    "title": "Plan",
    "format": "markdown",
    "latestRevisionId": "rev-abc123",
    "updatedAt": "2026-04-08T00:00:00.000Z"
  }
]
```

**Errors:** 404 if issue not found; 401 on auth failure.

---

### `paperclip_get_document`

Get the full content of a specific issue document by key.

**Input:**

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier   |
| `key`     | string | Yes      | Document key (e.g. `plan`) |

**Output:** Document object including `body` (markdown content) and `latestRevisionId` (use this as `baseRevisionId` when updating).

**Example:**

```
Prompt: "Get the plan document for PAP-15."

Tool call: paperclip_get_document {
  "issueId": "PAP-15",
  "key": "plan"
}

Result:
{
  "key": "plan",
  "title": "Plan",
  "format": "markdown",
  "body": "# Plan\n\n1. Read all tool sources...",
  "latestRevisionId": "rev-abc123",
  "updatedAt": "2026-04-08T00:00:00.000Z"
}
```

**Errors:** 404 if issue or document not found; 401 on auth failure.

---

### `paperclip_upsert_document`

Create or update an issue document. Send the current `baseRevisionId` (from a prior `paperclip_get_document` call) for safe concurrent writes. The run ID is injected automatically.

**Input:**

| Parameter        | Type         | Required | Description                                                           |
| ---------------- | ------------ | -------- | --------------------------------------------------------------------- |
| `issueId`        | string       | Yes      | Issue UUID or identifier                                              |
| `key`            | string       | Yes      | Document key (e.g. `plan`)                                            |
| `title`          | string       | Yes      | Document title                                                        |
| `body`           | string       | Yes      | Document body (markdown)                                              |
| `format`         | `"markdown"` | No       | Document format (default: `markdown`)                                 |
| `baseRevisionId` | string       | No       | Current revision ID for optimistic concurrency — omit on first create |

**Output:** Updated document object with new `latestRevisionId`.

**Example (create):**

```
Prompt: "Create a plan document for PAP-15."

Tool call: paperclip_upsert_document {
  "issueId": "PAP-15",
  "key": "plan",
  "title": "Plan",
  "body": "# Plan\n\n1. Read all source files\n2. Write reference\n3. Mark done"
}

Result:
{
  "key": "plan",
  "title": "Plan",
  "body": "# Plan\n\n1. Read all source files\n2. Write reference\n3. Mark done",
  "latestRevisionId": "rev-xyz789"
}
```

**Example (update with concurrency guard):**

```
Tool call: paperclip_upsert_document {
  "issueId": "PAP-15",
  "key": "plan",
  "title": "Plan",
  "body": "# Plan\n\n[updated content]",
  "baseRevisionId": "rev-xyz789"
}
```

**Errors:** 404 if issue not found; 409 if `baseRevisionId` conflicts with a concurrent update; 401 on auth failure.

---

### `paperclip_delete_document`

Delete a document from an issue by key. Use when a document is no longer relevant (e.g. a stale plan). Prefer `paperclip_upsert_document` for clearing content rather than deleting if you may need the key again. The run ID is injected automatically.

**Input:**

| Parameter | Type   | Required | Description                        |
| --------- | ------ | -------- | ---------------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier           |
| `key`     | string | Yes      | Document key to delete (e.g. `plan`) |

**Output:** Confirmation object (empty body or `{ "ok": true }` on success).

**Example:**

```
Prompt: "Delete the plan document from PAP-15."

Tool call: paperclip_delete_document {
  "issueId": "PAP-15",
  "key": "plan"
}

Result:
{}
```

**Errors:** 404 if issue or document not found; 401 on auth failure.

---

### `paperclip_get_document_revisions`

Get the full revision history for an issue document. Use to audit changes or recover a prior version by inspecting previous `revisionId` values.

**Input:**

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier   |
| `key`     | string | Yes      | Document key (e.g. `plan`) |

**Output:** Array of revision objects, newest first.

| Field        | Type   | Description                             |
| ------------ | ------ | --------------------------------------- |
| `revisionId` | string | UUID of this revision                   |
| `body`       | string | Document body at this revision          |
| `createdAt`  | string | ISO 8601 timestamp when revision was saved |

**Example:**

```
Prompt: "Show me the revision history for the plan on PAP-15."

Tool call: paperclip_get_document_revisions {
  "issueId": "PAP-15",
  "key": "plan"
}

Result:
[
  {
    "revisionId": "rev-xyz789",
    "body": "# Plan\n\n[updated content]",
    "createdAt": "2026-04-08T12:00:00.000Z"
  },
  {
    "revisionId": "rev-abc123",
    "body": "# Plan\n\n1. Read all source files\n2. Write reference\n3. Mark done",
    "createdAt": "2026-04-08T09:00:00.000Z"
  }
]
```

**Errors:** 404 if issue or document not found; 401 on auth failure.

---

## Agent tools

### `paperclip_list_agents`

Return all agents registered in the company.

**Input:** none

**Output:** Array of agent objects.

| Field    | Type   | Description                                  |
| -------- | ------ | -------------------------------------------- |
| `id`     | string | Agent UUID                                   |
| `name`   | string | Display name                                 |
| `urlKey` | string | URL-safe key (e.g. `techwriter`)             |
| `role`   | string | Agent role                                   |
| `status` | string | Current status (`idle`, `running`, `paused`) |

**Example:**

```
Prompt: "List all agents in the company."

Tool call: paperclip_list_agents {}

Result:
[
  { "id": "...", "name": "CEO", "urlKey": "ceo", "role": "ceo", "status": "idle" },
  { "id": "...", "name": "CTO", "urlKey": "cto", "role": "cto", "status": "idle" },
  { "id": "...", "name": "TechWriter", "urlKey": "techwriter", "role": "engineer", "status": "running" }
]
```

**Errors:** 401 on auth failure.

---

### `paperclip_get_agent`

Get full details for a single agent by ID.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `agentId` | string | Yes      | Agent UUID  |

**Output:** Full agent object including adapter config, skills, and chain of command.

**Example:**

```
Prompt: "Get full details for agent 4cb0474f."

Tool call: paperclip_get_agent { "agentId": "4cb0474f-2dce-4da3-af69-fc4ee0c68577" }

Result:
{
  "id": "4cb0474f-...",
  "name": "TechWriter",
  "urlKey": "techwriter",
  "role": "engineer",
  "status": "idle",
  "title": "Technical Writer",
  "capabilities": "Owns all documentation...",
  "chainOfCommand": [{ "id": "...", "name": "CTO" }]
}
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_update_agent`

Update an agent's name, title, capabilities, or status. Run ID header is injected automatically.

**Input:**

| Parameter      | Type   | Required | Description                          |
|----------------|--------|----------|--------------------------------------|
| `agentId`      | string | Yes      | Agent UUID                           |
| `name`         | string | No       | New display name                     |
| `title`        | string | No       | New job title                        |
| `capabilities` | string | No       | Updated capability description       |
| `status`       | string | No       | New status (e.g. `active`, `paused`) |

At least one optional field must be provided.

**Output:** Updated agent object.

**Example:**

```
Prompt: "Update the TechWriter agent's title to 'Senior Technical Writer'."

Tool call: paperclip_update_agent {
  "agentId": "4cb0474f-...",
  "title": "Senior Technical Writer"
}

Result:
{ "id": "4cb0474f-...", "name": "TechWriter", "title": "Senior Technical Writer", ... }
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_pause_agent`

Pause an agent, preventing it from starting new heartbeat runs.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `agentId` | string | Yes      | Agent UUID  |

**Output:** Updated agent object with `status: "paused"`.

**Example:**

```
Prompt: "Pause the TechWriter agent."

Tool call: paperclip_pause_agent { "agentId": "4cb0474f-..." }

Result:
{ "id": "4cb0474f-...", "name": "TechWriter", "status": "paused" }
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_resume_agent`

Resume a paused agent, allowing it to start new heartbeat runs.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `agentId` | string | Yes      | Agent UUID  |

**Output:** Updated agent object with `status: "idle"`.

**Example:**

```
Prompt: "Resume the TechWriter agent."

Tool call: paperclip_resume_agent { "agentId": "4cb0474f-..." }

Result:
{ "id": "4cb0474f-...", "name": "TechWriter", "status": "idle" }
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_invoke_heartbeat`

Manually trigger a heartbeat run for an agent immediately, bypassing the schedule. Run ID header is injected automatically.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `agentId` | string | Yes      | Agent UUID  |

**Output:** Created run object with `id` and `status`.

**Example:**

```
Prompt: "Trigger a heartbeat for the Scrum Master agent now."

Tool call: paperclip_invoke_heartbeat { "agentId": "scrum-master-uuid-..." }

Result:
{ "id": "run-uuid-...", "agentId": "scrum-master-uuid-...", "status": "running" }
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_terminate_agent`

Permanently deactivate an agent. **This action is irreversible** — the agent cannot be reactivated after termination. Run ID header is injected automatically.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `agentId` | string | Yes      | Agent UUID  |

**Output:** Terminated agent object.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_create_agent_key`

Create a long-lived API key for an agent. Returns the key value — store it securely, it will not be shown again. Run ID header is injected automatically.

**Input:**

| Parameter   | Type   | Required | Description                   |
|-------------|--------|----------|-------------------------------|
| `agentId`   | string | Yes      | Agent UUID                    |
| `name`      | string | No       | Key label                     |
| `expiresAt` | string | No       | ISO 8601 expiry date          |

**Output:** Created key object including the `key` value (shown once only).

**Example:**

```
Prompt: "Create a long-lived API key for the TechWriter agent."

Tool call: paperclip_create_agent_key {
  "agentId": "4cb0474f-...",
  "name": "CI deployment key"
}

Result:
{
  "id": "key-uuid-...",
  "name": "CI deployment key",
  "key": "pk_live_...",
  "createdAt": "2026-04-09T00:00:00.000Z"
}
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_list_agent_config_revisions`

List the config revision history for an agent.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `agentId` | string | Yes      | Agent UUID  |

**Output:** Array of config revision objects.

| Field       | Type   | Description                        |
|-------------|--------|------------------------------------|
| `id`        | string | Revision UUID                      |
| `createdAt` | string | ISO 8601 timestamp of the revision |
| `diff`      | object | What changed in this revision      |

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_rollback_agent_config`

Rollback an agent's config to a previous revision. Run ID header is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description                         |
|--------------|--------|----------|-------------------------------------|
| `agentId`    | string | Yes      | Agent UUID                          |
| `revisionId` | string | Yes      | Config revision UUID to rollback to |

**Output:** Updated agent object reflecting the rolled-back config.

**Example:**

```
Prompt: "Rollback the TechWriter agent config to revision rev-abc."

Tool call: paperclip_rollback_agent_config {
  "agentId": "4cb0474f-...",
  "revisionId": "rev-abc-..."
}

Result:
{ "id": "4cb0474f-...", "name": "TechWriter", ... }
```

**Errors:** 404 if agent or revision not found; 401 on auth failure.

---

### `paperclip_set_agent_instructions_path`

Set or clear the AGENTS.md instructions file path for an agent. Send `null` to clear the path. Run ID header is injected automatically.

**Input:**

| Parameter        | Type            | Required | Description                                                         |
|------------------|-----------------|----------|---------------------------------------------------------------------|
| `agentId`        | string          | Yes      | Agent UUID                                                          |
| `path`           | string \| null  | Yes      | Path to AGENTS.md file, or `null` to clear                         |
| `adapterConfigKey` | string        | No       | Adapter config key override for non-standard adapters               |

**Output:** Updated agent object with the new instructions path.

**Example:**

```
Prompt: "Set the TechWriter's instructions path to 'agents/techwriter/AGENTS.md'."

Tool call: paperclip_set_agent_instructions_path {
  "agentId": "4cb0474f-...",
  "path": "agents/techwriter/AGENTS.md"
}

Result:
{ "id": "4cb0474f-...", "instructionsFilePath": "agents/techwriter/AGENTS.md", ... }
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_get_org_chart`

Get the full company agent hierarchy (org chart).

**Input:** none

**Output:** Nested agent hierarchy object with each node containing `id`, `name`, `role`, `title`, and `reports` (array of direct reports).

**Example:**

```
Prompt: "Show me the company org chart."

Tool call: paperclip_get_org_chart {}

Result:
{
  "id": "ceo-uuid-...",
  "name": "CEO",
  "role": "ceo",
  "reports": [
    {
      "id": "cto-uuid-...",
      "name": "CTO",
      "role": "cto",
      "reports": [
        { "id": "4cb0474f-...", "name": "TechWriter", "role": "engineer", "reports": [] }
      ]
    }
  ]
}
```

**Errors:** 401 on auth failure.

---

### `paperclip_sync_agent_skills`

Sync the desired skill set for an agent — adds skills not yet assigned and removes skills no longer in the desired list. Run ID header is injected automatically.

**Input:**

| Parameter      | Type     | Required | Description                                              |
|----------------|----------|----------|----------------------------------------------------------|
| `agentId`      | string   | Yes      | Agent UUID                                               |
| `desiredSkills`| string[] | Yes      | Complete list of skill names the agent should have       |

**Output:** Sync result object listing added and removed skills.

**Example:**

```
Prompt: "Sync TechWriter skills to only include 'paperclip' and 'bmad-agent-tech-writer'."

Tool call: paperclip_sync_agent_skills {
  "agentId": "4cb0474f-...",
  "desiredSkills": ["paperclip", "bmad-agent-tech-writer"]
}

Result:
{
  "added": ["paperclip"],
  "removed": ["old-skill"],
  "current": ["paperclip", "bmad-agent-tech-writer"]
}
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_list_company_skills`

List all skills installed in the company.

**Input:** none

**Output:** Array of company skill objects.

| Field       | Type   | Description                              |
|-------------|--------|------------------------------------------|
| `id`        | string | Skill UUID                               |
| `name`      | string | Skill name (used in `desiredSkills`)     |
| `title`     | string | Human-readable title                     |
| `source`    | string | Origin of the skill (e.g. `scanned`)     |
| `createdAt` | string | ISO 8601 timestamp                       |

**Example:**

```
Prompt: "What skills are installed in this company?"

Tool call: paperclip_list_company_skills {}

Result:
[
  { "id": "skill-uuid-...", "name": "paperclip", "title": "Paperclip", "source": "scanned" },
  { "id": "skill-uuid-...", "name": "bmad-agent-tech-writer", "title": "BMad TechWriter", "source": "scanned" }
]
```

**Errors:** 401 on auth failure.

---

## Dashboard tools

### `paperclip_get_dashboard`

Return the company-level health summary: active goals, project status, issues by status, and agent workload.

**Input:** none

**Output:** Dashboard summary object.

| Field            | Type   | Description                 |
| ---------------- | ------ | --------------------------- |
| `goals`          | array  | Active goals with progress  |
| `projects`       | array  | Projects with status counts |
| `issuesByStatus` | object | Count of issues per status  |
| `agentWorkload`  | array  | Per-agent task counts       |

**Example:**

```
Prompt: "Give me a company health overview."

Tool call: paperclip_get_dashboard {}

Result:
{
  "goals": [{ "id": "...", "title": "Create MCP...", "status": "active" }],
  "projects": [{ "name": "Paperclip MCP", "status": "in_progress", "issueCount": 23 }],
  "issuesByStatus": { "todo": 5, "in_progress": 3, "done": 15 },
  "agentWorkload": [{ "agentId": "...", "name": "TechWriter", "inProgress": 1 }]
}
```

**Errors:** 401 on auth failure.

---

## Approval tools

Approval tools manage governance requests and the agent hire flow. Approvals must be explicitly approved or rejected by a board user or authorized agent.

### `paperclip_list_approvals`

List approval requests for the current company.

**Input:**

| Parameter | Type   | Required | Description                                          |
|-----------|--------|----------|------------------------------------------------------|
| `status`  | string | No       | Comma-separated status values (e.g. `pending,approved`) |

**Output:** Array of approval objects.

**Example:**

```
Prompt: "Show me all pending approvals."

Tool call: paperclip_list_approvals { "status": "pending" }

Result:
[
  { "id": "ca6ba09d-...", "title": "Hire senior engineer", "status": "pending", ... }
]
```

**Errors:** 401 on auth failure.

---

### `paperclip_get_approval`

Get a single approval request by ID, including its status and linked issues.

**Input:**

| Parameter    | Type   | Required | Description     |
|--------------|--------|----------|-----------------|
| `approvalId` | string | Yes      | Approval UUID   |

**Output:** Full approval object including `status`, `linkedIssueIds`, and audit timestamps.

**Example:**

```
Prompt: "Get the details for approval ca6ba09d."

Tool call: paperclip_get_approval { "approvalId": "ca6ba09d-..." }

Result:
{
  "id": "ca6ba09d-...",
  "title": "Hire senior engineer",
  "status": "pending",
  "linkedIssueIds": ["..."],
  "createdAt": "2026-04-09T00:00:00.000Z"
}
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_create_approval`

Create a new approval request. The run ID header is injected automatically.

**Input:**

| Parameter        | Type     | Required | Description                              |
|------------------|----------|----------|------------------------------------------|
| `title`          | string   | Yes      | Approval request title                   |
| `description`    | string   | No       | Description / justification (markdown)   |
| `linkedIssueIds` | string[] | No       | Issue UUIDs to link to this approval     |

**Output:** Created approval object.

**Example:**

```
Tool call: paperclip_create_approval {
  "title": "Deploy new MCP server version",
  "description": "Requesting approval to deploy v0.2.0.",
  "linkedIssueIds": ["e06ab575-..."]
}
```

**Errors:** 400 on invalid input; 401 on auth failure.

---

### `paperclip_approve`

Approve an approval request. The run ID header is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description   |
|--------------|--------|----------|---------------|
| `approvalId` | string | Yes      | Approval UUID |

**Output:** Updated approval object with `status: "approved"`.

**Errors:** 404 if not found; 409 if already resolved; 401 on auth failure.

---

### `paperclip_reject`

Reject an approval request. The run ID header is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description           |
|--------------|--------|----------|-----------------------|
| `approvalId` | string | Yes      | Approval UUID         |
| `reason`     | string | No       | Reason for rejection  |

**Output:** Updated approval object with `status: "rejected"`.

**Errors:** 404 if not found; 409 if already resolved; 401 on auth failure.

---

### `paperclip_request_revision`

Request a revision on a pending approval. The run ID header is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description                      |
|--------------|--------|----------|----------------------------------|
| `approvalId` | string | Yes      | Approval UUID                    |
| `feedback`   | string | No       | Feedback on what needs to change |

**Output:** Updated approval object with `status: "revision_requested"`.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_resubmit_approval`

Resubmit an approval request after addressing revision feedback. The run ID header is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description               |
|--------------|--------|----------|---------------------------|
| `approvalId` | string | Yes      | Approval UUID             |
| `comment`    | string | No       | Summary of changes made   |

**Output:** Updated approval object with `status: "pending"`.

**Errors:** 404 if not found; 409 if not in `revision_requested` state; 401 on auth failure.

---

### `paperclip_list_approval_comments`

List comments on an approval request.

**Input:**

| Parameter    | Type   | Required | Description   |
|--------------|--------|----------|---------------|
| `approvalId` | string | Yes      | Approval UUID |

**Output:** Array of comment objects (same shape as issue comments).

**Errors:** 404 if approval not found; 401 on auth failure.

---

### `paperclip_add_approval_comment`

Post a markdown comment on an approval request. The run ID header is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description             |
|--------------|--------|----------|-------------------------|
| `approvalId` | string | Yes      | Approval UUID           |
| `body`       | string | Yes      | Comment body (markdown) |

**Output:** Created comment object.

**Errors:** 404 if approval not found; 401 on auth failure.

---

### `paperclip_create_agent_hire`

Create an agent hire request, which triggers the approval and onboarding flow. The run ID header is injected automatically.

**Input:**

| Parameter      | Type   | Required | Description                             |
|----------------|--------|----------|-----------------------------------------|
| `name`         | string | Yes      | Agent display name                      |
| `role`         | string | Yes      | Agent role (e.g. `engineer`, `cto`)     |
| `title`        | string | No       | Job title                               |
| `capabilities` | string | No       | Free-text capability description        |
| `goalId`       | string | No       | Goal UUID to link the hire to           |
| `projectId`    | string | No       | Project UUID to associate               |

**Output:** Created hire request object, including the linked approval UUID.

**Example:**

```
Prompt: "Hire a new QA engineer."

Tool call: paperclip_create_agent_hire {
  "name": "QA",
  "role": "engineer",
  "title": "QA Engineer",
  "capabilities": "Writes and maintains test suites.",
  "goalId": "467f800f-..."
}

Result:
{
  "id": "hire-uuid-...",
  "agentName": "QA",
  "role": "engineer",
  "approvalId": "ca6ba09d-...",
  "status": "pending_approval"
}
```

**Errors:** 400 on invalid input; 401 on auth failure.

---

## Goal tools

### `paperclip_list_goals`

List goals for the current company.

**Input:** none

**Output:** Array of goal objects.

**Example:**

```
Prompt: "What goals does the company have?"

Tool call: paperclip_list_goals {}

Result:
[
  {
    "id": "467f800f-b971-4494-b25e-bc1d573ad70c",
    "title": "Create MCP to consume Paperclip API",
    "status": "active",
    "level": "company"
  }
]
```

**Errors:** 401 on auth failure.

---

### `paperclip_get_goal`

Get a single goal by ID, including its status and linked projects.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `goalId`  | string | Yes      | Goal UUID   |

**Output:** Full goal object including linked project UUIDs.

**Example:**

```
Prompt: "Get goal 467f800f."

Tool call: paperclip_get_goal { "goalId": "467f800f-b971-4494-b25e-bc1d573ad70c" }

Result:
{
  "id": "467f800f-...",
  "title": "Create MCP to consume Paperclip API",
  "status": "active",
  "level": "company",
  "projectIds": ["b368fc4b-..."]
}
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_create_goal`

Create a new goal. `companyId` is injected from auth config. Run ID is injected automatically.

**Input:**

| Parameter     | Type   | Required | Description                              |
|---------------|--------|----------|------------------------------------------|
| `title`       | string | Yes      | Goal title                               |
| `description` | string | No       | Goal description (markdown)              |
| `status`      | string | No       | Initial status (default: `active`)       |
| `level`       | string | No       | Goal level (e.g. `company`, `team`)      |
| `parentId`    | string | No       | Parent goal UUID for nested goals        |

**Output:** Created goal object.

**Example:**

```
Prompt: "Create a goal to improve test coverage."

Tool call: paperclip_create_goal {
  "title": "Improve test coverage to 90%",
  "level": "team"
}

Result:
{
  "id": "new-goal-uuid-...",
  "title": "Improve test coverage to 90%",
  "status": "active",
  "level": "team"
}
```

**Errors:** 400 on invalid input; 401 on auth failure.

---

### `paperclip_update_goal`

Update a goal's title, description, or status. Run ID is injected automatically.

**Input:**

| Parameter     | Type   | Required | Description          |
|---------------|--------|----------|----------------------|
| `goalId`      | string | Yes      | Goal UUID            |
| `title`       | string | No       | New title            |
| `description` | string | No       | New description (markdown) |
| `status`      | string | No       | New status           |

At least one optional field must be provided.

**Output:** Updated goal object.

**Example:**

```
Prompt: "Mark goal 467f800f as complete."

Tool call: paperclip_update_goal {
  "goalId": "467f800f-...",
  "status": "complete"
}

Result:
{
  "id": "467f800f-...",
  "title": "Create MCP to consume Paperclip API",
  "status": "complete"
}
```

**Errors:** 404 if not found; 401 on auth failure.

---

## Project tools

Project tools manage projects and their associated workspaces. A workspace links a project to a local directory (`cwd`) or remote repository (`repoUrl`) — Paperclip uses it to set up the agent's execution environment.

### `paperclip_list_projects`

List projects for the current company.

**Input:** none

**Output:** Array of project objects.

**Example:**

```
Prompt: "List all projects."

Tool call: paperclip_list_projects {}

Result:
[
  {
    "id": "b368fc4b-b137-42c6-8038-a699cb32f609",
    "name": "Paperclip MCP",
    "status": "in_progress",
    "goalId": "467f800f-..."
  }
]
```

**Errors:** 401 on auth failure.

---

### `paperclip_get_project`

Get a single project by ID, including its workspaces.

**Input:**

| Parameter   | Type   | Required | Description   |
|-------------|--------|----------|---------------|
| `projectId` | string | Yes      | Project UUID  |

**Output:** Full project object including `workspaces` array.

**Example:**

```
Prompt: "Get project b368fc4b."

Tool call: paperclip_get_project { "projectId": "b368fc4b-..." }

Result:
{
  "id": "b368fc4b-...",
  "name": "Paperclip MCP",
  "status": "in_progress",
  "workspaces": [
    { "id": "ws-uuid-...", "cwd": "/home/user/paperclip-mcp", "repoUrl": null }
  ]
}
```

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_create_project`

Create a new project. Optionally include a workspace config to create alongside the project. `companyId` is injected from auth config. Run ID is injected automatically.

**Input:**

| Parameter     | Type   | Required | Description                                          |
|---------------|--------|----------|------------------------------------------------------|
| `name`        | string | Yes      | Project name                                         |
| `description` | string | No       | Project description (markdown)                       |
| `status`      | string | No       | Initial status (default: `active`)                   |
| `goalId`      | string | No       | Goal UUID to link the project to                     |
| `workspace`   | object | No       | Optional workspace to create alongside the project   |
| `workspace.cwd`     | string | No | Local working directory path                       |
| `workspace.repoUrl` | string | No | Remote repository URL                              |

**Output:** Created project object.

**Example:**

```
Prompt: "Create a new project called 'API Gateway' linked to goal 467f800f."

Tool call: paperclip_create_project {
  "name": "API Gateway",
  "goalId": "467f800f-...",
  "workspace": { "cwd": "/home/user/api-gateway" }
}

Result:
{
  "id": "new-proj-uuid-...",
  "name": "API Gateway",
  "status": "active",
  "goalId": "467f800f-..."
}
```

**Errors:** 400 on invalid input; 401 on auth failure.

---

### `paperclip_update_project`

Update a project's name, description, or status. Run ID is injected automatically.

**Input:**

| Parameter     | Type   | Required | Description          |
|---------------|--------|----------|----------------------|
| `projectId`   | string | Yes      | Project UUID         |
| `name`        | string | No       | New name             |
| `description` | string | No       | New description (markdown) |
| `status`      | string | No       | New status           |

At least one optional field must be provided.

**Output:** Updated project object.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_list_workspaces`

List workspaces for a project.

**Input:**

| Parameter   | Type   | Required | Description  |
|-------------|--------|----------|--------------|
| `projectId` | string | Yes      | Project UUID |

**Output:** Array of workspace objects.

| Field      | Type           | Description                          |
|------------|----------------|--------------------------------------|
| `id`       | string         | Workspace UUID                       |
| `cwd`      | string \| null | Local working directory path         |
| `repoUrl`  | string \| null | Remote repository URL                |
| `createdAt`| string         | ISO 8601 creation timestamp          |

**Errors:** 404 if project not found; 401 on auth failure.

---

### `paperclip_create_workspace`

Create a new workspace for a project. Provide at least one of `cwd` or `repoUrl`. Run ID is injected automatically.

**Input:**

| Parameter   | Type   | Required | Description                      |
|-------------|--------|----------|----------------------------------|
| `projectId` | string | Yes      | Project UUID                     |
| `cwd`       | string | No       | Local working directory path     |
| `repoUrl`   | string | No       | Remote repository URL            |

**Output:** Created workspace object.

**Example:**

```
Prompt: "Add a workspace to project b368fc4b pointing to /home/user/code."

Tool call: paperclip_create_workspace {
  "projectId": "b368fc4b-...",
  "cwd": "/home/user/code"
}

Result:
{
  "id": "new-ws-uuid-...",
  "cwd": "/home/user/code",
  "repoUrl": null
}
```

**Errors:** 400 on invalid input; 404 if project not found; 401 on auth failure.

---

### `paperclip_update_workspace`

Update a workspace's `cwd` or `repoUrl`. Run ID is injected automatically.

**Input:**

| Parameter     | Type   | Required | Description                      |
|---------------|--------|----------|----------------------------------|
| `projectId`   | string | Yes      | Project UUID                     |
| `workspaceId` | string | Yes      | Workspace UUID                   |
| `cwd`         | string | No       | New local working directory path |
| `repoUrl`     | string | No       | New remote repository URL        |

At least one of `cwd` or `repoUrl` must be provided.

**Output:** Updated workspace object.

**Errors:** 404 if project or workspace not found; 401 on auth failure.

---

## Activity tools

Activity tools provide audit trail and cost visibility across the company.

### `paperclip_get_activity`

Get audit trail activity for the current company. Optionally filter by agent, entity type, or entity ID.

**Input:**

| Parameter    | Type   | Required | Description                                       |
|--------------|--------|----------|---------------------------------------------------|
| `agentId`    | string | No       | Filter by agent UUID                              |
| `entityType` | string | No       | Filter by entity type (e.g. `issue`, `approval`)  |
| `entityId`   | string | No       | Filter by entity UUID                             |

**Output:** Array of activity event objects.

**Example:**

```
Prompt: "Show me all activity for the TechWriter agent."

Tool call: paperclip_get_activity {
  "agentId": "4cb0474f-2dce-4da3-af69-fc4ee0c68577"
}

Result:
[
  {
    "id": "...",
    "agentId": "4cb0474f-...",
    "action": "update_issue",
    "entityType": "issue",
    "entityId": "e06ab575-...",
    "createdAt": "2026-04-09T12:00:00.000Z"
  }
]
```

**Errors:** 401 on auth failure.

---

### `paperclip_get_cost_summary`

Get a cost summary for the current company across all agents and projects.

**Input:** none

**Output:** Cost summary object with total spend, budget, and per-period breakdowns.

**Errors:** 401 on auth failure.

---

### `paperclip_get_costs_by_agent`

Get costs broken down by agent for the current company.

**Input:** none

**Output:** Array of per-agent cost objects.

| Field     | Type   | Description                    |
|-----------|--------|--------------------------------|
| `agentId` | string | Agent UUID                     |
| `name`    | string | Agent display name             |
| `cents`   | number | Total spend in cents           |

**Errors:** 401 on auth failure.

---

### `paperclip_get_costs_by_project`

Get costs broken down by project for the current company.

**Input:** none

**Output:** Array of per-project cost objects.

| Field       | Type   | Description          |
|-------------|--------|----------------------|
| `projectId` | string | Project UUID         |
| `name`      | string | Project name         |
| `cents`     | number | Total spend in cents |

**Errors:** 401 on auth failure.

---

## Routine tools

Routine tools manage recurring scheduled tasks. A routine belongs to an agent and is triggered by one or more triggers (cron schedule, webhook, or API call). Create the routine first, then add triggers separately.

### `paperclip_list_routines`

List all routines for the current company.

**Input:** none

**Output:** Array of routine objects.

**Errors:** 401 on auth failure.

---

### `paperclip_get_routine`

Get a single routine by ID, including its triggers and recent runs.

**Input:**

| Parameter   | Type   | Required | Description  |
|-------------|--------|----------|--------------|
| `routineId` | string | Yes      | Routine UUID |

**Output:** Full routine object including `triggers` array and `recentRuns` array.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_create_routine`

Create a new routine for an agent. Add triggers separately with `paperclip_add_routine_trigger`. Run ID is injected automatically.

**Input:**

| Parameter           | Type   | Required | Description                                                      |
|---------------------|--------|----------|------------------------------------------------------------------|
| `agentId`           | string | Yes      | Agent UUID to run the routine                                    |
| `name`              | string | Yes      | Routine name                                                     |
| `description`       | string | No       | Routine description                                              |
| `concurrencyPolicy` | string | No       | What to do if a run is already active: `allow`, `forbid`, `replace` |
| `catchUpPolicy`     | string | No       | What to do with missed runs: `skip`, `run_once`                  |

**Output:** Created routine object.

**Example:**

```
Prompt: "Create a daily heartbeat routine for the TechWriter agent."

Tool call: paperclip_create_routine {
  "agentId": "4cb0474f-...",
  "name": "Daily docs check",
  "concurrencyPolicy": "forbid",
  "catchUpPolicy": "skip"
}

Result:
{
  "id": "routine-uuid-...",
  "name": "Daily docs check",
  "agentId": "4cb0474f-...",
  "status": "active"
}
```

**Errors:** 400 on invalid input; 401 on auth failure.

---

### `paperclip_update_routine`

Update a routine's name, description, or scheduling policies. Run ID is injected automatically.

**Input:**

| Parameter           | Type   | Required | Description              |
|---------------------|--------|----------|--------------------------|
| `routineId`         | string | Yes      | Routine UUID             |
| `name`              | string | No       | New name                 |
| `description`       | string | No       | New description          |
| `concurrencyPolicy` | string | No       | New concurrency policy   |
| `catchUpPolicy`     | string | No       | New catch-up policy      |

At least one optional field must be provided.

**Output:** Updated routine object.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_add_routine_trigger`

Add a trigger to a routine (schedule, webhook, or api). For schedule triggers, provide a cron expression in `config.cron`. Run ID is injected automatically.

**Input:**

| Parameter      | Type   | Required | Description                                          |
|----------------|--------|----------|------------------------------------------------------|
| `routineId`    | string | Yes      | Routine UUID                                         |
| `type`         | string | Yes      | Trigger type: `schedule`, `webhook`, or `api`        |
| `config`       | object | No       | Trigger configuration                                |
| `config.cron`  | string | No       | Cron expression (required when `type` is `schedule`) |

**Output:** Created trigger object including its UUID (needed for updates and deletes).

**Example:**

```
Prompt: "Add a daily 9am schedule trigger to routine abc."

Tool call: paperclip_add_routine_trigger {
  "routineId": "routine-uuid-...",
  "type": "schedule",
  "config": { "cron": "0 9 * * *" }
}

Result:
{
  "id": "trigger-uuid-...",
  "routineId": "routine-uuid-...",
  "type": "schedule",
  "config": { "cron": "0 9 * * *" }
}
```

**Errors:** 400 on invalid input; 404 if routine not found; 401 on auth failure.

---

### `paperclip_update_routine_trigger`

Update an existing routine trigger's type or config. Run ID is injected automatically.

**Input:**

| Parameter     | Type   | Required | Description                |
|---------------|--------|----------|----------------------------|
| `triggerId`   | string | Yes      | Routine trigger UUID       |
| `type`        | string | No       | New trigger type           |
| `config`      | object | No       | New trigger configuration  |
| `config.cron` | string | No       | New cron expression        |

**Output:** Updated trigger object.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_delete_routine_trigger`

Delete a routine trigger. The routine itself is not deleted. Run ID is injected automatically.

**Input:**

| Parameter   | Type   | Required | Description          |
|-------------|--------|----------|----------------------|
| `triggerId` | string | Yes      | Routine trigger UUID |

**Output:** Deleted trigger object or confirmation.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_run_routine`

Manually trigger a routine run immediately, bypassing its schedule. Run ID is injected automatically.

**Input:**

| Parameter   | Type   | Required | Description  |
|-------------|--------|----------|--------------|
| `routineId` | string | Yes      | Routine UUID |

**Output:** Created run object with `id` and `status`.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_list_routine_runs`

List historical runs for a routine.

**Input:**

| Parameter   | Type   | Required | Description  |
|-------------|--------|----------|--------------|
| `routineId` | string | Yes      | Routine UUID |

**Output:** Array of run objects.

| Field       | Type   | Description                                     |
|-------------|--------|-------------------------------------------------|
| `id`        | string | Run UUID                                        |
| `status`    | string | Run status (`running`, `completed`, `failed`)   |
| `startedAt` | string | ISO 8601 start timestamp                        |
| `endedAt`   | string \| null | ISO 8601 end timestamp               |

**Errors:** 404 if routine not found; 401 on auth failure.

---

## Attachment tools

Attachment tools manage file attachments on issues. Files are uploaded from the local filesystem and stored server-side. Downloaded content is returned as base64.

### `paperclip_list_attachments`

List all attachments on an issue.

**Input:**

| Parameter | Type   | Required | Description              |
|-----------|--------|----------|--------------------------|
| `issueId` | string | Yes      | Issue UUID or identifier |

**Output:** Array of attachment metadata objects.

| Field       | Type   | Description              |
|-------------|--------|--------------------------|
| `id`        | string | Attachment UUID          |
| `filename`  | string | Original filename        |
| `mimeType`  | string | MIME type                |
| `size`      | number | File size in bytes       |
| `createdAt` | string | ISO 8601 timestamp       |

**Errors:** 404 if issue not found; 401 on auth failure.

---

### `paperclip_upload_attachment`

Upload a local file as an attachment to an issue. Provide the absolute file path. Run ID is injected automatically.

**Input:**

| Parameter  | Type   | Required | Description                                                          |
|------------|--------|----------|----------------------------------------------------------------------|
| `issueId`  | string | Yes      | Issue UUID or identifier                                             |
| `filePath` | string | Yes      | Absolute path to the local file to upload                            |
| `filename` | string | No       | Override filename in the upload (defaults to basename of `filePath`) |
| `mimeType` | string | No       | MIME type (e.g. `text/plain`, `application/pdf`)                     |

**Output:** Created attachment object including its UUID.

**Example:**

```
Prompt: "Attach the report at /home/user/report.pdf to PAP-15."

Tool call: paperclip_upload_attachment {
  "issueId": "PAP-15",
  "filePath": "/home/user/report.pdf",
  "mimeType": "application/pdf"
}

Result:
{
  "id": "att-uuid-...",
  "filename": "report.pdf",
  "mimeType": "application/pdf",
  "size": 204800
}
```

**Errors:** 400 if file path invalid; 404 if issue not found; 401 on auth failure.

---

### `paperclip_download_attachment`

Download the content of an attachment by ID. Returns the content as base64.

**Input:**

| Parameter      | Type   | Required | Description     |
|----------------|--------|----------|-----------------|
| `attachmentId` | string | Yes      | Attachment UUID |

**Output:** Object with `content` (base64-encoded file data) and `mimeType`.

**Errors:** 404 if not found; 401 on auth failure.

---

### `paperclip_delete_attachment`

Delete an attachment from an issue. Run ID is injected automatically.

**Input:**

| Parameter      | Type   | Required | Description     |
|----------------|--------|----------|-----------------|
| `attachmentId` | string | Yes      | Attachment UUID |

**Output:** Deleted attachment object or confirmation.

**Errors:** 404 if not found; 401 on auth failure.

---

## Error handling

All handlers catch `PaperclipApiError` and return `isError: true` results. The `content[0].text` field contains a human-readable error message.

| HTTP status | MCP behaviour                             |
| ----------- | ----------------------------------------- |
| 400         | `isError: true` with validation message   |
| 401 / 403   | `isError: true` with auth error           |
| 404         | `isError: true` with not-found message    |
| 409         | `isError: true` with conflict message     |
| 5xx         | `isError: true` with server error message |

---

## Adding a tool

1. Create a new module under `src/tools/`.
2. Export a `ToolDefinition[]` array (see `src/tools/index.ts` for the interface).
3. Import and spread the array into `ALL_TOOLS` in `src/tools/index.ts`.
4. Add the tool to this reference page.

---

## Related

- [Architecture overview](../architecture/overview.md)
- [Getting started](../guides/getting-started.md)
