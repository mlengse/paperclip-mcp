# Stage 8 API Contracts — Reference for Dev Agents

Each sub-stage agent consults this file for exact request/response shapes. Confirmed from `paperclipai` npm dist + `docs.paperclip.ing`. Endpoints flagged **(VERIFY)** require live-API curl confirmation before implementation — orchestrator runs these checks before dispatching the sub-stage Dev agent.

## Conventions

- `Authorization: Bearer <token>` on all calls.
- `X-Paperclip-Run-Id: <runId>` automatically injected by `PaperclipClient` on mutations when `PAPERCLIP_RUN_ID` env is set.
- Error body: `{ "error": string, "details"?: unknown }`.

---

## 8a — Workflow completeness

### `paperclip_list_approval_issues` — `GET /api/approvals/{approvalId}/issues`
- Auth: either. No run-id.
- Input: `{ approvalId: string }`
- Output: array of issues (same shape as `list_issues` items).
- Module: append to `src/tools/approvals.ts`.

### `paperclip_wakeup_agent` — `POST /api/agents/{agentId}/wakeup`
- Auth: either. Run-id recommended.
- Input: `{ agentId, source?: "timer"|"assignment"|"on_demand"|"automation", triggerDetail?: "manual"|"ping"|"callback"|"system", reason?: string|null, payload?: Record<string, unknown>|null, idempotencyKey?: string|null, forceFreshSession?: boolean }`
- Output: heartbeat run object `{ id, agentId, companyId, status, invocationSource, triggerDetail, startedAt, createdAt }` OR `{ status: "skipped" }` if agent already running/paused.
- Module: append to `src/tools/agents.ts`.

### `paperclip_get_current_user` — `GET /api/cli-auth/me`
- Auth: board. No run-id. Description prefix `⚠ Board-only:`.
- Input: `{}` (NoInput).
- Output: `{ userId: string|null, user: { id: string, ... }|null }`.
- Module: append to `src/tools/identity.ts`.

### `paperclip_revoke_current_session` — `POST /api/cli-auth/revoke-current`
- Auth: board. `destructiveHint: true`. Description prefix `⚠ Board-only:` + strong warning: "invalidates the token used to call this tool".
- Input: `{}` (NoInput).
- Output: `{ ok: true }` (verify on first curl).
- Module: append to `src/tools/identity.ts`.

---

## 8b — Company + workspace management (VERIFY before impl)

### `paperclip_delete_workspace` — `DELETE /api/projects/{projectId}/workspaces/{workspaceId}` (VERIFY response)
- Auth: board. Run-id recommended. `destructiveHint: true`. Description: `⚠ Board-only:`.
- Input: `{ projectId: string, workspaceId: string }`
- Output: **VERIFY** — likely `{ ok: true }` or deleted workspace object.

### `paperclip_update_company` — `PATCH /api/companies/{companyId}`
- Auth: either (restricted fields for agents). Run-id recommended. `destructiveHint: true`.
- Input (all optional except companyId):
  - `companyId`, `name`, `description`, `budgetMonthlyCents` (int, nonneg)
  - Board-only fields: `status` (enum active/paused/archived), `requireBoardApprovalForNewAgents`, `feedbackDataSharingEnabled`, `feedbackDataSharingTermsVersion`, `brandColor` (hex regex), `logoAssetId`
- Output: updated company object.

### `paperclip_list_companies` — `GET /api/companies`
- Auth: board. Description prefix `⚠ Board-only:`.
- Input: `{}` (NoInput).
- Output: array of company objects.

### `paperclip_get_company` — `GET /api/companies/{companyId}`
- Auth: board. Description prefix `⚠ Board-only:`.
- Input: `{ companyId }`.
- Output: company object (id, name, description, status, issuePrefix, issueCounter, budget/spent, flags, brandColor, logoAssetId, pauseReason, pausedAt, timestamps).

### `paperclip_create_company` — `POST /api/companies`
- Auth: board. Description prefix `⚠ Board-only:`.
- Input: `{ name: string (min 1), description?: string|null, budgetMonthlyCents?: int nonneg }`.
- Output: created company (status "active", issuePrefix auto-generated).

