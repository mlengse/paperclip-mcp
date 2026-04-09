# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

_Changes on `develop` not yet released to `main`._

---

## [0.1.0] — 2026-04-09

Initial public release of the Paperclip MCP server.

### Added

**Core infrastructure**
- MCP stdio server using `@modelcontextprotocol/sdk` with `ListTools` / `CallTool` handlers
- `PaperclipClient` typed HTTP wrapper with automatic `Authorization` and `X-Paperclip-Run-Id` header injection
- Fail-fast env var validation at startup (`PAPERCLIP_API_KEY`, `PAPERCLIP_API_URL`, `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`)
- Shared Zod validation helpers in `src/tools/validation.ts` (`validate`, `handleApiError`, common schemas)
- Standardised error handling: `PaperclipApiError` → `isError: true` result across all tool handlers
- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) on all tools

**Tool groups (54 tools across 12 groups)**
- **Identity** (2): `paperclip_get_me`, `paperclip_get_inbox`
- **Issues** (7): `paperclip_list_issues`, `paperclip_get_issue`, `paperclip_get_heartbeat_context`, `paperclip_checkout_issue`, `paperclip_release_issue`, `paperclip_update_issue`, `paperclip_create_issue`
- **Comments** (2): `paperclip_list_comments`, `paperclip_add_comment`
- **Documents** (3): `paperclip_list_documents`, `paperclip_get_document`, `paperclip_upsert_document`
- **Agents** (1): `paperclip_list_agents`
- **Dashboard** (1): `paperclip_get_dashboard`
- **Approvals** (10): `paperclip_list_approvals`, `paperclip_get_approval`, `paperclip_create_approval`, `paperclip_approve`, `paperclip_reject`, `paperclip_request_revision`, `paperclip_resubmit_approval`, `paperclip_list_approval_comments`, `paperclip_add_approval_comment`, `paperclip_create_agent_hire`
- **Goals** (4): `paperclip_list_goals`, `paperclip_get_goal`, `paperclip_create_goal`, `paperclip_update_goal`
- **Projects** (7): `paperclip_list_projects`, `paperclip_get_project`, `paperclip_create_project`, `paperclip_update_project`, `paperclip_list_workspaces`, `paperclip_create_workspace`, `paperclip_update_workspace`
- **Activity** (4): `paperclip_get_activity`, `paperclip_get_cost_summary`, `paperclip_get_costs_by_agent`, `paperclip_get_costs_by_project`
- **Routines** (9): `paperclip_list_routines`, `paperclip_get_routine`, `paperclip_create_routine`, `paperclip_update_routine`, `paperclip_add_routine_trigger`, `paperclip_update_routine_trigger`, `paperclip_delete_routine_trigger`, `paperclip_run_routine`, `paperclip_list_routine_runs`
- **Attachments** (4): `paperclip_list_attachments`, `paperclip_upload_attachment`, `paperclip_download_attachment`, `paperclip_delete_attachment`

**Documentation**
- `docs/guides/getting-started.md` — installation and first tool call walkthrough
- `docs/guides/configuration.md` — environment variable reference
- `docs/reference/tools.md` — full per-tool reference (all 54 tools)
- `docs/architecture/overview.md` — system design, module structure, error handling strategy
- `npm run docs:check` link-validation script

**Testing**
- Unit tests for all tool handlers using Node.js built-in `node:test`
- CI workflow on push/PR to `main` and `develop`

[Unreleased]: https://github.com/your-org/paperclip-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/paperclip-mcp/releases/tag/v0.1.0
