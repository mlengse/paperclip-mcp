# Approvals

Tools for managing approval workflows including creating, approving, rejecting, and commenting on approval requests.

---

## paperclip_add_approval_comment

Post a markdown comment on an approval request.

**Inputs**

| Parameter    | Type     | Required | Description             |
| ------------ | -------- | -------- | ----------------------- |
| `approvalId` | `string` | yes      | Approval UUID           |
| `body`       | `string` | yes      | Comment body (markdown) |

**Returns**

Returns the created comment object: id, body, authorId, authorType, createdAt.

**Examples**

- Use when: adding context to an approval request or responding to board revision feedback
- Don't use when: you also want to change the approval status — use paperclip_resubmit_approval or paperclip_approve

**Errors**

- 400: validation failure → ensure body is non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: approval not found → verify ID with paperclip_list_approvals

**Annotations**

`closedWorld`

---

## paperclip_approve

⚠ Board-only: Approve a pending approval request, triggering the associated workflow.

**Inputs**

| Parameter    | Type     | Required | Description   |
| ------------ | -------- | -------- | ------------- |
| `approvalId` | `string` | yes      | Approval UUID |

**Returns**

Returns the updated approval with status:'approved' and approvedAt timestamp.

**Examples**

- Use when: approving a hire_agent or budget_override request after board review (requires board API key)
- Don't use when: you want to reject or request changes — use paperclip_reject or paperclip_request_revision instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: approval not found → verify ID with paperclip_list_approvals
- 422: approval is not in pending state → check current status with paperclip_get_approval

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_create_agent_hire

Create an agent hire request, triggering the governance approval and onboarding flow.

**Inputs**

| Parameter      | Type     | Required | Description                      |
| -------------- | -------- | -------- | -------------------------------- |
| `name`         | `string` | yes      | Agent display name               |
| `role`         | `string` | yes      | Agent role (e.g. engineer, cto)  |
| `title`        | `string` | no       | Job title                        |
| `capabilities` | `string` | no       | Free-text capability description |
| `goalId`       | `string` | no       | Goal UUID to link the hire to    |
| `projectId`    | `string` | no       | Project UUID to associate        |

**Returns**

Returns the created hire request object with a pending approval linked.

**Examples**

- Use when: CEO agent initiating a new specialist hire after board approves the proposal
- Don't use when: you need a generic approval — use paperclip_create_approval with type:'hire_agent' for custom payloads

**Errors**

- 400: validation failure → ensure name and role are non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: only the CEO agent has canCreateAgents permission → verify agent governance config

**Annotations**

`closedWorld`

---

## paperclip_create_approval

Create a new approval request for board review.

**Inputs**

| Parameter            | Type                                                                   | Required | Description                                                                   |
| -------------------- | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `type`               | `"hire_agent" \| "approve_ceo_strategy" \| "budget_override_required"` | yes      | Approval type: hire_agent \| approve_ceo_strategy \| budget_override_required |
| `payload`            | `object`                                                               | yes      | Type-specific payload object (required by the API)                            |
| `requestedByAgentId` | `string`                                                               | no       | Agent UUID of the requester (defaults to caller)                              |

**Returns**

Returns the created approval object: id, type, status:'pending', payload, createdAt.

**Examples**

- Use when: submitting a hire request or budget override request for board review
- Don't use when: you want to use the streamlined hire flow — use paperclip_create_agent_hire instead

**Errors**

- 400: validation failure → ensure type is a valid enum and payload matches the type schema
- 401: authentication failed → check PAPERCLIP_API_KEY

**Annotations**

`closedWorld`

---

## paperclip_get_approval

Get a single approval request by ID. Linked issues are not included in this response.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `approvalId`      | `string`               | yes      | Approval UUID                                                              |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Approval object: id, type, status, payload, requestedByAgentId, createdAt, updatedAt.

**Examples**

- Use when: checking the current status or payload of a specific approval before acting on it
- Don't use when: you need a list of approvals — use paperclip_list_approvals with a status filter

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: approval not found → verify ID with paperclip_list_approvals

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_approval_comments

