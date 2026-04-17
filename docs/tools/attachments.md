# Attachments

Tools for listing, uploading, downloading, and deleting file attachments.

---

## paperclip_delete_attachment

Permanently delete an attachment by ID.

**Inputs**

| Parameter      | Type     | Required | Description     |
| -------------- | -------- | -------- | --------------- |
| `attachmentId` | `string` | yes      | Attachment UUID |

**Returns**

Returns the deleted attachment stub: id, filename, confirming deletion.

**Examples**

- Use when: removing a superseded or mistakenly uploaded file from an issue
- Don't use when: you want to read the file first — use paperclip_download_attachment before deleting

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: attachment not found → verify UUID with paperclip_list_attachments

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_download_attachment

Fetch the content of an attachment by ID from the Paperclip API.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `attachmentId`    | `string`               | yes      | Attachment UUID                                                            |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Returns a fixed envelope with fields: attachmentId, contentType, size (bytes), contentBase64 (base64-encoded file content). When response_format is 'markdown', produces a compact summary (id, contentType, size, base64 snippet). When response_format is 'json', returns the full envelope as structured JSON.

**Examples**

- Use when: reading a previously uploaded attachment to extract its content
- Don't use when: you need the attachment metadata only — use paperclip_list_attachments for id, filename, size

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: attachment not found → verify UUID with paperclip_list_attachments

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_attachments

List all attachments on an issue.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `issueId`         | `string`               | yes      | Issue ID or identifier (e.g. PAP-21)                                       |
| `limit`           | `integer`              | no       | Max attachments per page (1–100, default 50)                               |
| `offset`          | `integer`              | no       | Number of attachments to skip (default 0)                                  |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Attachment[], total, count, offset, limit, has_more, next_offset }. Each item: id, filename, mimeType, size, createdAt.

**Examples**

- Use when: discovering attachment IDs before downloading or deleting a file
- Don't use when: you already have the attachment UUID — use paperclip_download_attachment directly

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_upload_attachment

Upload a local file as an attachment to an issue.

**Inputs**

| Parameter  | Type     | Required | Description                                                        |
| ---------- | -------- | -------- | ------------------------------------------------------------------ |
| `issueId`  | `string` | yes      | Issue ID or identifier (e.g. PAP-22)                               |
| `filePath` | `string` | yes      | Absolute path to the local file to upload                          |
| `filename` | `string` | no       | Override filename in the upload (defaults to basename of filePath) |
| `mimeType` | `string` | no       | MIME type of the file (e.g. text/plain, application/pdf)           |

**Returns**

Returns the created attachment record: id, filename, mimeType, size, createdAt.

**Examples**

- Use when: attaching a generated report, diff, or log file to an issue
- Don't use when: you need to download an attachment — use paperclip_download_attachment instead

**Errors**

- 400: validation failure → check filePath is absolute and the file exists
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: issue not found → verify ID with paperclip_list_issues
- 413: file too large → check Paperclip attachment size limits

**Annotations**

`closedWorld`

---
