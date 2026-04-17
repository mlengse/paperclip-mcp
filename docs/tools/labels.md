# Labels

Tools for listing and creating issue labels.

---

## paperclip_create_label

Create a new label for the current company.

**Inputs**

| Parameter | Type     | Required | Description                                  |
| --------- | -------- | -------- | -------------------------------------------- |
| `name`    | `string` | yes      | Label name (e.g. 'source:agent', 'type:bug') |
| `color`   | `string` | no       | 6-digit hex color string (e.g. '#6366f1')    |

**Returns**

Returns the created label object: id, name, color, createdAt.

**Examples**

- Use when: seeding a missing taxonomy label (e.g. source:agent, type:bug) during Label Bootstrap
- Don't use when: the label already exists — use paperclip_list_labels to check before creating

**Errors**

- 400: validation failure → check name is non-empty and color is valid hex if supplied
- 401: authentication failed → check PAPERCLIP_API_KEY
- 409: label name already exists → fetch existing ID from paperclip_list_labels

**Annotations**

`closedWorld`

---

## paperclip_list_labels

List all labels defined for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `limit`           | `integer`              | no       | Max labels per page (1–100, default 50)                                    |
| `offset`          | `integer`              | no       | Number of labels to skip (default 0)                                       |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Label[], total, count, offset, limit, has_more, next_offset }. Each item: id, name, color (hex), createdAt.

**Examples**

- Use when: bootstrapping the label taxonomy at the start of a run to build a name→UUID cache
- Don't use when: you already have the label UUID — pass it directly to the relevant tool

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---
