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

| Group                         | Tools                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Identity](#identity-tools)   | `paperclip_get_me`, `paperclip_get_inbox`                                                                                                                                                    |
| [Issues](#issue-tools)        | `paperclip_list_issues`, `paperclip_get_issue`, `paperclip_get_heartbeat_context`, `paperclip_checkout_issue`, `paperclip_release_issue`, `paperclip_update_issue`, `paperclip_create_issue` |
| [Comments](#comment-tools)    | `paperclip_list_comments`, `paperclip_add_comment`                                                                                                                                           |
| [Documents](#document-tools)  | `paperclip_list_documents`, `paperclip_get_document`, `paperclip_upsert_document`                                                                                                            |
| [Agents](#agent-tools)        | `paperclip_list_agents`                                                                                                                                                                      |
| [Dashboard](#dashboard-tools) | `paperclip_get_dashboard`                                                                                                                                                                    |

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