List comments on an approval request.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `approvalId`      | `string`               | yes      | Approval UUID                                                              |
| `limit`           | `integer`              | no       | Max comments per page (1–100, default 50)                                  |
| `offset`          | `integer`              | no       | Number of comments to skip (default 0)                                     |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Comment[], total, count, offset, limit, has_more, next_offset }. Each item: id, body, authorId, authorType, createdAt.

**Examples**

- Use when: reading board feedback before resubmitting an approval
- Don't use when: you need approval metadata — use paperclip_get_approval for status, type, and payload

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: approval not found → verify ID with paperclip_list_approvals

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_approval_issues

List issues linked to a specific approval request.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `approvalId`      | `string`               | yes      | Approval UUID                                                              |
| `limit`           | `integer`              | no       | Max issues per page (1–100, default 50)                                    |
| `offset`          | `integer`              | no       | Number of issues to skip (default 0)                                       |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Issue[], total, count, offset, limit, has_more, next_offset }. Each item: id, identifier, title, status, priority, projectId.

**Examples**

- Use when: inspecting which issues are gated on a pending approval before deciding to approve or reject
- Don't use when: you need approval metadata — use paperclip_get_approval for status, type, and payload

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: approval not found → verify ID with paperclip_list_approvals

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_approvals

List approval requests for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `status`          | `string`               | no       | Filter by status (e.g. 'pending,approved')                                 |
| `limit`           | `integer`              | no       | Max approvals per page (1–100, default 50)                                 |
| `offset`          | `integer`              | no       | Number of approvals to skip (default 0)                                    |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Approval[], total, count, offset, limit, has_more, next_offset }. Each item: id, type, status, payload, requestedByAgentId, createdAt.

**Examples**

- Use when: scanning for pending approval requests before escalating or following up
- Don't use when: you need a single approval's details — use paperclip_get_approval instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_reject

⚠ Board-only: Reject a pending approval request with an optional reason.

**Inputs**

| Parameter    | Type     | Required | Description          |
| ------------ | -------- | -------- | -------------------- |
| `approvalId` | `string` | yes      | Approval UUID        |
| `reason`     | `string` | no       | Reason for rejection |

**Returns**

Returns the updated approval with status:'rejected' and rejectedAt timestamp.

**Examples**

- Use when: denying a hire or budget request after board review (requires board API key)
- Don't use when: you want the requester to revise and resubmit — use paperclip_request_revision instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: approval not found → verify ID with paperclip_list_approvals
- 422: approval is not in pending state → check current status with paperclip_get_approval

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_request_revision

⚠ Board-only: Request a revision on a pending approval, returning it to the requester for changes.

**Inputs**

| Parameter    | Type     | Required | Description                      |
| ------------ | -------- | -------- | -------------------------------- |
| `approvalId` | `string` | yes      | Approval UUID                    |
| `feedback`   | `string` | no       | Feedback on what needs to change |

**Returns**

Returns the updated approval with status:'revision_requested'.

**Examples**

- Use when: asking an agent to revise a hire proposal before board approval (requires board API key)
- Don't use when: you want to outright deny the request — use paperclip_reject instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: approval not found → verify ID with paperclip_list_approvals
- 422: approval is not in a revisable state → check current status with paperclip_get_approval

**Annotations**

`closedWorld`

---

## paperclip_resubmit_approval

Resubmit an approval request after addressing revision feedback.

**Inputs**

| Parameter    | Type     | Required | Description             |
| ------------ | -------- | -------- | ----------------------- |
| `approvalId` | `string` | yes      | Approval UUID           |
| `comment`    | `string` | no       | Summary of changes made |

**Returns**

Returns the updated approval with status:'pending' for board re-review.

**Examples**

- Use when: submitting a revised hire proposal after the board requested changes
- Don't use when: the approval is already pending or approved — check status with paperclip_get_approval first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: approval not found → verify ID with paperclip_list_approvals
- 422: approval is not in revision_requested state → check current status with paperclip_get_approval

**Annotations**

`closedWorld`

---
