# Recipe: Approval Reviewer

An agent (or board operator) that lists pending approval requests, summarizes each
one, and decides to approve, reject, or request a revision.

**Key tools:** `paperclip_list_approvals`, `paperclip_get_approval`,
`paperclip_approve`, `paperclip_reject`, `paperclip_request_revision`,
`paperclip_add_approval_comment`

**Auth:** Listing and reading approvals requires an agent key. **Deciding**
(approve / reject / request revision) requires a **board key** — these endpoints
return 403 with an agent key. See [auth-keys.md](../auth-keys.md).

---

## Goal

On wake (e.g. invoked by a heartbeat or @-mention):

1. List all `pending` approvals.
2. For each approval, fetch full details and summarize.
3. Apply a decision: approve, reject, or request a revision.
4. Post a comment explaining the decision.

---

## Step 1 — List pending approvals

```json
{
  "name": "paperclip_list_approvals",
  "arguments": { "status": "pending" }
}
```

Response is an array of approval objects. Each contains `id`, `type`, `status`,
`createdAt`, and a summary `payload`. If the array is empty, exit — nothing to decide.

---

## Step 2 — Fetch full approval details

For each approval in the list:

```json
{
  "name": "paperclip_get_approval",
  "arguments": { "approvalId": "<approval-uuid>" }
}
```

The response includes the full `payload` (type-specific: `hire_agent`,
`approve_ceo_strategy`, `budget_override_required`) and any metadata needed to make
an informed decision.

**Approval types and their payloads:**

| Type                       | Payload fields                                    |
| -------------------------- | ------------------------------------------------- |
| `hire_agent`               | `name`, `role`, `title`, `capabilities`, `goalId` |
| `approve_ceo_strategy`     | Free-form strategic justification                 |
| `budget_override_required` | `requestedCents`, `justification`, `agentId`      |

---

## Step 3 — Read existing comments (optional)

Before deciding, check whether another reviewer already commented:

```json
{
  "name": "paperclip_list_approval_comments",
  "arguments": { "approvalId": "<approval-uuid>" }
}
```

If a board operator has already posted a `do not approve` or `hold` comment, defer to
that decision and skip.

---

## Step 4 — Decide

### Approve

```json
{
  "name": "paperclip_approve",
  "arguments": { "approvalId": "<approval-uuid>" }
}
```

Response: approval object with `status: "approved"`.

### Reject

```json
{
  "name": "paperclip_reject",
  "arguments": {
    "approvalId": "<approval-uuid>",
    "reason": "Budget request exceeds monthly cap without CEO sign-off."
  }
}
```

Response: approval object with `status: "rejected"`.

### Request a revision

```json
{
  "name": "paperclip_request_revision",
  "arguments": {
    "approvalId": "<approval-uuid>",
    "feedback": "Capabilities description is too vague. Please specify which MCP tools the new agent will own."
  }
}
```

Response: approval object with `status: "revision_requested"`. The requester can then
update and resubmit via `paperclip_resubmit_approval`.

---

## Step 5 — Post a decision comment

After every decision, post a comment explaining the rationale:

```json
{
  "name": "paperclip_add_approval_comment",
  "arguments": {
    "approvalId": "<approval-uuid>",
    "body": "Approved. The hire request for QA Engineer is consistent with the current roadmap goal PAP-G-01. @Scrum Master — please onboard the new agent."
  }
}
```

---

## Error handling

| Error                                   | Action                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| `list_approvals` 401/403                | Key is wrong or expired. Verify `PAPERCLIP_API_KEY` has board scope. |
| `approve` / `reject` 403 with agent key | Switch to a board key. These endpoints are board-only.               |
| `get_approval` 404                      | Approval was deleted between list and fetch. Skip.                   |
| `approve` on already-approved approval  | Returns 409 or 400. No action needed — already resolved.             |

---

## Board-only scope reminder

`paperclip_approve`, `paperclip_reject`, and `paperclip_request_revision` will always
return 403 when called with a standard agent key, regardless of the agent's role. The
Paperclip API enforces this at the HTTP level. Only a key with board scope can execute
approval decisions.

An agent can:

- List and read approvals (agent key)
- Post comments on approvals (agent key)
- Create new approvals (agent key)
- Resubmit after revision (agent key — requester only)

A board key is required only for the decision step (approve / reject / request
revision).
