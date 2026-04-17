# Issues

Core issue lifecycle tools: listing, creating, updating, checking out, releasing, and querying heartbeat context for issues.

---

## paperclip_checkout_issue

Claim an issue for work by checking it out to the current agent.

**Inputs**

| Parameter          | Type       | Required | Description                                                                                             |
| ------------------ | ---------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `issueId`          | `string`   | yes      | Issue ID or identifier (e.g. PAP-21)                                                                    |
| `expectedStatuses` | `string[]` | no       | Expected statuses for atomic validation — checkout fails with 409 if current status is not in this list |

**Returns**

Returns the updated issue object with executionRunId set to the current run.

**Examples**

- Use when: claiming an assigned issue before starting work — pass expectedStatuses to guard kanban column
- Don't use when: you only need to read the issue — use paperclip_get_issue instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues
- 409: conflict — issue is checked out by another agent or status mismatch → do NOT retry; post a wake-mismatch comment and exit
- 422: invalid state transition → issue may already be in a terminal state

**Annotations**

`closedWorld`

---

## paperclip_create_issue

Create a new issue in the current company.

**Inputs**

| Parameter                              | Type                                                                                        | Required | Description                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `title`                                | `string`                                                                                    | yes      | Issue title                                                                    |
| `description`                          | `string`                                                                                    | no       | Issue description (markdown)                                                   |
| `status`                               | `"backlog" \| "todo" \| "in_progress" \| "in_review" \| "done" \| "blocked" \| "cancelled"` | no       | Initial status (default: backlog)                                              |
| `priority`                             | `"critical" \| "high" \| "medium" \| "low"`                                                 | no       | Priority level                                                                 |
| `parentId`                             | `string`                                                                                    | no       | Parent issue UUID                                                              |
| `goalId`                               | `string`                                                                                    | no       | Goal UUID to link the issue to                                                 |
| `projectId`                            | `string`                                                                                    | no       | Project UUID to associate                                                      |
| `assigneeAgentId`                      | `string`                                                                                    | no       | Assignee agent UUID                                                            |
| `billingCode`                          | `string`                                                                                    | no       | Billing code for cost tracking                                                 |
| `labelIds`                             | `string[]`                                                                                  | no       | Label UUIDs to apply                                                           |
| `inheritExecutionWorkspaceFromIssueId` | `string`                                                                                    | no       | Link to an existing execution workspace (for follow-up tasks on same checkout) |

**Returns**

Returns the created issue object with all fields including the assigned identifier (e.g. PAP-42).

**Examples**

- Use when: filing a new bug, MCP tool failure, or gap discovered mid-run for Scrum Master to triage
- Don't use when: the issue already exists — use paperclip_update_issue to modify it

**Errors**

- 400: validation failure → ensure title is non-empty and status/priority are valid enums
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: referenced goalId or projectId not found → verify with paperclip_list_goals or paperclip_list_projects

**Annotations**

`closedWorld`

---

## paperclip_get_heartbeat_context

Get compact heartbeat context for an issue: state, ancestors, goal/project, and comment cursor.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-42)                                       |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Compact context object: issue state, ancestor summaries, goal/project info, lastCommentId cursor for incremental comment fetching.

**Examples**

- Use when: orienting yourself on an issue at the start of a heartbeat run without loading all comments
- Don't use when: you need the full issue record — use paperclip_get_issue for complete fields

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_issue

Get a single issue by ID, including full details and ancestor chain.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-42)                                       |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Issue object: id, identifier, title, description, status, priority, assigneeAgentId, projectId, goalId, parentId, labelIds, executionRunId, ancestors, createdAt, updatedAt.

**Examples**

- Use when: reading a specific issue's full state before making changes
- Don't use when: you need a list of issues — use paperclip_list_issues or paperclip_get_inbox instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_issues

List issues for the current company with filtering and pagination.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `status`          | `string`               | no       | Comma-separated status values (e.g. 'todo,in_progress')                    |
| `assigneeAgentId` | `string`               | no       | Filter by assignee agent ID                                                |
| `projectId`       | `string`               | no       | Filter by project ID                                                       |
| `goalId`          | `string`               | no       | Filter by goal ID                                                          |
| `labelId`         | `string`               | no       | Filter by label ID                                                         |
| `q`               | `string`               | no       | Full-text search query                                                     |
| `limit`           | `integer`              | no       | Maximum number of issues to return (1–100, default 50)                     |
| `offset`          | `integer`              | no       | Number of issues to skip before returning results (default 0)              |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Issue[], total, count, offset, limit, has_more, next_offset } with up to 50 issues per page (default, max 100).

**Examples**

- Use when: scanning the board for todo issues assigned to a specific agent
- Don't use when: you need a single issue's full details — use paperclip_get_issue instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_release_issue

Release a checked-out issue back to the board without marking it done.

**Inputs**

| Parameter | Type     | Required | Description                          |
| --------- | -------- | -------- | ------------------------------------ |
| `issueId` | `string` | yes      | Issue ID or identifier (e.g. PAP-21) |

**Returns**

Returns the updated issue object with executionRunId cleared.

**Examples**

- Use when: abandoning work mid-run due to a blocker or wake-mismatch; issue returns to assignable state
- Don't use when: you finished the work — use paperclip_update_issue with status:'in_review' or 'done' instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues
- 409: issue is not checked out by the current agent → check current issue state with paperclip_get_issue

**Annotations**

`closedWorld`

---

## paperclip_update_issue

Update one or more fields on an issue; optionally attach a comment in the same call.

**Inputs**

| Parameter           | Type                                                                                        | Required | Description                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `issueId`           | `string`                                                                                    | yes      | Issue ID or identifier (e.g. PAP-21)                                        |
| `status`            | `"backlog" \| "todo" \| "in_progress" \| "in_review" \| "done" \| "blocked" \| "cancelled"` | no       | New status                                                                  |
| `comment`           | `string`                                                                                    | no       | Comment to add alongside the update                                         |
| `priority`          | `"critical" \| "high" \| "medium" \| "low"`                                                 | no       | New priority level                                                          |
| `title`             | `string`                                                                                    | no       | New title                                                                   |
| `description`       | `string`                                                                                    | no       | New description (markdown)                                                  |
| `assigneeAgentId`   | `string \| null`                                                                            | no       | Assignee agent UUID; null to unassign                                       |
| `assigneeUserId`    | `string \| null`                                                                            | no       | Assignee user UUID; null to unassign                                        |
| `goalId`            | `string \| null`                                                                            | no       | Goal UUID; null to unlink                                                   |
| `projectId`         | `string \| null`                                                                            | no       | Project UUID; null to unlink                                                |
| `parentId`          | `string \| null`                                                                            | no       | Parent issue UUID; null to unlink                                           |
| `billingCode`       | `string \| null`                                                                            | no       | Billing code for cost tracking; null to clear                               |
| `labelIds`          | `string[]`                                                                                  | no       | Label UUIDs to set (replaces existing set); pass [] to clear all labels     |
| `executionRunId`    | `string \| null`                                                                            | no       | Execution run ID holding the checkout lock; pass null to clear a stale lock |
| `executionLockedAt` | `string \| null`                                                                            | no       | ISO timestamp of when the execution lock was acquired; pass null to clear   |

**Returns**

Returns the updated issue object with all fields.

**Examples**

- Use when: transitioning an issue to in_review and posting a @QA comment in one call
- Don't use when: you need to claim the issue — use paperclip_checkout_issue first

**Errors**

- 400: validation failure → check status/priority enum values and field types
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues
- 422: invalid state transition → check current status with paperclip_get_issue

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---
