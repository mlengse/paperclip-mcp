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

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const ListCompaniesInput = z
  .object({
    limit: PaginationLimitSchema.describe("Max companies per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of companies to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetCompanyInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const CreateCompanyInput = z
  .object({
    name: z.string().min(1).describe("Company name (required, non-empty)"),
    description: z
      .string()
      .nullable()
      .optional()
      .describe("Company description (optional, nullable)"),
    budgetMonthlyCents: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Monthly budget in cents (non-negative integer, e.g. 5000 = $50.00)"),
  })
  .strict();

const UpdateCompanyInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID"),
    name: z.string().min(1).optional().describe("New company name"),
    description: z.string().nullable().optional().describe("New description (nullable to clear)"),
    budgetMonthlyCents: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("New monthly budget in cents (non-negative integer)"),
  })
  .strict();

const ArchiveCompanyInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID to archive"),
  })
  .strict();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const companyTools: ToolDefinition[] = [
  {
    name: "paperclip_list_companies",
    description: composeDescription({
      summary: "⚠ Board-only: List all companies accessible to the authenticated board user.",
      args: [
        "- limit: number (optional) — Max companies per page (1–100, default 50)",
        "- offset: number (optional) — Number of companies to skip (default 0)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: Company[], total, count, offset, limit, has_more, next_offset }. Each item: id, name, description, status, issuePrefix, budgetMonthlyCents, createdAt.",
      examples: {
        useWhen: "discovering all companies on the board before looking up a specific companyId",
        dontUseWhen: "you already have the companyId — use paperclip_get_company instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → this endpoint requires board-level authentication",
      ],
    }),
    inputSchema: toJsonSchema(ListCompaniesInput),
    annotations: { title: "List all companies", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt, limit, offset } = validate(ListCompaniesInput, args);
        const all = await client.get<unknown[]>(`/api/companies`);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Companies", envelope);
        const hint = "Response too large. Use limit/offset to page through results.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_companies", resource: "company" });
      }
    },
  },
  {
    name: "paperclip_get_company",
    description: composeDescription({
      summary: "⚠ Board-only: Get a single company by UUID.",
      args: [
        '- companyId: string — Company UUID (example: "53caad5d-05d6-469d-b6eb-8961a71b615e")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Company object: id, name, description, status, issuePrefix, issueCounter, budgetMonthlyCents, spentMonthlyCents, requireBoardApprovalForNewAgents, feedbackDataSharingEnabled, brandColor, logoAssetId, pauseReason, pausedAt, createdAt, updatedAt.",
      examples: {
        useWhen: "reading a company's budget, status, or branding configuration",
        dontUseWhen:
          "you need to list all companies — use paperclip_list_companies to discover IDs first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → this endpoint requires board-level authentication",
        "- 404: company not found → verify ID with paperclip_list_companies",
      ],
    }),
    inputSchema: toJsonSchema(GetCompanyInput),
    annotations: { title: "Get company by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { companyId, response_format: fmt } = validate(GetCompanyInput, args);
        const data = await client.get<unknown>(`/api/companies/${companyId}`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList([data], "Company");
        const hint =
          "Entity response too large. This company may have oversized description or metadata fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_company", resource: "company" });
      }
    },
  },
  {
    name: "paperclip_create_company",
    description: composeDescription({
      summary:
        "⚠ Board-only: Create a new company. The issuePrefix is auto-generated from the name.",
      args: [
        "- name: string — Company name (required, non-empty)",
        "- description: string | null (optional) — Company description",
        "- budgetMonthlyCents: number (optional) — Monthly budget in cents (e.g. 5000 = $50.00)",
      ],
      returns:
        "The created company object with all fields including assigned UUID, issuePrefix (auto-generated), status 'active', and timestamps.",
      examples: {
        useWhen: "onboarding a new organization or setting up a tenant on the board",
        dontUseWhen:
          "you need to update an existing company — use paperclip_update_company instead",
      },
      errors: [
        "- 400: validation failure → ensure name is non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → this endpoint requires board-level authentication",
      ],
    }),
    inputSchema: toJsonSchema(CreateCompanyInput),
    annotations: { title: "Create new company", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { name, description, budgetMonthlyCents } = validate(CreateCompanyInput, args);
        const body: Record<string, unknown> = { name };
        if (description !== undefined) body.description = description;
        if (budgetMonthlyCents !== undefined) body.budgetMonthlyCents = budgetMonthlyCents;
        const data = await client.post<unknown>(`/api/companies`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_create_company", resource: "company" });
      }
    },
  },
  {
    name: "paperclip_update_company",
    description: composeDescription({
      summary:
        "⚠ Board-only: Update a company's name, description, or monthly budget. Requires board-level authentication (agent keys are rejected — even CEO agents receive 403).",
      args: [
        '- companyId: string — Company UUID (example: "53caad5d-05d6-469d-b6eb-8961a71b615e")',
        "- name: string (optional) — New company name",
        "- description: string | null (optional) — New description (pass null to clear)",
        "- budgetMonthlyCents: number (optional) — New monthly budget in cents (non-negative integer)",
      ],
      returns: "The updated company object with all fields and updated timestamps.",
      examples: {
        useWhen: "adjusting a company's monthly budget cap or renaming it after a rebrand",
        dontUseWhen:
          "you need to archive the company — use paperclip_archive_company for status transitions",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → agent keys are not accepted for this endpoint",
        "- 404: company not found → verify ID with paperclip_list_companies",
      ],
    }),
    inputSchema: toJsonSchema(UpdateCompanyInput),
    annotations: {
      title: "Update company settings",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { companyId, ...rest } = validate(UpdateCompanyInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/companies/${companyId}`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_update_company", resource: "company" });
      }
    },
  },
  {
    name: "paperclip_archive_company",
    description: composeDescription({
      summary:
        "⚠ Board-only: Archive a company, setting its status to 'archived'. Uses a dedicated POST endpoint — not a PATCH. This action is irreversible through the API.",
      args: [
        '- companyId: string — Company UUID to archive (example: "53caad5d-05d6-469d-b6eb-8961a71b615e")',
      ],
      returns: "The updated company object with status: 'archived' and updated timestamps.",
      examples: {
        useWhen: "decommissioning a company that is no longer in use",
        dontUseWhen:
          "you need to update other company fields — use paperclip_update_company for name/description/budget",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → this endpoint requires board-level authentication",
        "- 404: company not found → verify ID with paperclip_list_companies",
      ],
    }),
    inputSchema: toJsonSchema(ArchiveCompanyInput),
    annotations: {
      title: "Archive company",
      destructiveHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { companyId } = validate(ArchiveCompanyInput, args);
        const data = await client.post<unknown>(`/api/companies/${companyId}/archive`, {});
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_archive_company", resource: "company" });
      }
    },
  },
];
