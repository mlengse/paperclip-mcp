# Comments

Tools for listing, adding, and retrieving comments on issues.

---

## paperclip_add_comment

Post a markdown comment on an issue. Run ID header injected automatically for audit trail.

**Inputs**

| Parameter | Type     | Required | Description                          |
| --------- | -------- | -------- | ------------------------------------ |
| `issueId` | `string` | yes      | Issue ID or identifier (e.g. PAP-21) |
| `body`    | `string` | yes      | Comment body (markdown)              |

**Returns**

Returns the created comment object: id, body, authorId, authorType, createdAt.

**Examples**

- Use when: posting @-mention handoffs (e.g. @QA ready for review, @Engineer changes needed)
- Don't use when: you also need to update issue fields — use paperclip_update_issue with a `comment` field instead

**Errors**

- 400: validation failure → ensure body is non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues

**Annotations**

`closedWorld`

---

## paperclip_get_comment

Fetch a single comment by ID, typically the triggering comment from a wake event.

**Inputs**

| Parameter   | Type     | Required | Description                          |
| ----------- | -------- | -------- | ------------------------------------ |
| `issueId`   | `string` | yes      | Issue ID or identifier (e.g. PAP-21) |
| `commentId` | `string` | yes      | Comment UUID to fetch                |

**Returns**

Returns the comment object: id, body, authorId, authorType, createdAt.

**Examples**

- Use when: PAPERCLIP_WAKE_COMMENT_ID is set — read the exact comment that triggered the @-mention wake
- Don't use when: you need all comments on an issue — use paperclip_list_comments instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: comment or issue not found → verify both issueId and commentId

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_comments

List comments on an issue, with optional cursor-based incremental fetching.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                                                                                                                 |
| ----------------- | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-21)                                                                                                                                        |
| `after`           | `string`               | no       | Comment ID cursor — returns only comments posted after this ID. Note: the server-side `after` param is broken (returns 500); this tool implements a client-side workaround. |
| `order`           | `"asc" \| "desc"`      | no       | Sort order (default: asc)                                                                                                                                                   |
| `limit`           | `integer`              | no       | Max comments per page (1–100, default 50)                                                                                                                                   |
| `offset`          | `integer`              | no       | Number of comments to skip (default 0)                                                                                                                                      |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured)                                                                                                  |

**Returns**

Pagination envelope { items: Comment[], total, count, offset, limit, has_more, next_offset }. When `after` is used, total reflects the filtered (post-cursor) count.

**Examples**

- Use when: reading new @-mention comments since the last heartbeat using the `after` cursor
- Don't use when: you need a single comment by ID — use paperclip_get_comment instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues
- 500: server error on the `after` cursor path → tool automatically applies a client-side workaround

**Annotations**

`readOnly`, `closedWorld`

---
