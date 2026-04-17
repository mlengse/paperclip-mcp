# Feedback Traces

Board-only tools for retrieving feedback-trace bundles and per-issue trace summaries.

---

## paperclip_get_feedback_trace_bundle

⚠ Board-only: Fetch the full bundle for a single feedback trace by its UUID.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `traceId`         | `string`               | yes      | Feedback trace UUID                                                        |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Feedback trace bundle object: traceId, events[], metadata, and related context fields.

**Examples**

- Use when: retrieving the complete payload and event history for a specific feedback trace
- Don't use when: you need to browse traces — use paperclip_list_feedback_traces or paperclip_list_issue_feedback_traces

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → board-only endpoint, requires board API key
- 404: trace not found → verify traceId with paperclip_list_feedback_traces

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_feedback_traces

⚠ Board-only: List feedback traces for the company, with optional filters for type, vote, status, project, issue, date range, and payload inclusion.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `companyId`       | `string`               | yes      | Company UUID                                                               |
| `targetType`      | `string`               | no       | Filter by target type (e.g. 'issue', 'comment')                            |
| `vote`            | `string`               | no       | Filter by vote value (e.g. 'up', 'down')                                   |
| `status`          | `string`               | no       | Filter by trace status (e.g. 'pending', 'resolved')                        |
| `from`            | `string`               | no       | ISO 8601 datetime — return traces created at or after this timestamp       |
| `to`              | `string`               | no       | ISO 8601 datetime — return traces created at or before this timestamp      |
| `sharedOnly`      | `boolean`              | no       | When true, return only traces marked as shared                             |
| `includePayload`  | `boolean`              | no       | When true, include full trace payload in response                          |
| `projectId`       | `string`               | no       | Filter by project UUID                                                     |
| `issueId`         | `string`               | no       | Filter by issue ID or identifier                                           |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |
| `limit`           | `integer`              | no       | Max traces per page (1–100, default 50)                                    |
| `offset`          | `integer`              | no       | Number of traces to skip (default 0)                                       |

**Returns**

Pagination envelope { items: FeedbackTrace[], total, count, offset, limit, has_more, next_offset }.

**Examples**

- Use when: auditing feedback across the company or filtering by issue, vote, or date range
- Don't use when: you need traces for a single issue — use paperclip_list_issue_feedback_traces

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → board-only endpoint, requires board API key

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_issue_feedback_traces

⚠ Board-only: List feedback traces scoped to a single issue, with optional filters.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-42)                                       |
| `targetType`      | `string`               | no       | Filter by target type (e.g. 'issue', 'comment')                            |
| `vote`            | `string`               | no       | Filter by vote value (e.g. 'up', 'down')                                   |
| `status`          | `string`               | no       | Filter by trace status (e.g. 'pending', 'resolved')                        |
| `from`            | `string`               | no       | ISO 8601 datetime — return traces created at or after this timestamp       |
| `to`              | `string`               | no       | ISO 8601 datetime — return traces created at or before this timestamp      |
| `sharedOnly`      | `boolean`              | no       | When true, return only traces marked as shared                             |
| `includePayload`  | `boolean`              | no       | When true, include full trace payload in response                          |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |
| `limit`           | `integer`              | no       | Max traces per page (1–100, default 50)                                    |
| `offset`          | `integer`              | no       | Number of traces to skip (default 0)                                       |

**Returns**

Pagination envelope { items: FeedbackTrace[], total, count, offset, limit, has_more, next_offset }.

**Examples**

- Use when: inspecting all feedback traces attached to a specific issue
- Don't use when: you need traces across the company — use paperclip_list_feedback_traces instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → board-only endpoint, requires board API key
- 404: issue not found → verify issueId with paperclip_list_issues

**Annotations**

`readOnly`, `closedWorld`

---
