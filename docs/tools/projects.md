# Projects & Workspaces

Tools for managing projects and execution workspaces that group issues under a goal.

---

## paperclip_create_project

Create a new project. Optionally include a workspace config.

**Inputs**

| Parameter     | Type     | Required | Description                                               |
| ------------- | -------- | -------- | --------------------------------------------------------- |
| `name`        | `string` | yes      | Project name                                              |
| `description` | `string` | no       | Project description (markdown)                            |
| `status`      | `string` | no       | Initial status (e.g. active)                              |
| `goalId`      | `string` | no       | Goal UUID to link the project to                          |
| `workspace`   | `object` | no       | Optional workspace config to create alongside the project |

**Returns**

Returns the created project object with all fields including assigned UUID and workspace if provided.

**Examples**

- Use when: setting up a new feature project linked to a goal, with a workspace for agent execution
- Don't use when: you need to add a workspace to an existing project — use paperclip_create_workspace instead

**Errors**

- 400: validation failure → ensure name is non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: goalId not found → verify with paperclip_list_goals

**Annotations**

`closedWorld`

---

## paperclip_create_workspace

Create a new workspace for a project. At least one of cwd or repoUrl is required.

**Inputs**

| Parameter   | Type     | Required | Description                  |
| ----------- | -------- | -------- | ---------------------------- |
| `projectId` | `string` | yes      | Project UUID                 |
| `cwd`       | `string` | no       | Local working directory path |
| `repoUrl`   | `string` | no       | Remote repository URL        |

**Returns**

Returns the created workspace object: id, cwd, repoUrl, projectId, createdAt.

**Examples**

- Use when: adding a second workspace (e.g. a different branch or clone) to an existing project
- Don't use when: you are creating a project — use paperclip_create_project with the workspace field instead

**Errors**

- 400: validation failure → must provide at least one of cwd or repoUrl
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: project not found → verify ID with paperclip_list_projects

**Annotations**

`closedWorld`

---

## paperclip_delete_workspace

⚠ Board-only: Permanently delete a workspace from a project. Returns the deleted workspace object.

**Inputs**

| Parameter     | Type     | Required | Description                          |
| ------------- | -------- | -------- | ------------------------------------ |
| `projectId`   | `string` | yes      | Project UUID                         |
| `workspaceId` | `string` | yes      | Workspace UUID to permanently delete |

**Returns**

The deleted workspace object: id, companyId, projectId, name, sourceType, cwd, repoUrl, isPrimary, createdAt, updatedAt.

**Examples**

- Use when: removing a workspace that is no longer needed (e.g. a closed branch or decommissioned path)
- Don't use when: you want to update workspace settings — use paperclip_update_workspace instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication
- 404: project or workspace not found → verify IDs with paperclip_list_workspaces

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_get_project

Get a single project by UUID, including its associated workspaces.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `projectId`       | `string`               | yes      | Project UUID                                                               |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Project object: id, name, description, status, goalId, workspaces[], createdAt.

**Examples**

- Use when: reading project details or checking workspace cwd before checking out a branch
- Don't use when: you need a list of projects — use paperclip_list_projects to discover IDs first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: project not found → verify ID with paperclip_list_projects

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_projects

List all projects for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `limit`           | `integer`              | no       | Max projects per page (1–100, default 50)                                  |
| `offset`          | `integer`              | no       | Number of projects to skip (default 0)                                     |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Project[], total, count, offset, limit, has_more, next_offset }. Each item: id, name, status, goalId, createdAt.

**Examples**

- Use when: finding the projectId to link when creating a new issue
- Don't use when: you need a project's workspaces — use paperclip_get_project or paperclip_list_workspaces

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_workspaces

List all workspaces for a project.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `projectId`       | `string`               | yes      | Project UUID                                                               |
| `limit`           | `integer`              | no       | Max workspaces per page (1–100, default 50)                                |
| `offset`          | `integer`              | no       | Number of workspaces to skip (default 0)                                   |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Workspace[], total, count, offset, limit, has_more, next_offset }. Each item: id, cwd, repoUrl, projectId, createdAt.

**Examples**

- Use when: finding the workspace cwd or repoUrl before an agent starts executing in it
- Don't use when: you need the project record — use paperclip_get_project which includes workspaces

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: project not found → verify ID with paperclip_list_projects

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_update_project

Update a project's name, description, or status.

**Inputs**

| Parameter     | Type     | Required | Description                        |
| ------------- | -------- | -------- | ---------------------------------- |
| `projectId`   | `string` | yes      | Project UUID                       |
| `name`        | `string` | no       | New name                           |
| `description` | `string` | no       | New description (markdown)         |
| `status`      | `string` | no       | New status (e.g. active, archived) |

**Returns**

Returns the updated project object with all fields.

**Examples**

- Use when: archiving a completed project or renaming it after a scope change
- Don't use when: you need to update workspace settings — use paperclip_update_workspace instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: project not found → verify ID with paperclip_list_projects

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---

## paperclip_update_workspace

Update a workspace's cwd or repoUrl.

**Inputs**

| Parameter     | Type     | Required | Description                      |
| ------------- | -------- | -------- | -------------------------------- |
| `projectId`   | `string` | yes      | Project UUID                     |
| `workspaceId` | `string` | yes      | Workspace UUID                   |
| `cwd`         | `string` | no       | New local working directory path |
| `repoUrl`     | `string` | no       | New remote repository URL        |

**Returns**

Returns the updated workspace object: id, cwd, repoUrl, projectId, updatedAt.

**Examples**

- Use when: updating the workspace path after the repo was moved to a new location
- Don't use when: you need to create a new workspace — use paperclip_create_workspace instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: project or workspace not found → verify IDs with paperclip_list_workspaces

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---
