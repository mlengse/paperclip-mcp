# Recipe: Triage Agent

An agent that wakes periodically, scans its inbox, classifies issues by label, and
either claims straightforward ones or @-mentions the right specialist for complex ones.

**Key tools:** `paperclip_get_me`, `paperclip_get_inbox`, `paperclip_list_labels`,
`paperclip_update_issue`, `paperclip_add_comment`, `paperclip_checkout_issue`

**Auth:** Agent key sufficient.

---

## Goal

On each heartbeat wake:

1. Confirm identity.
2. Load the label taxonomy.
3. Scan the inbox for unprocessed issues.
4. Classify each issue: if it carries a `type:bug` label, claim it; if it carries
   `type:feature`, @-mention the PM for refinement; if unlabelled, apply
   `status:unrefined` and notify the PM.
5. Exit cleanly — do not hold the lock on issues you are not working.

---

## Step 1 — Confirm identity

```json
{ "name": "paperclip_get_me", "arguments": {} }
```

Cache `id` (your agent UUID) and `role` for the run. If this call fails, stop
immediately — do not mutate any state without knowing who you are.

---

## Step 2 — Bootstrap the label cache

```json
{ "name": "paperclip_list_labels", "arguments": {} }
```

Build a `name → id` map from the response. You will need UUIDs for the labels you
apply. If required taxonomy labels are missing, create them with
`paperclip_create_label` before proceeding.

Example taxonomy labels used in this recipe:

| Name               | Purpose                         |
| ------------------ | ------------------------------- |
| `type:bug`         | Bug report                      |
| `type:feature`     | Feature request                 |
| `status:unrefined` | Needs PM refinement before work |
| `agent:triage`     | Touched by this triage agent    |

---

## Step 3 — Load the inbox

```json
{ "name": "paperclip_get_inbox", "arguments": {} }
```

Filter the result to issues in `todo` status — issues already `in_progress` or
`in_review` are being worked and should not be re-triaged.

```
inbox.filter(issue => issue.status === "todo")
```

If the filtered list is empty, exit cleanly — nothing to do.

---

## Step 4 — Classify and act per issue

For each `todo` issue, check its `labelIds` against the label cache.

### Path A: Issue has `type:bug`

Claim it for work:

```json
{
  "name": "paperclip_checkout_issue",
  "arguments": {
    "issueId": "PAP-42",
    "expectedStatuses": ["todo"]
  }
}
```

On success (status becomes `in_progress`): proceed with bug investigation.

On 409: the issue was already claimed or moved. Log and skip — do not retry.

### Path B: Issue has `type:feature`

Do not claim it. Notify the PM:

```json
{
  "name": "paperclip_add_comment",
  "arguments": {
    "issueId": "PAP-43",
    "body": "@PM — PAP-43 is a feature request awaiting refinement. Please refine and update acceptance criteria."
  }
}
```

### Path C: Issue has no relevant labels

Apply the `status:unrefined` label and `agent:triage` label, then notify the PM:

```json
{
  "name": "paperclip_update_issue",
  "arguments": {
    "issueId": "PAP-44",
    "labelIds": ["<status:unrefined-uuid>", "<agent:triage-uuid>"],
    "comment": "@PM — PAP-44 arrived without type labels. Marked unrefined for your review."
  }
}
```

---

## Error handling

| Error                               | Action                                                               |
| ----------------------------------- | -------------------------------------------------------------------- |
| `get_inbox` returns `isError: true` | Retry once. If it fails again, create an MCP failure issue and exit. |
| `checkout_issue` returns 409        | Skip the issue. Do not retry. Move to the next item.                 |
| `update_issue` returns 404          | Issue was deleted between inbox fetch and update. Skip.              |
| `list_labels` returns empty array   | Create required taxonomy labels before classifying.                  |

---

## Idempotency

This recipe is safe to re-run. Applying a label that is already present is a no-op
(the API deduplicates `labelIds`). Posting a duplicate @-mention comment creates an
extra comment but does not break state. The `checkout_issue` 409 guard prevents
double-claiming.

To make the @-mention step idempotent, check the recent comments before posting:

```json
{
  "name": "paperclip_list_comments",
  "arguments": { "issueId": "PAP-43", "order": "desc" }
}
```

If the most recent comment body contains `@PM` and was posted by your agent ID in the
last 24 hours, skip posting again.
