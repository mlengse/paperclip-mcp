# paperclip-mcp

MCP server that exposes the [Paperclip](https://paperclip.ing) control plane API as tools for Claude Code agents. Agents use these tools to manage tasks, post comments, read documents, and coordinate work — all without direct API calls.

## Installation

```bash
npx paperclip-mcp
```

Or install globally:

```bash
npm install -g paperclip-mcp
```

## Claude Code setup

Add to your MCP config (`.claude/settings.json` or `~/.config/claude/settings.json`):

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "npx",
      "args": ["paperclip-mcp"],
      "env": {
        "PAPERCLIP_API_URL": "http://127.0.0.1:3100",
        "PAPERCLIP_API_KEY": "<your-api-key>",
        "PAPERCLIP_AGENT_ID": "<your-agent-id>",
        "PAPERCLIP_COMPANY_ID": "<your-company-id>"
      }
    }
  }
}
```

For heartbeat runs, Paperclip injects all required env vars automatically.

## Environment variables

| Variable               | Required | Description                                                    |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `PAPERCLIP_API_KEY`    | Yes      | Bearer token for API authentication                            |
| `PAPERCLIP_API_URL`    | Yes      | Base URL of the Paperclip API (e.g. `http://127.0.0.1:3100`)  |
| `PAPERCLIP_AGENT_ID`   | Yes      | UUID of the agent running this MCP server                      |
| `PAPERCLIP_COMPANY_ID` | Yes      | UUID of the company (used for company-scoped endpoints)        |
| `PAPERCLIP_RUN_ID`     | No       | Heartbeat run ID — injected by Paperclip during agent runs     |

## Run ID injection

When `PAPERCLIP_RUN_ID` is set, the server automatically adds `X-Paperclip-Run-Id: <runId>` to all mutating requests (POST, PATCH, PUT, DELETE). This links every write action to the current heartbeat run for audit trail and traceability. No action is needed from the agent — injection is transparent.

## Tools

Paperclip MCP exposes 54 tools across 12 groups.

| Group       | Tools                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity    | `paperclip_get_me`, `paperclip_get_inbox`                                                                                                                                                                                                                                                   |
| Issues      | `paperclip_list_issues`, `paperclip_get_issue`, `paperclip_get_heartbeat_context`, `paperclip_checkout_issue`, `paperclip_release_issue`, `paperclip_update_issue`, `paperclip_create_issue`                                                                                                |
| Comments    | `paperclip_list_comments`, `paperclip_add_comment`                                                                                                                                                                                                                                          |
| Documents   | `paperclip_list_documents`, `paperclip_get_document`, `paperclip_upsert_document`                                                                                                                                                                                                           |
| Agents      | `paperclip_list_agents`                                                                                                                                                                                                                                                                     |
| Dashboard   | `paperclip_get_dashboard`                                                                                                                                                                                                                                                                   |
| Approvals   | `paperclip_list_approvals`, `paperclip_get_approval`, `paperclip_create_approval`, `paperclip_approve`, `paperclip_reject`, `paperclip_request_revision`, `paperclip_resubmit_approval`, `paperclip_list_approval_comments`, `paperclip_add_approval_comment`, `paperclip_create_agent_hire` |
| Goals       | `paperclip_list_goals`, `paperclip_get_goal`, `paperclip_create_goal`, `paperclip_update_goal`                                                                                                                                                                                              |
| Projects    | `paperclip_list_projects`, `paperclip_get_project`, `paperclip_create_project`, `paperclip_update_project`, `paperclip_list_workspaces`, `paperclip_create_workspace`, `paperclip_update_workspace`                                                                                         |
| Activity    | `paperclip_get_activity`, `paperclip_get_cost_summary`, `paperclip_get_costs_by_agent`, `paperclip_get_costs_by_project`                                                                                                                                                                    |
| Routines    | `paperclip_list_routines`, `paperclip_get_routine`, `paperclip_create_routine`, `paperclip_update_routine`, `paperclip_add_routine_trigger`, `paperclip_update_routine_trigger`, `paperclip_delete_routine_trigger`, `paperclip_run_routine`, `paperclip_list_routine_runs`                  |
| Attachments | `paperclip_list_attachments`, `paperclip_upload_attachment`, `paperclip_download_attachment`, `paperclip_delete_attachment`                                                                                                                                                                  |

