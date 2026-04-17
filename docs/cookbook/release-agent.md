# Recipe: Release Agent

An agent that reads a goal, collects all completed issues under it, and drafts a
CHANGELOG document on a designated tracking issue.

**Key tools:** `paperclip_get_goal`, `paperclip_list_issues`,
`paperclip_get_document`, `paperclip_upsert_document`

**Auth:** Agent key sufficient for all read and document-write steps. Board key
required only if you need to delete a prior draft (`paperclip_delete_document`).

---

## Goal

On a release trigger (e.g. invoked by a routine after QA merges to `main`):

1. Read the active goal to confirm scope and title.
2. List all `done` issues linked to that goal.
3. Compose a CHANGELOG draft grouped by type (feature, bug, chore).
4. Write the draft as a document on a release-tracking issue.

This is a **read-then-write** operation. The analysis step is fully read-only; only
the document upsert writes state.

---

## Step 1 — Read the goal

```json
{
  "name": "paperclip_get_goal",
  "arguments": { "goalId": "<your-goal-uuid>" }
}
```

Extract `title`, `status`, and any `description` that names the version or release
scope. If the goal is not `active`, exit — this release run does not apply.

---

## Step 2 — List completed issues

```json
{
  "name": "paperclip_list_issues",
  "arguments": {
    "goalId": "<your-goal-uuid>",
    "status": "done",
    "limit": 100,
    "offset": 0
  }
}
```

The response is `{ issues, total, limit, offset }`. If `total > limit`, page through
with `offset` until all issues are collected:

```
while (offset < total) {
  fetch with { limit: 100, offset }
  offset += 100
}
```

---

## Step 3 — Classify issues

Group the collected issues by label:

- Issues with `type:bug` label → Fixes section
- Issues with `type:feature` label → Features section
- Issues with `type:chore` or no type label → Changes section

Use the `paperclip_list_labels` label cache (name → UUID) to identify which UUID
corresponds to each type label, then cross-reference `issue.labelIds`.

---

## Step 4 — Compose the CHANGELOG draft

Build a markdown document in memory:

```markdown
# CHANGELOG — <goal title>

Generated: <ISO date>

## Features

- PAP-55: Add routine trigger management (#pr-number if known)
- PAP-52: Add label taxonomy bootstrap

## Fixes

- PAP-58: Resolve 409 on stale checkout lock (PAP-192)

## Changes

- PAP-60: Update dependency versions
```

---

## Step 5 — Read any existing draft (for safe update)

Before writing, read the current document to get `latestRevisionId`:

```json
{
  "name": "paperclip_get_document",
  "arguments": {
    "issueId": "<release-tracking-issue-id>",
    "key": "changelog-draft"
  }
}
```

If the document does not exist yet, you will get a 404 — treat that as `null` and
omit `baseRevisionId` on the first write.

---

## Step 6 — Write the document

```json
{
  "name": "paperclip_upsert_document",
  "arguments": {
    "issueId": "<release-tracking-issue-id>",
    "key": "changelog-draft",
    "title": "CHANGELOG Draft — v2.1.0",
    "body": "# CHANGELOG...",
    "baseRevisionId": "<latestRevisionId-from-step-5-or-omit>"
  }
}
```

The response includes a new `latestRevisionId`. Store it if you need to update again
in the same run.

---

## Error handling

| Error                                             | Action                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `get_goal` returns 404                            | Goal UUID is wrong or deleted. Exit and notify coordinator.                                                 |
| `list_issues` returns `total: 0`                  | No done issues — draft a "no changes" notice or exit.                                                       |
| `upsert_document` returns 409 (revision conflict) | Re-read the document with `get_document` to get the current `latestRevisionId`, then retry the upsert once. |
| Any tool returns `isError: true` after retry      | Create an MCP failure issue and stop.                                                                       |

---

## Read-only analysis — important note

Steps 1 through 4 are purely read-only and safe to run repeatedly. The only write is
Step 6 (`upsert_document`). If you want to validate the draft before committing,
print it to a comment on the tracking issue via `paperclip_add_comment` first, then
upsert the document only after a human or board operator confirms.

If you need to delete a prior draft and start fresh,
`paperclip_delete_document` requires a board key — do not attempt this with an agent
key.
