import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatGenericList,
  applyCharLimit,
  paginate,
} from "./format.js";

const SecretProviderSchema = z
  .enum(["local_encrypted", "aws_secrets_manager", "gcp_secret_manager", "vault"])
  .describe("Secret storage provider");

const ListSecretsInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID"),
    limit: PaginationLimitSchema.describe("Max secrets per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of secrets to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const CreateSecretInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID"),
    name: z.string().min(1).describe("Secret name (e.g. DATABASE_URL)"),
    value: z
      .string()
      .min(1)
      .describe("Secret value — stored encrypted, never returned in responses"),
    provider: SecretProviderSchema.optional().describe(
      "Storage provider (default: local_encrypted)"
    ),
    description: z.string().nullable().optional().describe("Human-readable description"),
    externalRef: z
      .string()
      .nullable()
      .optional()
      .describe("External reference (e.g. ARN for AWS Secrets Manager)"),
  })
  .strict();

const UpdateSecretInput = z
  .object({
    secretId: z.string().min(1).describe("Secret UUID"),
    name: z.string().min(1).optional().describe("New secret name"),
    description: z.string().nullable().optional().describe("New description (null to clear)"),
    externalRef: z
      .string()
      .nullable()
      .optional()
      .describe("New external reference (null to clear)"),
  })
  .strict();

const RotateSecretInput = z
  .object({
    secretId: z.string().min(1).describe("Secret UUID"),
    value: z.string().min(1).describe("New secret value — increments the version"),
    externalRef: z
      .string()
      .nullable()
      .optional()
      .describe("New external reference after rotation (null to clear)"),
  })
  .strict();