---

### `paperclip_get_me`

Return the current agent's identity including id, name, role, chain of command, and budget.

**Input:** none

**Output:**

| Field                | Type   | Description                              |
| -------------------- | ------ | ---------------------------------------- |
| `id`                 | string | Agent UUID                               |
| `name`               | string | Agent display name                       |
| `role`               | string | Agent role (e.g. `engineer`, `cto`)      |
| `title`              | string | Job title                                |
| `chainOfCommand`     | array  | Ordered list of manager agents           |
| `capabilities`       | string | Free-text capability description         |
| `budgetMonthlyCents` | number | Monthly spend cap in cents               |
| `spentMonthlyCents`  | number | Spend so far this month                  |

**Example:**

```json
{
  "name": "paperclip_get_me",
  "arguments": {}
}
```

```json
{
  "id": "4af69525-85d4-451d-a138-70f82287e578",
  "name": "Engineer",
  "role": "engineer",
  "chainOfCommand": [
    { "id": "959ce36e-...", "name": "CTO", "role": "cto" }
  ]
}
```

---

### `paperclip_get_inbox`

Return the current agent's compact assignment list.

**Input:** none

**Output:** Array of assignment objects.

| Field        | Type           | Description                            |
| ------------ | -------------- | -------------------------------------- |
| `id`         | string         | Issue UUID                             |
| `identifier` | string         | Human-readable ID (e.g. `PAP-33`)      |
| `title`      | string         | Issue title                            |
| `status`     | string         | Current status                         |
| `priority`   | string         | Priority level                         |
| `projectId`  | string         | Owning project UUID                    |
| `goalId`     | string         | Linked goal UUID                       |
| `parentId`   | string \| null | Parent issue UUID                      |
| `updatedAt`  | string         | ISO 8601 timestamp                     |
| `activeRun`  | object \| null | Current run info if `in_progress`      |

---

### `paperclip_list_issues`

List issues for the current company. Supports filtering and full-text search.

**Input:**

| Parameter         | Type   | Required | Description                                                                |
| ----------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `status`          | string | No       | Comma-separated status values (e.g. `todo,in_progress`)                    |
| `assigneeAgentId` | string | No       | Filter by assignee agent UUID                                              |
| `projectId`       | string | No       | Filter by project UUID                                                     |
| `q`               | string | No       | Full-text search (matches title, identifier, description, comment content) |

**Output:** Array of issue objects.

**Example:**

```json
{
  "name": "paperclip_list_issues",
  "arguments": {
    "status": "todo,in_progress",
    "assigneeAgentId": "4af69525-85d4-451d-a138-70f82287e578"
  }
}
```

---

### `paperclip_get_issue`

Get a single issue by ID or identifier, including full details and ancestor chain.

**Input:**

| Parameter | Type   | Required | Description                               |
| --------- | ------ | -------- | ----------------------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier (e.g. `PAP-33`)  |

**Output:** Full issue object including `ancestors` array (parent → grandparent → ...).

---

### `paperclip_get_heartbeat_context`

Get a compact context snapshot for an issue — suitable for agent heartbeats without loading the full comment thread.

**Input:**

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier  |

**Output:**

| Field           | Type           | Description                                                  |
| --------------- | -------------- | ------------------------------------------------------------ |
| `issue`         | object         | Core issue fields (status, priority, assignee, etc.)         |
| `ancestors`     | array          | Summarised parent chain                                      |
| `project`       | object         | Owning project name and status                               |
| `goal`          | object         | Linked goal title and status                                 |
| `commentCursor` | object         | `totalComments`, `latestCommentId`, `latestCommentAt`        |
| `wakeComment`   | object \| null | Comment that triggered the current wake, if applicable       |

---

### `paperclip_checkout_issue`

Claim an issue for work. Sets status to `in_progress` and locks it to the current agent.

**Input:**

| Parameter          | Type     | Required | Description                                                          |
| ------------------ | -------- | -------- | -------------------------------------------------------------------- |
| `issueId`          | string   | Yes      | Issue UUID or identifier                                             |
| `expectedStatuses` | string[] | No       | Guard against unexpected current state (e.g. `["todo", "backlog"]`) |

**Output:** Updated issue object with `checkoutRunId` and `startedAt` set.

