# Stage Plan — v2.0 Implementation

16 stages total (9 main + 8 sub-stages in Stage 8). Execute sequentially. TDD red-first every stage.

## Stage 1 — Test infrastructure + schema unification [FOUNDATION]

**Pre-seeded:** `src/test/helpers/*` and `src/test/cross-cutting/registry.test.ts` landed in first Stage 1 commit (`stage(1): scaffold test helpers + registry invariants`). Two RED tests intentional:

- `[RED→GREEN STAGE 1] no tool has a forbidden non-spec annotation key` (flags `boardOnlyHint` on `paperclip_delete_document`)
- `[RED→GREEN STAGE 1] every tool has a non-empty title annotation` (all 74 tools lack `annotations.title`)

**Impl tasks:**

1. Add `zod-to-json-schema` dependency.
2. Change `ToolDefinition.inputSchema` type from `Record<string, unknown>` → `z.ZodTypeAny` in `src/tools/index.ts`.
3. Convert Zod → JSON Schema at registration time in the `ListToolsRequestSchema` handler (cache per-tool).
4. Delete hand-written JSON `inputSchema` objects in every tool module (13 files), replace with the existing Zod schema reference.
5. Add `title` field to every tool's `annotations` (concise phrase, max 60 chars).
6. Remove the `boardOnlyHint?: boolean` field from the `ToolAnnotations` interface.
7. Move the existing `paperclip_delete_document` description to start with `⚠ Board-only:` and drop the `boardOnlyHint` annotation.
8. Wrap `CallToolRequestSchema` handler in try/catch — unhandled errors become `{ isError: true, content: [{ type: "text", text: "..." }] }`.

**Green when:** all registry tests pass + all 297 existing tests pass + `npm run build` succeeds.

## Stage 2 — Schema constraints + enums + `.strict()`

**Red-first tests:** per-module A4 (enum rejection) + A5 (strict rejects extras) + cross-cutting `error-format.test.ts` with full 9-status-code matrix.

**Impl tasks:**

1. Apply `StatusSchema` / `PrioritySchema` to every `status` / `priority` field in issues, goals, projects.
2. Lift `ApprovalTypeSchema` and `RoutineTriggerTypeSchema` from inline to `src/tools/validation.ts`.
3. Add `.strict()` to every input Zod schema.
4. Format validators: `.datetime()` for ISO 8601 (`expiresAt`, `occurredAt`); hex color regex `/^#[0-9a-fA-F]{6}$/` for `color`; 5-field cron regex for `cron`.
5. `.refine()` on `paperclip_create_workspace`: `cwd || repoUrl` required.
6. `.describe()` on every field that lacks it (audit all modules).

## Stage 3 — Annotations polish + version sync

**Red-first tests:** `registry.test.ts` gains explicit name-lists for read-only / destructive / idempotent tools.

**Impl tasks:**

1. Audit every tool → correct `readOnlyHint` / `destructiveHint` / `idempotentHint`.
2. Add `idempotentHint: true` to: `release_issue`, `upsert_document`, `pause_agent`, `resume_agent`, all `update_*` tools.
3. Prefix with `⚠ Board-only:` in description: `terminate_agent`, `create_agent_key`, `rollback_agent_config`, `update_agent_permissions`, `set_agent_instructions_path`, `approve`, `reject`, `request_revision`.
4. Sync server version in `src/index.ts` from `package.json` (use `createRequire`).

## Stage 4 — Description standardization

**Red-first tests:** `registry.test.ts` adds length ≥ 20, non-empty `Returns:` section detection, presence of `Use when:` marker.

**Impl tasks:**