### `paperclip_archive_company` — `POST /api/companies/{companyId}/archive` (VERIFY endpoint)
- Auth: board. `destructiveHint: true`. Description prefix `⚠ Board-only:`.
- If dedicated endpoint doesn't exist, fall back to `PATCH /api/companies/{id}` with `{ status: "archived" }`.
- Input: `{ companyId }`.
- Output: updated company with `status: "archived"`.

---

## 8c — Direct agent creation

### `paperclip_create_agent` — `POST /api/companies/{companyId}/agents`
- Auth: board. Run-id recommended. Description prefix `⚠ Board-only: direct creation; agent-initiated hires go through paperclip_create_agent_hire.`
- Input schema (from `createAgentSchema`):
  - `companyId` (string, required)
  - `name` (string, required, min 1)
  - `role` (enum: ceo|cto|cmo|cfo|engineer|designer|pm|qa|devops|researcher|general, default "general")
  - `title` (string|null, optional)
  - `icon` (enum, optional — see dist for full list)
  - `reportsTo` (string UUID|null, optional)
  - `capabilities` (string|null, optional)
  - `desiredSkills` (string[], optional)
  - `adapterType` (enum: process|http|claude_local|codex_local|gemini_local|opencode_local|pi_local|cursor|openclaw_gateway|hermes_local, default "process")
  - `adapterConfig` (record, default {})
  - `runtimeConfig` (record, default {})
  - `budgetMonthlyCents` (int nonneg, default 0)
  - `permissions` (object `{ canCreateAgents?: boolean }`, default `{ canCreateAgents: false }`)
  - `metadata` (record|null, optional)
- Output: created agent.
- Module: append to `src/tools/agents.ts`.

---

## 8d — Plugins (new `src/tools/plugins.ts`)

All board-only. Description prefix `⚠ Board-only:` on every tool.

### `paperclip_list_plugins` — `GET /api/plugins?status=<enum>`
- Input: `{ status?: "installed"|"ready"|"disabled"|"error"|"upgrade_pending"|"uninstalled" }`.
- Output: array `{ id, pluginKey, packageName, version, status, lastError, createdAt, updatedAt }[]`.

### `paperclip_get_plugin` — `GET /api/plugins/{pluginKey}`
- Note: `pluginKey` must be URL-encoded (may contain `@` and `/`).
- Input: `{ pluginKey: string }`.
- Output: plugin object.

### `paperclip_install_plugin` — `POST /api/plugins/install`
- Input: `{ packageName: string (min 1), version?: string, isLocalPath?: boolean }`.
- Output: installed plugin object.

### `paperclip_list_plugin_examples` — `GET /api/plugins/examples`
- Input: `{}`.
- Output: array `{ displayName, pluginKey, description, localPath }[]`.

### `paperclip_enable_plugin` — `POST /api/plugins/{pluginKey}/enable`
- Input: `{ pluginKey }`.
- Output: updated plugin (status "ready" or "installed").

### `paperclip_disable_plugin` — `POST /api/plugins/{pluginKey}/disable`
- `destructiveHint: true`.
- Input: `{ pluginKey }`.
- Output: updated plugin (status "disabled").

---

## 8e — Secrets (new `src/tools/secrets.ts`) (VERIFY rotate)

All board-only. Description prefix `⚠ Board-only:`.

### `paperclip_list_secrets` — `GET /api/companies/{companyId}/secrets`
- Input: `{ companyId }`.
- Output: array of metadata `{ id, companyId, name, provider, latestVersion, description, externalRef, createdByAgentId, createdByUserId, createdAt, updatedAt }[]` (value NEVER returned).

### `paperclip_create_secret` — `POST /api/companies/{companyId}/secrets`
- Input: `{ companyId, name: string (min 1), value: string (min 1), provider?: "local_encrypted"|"aws_secrets_manager"|"gcp_secret_manager"|"vault", description?: string|null, externalRef?: string|null }`.
- Output: created secret metadata.

### `paperclip_update_secret` — `PATCH /api/secrets/{secretId}`
- Input (value rotation is a separate endpoint per dist — VERIFY `POST /api/secrets/{id}/rotate`):
  - `{ secretId, name?: string (min 1), description?: string|null, externalRef?: string|null }`.
- Output: updated secret metadata.
- Docstring note: "To rotate the secret value, use <TBD after verification>."

---

