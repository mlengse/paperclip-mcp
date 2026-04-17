---
name: paperclip-close-epic
description: Use when all child issues of an epic are done and the epic itself needs to be closed with a summary comment and status update.
---

## paperclip-close-epic

Verifies that every child issue of an epic is in `done` status, composes a structured closing summary, and transitions the epic to `done`. Produces a document artifact summarizing shipped work before closing.

### When to use

Run this skill when:

- The Scrum Master heartbeat detects that all tracked children of an epic are `done`.
- A human operator or coordinator agent wants to formally close an epic and archive its outcomes.
- You are the Scrum Master and the heartbeat identified a candidate epic for closure.

Do not run this skill on an epic that has any child in `todo`, `in_progress`, `in_review`, or `blocked`. The skill will abort if that check fails.

### Step 1 — Fetch the epic

```
paperclip_get_issue  { issueId: "<epic-id>" }
```

Confirm the issue `type` is `epic` (or the equivalent parent-type in your Paperclip configuration). Record `title`, `projectId`, `goalId`, and `status`. If the epic is already `done` or `cancelled`, exit — nothing to do.

### Step 2 — List all children

`paperclip_list_issues` does not accept a `parentId` filter. Use one of these strategies to find child issues:

**Strategy A — filter by project, then check parentId in results (fastest for small projects):**

```
paperclip_list_issues  { projectId: "<epic-project-id>", limit: 100, offset: 0 }
```

Filter the returned issues client-side: `issues.filter(i => i.parentId === epicId)`.

**Strategy B — full-text search for the epic identifier:**

```
paperclip_list_issues  { q: "<PAP-N>", limit: 100, offset: 0 }
```

**Strategy C — filter by goalId if the epic and all children share a goal:**

```
paperclip_list_issues  { goalId: "<epic-goal-id>", limit: 100, offset: 0 }
```

Then filter client-side by `parentId`. Use Strategy A unless the epic spans multiple projects.

If no children are found, log a warning and ask the operator before closing — an epic with no children may indicate a data problem.

### Step 3 — Verify all children are done

For each child, check `status === "done"`. If any child is not `done`:

- Do not close the epic.
- Post a blocking comment:
  ```
  paperclip_add_comment  {
    issueId: "<epic-id>",
    body: "Cannot close epic: PAP-XX is still in status <status>. Resolve before closing."
  }
  ```
- Exit.

### Step 4 — Compose a closing summary

Build a summary with the following structure:

```
## Epic Closing Summary

**Epic:** <title> (PAP-N)
**Closed:** <ISO date>
**Children shipped:** <count>

### Work completed
<bullet list: PAP-XX — <child title> for each done child>

### Outcome
<1–3 sentences describing what capability this epic delivered, derived from the epic description and child titles>
```

Create this as a document so it is permanently archived:

```
paperclip_upsert_document  {
  title: "Closing Summary: <epic title>",
  content: "<summary markdown above>",
  issueId: "<epic-id>"
}
```

### Step 5 — Post the summary as a comment

```
paperclip_add_comment  {
  issueId: "<epic-id>",
  body: "<same summary markdown>"
}
```

This ensures the summary is visible in the issue timeline without requiring a document lookup.

### Step 6 — Close the epic

```
paperclip_update_issue  {
  issueId: "<epic-id>",
  status: "done"
}
```

Verify the response reflects `status: "done"`. If the API returns an error, do not retry — post a comment noting the failure and exit.

### Step 7 — Notify

If the epic has a `goalId`, check whether closing this epic means the goal is now fully complete:

```
paperclip_get_goal  { goalId: "<goal-id>" }
paperclip_list_issues  { goalId: "<goal-id>", status: "done" }
```

If all epics under the goal are done, post a comment on the goal:

```
paperclip_add_comment  {
  issueId: "<goal-id>",
  body: "@Scrum Master — all epics under this goal are now done. Consider closing the goal."
}
```

### Error Handling

**Child fetch returns 404 on a specific issue:** That child may have been deleted. Treat it as `done` for closure purposes but note it in the summary: `PAP-XX — deleted (treated as done)`.

**`paperclip_update_issue` fails on the epic:** Post a comment: `Failed to set epic to done. Manual intervention required. Error: <text>`. Do not retry.

**`paperclip_upsert_document` fails:** The document is a nice-to-have artifact. Log the failure in the comment (Step 5) and continue with the status update — do not block closure on a document write failure.

### Common Pitfalls

- Always verify children before closing. Never trust a caller's assertion that "all children are done" — fetch and check.
- The document (Step 4) and comment (Step 5) use the same content. Write it once, post it twice.
- Do not set the epic to `done` before the comment is posted. If the status update fires first and the comment fails, the epic closes silently with no audit trail.
- If the Scrum Master is running this skill during a heartbeat, it may encounter rate limits on `paperclip_list_issues`. Add a short wait between paginated calls if more than 20 children are expected.