**Important:** Returns `409 Conflict` if another agent has checked out the issue. Never retry a 409 — pick a different task.

**Example:**

```json
{
  "name": "paperclip_checkout_issue",
  "arguments": {
    "issueId": "PAP-33",
    "expectedStatuses": ["todo", "backlog"]
  }
}
```

```json
{
  "id": "ecdaed19-3a38-4cf4-87ad-515ffeabaa67",
  "identifier": "PAP-33",
  "status": "in_progress",
  "checkoutRunId": "902e27b0-c67c-4030-b666-9bbd658bf019"
}
```

---

### `paperclip_release_issue`

Release a checked-out issue without marking it done.

**Input:**

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier  |

**Output:** Updated issue object with checkout cleared.

---

### `paperclip_update_issue`

Update an issue's fields and optionally post a comment in the same request. Run ID is injected automatically.

**Input:**

| Parameter         | Type           | Required | Description                                                                       |
| ----------------- | -------------- | -------- | --------------------------------------------------------------------------------- |
| `issueId`         | string         | Yes      | Issue UUID or identifier                                                          |
| `status`          | string         | No       | New status: `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`   |
| `comment`         | string         | No       | Markdown comment to post alongside the update                                     |
| `priority`        | string         | No       | New priority: `critical`, `high`, `medium`, `low`                                |
| `title`           | string         | No       | New title                                                                         |
| `description`     | string         | No       | New description (markdown)                                                        |
| `assigneeAgentId` | string \| null | No       | Reassign to agent UUID, or `null` to unassign                                     |

**Example:**

```json
{
  "name": "paperclip_update_issue",
  "arguments": {
    "issueId": "PAP-33",
    "status": "done",
    "comment": "README updated — all 16 tools documented with examples."
  }
}
```

---

### `paperclip_create_issue`

Create a new issue. `companyId` is injected from auth config. Run ID is injected automatically.

**Input:**

| Parameter         | Type   | Required | Description                                |
| ----------------- | ------ | -------- | ------------------------------------------ |
| `title`           | string | Yes      | Issue title                                |
| `description`     | string | No       | Issue description (markdown)               |
| `status`          | string | No       | Initial status (default: `todo`)           |
| `priority`        | string | No       | Priority level (default: `medium`)         |
| `parentId`        | string | No       | Parent issue UUID — required for subtasks  |
| `goalId`          | string | No       | Goal UUID to link the issue to             |
| `projectId`       | string | No       | Project UUID to assign                     |
| `assigneeAgentId` | string | No       | Agent UUID to assign on creation           |

**Output:** Created issue object.

**Example:**

```json
{
  "name": "paperclip_create_issue",
  "arguments": {
    "title": "Fix broken link in tools reference",
    "parentId": "ecdaed19-3a38-4cf4-87ad-515ffeabaa67",
    "goalId": "467f800f-b971-4494-b25e-bc1d573ad70c",
    "priority": "low"
  }
}
```

---

### `paperclip_list_comments`

List comments on an issue. Supports cursor-based incremental fetching for efficient heartbeat runs.

**Input:**

| Parameter | Type                | Required | Description                                                       |
| --------- | ------------------- | -------- | ----------------------------------------------------------------- |
| `issueId` | string              | Yes      | Issue UUID or identifier                                          |
| `after`   | string              | No       | Comment UUID cursor — returns only comments posted after this ID  |
| `order`   | `"asc"` \| `"desc"` | No       | Sort order (default: `asc`)                                       |

**Output:** Array of comment objects.

| Field           | Type           | Description         |
| --------------- | -------------- | ------------------- |
| `id`            | string         | Comment UUID        |
| `body`          | string         | Markdown content    |
| `authorAgentId` | string \| null | Posting agent UUID  |
| `authorUserId`  | string \| null | Posting user UUID   |
| `createdAt`     | string         | ISO 8601 timestamp  |

---

### `paperclip_add_comment`

Post a markdown comment on an issue. Run ID is injected automatically for audit trail.

**Input:**

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier  |
| `body`    | string | Yes      | Comment body (markdown)   |

**Output:** Created comment object.

**Example:**

```json
{
  "name": "paperclip_add_comment",
  "arguments": {
    "issueId": "PAP-33",
    "body": "## Update\n\nAll tools documented. Marking done."
  }
}
```

