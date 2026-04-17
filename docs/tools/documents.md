# Documents

Tools for managing long-form documents attached to the company workspace, including revisions.

---

## paperclip_delete_document

⚠ Board-only: Delete a document from an issue by key.

**Inputs**

| Parameter | Type     | Required | Description                          |
| --------- | -------- | -------- | ------------------------------------ |
| `issueId` | `string` | yes      | Issue ID or identifier (e.g. PAP-22) |
| `key`     | `string` | yes      | Document key (e.g. `plan`)           |

**Returns**

Returns the deleted document stub confirming the key and issueId.

**Examples**

- Use when: removing an obsolete document from an issue (requires board API key)
- Don't use when: you want to clear the body — use paperclip_upsert_document with an empty body instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human) API key
- 404: document or issue not found → verify both issueId and key

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_get_document

Get the full content of a specific issue document by key.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-22)                                       |
| `key`             | `string`               | yes      | Document key (e.g. `plan`)                                                 |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Document object: key, title, body (markdown), format, revisionId, createdAt, updatedAt.

**Examples**

- Use when: reading the plan or notes document before writing an update
- Don't use when: you need all document keys — use paperclip_list_documents first to discover them

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: document or issue not found → verify both issueId and key with paperclip_list_documents

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_get_document_revisions

Get the full revision history for an issue document.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-22)                                       |
| `key`             | `string`               | yes      | Document key (e.g. `plan`)                                                 |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Array of revision objects: revisionId, authorId, createdAt, changeSummary.

**Examples**

- Use when: auditing who changed a document or finding a revisionId to pass to paperclip_upsert_document
- Don't use when: you need the current document body — use paperclip_get_document instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: document or issue not found → verify both issueId and key with paperclip_list_documents

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_documents

List all documents attached to an issue (e.g. plan, notes).

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-21)                                       |
| `limit`           | `integer`              | no       | Max documents per page (1–100, default 50)                                 |
| `offset`          | `integer`              | no       | Number of documents to skip (default 0)                                    |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: DocumentStub[], total, count, offset, limit, has_more, next_offset }. Body not included — use paperclip_get_document.

**Examples**

- Use when: discovering which document keys exist on an issue before reading or updating one
- Don't use when: you already know the key — use paperclip_get_document directly

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_upsert_document

Create or update an issue document. Send baseRevisionId for safe concurrent updates.

**Inputs**

| Parameter        | Type         | Required | Description                                                           |
| ---------------- | ------------ | -------- | --------------------------------------------------------------------- |
| `issueId`        | `string`     | yes      | Issue ID or identifier (e.g. PAP-22)                                  |
| `key`            | `string`     | yes      | Document key (e.g. `plan`)                                            |
| `title`          | `string`     | yes      | Document title                                                        |
| `body`           | `string`     | yes      | Document body (markdown)                                              |
| `format`         | `"markdown"` | no       | Document format (default: markdown)                                   |
| `baseRevisionId` | `string`     | no       | Current revision ID for optimistic concurrency — omit on first create |

**Returns**

Returns the updated document object: key, title, body, revisionId, updatedAt.

**Examples**

- Use when: writing or updating the implementation plan document on an issue mid-run
- Don't use when: you want to delete a document — use paperclip_delete_document (board-only)

**Errors**

- 400: validation failure → check title and body are non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues
- 409: conflict — baseRevisionId mismatch → re-read with paperclip_get_document and retry

**Annotations**

`idempotent`, `closedWorld`

---
