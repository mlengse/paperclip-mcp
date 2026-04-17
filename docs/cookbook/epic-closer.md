# Recipe: Epic Closer

An agent (typically the Scrum Master) that checks whether all child issues of an epic
are done and, if so, closes the epic itself.

**Key tools:** `paperclip_get_issue`, `paperclip_list_issues`, `paperclip_update_issue`

**Auth:** Agent key sufficient.

---

## Goal

Given an epic issue ID:

1. Fetch the epic to confirm it is not already closed.
2. List all child issues.
3. Confirm every child is `done` or `cancelled`.
4. If all children are resolved, set the epic status to `done`.
5. Post a closing comment.

---

## Step 1 — Fetch the epic

```json
{
  "name": "paperclip_get_issue",
  "arguments": { "issueId": "PAP-10" }
}
```

Check `status`. If it is already `done` or `cancelled`, exit — nothing to do. This
guard makes the recipe idempotent.

Note the epic's `id` (UUID), `title`, `goalId`, and `projectId` for later use.

---

## Step 2 — List child issues

```json
{
  "name": "paperclip_list_issues",
  "arguments": {
    "limit": 100,
    "offset": 0
  }
}
```

`paperclip_list_issues` does not have a `parentId` filter parameter. To find children
of the epic, use one of these strategies:

**Strategy A — filter by project and search:**
If the epic's children all live in the same project, filter by `projectId` and check
`parentId` in the response:

```json
{
  "name": "paperclip_list_issues",
  "arguments": {
    "projectId": "<epic-project-id>",
    "limit": 100,
    "offset": 0
  }
}
```

Then filter client-side: `issues.filter(i => i.parentId === epicId)`.

**Strategy B — use full-text search:**
Search for the epic identifier in issue descriptions or titles:

```json
{
  "name": "paperclip_list_issues",
  "arguments": { "q": "PAP-10", "limit": 100, "offset": 0 }
}
```

**Strategy C — use `get_issue` ancestors:**
Fetch each candidate child and check its `ancestors` array for the epic ID.

Use whichever strategy fits your data shape. Strategy A is fastest for small projects.

---

## Step 3 — Check child statuses

For each child issue, check `status`. Resolution statuses are `done` and `cancelled`.
Any child in `todo`, `in_progress`, `in_review`, or `blocked` means the epic is not
ready to close.

```
const allResolved = children.every(
  c => c.status === "done" || c.status === "cancelled"
);
```

If `allResolved` is false, post a progress comment on the epic and exit:

```json
{
  "name": "paperclip_update_issue",
  "arguments": {
    "issueId": "PAP-10",
    "comment": "Epic check: 8/10 children done. Waiting on PAP-55 (in_review) and PAP-58 (blocked)."
  }
}
```

---

## Step 4 — Close the epic

If all children are resolved:

```json
{
  "name": "paperclip_update_issue",
  "arguments": {
    "issueId": "PAP-10",
    "status": "done",
    "comment": "All 10 child issues are done or cancelled. Closing epic."
  }
}
```

The `comment` field and `status` field are applied atomically in a single request —
no need for a separate `add_comment` call.

---

## Step 5 — Notify the coordinator

After closing the epic, post a notification on the relevant coordinator's inbox (or
to the Scrum Master if you are a different agent):

```json
{
  "name": "paperclip_add_comment",
  "arguments": {
    "issueId": "PAP-10",
    "body": "@Scrum Master — PAP-10 is now done. All child issues resolved. Ready for goal progress check."
  }
}
```

---

## Error handling

| Error                                     | Action                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `get_issue` returns 404                   | Epic does not exist. Exit — wrong ID.                                         |
| `list_issues` returns `total > limit`     | Page with `offset` until all children are fetched.                            |
| `update_issue` (status: done) returns 409 | Another agent closed it simultaneously. Fetch current state and verify.       |
| `update_issue` returns 403                | You do not have write permission on this issue. Escalate to a board operator. |

---

## Idempotency

This recipe is safe to re-run. The Step 1 guard (`status === "done"`) prevents double-
closing. The progress comment in Step 3 creates a duplicate comment on re-run if
children are still open — this is cosmetically noisy but not harmful. To avoid the
duplicate, check the most recent comment body before posting:

```json
{
  "name": "paperclip_list_comments",
  "arguments": { "issueId": "PAP-10", "order": "desc" }
}
```

If the most recent comment was posted by your agent in the last heartbeat cycle with
equivalent content, skip posting again.

---

## Variant: Close by goal

To close all epics under a goal when the goal is complete:

```json
{
  "name": "paperclip_list_issues",
  "arguments": {
    "goalId": "<goal-uuid>",
    "status": "todo,in_progress,in_review,blocked",
    "limit": 100,
    "offset": 0
  }
}
```

If this returns an empty result (no open issues linked to the goal), proceed to close
the goal itself via `paperclip_update_goal` (set `status: "completed"`). Then close
any epics linked to the goal using the pattern above.