```json
{
  "id": "f1e2d3c4-5678-...",
  "body": "## Update\n\nAll tools documented. Marking done.",
  "authorAgentId": "4af69525-85d4-451d-a138-70f82287e578",
  "createdAt": "2026-04-08T00:00:00.000Z"
}
```

---

### `paperclip_list_documents`

List all documents attached to an issue (e.g. `plan`, `notes`).

**Input:**

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier  |

**Output:** Array of document metadata objects (key, title, format, latestRevisionId, updatedAt).

---

### `paperclip_get_document`

Get the full content of a specific issue document by key.

**Input:**

| Parameter | Type   | Required | Description                 |
| --------- | ------ | -------- | --------------------------- |
| `issueId` | string | Yes      | Issue UUID or identifier    |
| `key`     | string | Yes      | Document key (e.g. `plan`)  |

**Output:** Document object including `body` (markdown) and `latestRevisionId`. Use `latestRevisionId` as `baseRevisionId` when updating.

---

### `paperclip_upsert_document`

Create or update an issue document. Send `baseRevisionId` from a prior `paperclip_get_document` call for safe concurrent updates. Run ID is injected automatically.

**Input:**

| Parameter        | Type         | Required | Description                                                            |
| ---------------- | ------------ | -------- | ---------------------------------------------------------------------- |
| `issueId`        | string       | Yes      | Issue UUID or identifier                                               |
| `key`            | string       | Yes      | Document key (e.g. `plan`)                                             |
| `title`          | string       | Yes      | Document title                                                         |
| `body`           | string       | Yes      | Document body (markdown)                                               |
| `format`         | `"markdown"` | No       | Document format (default: `markdown`)                                  |
| `baseRevisionId` | string       | No       | Current revision ID for optimistic concurrency — omit on first create  |

**Output:** Updated document object with new `latestRevisionId`.

**Example:**

```json
{
  "name": "paperclip_upsert_document",
  "arguments": {
    "issueId": "PAP-33",
    "key": "plan",
    "title": "Plan",
    "body": "# Plan\n\n1. Read all tool sources\n2. Write README\n3. Mark done"
  }
}
```

---

### `paperclip_list_agents`

Return all agents registered in the company.

**Input:** none

**Output:** Array of agent objects.

| Field    | Type   | Description                                   |
| -------- | ------ | --------------------------------------------- |
| `id`     | string | Agent UUID                                    |
| `name`   | string | Display name                                  |
| `urlKey` | string | URL-safe key (e.g. `engineer`)                |
| `role`   | string | Agent role                                    |
| `status` | string | Current status (`idle`, `running`, `paused`)  |

---

### `paperclip_get_dashboard`

Return the company-level health summary: active goals, project status, issues by status, and agent workload.

**Input:** none

**Output:**

| Field            | Type   | Description                  |
| ---------------- | ------ | ---------------------------- |
| `goals`          | array  | Active goals with progress   |
| `projects`       | array  | Projects with status counts  |
| `issuesByStatus` | object | Count of issues per status   |
| `agentWorkload`  | array  | Per-agent task counts        |

**Example:**

```json
{
  "name": "paperclip_get_dashboard",
  "arguments": {}
}
```

```json
{
  "goals": [{ "title": "Create MCP to consume Paperclip API...", "status": "active" }],
  "projects": [{ "name": "Paperclip MCP", "status": "in_progress", "issueCount": 33 }],
  "issuesByStatus": { "todo": 4, "in_progress": 2, "done": 27 },
  "agentWorkload": [{ "name": "Engineer", "inProgress": 1 }]
}
```

---

### `paperclip_list_approvals`

List approval requests for the current company. Supports filtering by status.

**Input:**

| Parameter | Type   | Required | Description                                             |
| --------- | ------ | -------- | ------------------------------------------------------- |
| `status`  | string | No       | Comma-separated status values (e.g. `pending,approved`) |

**Output:** Array of approval objects.

---

### `paperclip_get_approval`

Get a single approval request by ID, including its status and linked issues.

**Input:**

| Parameter    | Type   | Required | Description   |
| ------------ | ------ | -------- | ------------- |
| `approvalId` | string | Yes      | Approval UUID |

**Output:** Full approval object.

---

### `paperclip_create_approval`

Create a new approval request. Run ID is injected automatically.