## 8f — Run observability (new `src/tools/runs.ts`)

All board-only. Description prefix `⚠ Board-only:`.

### `paperclip_list_heartbeat_runs` — `GET /api/companies/{companyId}/heartbeat-runs?agentId=<id>`
- Input: `{ companyId, agentId?: string }`.
- Output: array of run objects with full schema `{ id, agentId, invocationSource, triggerDetail, status, startedAt, finishedAt, error, errorCode, exitCode, signal, logBytes, stdoutExcerpt, stderrExcerpt, sessionIdBefore, sessionIdAfter, wakeupRequestId, retryOfRunId, createdAt, updatedAt }[]`.
- Pagination envelope per Stage 6 pattern.

### `paperclip_list_run_events` — `GET /api/heartbeat-runs/{runId}/events?afterSeq=<n>&limit=<n>`
- Input: `{ runId, afterSeq?: int nonneg, limit?: int positive (default 100) }`.
- Output: array of events `{ id, companyId, runId, agentId, seq, eventType, stream, level, color, message, payload, createdAt }[]`.

### `paperclip_get_run_log` — `GET /api/heartbeat-runs/{runId}/log?offset=<n>&limitBytes=<n>`
- Input: `{ runId, offset?: int nonneg, limitBytes?: int positive (default 16384) }`.
- Output: `{ content: string (NDJSON per line), nextOffset: int, totalBytes: int|null }`.

---

## 8g — Feedback traces (new `src/tools/feedback.ts`) (VERIFY auth scope on bundle)

### `paperclip_list_feedback_traces` — `GET /api/companies/{companyId}/feedback-traces`
- Auth: either.
- Input: `{ companyId, targetType?, vote?, status?, projectId?, issueId?, from? (ISO 8601), to? (ISO 8601), sharedOnly?: boolean, includePayload?: boolean }`.
- Output: array of trace objects.
- Pagination envelope.

### `paperclip_list_issue_feedback_traces` — `GET /api/issues/{issueId}/feedback-traces`
- Auth: either.
- Input: `{ issueId, targetType?, vote?, status?, from?, to?, sharedOnly?, includePayload? }`.
- Output: array of trace objects (scoped to issue).

### `paperclip_get_feedback_trace_bundle` — `GET /api/feedback-traces/{traceId}/bundle` (VERIFY scope)
- Auth: VERIFY (likely board, possibly either).
- Input: `{ traceId }`.
- Output: full bundle `{ id, schemaVersion, bundleVersion, payloadVersion, vote, status, targetType, targetId, targetSummary, payloadSnapshot, payloadDigest, redactionSummary, consentVersion, createdAt, updatedAt }`.

---

## 8h — Company import/export (new `src/tools/company-import.ts`)

All board-only. Description prefix `⚠ Board-only:`.

### `paperclip_export_company` — `POST /api/companies/{companyId}/export`
- Input: `{ companyId, include: { company, agents, projects, issues, skills: all boolean }, skills?: string[], projects?: string[], issues?: string[], projectIssues?: string[], expandReferencedSkills?: boolean }`.
- Output: `{ rootPath, files: Record<string, string>, paperclipExtensionPath, warnings: string[] }`.

### `paperclip_preview_company_import` — `POST /api/companies/{companyId}/imports/preview`
- Input (union source): `{ companyId, source: ({type:"inline", rootPath, files}|{type:"github", url}), include, target: {mode:"existing_company", companyId}, agents: "all"|string[], collisionStrategy: "rename"|"skip"|"replace", selectedFiles?: string[] }`.
- Output: `{ source, target, agents, projects, issues, skills, warnings, adapterOverrides }`.

### `paperclip_apply_company_import` — `POST /api/companies/{companyId}/imports/apply`
- Input: preview schema + `adapterOverrides?: Record<string, unknown>`.
- Output: `{ company, insertedAgents, insertedProjects, insertedProjectWorkspaces, insertedIssues, insertedComments, insertedDocuments, insertedDocumentRevisions, mergedDocuments, insertedAttachments, warnings }`.

---

## Skipped endpoints

- `GET /api/health` — infrastructure probe, not agent-useful.
- `POST /api/cli-auth/challenges` (+ `GET` poll) — browser-mediated PKCE flow requires human interaction; not tool-shaped.
