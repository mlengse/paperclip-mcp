---
name: paperclip-release-flow
description: Use when packaging a release — write a CHANGELOG draft as a document, tag the goal as complete, and notify stakeholders via comments.
---

## paperclip-release-flow

Produces a structured CHANGELOG document from all issues closed under a goal, updates the goal status to reflect the release, and posts stakeholder notifications. This is a Paperclip-level release tracking workflow — it does not interact with git tags or npm. For the git/npm release, see the repo's CI release pipeline.

### When to use

Run this skill when:

- A sprint or milestone is complete and you need a structured record of what shipped.
- You are preparing to cut a version and need a CHANGELOG document before notifying stakeholders.
- The Scrum Master or PM asks for a release summary after all epics under a goal are done.

Do not run this skill on a goal that still has open issues. Confirm all epics and their children are `done` first (use `paperclip-close-epic` for any unclosed epics).

### Step 1 — Fetch the goal

```
paperclip_get_goal  { goalId: "<goal-id>" }
```

Record `title`, `description`, `status`, and `projectId`. If `status` is already `done`, this skill may be running redundantly — verify with the operator before proceeding.

### Step 2 — List all issues under the goal

```
paperclip_list_issues  { goalId: "<goal-id>" }
```

Collect all issues. Group them by type: `feature`, `bug`, `chore`, `docs`. Filter to `status: "done"` only — open issues should have blocked the release; log any found and flag them to the operator.

### Step 3 — Compose the CHANGELOG

Build the CHANGELOG body using this structure:

```markdown
# CHANGELOG — <goal title>

**Released:** <ISO date>
**Goal:** <goal description, 1–2 sentences>

## Features

- PAP-XX — <title>
- PAP-YY — <title>

## Bug Fixes

- PAP-ZZ — <title>

## Chores & Maintenance

- PAP-AA — <title>

## Documentation

- PAP-BB — <title>

## Known Limitations

<If any issues were explicitly deferred or descoped, list them here with a note. Otherwise omit this section.>
```

Omit any section that has no items. Do not fabricate entries.

### Step 4 — Create the CHANGELOG document

```
paperclip_upsert_document  {
  title: "CHANGELOG: <goal title>",
  content: "<CHANGELOG markdown>",
  goalId: "<goal-id>"
}
```

Record the returned document ID for reference in notifications.

### Step 5 — Update the goal status

```
paperclip_update_goal  {
  goalId: "<goal-id>",
  status: "done"
}
```

If the goal has an `endDate` field and it has not been set, set it to today's date in the same call.

### Step 6 — Notify stakeholders

Post a comment on the goal with the release summary and a link to the CHANGELOG document:

```
paperclip_add_comment  {
  goalId: "<goal-id>",
  body: "Release complete. CHANGELOG document created (doc ID: <id>).\n\n**Summary:** <3 bullet points from CHANGELOG>\n\n@Scrum Master @CTO — goal <title> is now done."
}
```

If the goal is linked to a specific project, also post on the project:

```
paperclip_add_comment  {
  issueId: "<project-level-tracker-if-exists>",
  body: "Goal '<title>' released. See CHANGELOG document <id> for full details."
}
```

### Step 7 — Verify

```
paperclip_get_goal  { goalId: "<goal-id>" }
```

Confirm `status === "done"`. If not, the update in Step 5 failed silently — post a manual intervention note and exit.

### Error Handling

**Open issues found in Step 2:** Do not proceed with the release. Post a comment on the goal:

```
paperclip_add_comment  {
  goalId: "<goal-id>",
  body: "Release blocked: open issues found under this goal. Resolve or descope before cutting release: PAP-XX (status: <s>), ..."
}
```

**`paperclip_upsert_document` fails:** The CHANGELOG document is a required artifact. Do not skip it. Post the CHANGELOG content directly as a comment on the goal instead, flag it as a fallback, and note that a document write failure occurred:

```
paperclip_add_comment  {
  goalId: "<goal-id>",
  body: "Document write failed. CHANGELOG posted inline as fallback:\n\n<CHANGELOG markdown>"
}
```

**`paperclip_update_goal` fails:** Do not close the goal silently. Report the failure and request manual intervention. The CHANGELOG document is already created — record its ID so it is not lost.

**`paperclip_list_issues` pagination:** If the goal has more than the default page size of issues, paginate:

```
paperclip_list_issues  { goalId: "<goal-id>", limit: 50, offset: 0 }
paperclip_list_issues  { goalId: "<goal-id>", limit: 50, offset: 50 }
```

Continue until the result count is less than the page size.

### Common Pitfalls

- Step 5 (goal update) must come after Step 4 (document creation). If the goal closes before the CHANGELOG exists, stakeholders have no artifact to reference.
- Do not include issues from other goals in the CHANGELOG. Filter strictly by `goalId`.
- The CHANGELOG is a snapshot. Do not edit it after posting — create a new "CHANGELOG Amendment" document if corrections are needed post-release.
- `paperclip_list_issues` returns all statuses by default. Filter to `done` explicitly — do not assume all returned issues are complete.
