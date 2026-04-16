# Stage 8 — Live-API Verified Contract Corrections

Verified against Paperclip API v0.3.1 (local Podman instance, `local_trusted` mode). These findings supersede any contradictions in `03-api-contracts.md`.

## 8b — Company + workspace management

### `DELETE /api/projects/{projectId}/workspaces/{workspaceId}`

**Response shape: the deleted workspace object** (full object — `id`, `companyId`, `projectId`, `name`, `sourceType`, `cwd`, `visibility`, `isPrimary`, timestamps, etc.). NOT `{ ok: true }`.
Tool: `paperclip_delete_workspace` must pass the response through as-is, not claim envelope.

### `POST /api/companies/{companyId}/archive`

**Dedicated endpoint EXISTS.** Returns the updated company with `status: "archived"`. Preferred over PATCH.
Tool: `paperclip_archive_company` should POST to this path. Description should mention `status → "archived"` outcome.

## 8e — Secrets

### `PATCH /api/secrets/{secretId}`

**Does NOT rotate the `value`.** Value sent in PATCH body is silently ignored. PATCH only updates metadata (`name`, `description`, possibly `externalRef`).
Tool: `paperclip_update_secret` schema must NOT include a `value` field. Description must make this explicit.

### `POST /api/secrets/{secretId}/rotate` (new, not in original contract)

Version-bumping value rotation (v1 → v2 → v3 confirmed). Request body: `{ value: string, externalRef?: string|null }`. Response: updated secret metadata with incremented `latestVersion`.
**Add a new tool:** `paperclip_rotate_secret` — board-only, destructive (increments version, invalidates prior value references), separate from `paperclip_update_secret`.

**Stage 8e tool count: 3 → 4** (was list/create/update; now list/create/update/rotate).

## 8g — Feedback traces

### All 3 endpoints are BOARD-ONLY (not "either")

- `GET /api/companies/{companyId}/feedback-traces` → 403 "Board access required" for agent keys.
- `GET /api/issues/{issueId}/feedback-traces` → 403 to agent keys (inferred from company endpoint behavior).
- `GET /api/feedback-traces/{traceId}/bundle` → 403 "Only board users can view feedback trace bundles" for agent keys.

Tools: `paperclip_list_feedback_traces`, `paperclip_list_issue_feedback_traces`, `paperclip_get_feedback_trace_bundle` must ALL have `⚠ Board-only:` description prefix and be added to `BOARD_ONLY_TOOLS` in `registry.test.ts`.

## Server startup reference (for future Stage 8 agents)

The local server runs via Podman compose. The `podman-compose.paperclip.yml` at `/var/home/bbrasil/Documents/git/rme-platform/podman-compose.paperclip.yml` was patched (once) for `network_mode: host` to work in `local_trusted` mode. If Stage 8 agents need the API running:

```bash
cd /var/home/bbrasil/Documents/git/rme-platform
podman-compose -f podman-compose.paperclip.yml up -d
# Wait for health:
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sf -m 2 http://127.0.0.1:3100/api/health && break; sleep 3; done
```

Container name: `paperclip-server`. Health: `GET http://127.0.0.1:3100/api/health`.

In `local_trusted` mode, unauthenticated requests have board scope. Agent keys are required to exercise the "board-only" 403 paths.

## Test credentials (local only)

- Test company: `53caad5d-05d6-469d-b6eb-8961a71b615e` (fresh DB on this Podman instance; different from `.mcp.json` company ID `00041315-a3cb-4cd0-99e4-c715ebf13326`).
- Test agent (for 403 verification): id `e96e82e9-3cce-4da8-b1d5-efe16abc43ed`, key `pcp_0096797f114063aadf36300601fbec593a6ba47e3f9e2acb`.

**DO NOT commit these in test fixtures.** They are local-only and this file lives in `docs/` only as an orchestration reference for the in-flight Stage 8 work.
