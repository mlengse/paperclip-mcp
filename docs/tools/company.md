# Companies

Tools for managing companies at the board level: creating, updating, archiving, and listing company membership.

---

## paperclip_archive_company

⚠ Board-only: Archive a company, setting its status to 'archived'. Uses a dedicated POST endpoint — not a PATCH. This action is irreversible through the API.

**Inputs**

| Parameter   | Type     | Required | Description             |
| ----------- | -------- | -------- | ----------------------- |
| `companyId` | `string` | yes      | Company UUID to archive |

**Returns**

The updated company object with status: 'archived' and updated timestamps.

**Examples**

- Use when: decommissioning a company that is no longer in use
- Don't use when: you need to update other company fields — use paperclip_update_company for name/description/budget

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication
- 404: company not found → verify ID with paperclip_list_companies

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_create_company

⚠ Board-only: Create a new company. The issuePrefix is auto-generated from the name.

**Inputs**

| Parameter            | Type             | Required | Description                                                        |
| -------------------- | ---------------- | -------- | ------------------------------------------------------------------ |
| `name`               | `string`         | yes      | Company name (required, non-empty)                                 |
| `description`        | `string \| null` | no       | Company description (optional, nullable)                           |
| `budgetMonthlyCents` | `integer`        | no       | Monthly budget in cents (non-negative integer, e.g. 5000 = $50.00) |

**Returns**

The created company object with all fields including assigned UUID, issuePrefix (auto-generated), status 'active', and timestamps.

**Examples**

- Use when: onboarding a new organization or setting up a tenant on the board
- Don't use when: you need to update an existing company — use paperclip_update_company instead

**Errors**

- 400: validation failure → ensure name is non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication

**Annotations**

`closedWorld`

---

## paperclip_get_company

⚠ Board-only: Get a single company by UUID.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `companyId`       | `string`               | yes      | Company UUID                                                               |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Company object: id, name, description, status, issuePrefix, issueCounter, budgetMonthlyCents, spentMonthlyCents, requireBoardApprovalForNewAgents, feedbackDataSharingEnabled, brandColor, logoAssetId, pauseReason, pausedAt, createdAt, updatedAt.

**Examples**

- Use when: reading a company's budget, status, or branding configuration
- Don't use when: you need to list all companies — use paperclip_list_companies to discover IDs first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication
- 404: company not found → verify ID with paperclip_list_companies

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_companies

⚠ Board-only: List all companies accessible to the authenticated board user.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `limit`           | `integer`              | no       | Max companies per page (1–100, default 50)                                 |
| `offset`          | `integer`              | no       | Number of companies to skip (default 0)                                    |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Company[], total, count, offset, limit, has_more, next_offset }. Each item: id, name, description, status, issuePrefix, budgetMonthlyCents, createdAt.

**Examples**

- Use when: discovering all companies on the board before looking up a specific companyId
- Don't use when: you already have the companyId — use paperclip_get_company instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_update_company

⚠ Board-only: Update a company's name, description, or monthly budget. Requires board-level authentication (agent keys are rejected — even CEO agents receive 403).

**Inputs**

| Parameter            | Type             | Required | Description                                        |
| -------------------- | ---------------- | -------- | -------------------------------------------------- |
| `companyId`          | `string`         | yes      | Company UUID                                       |
| `name`               | `string`         | no       | New company name                                   |
| `description`        | `string \| null` | no       | New description (nullable to clear)                |
| `budgetMonthlyCents` | `integer`        | no       | New monthly budget in cents (non-negative integer) |

**Returns**

The updated company object with all fields and updated timestamps.

**Examples**

- Use when: adjusting a company's monthly budget cap or renaming it after a rebrand
- Don't use when: you need to archive the company — use paperclip_archive_company for status transitions

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → agent keys are not accepted for this endpoint
- 404: company not found → verify ID with paperclip_list_companies

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---
