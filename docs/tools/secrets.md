# Secrets

Tools for managing encrypted secrets: listing, creating, updating metadata, and rotating values.

---

## paperclip_create_secret

⚠ Board-only: Create a new secret for a company. The value is stored encrypted and is never returned in any response.

**Inputs**

| Parameter     | Type                                                                            | Required | Description                                                  |
| ------------- | ------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `companyId`   | `string`                                                                        | yes      | Company UUID                                                 |
| `name`        | `string`                                                                        | yes      | Secret name (e.g. DATABASE_URL)                              |
| `value`       | `string`                                                                        | yes      | Secret value — stored encrypted, never returned in responses |
| `provider`    | `"local_encrypted" \| "aws_secrets_manager" \| "gcp_secret_manager" \| "vault"` | no       | Storage provider (default: local_encrypted)                  |
| `description` | `string \| null`                                                                | no       | Human-readable description                                   |
| `externalRef` | `string \| null`                                                                | no       | External reference (e.g. ARN for AWS Secrets Manager)        |

**Returns**

Created secret metadata: id, companyId, name, provider, externalRef, latestVersion (starts at 1), description, createdByAgentId, createdByUserId, createdAt, updatedAt. Value is never returned.

**Examples**

- Use when: registering a new credential or API key that agents or routines will reference by name
- Don't use when: the secret already exists and you want to update its value — use paperclip_rotate_secret instead

**Errors**

- 400: validation error → check that name and value are non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key
- 409: secret name already exists → use paperclip_rotate_secret to update its value

**Annotations**

`closedWorld`

---

## paperclip_list_secrets

⚠ Board-only: List secrets registered for a company. Returns metadata only — secret values are never included in any response.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `companyId`       | `string`               | yes      | Company UUID                                                               |
| `limit`           | `integer`              | no       | Max secrets per page (1–100, default 50)                                   |
| `offset`          | `integer`              | no       | Number of secrets to skip (default 0)                                      |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Secret[], total, count, offset, limit, has_more, next_offset }. Each item: id, companyId, name, provider, externalRef, latestVersion, description, createdByAgentId, createdByUserId, createdAt, updatedAt. Value field is never present.

**Examples**

- Use when: auditing which secrets are registered for a company or checking a specific secret's metadata
- Don't use when: you need to rotate or update a secret — use paperclip_rotate_secret or paperclip_update_secret instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_rotate_secret

⚠ Board-only: Rotate a secret's value, incrementing its version. Increments the secret version (v1 → v2 → v3). Previous references to the secret remain valid for older versions unless specifically purged.

**Inputs**

| Parameter     | Type             | Required | Description                                           |
| ------------- | ---------------- | -------- | ----------------------------------------------------- |
| `secretId`    | `string`         | yes      | Secret UUID                                           |
| `value`       | `string`         | yes      | New secret value — increments the version             |
| `externalRef` | `string \| null` | no       | New external reference after rotation (null to clear) |

**Returns**

Updated secret metadata with incremented latestVersion: id, companyId, name, provider, externalRef, latestVersion, description, timestamps. Value is never returned.

**Examples**

- Use when: rotating a compromised or expiring credential; each call increments latestVersion
- Don't use when: you only need to rename or update metadata without changing the value — use paperclip_update_secret instead

**Errors**

- 404: secret not found → verify secretId with paperclip_list_secrets
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_update_secret

⚠ Board-only: Update secret metadata (name, description, externalRef). To rotate the secret value, use `paperclip_rotate_secret`.

**Inputs**

| Parameter     | Type             | Required | Description                            |
| ------------- | ---------------- | -------- | -------------------------------------- |
| `secretId`    | `string`         | yes      | Secret UUID                            |
| `name`        | `string`         | no       | New secret name                        |
| `description` | `string \| null` | no       | New description (null to clear)        |
| `externalRef` | `string \| null` | no       | New external reference (null to clear) |

**Returns**

Updated secret metadata: id, companyId, name, provider, externalRef, latestVersion, description, timestamps. Value is never returned.

**Examples**

- Use when: renaming a secret or updating its description or external reference without changing its value
- Don't use when: you need to change the secret value — the value field is not accepted here; use paperclip_rotate_secret instead

**Errors**

- 404: secret not found → verify secretId with paperclip_list_secrets
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---
