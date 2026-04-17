---
name: paperclip-audit-approvals
description: Use when an approver agent wakes to clear pending approvals and needs a structured review workflow covering each item before deciding to approve, reject, or escalate.
---

## paperclip-audit-approvals

Walks every pending approval assigned to the current agent, retrieves the full approval record and its comments, applies a structured review checklist, then issues a single decision per approval: approve, reject (with revision request), or escalate.

### When to use

Run this skill when:

- You are an approver agent (CEO, CTO, or a designated board reviewer) and you wake on an @-mention that references a pending approval.
- The Scrum Master has flagged an orphaned approval that has been pending beyond its SLA.
- A human operator asks you to clear a queue of pending approvals.

**Board-only warning:** Some approvals are board-level governance decisions (agent hires, budget increases, architecture changes). If the approval record contains any of the labels `type:governance` or `type:board-decision`, do not approve or reject unilaterally — escalate to the board channel and exit.

### Step 1 — Confirm identity

```
paperclip_get_me
```

Record `agentId` and `role`. Only proceed if your role is authorized to approve the items in the queue. If you are not the designated approver for an item, skip it and post a routing comment (see Error Handling).

### Step 2 — List pending approvals

```
paperclip_list_approvals  { status: "pending" }
```

Filter the result to approvals where `approverId === <your-agentId>` or `approverRole === <your-role>`. If none match, exit — no work to do.

### Step 3 — Process each approval

For each matching approval, run the following sub-sequence:

#### 3a — Fetch the full approval record

```
paperclip_get_approval  { approvalId: "<id>" }
```

Record: `title`, `description`, `submittedBy`, `createdAt`, `linkedIssueId` (if any), `labelIds`.

#### 3b — Fetch approval comments

```
paperclip_list_approval_comments  { approvalId: "<id>" }
```

Look for prior reviewer notes. If a previous approver has already rejected this item and the resubmission did not address the stated concerns, note this — it affects the decision.

#### 3c — Fetch the linked issue (if present)

```
paperclip_get_issue  { issueId: "<linkedIssueId>" }
```

Review the issue description and acceptance criteria. The approval decision should be anchored to whether the described work satisfies those criteria.

#### 3d — Apply the review checklist

Score each item against this checklist before deciding:

- [ ] Approval description is complete and unambiguous
- [ ] Linked issue (if any) has acceptance criteria that are met or explicitly waived
- [ ] No governance labels present (`type:governance`, `type:board-decision`)
- [ ] No open blocking comments from prior reviewers that were not addressed
- [ ] Approval is within your role's authority to decide

#### 3e — Decide

| Checklist result                                  | Decision             | Action                                               |
| ------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| All checks pass                                   | **Approve**          | `paperclip_approve`                                  |
| One or more checks fail (fixable)                 | **Request revision** | `paperclip_request_revision`                         |
| Governance label present or outside authority     | **Escalate**         | `paperclip_add_approval_comment` + exit              |
| Ambiguous — cannot determine without more context | **Request revision** | `paperclip_request_revision` with specific questions |

### Step 4 — Execute the decision

**Approve:**

```
paperclip_approve  {
  approvalId: "<id>",
  comment: "Approved. All acceptance criteria met. No blocking concerns."
}
```

**Request revision:**

```
paperclip_request_revision  {
  approvalId: "<id>",
  comment: "Revision needed:\n- <specific concern 1>\n- <specific concern 2>\nResubmit when addressed."
}
```

**Escalate (board-only or out-of-authority):**

```
paperclip_add_approval_comment  {
  approvalId: "<id>",
  body: "This approval requires board-level review. Routing to board channel. Not deciding unilaterally."
}
```

Then post a comment on the linked issue if present:

```
paperclip_add_comment  {
  issueId: "<linkedIssueId>",
  body: "@CTO — approval PAP-APPR-XX requires board review. I have flagged it but not decided."
}
```

### Step 5 — Summary comment

After processing all approvals, post a single summary on each linked issue where a decision was made:

```
paperclip_add_comment  {
  issueId: "<linkedIssueId>",
  body: "Approval audit complete. Decision: <approved|revision-requested|escalated>. Reason: <one line>."
}
```

### Error Handling

**`paperclip_list_approvals` returns empty or 404:** No pending approvals. Exit cleanly.

**`paperclip_get_approval` returns 404:** Approval was withdrawn between list and fetch. Skip it silently.

**`paperclip_approve` or `paperclip_request_revision` returns an error:** Do not retry. Post a comment on the approval with the error text and note it requires manual intervention.

**Not the designated approver for an item:** Post this comment on the approval and skip:

```
paperclip_add_approval_comment  {
  approvalId: "<id>",
  body: "Routing: this approval is not in my authority (<your-role>). Forwarding to the correct approver."
}
```

Then @-mention the correct approver role on the linked issue.

### Common Pitfalls

- Never approve governance items (`type:governance`, `type:board-decision`) without explicit board instruction. When in doubt, escalate.
- Process approvals one at a time. Do not batch-approve without reading each record.
- `paperclip_resubmit_approval` is called by the submitter, not the reviewer. Do not call it during this skill.
- Always post the summary comment (Step 5) on the linked issue, not just on the approval. Issues are where stakeholders watch for updates.
- Check prior rejection comments (Step 3b) before deciding. Approving an item that was rejected for unresolved reasons creates a governance gap.
