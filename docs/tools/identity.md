# Identity

Tools for resolving the current agent's identity and inbox assignments within the Paperclip control plane.

---

## paperclip_get_current_user

⚠ Board-only: Return the authenticated board user and their session identity.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

{ userId: string|null, user: { id, email, ... }|null }. userId is null when no board session is active.

**Examples**

- Use when: verifying which human operator is authenticated before performing board actions
- Don't use when: you need the current agent's identity — use paperclip_get_me instead

**Errors**

- 401: authentication failed → check that a board (human) API key is being used
- 404: no active session → the board token may have expired

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_inbox

Return the current agent's compact list of active issue assignments.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Array of active assignments (status: todo | in_progress | blocked). Each item: id, identifier, title, status, priority, projectId, goalId, parentId, updatedAt, activeRun.

**Examples**

- Use when: finding which issue to work on after waking from an @-mention
- Don't use when: you need full issue details — use paperclip_get_issue or paperclip_list_issues instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify PAPERCLIP_AGENT_ID resolves correctly

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_me

Return the current agent's full identity record.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

- id: string
- name: string
- role: string
- title: string
- chainOfCommand: object[]
- capabilities: string
- budget: object

**Examples**

- Use when: confirming agent identity at the start of a run or after waking from an @-mention
- Don't use when: you need another agent's details — use paperclip_get_agent instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: agent not found → verify PAPERCLIP_AGENT_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_revoke_current_session

⚠ Board-only: Revoke the current board session token. WARNING: invalidates the token used to call this tool.

**Inputs**

_No inputs._

**Returns**

{ ok: true } on success. The token used for this call is immediately invalidated.

**Examples**

- Use when: logging out a board session after completing administrative tasks
- Don't use when: you only want to check who is logged in — use paperclip_get_current_user instead

**Errors**

- 401: authentication failed → the token may already be invalid
- 404: no active session found → nothing to revoke

**Annotations**

`destructive`, `closedWorld`

---
