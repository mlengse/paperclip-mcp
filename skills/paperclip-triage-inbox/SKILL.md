---
name: paperclip-triage-inbox
description: Use when an agent wakes up and needs to evaluate its assigned issues, prioritize, label, and decide whether to claim or escalate.
---

## paperclip-triage-inbox

Structured wake-up sequence for any IC agent. Evaluates what is in the inbox, classifies each item by urgency and type, applies labels, and produces a single decision per issue: claim, defer, or escalate.

### When to use

Run this skill at the start of every agent session, before touching any issue. Do not skip it even if you believe you already know which issue to work on — the inbox may contain reassignments, escalations, or wake-reason mismatches that change the plan.

### Step 1 — Confirm identity

```
paperclip_get_me
```

Record `agentId`, `role`, and `urlKey`. These are needed for branch naming and @-mention targeting throughout the session.

### Step 2 — Read the inbox

```
paperclip_get_inbox
```

The response is a list of issues currently assigned to this agent. If the list is empty, exit cleanly — there is nothing to claim. Do not poll or retry.

### Step 3 — Fetch heartbeat context

```
paperclip_get_heartbeat_context
```

This surfaces `PAPERCLIP_WAKE_REASON` and `PAPERCLIP_TASK_ID`. Cross-reference the wake reason against the inbox items. If the wake reason references an issue that is NOT in the inbox, post a mismatch comment (see Error Handling) and exit.

### Step 4 — Classify each inbox item

For each issue returned in Step 2, fetch its full record:

```
paperclip_get_issue  { issueId: "<id>" }
```

Classify using the following decision matrix:

| Condition                                             | Decision                                         |
| ----------------------------------------------------- | ------------------------------------------------ |
| Status is `todo`, assigned to me, wake reason matches | **Claim**                                        |
| Status is `in_review` but I am not QA                 | **Escalate** — this should not be in my inbox    |
| Status is `blocked`                                   | **Defer** — post a note, do not claim            |
| Status is `done` or `cancelled`                       | **Skip** — stale assignment, no action           |
| Priority is `urgent` and no other agent is active     | **Claim first** among all claimable items        |
| Multiple claimable items                              | **Claim highest priority first**, defer the rest |

### Step 5 — Apply labels (Label Bootstrap)

Before claiming, ensure the label taxonomy is seeded. Call `paperclip_list_labels` once and build a `name → id` map. If any of the following are missing, create them before proceeding:

- `source:agent`, `source:human`
- `status:refined`, `status:unrefined`
- `type:feature`, `type:bug`, `type:chore`, `type:docs`, `type:mcp-failure`
- `agent:<your-role>` (e.g. `agent:engineer`)

```
paperclip_list_labels
paperclip_create_label  { name: "<missing-label>", color: "<hex>" }
```

Then apply the correct labels to each issue you are about to claim:

```
paperclip_update_issue  { issueId: "<id>", labelIds: ["<agent-label-id>", "<status-label-id>"] }
```

### Step 6 — Claim the highest-priority issue

```
paperclip_checkout_issue  {
  issueId: "<id>",
  expectedStatuses: ["todo"]
}
```

If this returns a 409:

- Do not retry.
- Post a wake-mismatch comment (see Error Handling).
- Exit cleanly.

### Step 7 — Board precedence check

Immediately after a successful checkout, fetch the last 5 comments:

```
paperclip_list_comments  { issueId: "<id>" }
```

If any comment from `local-board` in the last 24 hours contains any of: `blocked`, `cancelled`, `parked`, `hold`, `do not promote`, `needs board decision`, `board action` — release the checkout and exit with a deferral comment. The board's state takes precedence over a Scrum Master assignment.

```
paperclip_release_issue  { issueId: "<id>" }
paperclip_add_comment    { issueId: "<id>", body: "Deferring: board comment takes precedence. Releasing checkout." }
```

### Step 8 — Output a triage summary

Before proceeding to implementation, post a single comment summarizing the triage decision:

```
paperclip_add_comment  {
  issueId: "<claimed-id>",
  body: "Triage complete. Claiming PAP-XX (priority: <p>). Deferring: [PAP-YY, ...]. Skipping: [PAP-ZZ, ...]."
}
```

Then continue with your role-specific implementation protocol.

### Error Handling

**404 on `paperclip_get_issue`:** The issue was deleted or reassigned between inbox fetch and get. Skip it silently — do not post a comment on a non-existent issue.

**409 on `paperclip_checkout_issue`:** Post this comment on the issue (if it still exists), then exit:

```
Wake mismatch: PAP-XX is in status <X>, expected [todo]. Not claiming.
@Scrum Master — please verify assignment.
```

**Empty inbox:** Exit silently. Do not create issues or post comments.

**`paperclip_get_heartbeat_context` fails:** Proceed with inbox-only triage. Log the failure but do not block on it.

### Example Output

```
Triage complete. Claiming PAP-42 (priority: high, type: feature).
Deferring: PAP-38 (blocked), PAP-41 (status: in_review — not in QA role).
Skipping: PAP-35 (done).
```

### Common Pitfalls

- Do not claim multiple issues in one session. Claim the highest-priority item and work it to completion.
- Do not skip label bootstrap. Missing labels cause silent data quality issues in dashboards.
- Do not retry a 409. The issue is locked. Retrying wastes a run and risks a double-claim race.
- The board precedence check (Step 7) must happen after checkout, not before — you need the checkout lock to safely read and act on board comments.
