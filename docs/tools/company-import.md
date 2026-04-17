# Company Import / Export

Tools for exporting a company's state to a bundle and previewing or applying an import bundle.

---

## paperclip_apply_company_import

⚠ Board-only: Apply company import

**Inputs**

| Parameter           | Type                              | Required | Description                                                                                                 |
| ------------------- | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `companyId`         | `string`                          | yes      | Target company UUID to apply the import into                                                                |
| `source`            | `object \| object`                | yes      | Bundle source: 'inline' provides files in the request; 'github' fetches from a repo URL                     |
| `include`           | `object`                          | yes      | Which resource types to apply (company, agents, projects, issues, skills)                                   |
| `target`            | `object`                          | yes      | Import destination                                                                                          |
| `agents`            | `"all" \| string[]`               | no       | Which agents to import: literal 'all' or an array of agent URL keys                                         |
| `collisionStrategy` | `"rename" \| "skip" \| "replace"` | no       | How to handle name/key collisions: 'rename' (append suffix), 'skip' (leave existing), 'replace' (overwrite) |
| `selectedFiles`     | `string[]`                        | no       | Subset of file paths from the bundle to apply (omit for all files in the bundle)                            |
| `adapterOverrides`  | `object`                          | no       | Adapter-specific overrides map from the preview step (key: adapter name, value: override config)            |

**Returns**

Import result counts (JSON only): { insertedAgents, insertedProjects, insertedIssues, insertedSkills, warnings }. Destructive — writes new records.

**Examples**

- Use when: applying a validated import bundle; run paperclip_preview_company_import first to inspect changes
- Don't use when: you just want to inspect what would change — use paperclip_preview_company_import

**Errors**

- 400: invalid bundle → verify source files are well-formed
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication
- 404: company not found → verify ID with paperclip_list_companies
- 409: conflict not resolvable with current strategy → try a different collisionStrategy

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_export_company

⚠ Board-only: Export company package

**Inputs**

| Parameter                | Type       | Required | Description                                                                                       |
| ------------------------ | ---------- | -------- | ------------------------------------------------------------------------------------------------- |
| `companyId`              | `string`   | yes      | Company UUID to export                                                                            |
| `include`                | `object`   | yes      | Which resource types to include in the export package (company, agents, projects, issues, skills) |
| `skills`                 | `string[]` | no       | Filter export to specific skill IDs (omit for all skills)                                         |
| `projects`               | `string[]` | no       | Filter export to specific project IDs (omit for all projects)                                     |
| `issues`                 | `string[]` | no       | Filter export to specific issue IDs (omit for all issues)                                         |
| `projectIssues`          | `string[]` | no       | Project IDs whose issues should be included in the export                                         |
| `expandReferencedSkills` | `boolean`  | no       | When true, expand transitive skill references into the export bundle                              |

**Returns**

Export bundle (JSON only): { rootPath, manifest, files (map of path → content), paperclipExtensionPath, warnings }. Files can be very large — response is truncated at 25k chars.

**Examples**

- Use when: creating a portable snapshot of a company configuration for backup or migration
- Don't use when: you want to apply an import bundle — use paperclip_preview_company_import then paperclip_apply_company_import

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication
- 404: company not found → verify ID with paperclip_list_companies

**Annotations**

`closedWorld`

---

## paperclip_preview_company_import

⚠ Board-only: Preview company import

**Inputs**

| Parameter           | Type                              | Required | Description                                                                                                 |
| ------------------- | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `companyId`         | `string`                          | yes      | Target company UUID for the import preview                                                                  |
| `source`            | `object \| object`                | yes      | Bundle source: 'inline' provides files in the request; 'github' fetches from a repo URL                     |
| `include`           | `object`                          | yes      | Which resource types to consider during the import (company, agents, projects, issues, skills)              |
| `target`            | `object`                          | yes      | Import destination                                                                                          |
| `agents`            | `"all" \| string[]`               | no       | Which agents to import: literal 'all' or an array of agent URL keys                                         |
| `collisionStrategy` | `"rename" \| "skip" \| "replace"` | no       | How to handle name/key collisions: 'rename' (append suffix), 'skip' (leave existing), 'replace' (overwrite) |
| `selectedFiles`     | `string[]`                        | no       | Subset of file paths from the bundle to process (omit for all files in the bundle)                          |

**Returns**

Preview report (JSON only): { source, target, agents, projects, issues, skills, warnings, adapterOverrides }. Non-mutating — no changes are applied. Note: openWorldHint is false; if source.type is 'github', the API fetches external content.

**Examples**

- Use when: inspecting what an import would change before committing; also generates adapterOverrides for the apply step
- Don't use when: you want to immediately apply — call paperclip_apply_company_import directly (preview is optional but recommended)

**Errors**

- 400: invalid bundle → check source files and rootPath
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: board key required → this endpoint requires board-level authentication
- 404: company not found → verify ID with paperclip_list_companies

**Annotations**

`readOnly`, `closedWorld`

---
