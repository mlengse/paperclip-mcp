import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import { formatJson, applyCharLimit } from "./format.js";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/**
 * The `include` object controls which resource types are bundled in the
 * export or applied during import. Defaults mirror the API defaults.
 */
const IncludeSchema = z
  .object({
    company: z.boolean().default(true).describe("Include the company metadata file (COMPANY.md)"),
    agents: z.boolean().default(true).describe("Include all agent configuration files"),
    projects: z.boolean().default(false).describe("Include project records"),
    issues: z.boolean().default(false).describe("Include issue records"),
    skills: z.boolean().default(false).describe("Include company skill definitions"),
  })
  .strict();

/**
 * Source union for import operations.
 * - `inline`: caller provides the bundle in-memory (rootPath + files map).
 * - `github`: API fetches the bundle from the given GitHub repository URL.
 */
const SourceSchema = z.union([
  z
    .object({
      type: z.literal("inline").describe("Source type: inline bundle provided in this request"),
      rootPath: z.string().min(1).describe("Root path key of the bundle (e.g. 'my-company')"),
      files: z
        .record(z.string(), z.string())
        .describe("Map of relative file paths to their string contents"),
    })
    .strict(),
  z
    .object({
      type: z.literal("github").describe("Source type: fetch bundle from a GitHub repository URL"),
      url: z.string().url().describe("GitHub repository URL (e.g. 'https://github.com/org/repo')"),
    })
    .strict(),
]);

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const ExportCompanyInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID to export"),
    include: IncludeSchema.describe(
      "Which resource types to include in the export package (company, agents, projects, issues, skills)"
    ),
    skills: z
      .array(z.string())
      .optional()
      .describe("Filter export to specific skill IDs (omit for all skills)"),
    projects: z
      .array(z.string())
      .optional()
      .describe("Filter export to specific project IDs (omit for all projects)"),
    issues: z
      .array(z.string())
      .optional()
      .describe("Filter export to specific issue IDs (omit for all issues)"),
    projectIssues: z
      .array(z.string())
      .optional()
      .describe("Project IDs whose issues should be included in the export"),
    expandReferencedSkills: z
      .boolean()
      .optional()
      .describe("When true, expand transitive skill references into the export bundle"),
  })
  .strict();

const PreviewCompanyImportInput = z
  .object({
    companyId: z.string().min(1).describe("Target company UUID for the import preview"),
    source: SourceSchema.describe(
      "Bundle source: 'inline' provides files in the request; 'github' fetches from a repo URL"
    ),
    include: IncludeSchema.describe(
      "Which resource types to consider during the import (company, agents, projects, issues, skills)"
    ),
    agents: z
      .union([z.literal("all"), z.array(z.string())])
      .default("all")
      .describe("Which agents to import: literal 'all' or an array of agent URL keys"),
    collisionStrategy: z
      .enum(["rename", "skip", "replace"])
      .default("rename")
      .describe(
        "How to handle name/key collisions: 'rename' (append suffix), 'skip' (leave existing), 'replace' (overwrite)"
      ),
    selectedFiles: z
      .array(z.string())
      .optional()
      .describe(
        "Subset of file paths from the bundle to process (omit for all files in the bundle)"
      ),
  })
  .strict();