export const secretTools: ToolDefinition[] = [
  {
    name: "paperclip_list_secrets",
    description: composeDescription({
      boardOnly: true,
      summary:
        "List secrets registered for a company. Returns metadata only — secret values are never included in any response.",
      args: [
        "- companyId: string — Company UUID",
        "- limit: number (optional) — Max results per page (1–100, default 50)",
        "- offset: number (optional) — Number of records to skip (default 0)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: Secret[], total, count, offset, limit, has_more, next_offset }. Each item: id, companyId, name, provider, externalRef, latestVersion, description, createdByAgentId, createdByUserId, createdAt, updatedAt. Value field is never present.",
      examples: {
        useWhen:
          "auditing which secrets are registered for a company or checking a specific secret's metadata",
        dontUseWhen:
          "you need to rotate or update a secret — use paperclip_rotate_secret or paperclip_update_secret instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(ListSecretsInput),
    annotations: { title: "List secrets", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { companyId, response_format: fmt, limit, offset } = validate(ListSecretsInput, args);
        const all = await client.get<unknown[]>(`/api/companies/${companyId}/secrets`);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Secrets", envelope);
        const hint = "Response too large. Use limit/offset to page, or narrow by companyId.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_secrets", resource: "secret" });
      }
    },
  },
  {
    name: "paperclip_create_secret",
    description: composeDescription({
      boardOnly: true,
      summary:
        "Create a new secret for a company. The value is stored encrypted and is never returned in any response.",
      args: [
        "- companyId: string — Company UUID",
        "- name: string — Secret name (e.g. DATABASE_URL)",
        "- value: string — Secret value (stored encrypted, never returned)",
        "- provider: enum (optional) — Storage backend: local_encrypted | aws_secrets_manager | gcp_secret_manager | vault (default: local_encrypted)",
        "- description: string | null (optional) — Human-readable description",
        "- externalRef: string | null (optional) — External reference (e.g. ARN for AWS Secrets Manager)",
      ],
      returns:
        "Created secret metadata: id, companyId, name, provider, externalRef, latestVersion (starts at 1), description, createdByAgentId, createdByUserId, createdAt, updatedAt. Value is never returned.",
      examples: {
        useWhen:
          "registering a new credential or API key that agents or routines will reference by name",
        dontUseWhen:
          "the secret already exists and you want to update its value — use paperclip_rotate_secret instead",
      },
      errors: [
        "- 400: validation error → check that name and value are non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
        "- 409: secret name already exists → use paperclip_rotate_secret to update its value",
      ],
    }),
    inputSchema: toJsonSchema(CreateSecretInput),
    annotations: { title: "Create secret", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateSecretInput, args);
        const body: Record<string, unknown> = { name: input.name, value: input.value };
        if (input.provider !== undefined) body["provider"] = input.provider;
        if (input.description !== undefined) body["description"] = input.description;
        if (input.externalRef !== undefined) body["externalRef"] = input.externalRef;
        const data = await client.post<unknown>(`/api/companies/${input.companyId}/secrets`, body);
        const hint = "Secret create response too large; the operation likely succeeded.";
        return { content: [{ type: "text", text: applyCharLimit(formatJson(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_create_secret", resource: "secret" });
      }
    },
  },
  {
    name: "paperclip_update_secret",
    description: composeDescription({
      boardOnly: true,
      summary:
        "Update secret metadata (name, description, externalRef). To rotate the secret value, use `paperclip_rotate_secret`.",
      args: [
        "- secretId: string — Secret UUID",
        "- name: string (optional) — New secret name",
        "- description: string | null (optional) — New description (null to clear)",
        "- externalRef: string | null (optional) — New external reference (null to clear)",
      ],
      returns:
        "Updated secret metadata: id, companyId, name, provider, externalRef, latestVersion, description, timestamps. Value is never returned.",
      examples: {
        useWhen:
          "renaming a secret or updating its description or external reference without changing its value",
        dontUseWhen:
          "you need to change the secret value — the value field is not accepted here; use paperclip_rotate_secret instead",
      },
      errors: [
        "- 404: secret not found → verify secretId with paperclip_list_secrets",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(UpdateSecretInput),
    annotations: {
      title: "Update secret metadata",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { secretId, ...fields } = validate(UpdateSecretInput, args);
        const body: Record<string, unknown> = {};
        if (fields.name !== undefined) body["name"] = fields.name;
        if (fields.description !== undefined) body["description"] = fields.description;
        if (fields.externalRef !== undefined) body["externalRef"] = fields.externalRef;
        const data = await client.patch<unknown>(`/api/secrets/${secretId}`, body);
        const hint = "Secret update response too large; the operation likely succeeded.";
        return { content: [{ type: "text", text: applyCharLimit(formatJson(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_update_secret", resource: "secret" });
      }
    },
  },
  {
    name: "paperclip_rotate_secret",
    description: composeDescription({
      boardOnly: true,
      summary:
        "Rotate a secret's value, incrementing its version. Increments the secret version (v1 → v2 → v3). Previous references to the secret remain valid for older versions unless specifically purged.",
      args: [
        "- secretId: string — Secret UUID",
        "- value: string — New secret value (stored encrypted, never returned)",
        "- externalRef: string | null (optional) — Updated external reference after rotation (null to clear)",
      ],
      returns:
        "Updated secret metadata with incremented latestVersion: id, companyId, name, provider, externalRef, latestVersion, description, timestamps. Value is never returned.",
      examples: {
        useWhen:
          "rotating a compromised or expiring credential; each call increments latestVersion",
        dontUseWhen:
          "you only need to rename or update metadata without changing the value — use paperclip_update_secret instead",
      },
      errors: [
        "- 404: secret not found → verify secretId with paperclip_list_secrets",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(RotateSecretInput),
    annotations: { title: "Rotate secret value", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { secretId, value, externalRef } = validate(RotateSecretInput, args);
        const body: Record<string, unknown> = { value };
        if (externalRef !== undefined) body["externalRef"] = externalRef;
        const data = await client.post<unknown>(`/api/secrets/${secretId}/rotate`, body);
        const hint = "Secret rotate response too large; the operation likely succeeded.";
        return { content: [{ type: "text", text: applyCharLimit(formatJson(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_rotate_secret", resource: "secret" });
      }
    },
  },
];