1. Helper `composeDescription({ summary, args?, returns, examples, errors })` in `src/tools/validation.ts`.
2. Rewrite all tool descriptions using the template (Args/Returns/Examples/Error Handling).
3. Fix `paperclip_download_attachment` description to match actual return shape (NOT "base64"; it's JSON of the upstream response).

## Stage 5 — Response formatting + 25k truncation

**Red-first tests:** D1/D2 truncation tests + F1/F2 format tests + F3 markdown header tests per read-heavy tool.

**Impl tasks:**

1. `src/constants.ts` → `export const CHARACTER_LIMIT = 25_000;`
2. `src/tools/format.ts` → `formatJson`, `formatMarkdown(data, kind)`, `applyCharLimit(text, hint)`.
3. Per-kind markdown formatters: `agentList`, `issueList`, `dashboard`, `orgChart` (others added in Stage 8).
4. Add `response_format` enum param to read-heavy tools, default **`"markdown"`** (per skill §Response Formats).
5. Apply `applyCharLimit` at the return site of every tool (not just read-heavy ones).

## Stage 6 — Pagination envelope

**Red-first tests:** E1/E2/E3 for every `list_*` tool.

**Impl tasks:**

1. Shared `paginate<T>(items, { limit, offset })` helper → returns `{ items, total, count, offset, has_more, next_offset }`.
2. Add `limit` (default 50, max 100) + `offset` (default 0) to every `list_*` tool schema.
3. Wrap upstream responses in the envelope.
4. `list_issues` already paginates client-side — unify with the shared helper.
5. `list_comments` keeps its `after`-cursor workaround, wrapped in the same envelope.

## Stage 7 — Error handling + client timeout

**Red-first tests:** C4 (AbortError) + C5 (network error) per representative module + `error-format.test.ts` timeout case.

**Impl tasks:**

1. Refactor `handleApiError(err, context?)` in `src/tools/validation.ts` with status-coded messages per skill.
2. Per-status text includes the named recovery action (404 → "verify with paperclip*list*..."; 409 → checkout-specific hint; 500 on comments-after → Paperclip-bug note).
3. `AbortSignal.timeout(ms)` in `PaperclipClient`. Default 30000 ms; env override `PAPERCLIP_REQUEST_TIMEOUT_MS`.
4. Wrap `fetch` network errors (TypeError "fetch failed") as `PaperclipApiError(0, "Network error", err.message)` so they flow through `handleApiError`.
5. Every handler passes tool-name context into `handleApiError`.

## Stage 8 — Full API parity (29 new tools across 8 sub-stages)

Contract details in `03-api-contracts.md`. Sub-stages sequential. Each substage follows same TDD cycle.

### 8a — Workflow completeness (4 tools)

- `paperclip_list_approval_issues` — `GET /api/approvals/{id}/issues` (either scope)
- `paperclip_wakeup_agent` — `POST /api/agents/{id}/wakeup` (either scope)
- `paperclip_get_current_user` — `GET /api/cli-auth/me` (board)
- `paperclip_revoke_current_session` — `POST /api/cli-auth/revoke-current` (board, destructive)

### 8b — Company + workspace management (6 tools) — **needs live-API verification**

- `paperclip_delete_workspace` — `DELETE /api/projects/{id}/workspaces/{id}` (board, verify response shape)
- `paperclip_update_company` — `PATCH /api/companies/{id}` (either, restricted fields for agents)
- `paperclip_list_companies` — `GET /api/companies` (board)
- `paperclip_get_company` — `GET /api/companies/{id}` (board)
- `paperclip_create_company` — `POST /api/companies` (board)
- `paperclip_archive_company` — `POST /api/companies/{id}/archive` (board, verify endpoint exists vs PATCH status)

Before 8b: orchestrator spawns `paperclip-server` startup agent, runs curl verification on flagged endpoints, updates this file with confirmed shapes.

### 8c — Direct agent creation (1 tool)

- `paperclip_create_agent` — `POST /api/companies/{id}/agents` (board — agent-side uses existing `create_agent_hire`)

### 8d — Plugins (6 tools, new `plugins.ts`)

- `list_plugins`, `get_plugin`, `install_plugin`, `list_plugin_examples`, `enable_plugin`, `disable_plugin`

### 8e — Secrets (3 tools, new `secrets.ts`) — **needs live-API verification** on value rotation endpoint

- `list_secrets`, `create_secret`, `update_secret`

### 8f — Run observability (3 tools, new `runs.ts`)

- `list_heartbeat_runs`, `list_run_events`, `get_run_log`

### 8g — Feedback traces (3 tools, new `feedback.ts`) — **needs live-API verification** on trace-bundle auth scope

- `list_feedback_traces`, `list_issue_feedback_traces`, `get_feedback_trace_bundle`

### 8h — Company import/export (3 tools, new `company-import.ts`)

- `export_company`, `preview_company_import`, `apply_company_import`

## Stage 9 — Docs + coverage gate + version bump

**Red-first tests:** final registry test asserts count === 103; no `boardOnlyHint`; every tool has `title`.

**Impl tasks:**

1. `docs/guides/mcp-tool-conventions.md` — canonical reference for adding tools.
2. Update `CLAUDE.md` "Adding a New Tool" to point at conventions doc.
3. `docs/api-coverage.md` — endpoint × tool matrix.
4. Add `test:coverage` script using Node `--experimental-test-coverage --test-coverage-lines=90 --test-coverage-branches=80`.
5. ESLint rule (or grep hook) banning `inputSchema: {` literal in `src/tools/`.
6. Bump `package.json` version `1.0.0` → `2.0.0` + CHANGELOG entry summarizing all stages.

## Skipped endpoints (document in api-coverage.md)

- `GET /api/health` — infrastructure probe, not agent-useful.
- `POST /api/cli-auth/challenges` (+ poll) — browser-mediated PKCE; requires human interaction, not tool-shaped.