const ApplyCompanyImportInput = z
  .object({
    companyId: z.string().min(1).describe("Target company UUID to apply the import into"),
    source: SourceSchema.describe(
      "Bundle source: 'inline' provides files in the request; 'github' fetches from a repo URL"
    ),
    include: IncludeSchema.describe(
      "Which resource types to apply (company, agents, projects, issues, skills)"
    ),
    agents: z
      .union([z.literal("all"), z.array(z.string())])
      .default("all")
      .describe("Which agents to import: literal 'all' or an array of agent URL keys"),
    collisionStrategy: z
      .enum(["rename", "skip", "replace"])
      .default("rename")
      .describe(
        "How to handle name/key collisions: 'rename' (append suffix), 'skip' (leave existing), 'replace' (overwrite)"
      ),
    selectedFiles: z
      .array(z.string())
      .optional()
      .describe("Subset of file paths from the bundle to apply (omit for all files in the bundle)"),
    adapterOverrides: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Adapter-specific overrides map from the preview step (key: adapter name, value: override config)"
      ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const companyImportTools: ToolDefinition[] = [
  {
    name: "paperclip_export_company",
    description: composeDescription({
      boardOnly: true,
      summary: "Export company package",
      args: [
        "- companyId: string — Company UUID to export",
        "- include: object — Which resource types to bundle: { company, agents, projects, issues, skills } (booleans with defaults true/true/false/false/false)",
        "- skills: string[] (optional) — Filter to specific skill IDs",
        "- projects: string[] (optional) — Filter to specific project IDs",
        "- issues: string[] (optional) — Filter to specific issue IDs",
        "- projectIssues: string[] (optional) — Project IDs whose issues to include",
        "- expandReferencedSkills: boolean (optional) — Expand transitive skill references",
      ],
      returns:
        "Export bundle (JSON only): { rootPath, manifest, files (map of path → content), paperclipExtensionPath, warnings }. Files can be very large — response is truncated at 25k chars.",
      examples: {
        useWhen: "creating a portable snapshot of a company configuration for backup or migration",
        dontUseWhen:
          "you want to apply an import bundle — use paperclip_preview_company_import then paperclip_apply_company_import",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → this endpoint requires board-level authentication",
        "- 404: company not found → verify ID with paperclip_list_companies",
      ],
    }),
    inputSchema: toJsonSchema(ExportCompanyInput),
    annotations: { title: "Export company package", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const {
          companyId,
          include,
          skills,
          projects,
          issues,
          projectIssues,
          expandReferencedSkills,
        } = validate(ExportCompanyInput, args);

        const body: Record<string, unknown> = { include };
        if (skills !== undefined) body.skills = skills;
        if (projects !== undefined) body.projects = projects;
        if (issues !== undefined) body.issues = issues;
        if (projectIssues !== undefined) body.projectIssues = projectIssues;
        if (expandReferencedSkills !== undefined)
          body.expandReferencedSkills = expandReferencedSkills;

        const data = await client.post<unknown>(`/api/companies/${companyId}/export`, body);
        const text = formatJson(data);
        const hint =
          "Export bundle truncated — use narrower include flags or filter by skills/projects/issues.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_export_company", resource: "company" });
      }
    },
  },
  {
    name: "paperclip_preview_company_import",
    description: composeDescription({
      boardOnly: true,
      summary: "Preview company import",
      args: [
        "- companyId: string — Target company UUID",
        "- source: union — { type: 'inline', rootPath: string, files: Record<string,string> } or { type: 'github', url: string }",
        "- include: object — Which resource types to preview (company, agents, projects, issues, skills)",
        "- agents: 'all' | string[] (optional) — Which agents to import (default: 'all')",
        "- collisionStrategy: 'rename' | 'skip' | 'replace' (optional) — Collision handling (default: rename)",
        "- selectedFiles: string[] (optional) — Subset of bundle files to process",
      ],
      returns:
        "Preview report (JSON only): { source, target, agents, projects, issues, skills, warnings, adapterOverrides }. Non-mutating — no changes are applied. Note: openWorldHint is false; if source.type is 'github', the API fetches external content.",
      examples: {
        useWhen:
          "inspecting what an import would change before committing; also generates adapterOverrides for the apply step",
        dontUseWhen:
          "you want to immediately apply — call paperclip_apply_company_import directly (preview is optional but recommended)",
      },
      errors: [
        "- 400: invalid bundle → check source files and rootPath",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → this endpoint requires board-level authentication",
        "- 404: company not found → verify ID with paperclip_list_companies",
      ],
    }),
    inputSchema: toJsonSchema(PreviewCompanyImportInput),
    annotations: {
      title: "Preview company import",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { companyId, source, include, agents, collisionStrategy, selectedFiles } = validate(
          PreviewCompanyImportInput,
          args
        );

        const body: Record<string, unknown> = { source, include };
        if (agents !== undefined) body.agents = agents;
        if (collisionStrategy !== undefined) body.collisionStrategy = collisionStrategy;
        if (selectedFiles !== undefined) body.selectedFiles = selectedFiles;

        const data = await client.post<unknown>(
          `/api/companies/${companyId}/imports/preview`,
          body
        );
        const text = formatJson(data);
        const hint =
          "Preview response truncated — use selectedFiles to narrow the bundle or filter include flags.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_preview_company_import",
          resource: "company",
        });
      }
    },
  },
  {
    name: "paperclip_apply_company_import",
    description: composeDescription({
      boardOnly: true,
      summary: "Apply company import",
      args: [
        "- companyId: string — Target company UUID",
        "- source: union — { type: 'inline', rootPath: string, files: Record<string,string> } or { type: 'github', url: string }",
        "- include: object — Which resource types to apply (company, agents, projects, issues, skills)",
        "- agents: 'all' | string[] (optional) — Which agents to import (default: 'all')",
        "- collisionStrategy: 'rename' | 'skip' | 'replace' (optional) — Collision handling (default: rename)",
        "- selectedFiles: string[] (optional) — Subset of bundle files to apply",
        "- adapterOverrides: Record<string,unknown> (optional) — Adapter overrides from preview step",
      ],
      returns:
        "Import result counts (JSON only): { insertedAgents, insertedProjects, insertedIssues, insertedSkills, warnings }. This operation is destructive — it writes new records into the company.",
      examples: {
        useWhen:
          "applying a validated import bundle; run paperclip_preview_company_import first to inspect changes",
        dontUseWhen:
          "you just want to inspect what would change — use paperclip_preview_company_import",
      },
      errors: [
        "- 400: invalid bundle → verify source files are well-formed",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: board key required → this endpoint requires board-level authentication",
        "- 404: company not found → verify ID with paperclip_list_companies",
        "- 409: conflict not resolvable with current strategy → try a different collisionStrategy",
      ],
    }),
    inputSchema: toJsonSchema(ApplyCompanyImportInput),
    annotations: {
      title: "Apply company import",
      destructiveHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const {
          companyId,
          source,
          include,
          agents,
          collisionStrategy,
          selectedFiles,
          adapterOverrides,
        } = validate(ApplyCompanyImportInput, args);

        const body: Record<string, unknown> = { source, include };
        if (agents !== undefined) body.agents = agents;
        if (collisionStrategy !== undefined) body.collisionStrategy = collisionStrategy;
        if (selectedFiles !== undefined) body.selectedFiles = selectedFiles;
        if (adapterOverrides !== undefined) body.adapterOverrides = adapterOverrides;

        const data = await client.post<unknown>(`/api/companies/${companyId}/imports/apply`, body);
        const text = formatJson(data);
        const hint = "Apply response truncated — the import likely succeeded; check the counts.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_apply_company_import",
          resource: "company",
        });
      }
    },
  },
];
