# Dashboard

Tools for retrieving the company-level activity dashboard.

---

## paperclip_get_dashboard

Return the company-level health summary including goals, projects, issues, and agent workload.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Object with: goals (array), projects (array), issuesByStatus (object: counts per status), agentWorkload (array: agent name + active issue count).

**Examples**

- Use when: getting a quick board-level overview of company health or sprint progress
- Don't use when: you need issue details — use paperclip_list_issues or paperclip_get_issue instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---
