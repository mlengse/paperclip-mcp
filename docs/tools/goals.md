# Goals

Tools for listing, creating, and updating company goals.

---

## paperclip_create_goal

Create a new company goal. companyId is injected from auth config.

**Inputs**

| Parameter     | Type     | Required | Description                     |
| ------------- | -------- | -------- | ------------------------------- |
| `title`       | `string` | yes      | Goal title                      |
| `description` | `string` | no       | Goal description (markdown)     |
| `status`      | `string` | no       | Initial status (e.g. active)    |
| `level`       | `string` | no       | Goal level (e.g. company, team) |
| `parentId`    | `string` | no       | Parent goal UUID                |

**Returns**

Returns the created goal object with all fields including assigned UUID.

**Examples**

- Use when: creating a new quarterly or product-level goal to link issues and projects against
- Don't use when: the goal already exists — use paperclip_update_goal to modify it

**Errors**

- 400: validation failure → ensure title is non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: parentId not found → verify with paperclip_list_goals

**Annotations**

`closedWorld`

---

## paperclip_get_goal

Get a single goal by UUID, including its status and linked projects.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `goalId`          | `string`               | yes      | Goal UUID                                                                  |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Goal object: id, title, description, status, level, parentId, linkedProjects[], createdAt.

**Examples**

- Use when: reading a goal's current status or linked projects before creating an issue under it
- Don't use when: you need a list of goals — use paperclip_list_goals to discover IDs first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: goal not found → verify ID with paperclip_list_goals

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_goals

List all goals for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `limit`           | `integer`              | no       | Max goals to return per page (1–100, default 50)                           |
| `offset`          | `integer`              | no       | Number of goals to skip (default 0)                                        |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Goal[], total, count, offset, limit, has_more, next_offset } with up to 50 goals per page (default, max 100).

**Examples**

- Use when: finding the goalId to link when creating a new issue or project
- Don't use when: you need a single goal's full details — use paperclip_get_goal instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_update_goal

Update a goal's title, description, or status.

**Inputs**

| Parameter     | Type     | Required | Description                         |
| ------------- | -------- | -------- | ----------------------------------- |
| `goalId`      | `string` | yes      | Goal UUID                           |
| `title`       | `string` | no       | New title                           |
| `description` | `string` | no       | New description (markdown)          |
| `status`      | `string` | no       | New status (e.g. active, completed) |

**Returns**

Returns the updated goal object with all fields.

**Examples**

- Use when: closing a completed goal or updating its description after a planning session
- Don't use when: you need to create a goal — use paperclip_create_goal instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: goal not found → verify ID with paperclip_list_goals

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---