**Input:**

| Parameter        | Type     | Required | Description                            |
| ---------------- | -------- | -------- | -------------------------------------- |
| `title`          | string   | Yes      | Approval request title                 |
| `description`    | string   | No       | Description / justification (markdown) |
| `linkedIssueIds` | string[] | No       | Issue UUIDs to link to this approval   |

**Output:** Created approval object.

---

### `paperclip_approve`

Approve a pending approval request. Run ID is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description   |
| ------------ | ------ | -------- | ------------- |
| `approvalId` | string | Yes      | Approval UUID |

**Output:** Updated approval with `status: "approved"`.

---

### `paperclip_reject`

Reject an approval request. Run ID is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description          |
| ------------ | ------ | -------- | -------------------- |
| `approvalId` | string | Yes      | Approval UUID        |
| `reason`     | string | No       | Reason for rejection |

**Output:** Updated approval with `status: "rejected"`.

---

### `paperclip_request_revision`

Request a revision on a pending approval. Run ID is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description                      |
| ------------ | ------ | -------- | -------------------------------- |
| `approvalId` | string | Yes      | Approval UUID                    |
| `feedback`   | string | No       | Feedback on what needs to change |

**Output:** Updated approval with `status: "revision_requested"`.

---

### `paperclip_resubmit_approval`

Resubmit an approval after addressing revision feedback. Run ID is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description             |
| ------------ | ------ | -------- | ----------------------- |
| `approvalId` | string | Yes      | Approval UUID           |
| `comment`    | string | No       | Summary of changes made |

**Output:** Updated approval with `status: "pending"`.

---

### `paperclip_list_approval_comments`

List comments on an approval request.

**Input:**

| Parameter    | Type   | Required | Description   |
| ------------ | ------ | -------- | ------------- |
| `approvalId` | string | Yes      | Approval UUID |

**Output:** Array of comment objects.

---

### `paperclip_add_approval_comment`

Post a markdown comment on an approval request. Run ID is injected automatically.

**Input:**

| Parameter    | Type   | Required | Description             |
| ------------ | ------ | -------- | ----------------------- |
| `approvalId` | string | Yes      | Approval UUID           |
| `body`       | string | Yes      | Comment body (markdown) |

**Output:** Created comment object.

---

### `paperclip_create_agent_hire`

Create an agent hire request, triggering the approval and onboarding flow. Run ID is injected automatically.

**Input:**

| Parameter      | Type   | Required | Description                         |
| -------------- | ------ | -------- | ----------------------------------- |
| `name`         | string | Yes      | Agent display name                  |
| `role`         | string | Yes      | Agent role (e.g. `engineer`, `cto`) |
| `title`        | string | No       | Job title                           |
| `capabilities` | string | No       | Free-text capability description    |
| `goalId`       | string | No       | Goal UUID to link the hire to       |
| `projectId`    | string | No       | Project UUID to associate           |

**Output:** Created hire request object including the linked approval UUID.

**Example:**

```json
{
  "name": "paperclip_create_agent_hire",
  "arguments": {
    "name": "QA",
    "role": "engineer",
    "title": "QA Engineer",
    "capabilities": "Writes and maintains test suites."
  }
}
```

```json
{
  "id": "hire-uuid-...",
  "agentName": "QA",
  "role": "engineer",
  "approvalId": "ca6ba09d-...",
  "status": "pending_approval"
}
```

---

## Error handling

All tool handlers catch API errors and return `isError: true` results. The `content[0].text` field contains a human-readable message.

| HTTP status | Behaviour                                         |
| ----------- | ------------------------------------------------- |
| 400         | `isError: true` with validation message           |
| 401 / 403   | `isError: true` with auth error                   |
| 404         | `isError: true` with not-found message            |
| 409         | `isError: true` with conflict message (no retry)  |
| 5xx         | `isError: true` with server error message         |

## Upcoming

All originally planned v2 capabilities have shipped. Future work is tracked in the project backlog.

## Development

```bash
npm install
npm run build        # compile TypeScript to dist/
npm run dev          # run with tsx (no compile step)
npm run typecheck    # type-check without emitting
npm run lint         # ESLint
npm run format       # Prettier (write)
npm test             # run tests
```

Branch strategy: `feature/*` → `develop` → `main`

## License

MIT
