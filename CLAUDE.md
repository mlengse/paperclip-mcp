# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

paperclip-mcp is a Model Context Protocol (MCP) stdio server that exposes the Paperclip control plane API as callable tools for Claude Code agents. It translates MCP tool requests into Paperclip REST API calls over HTTP.

## Commands

| Task                  | Command                                            |
| --------------------- | -------------------------------------------------- |
| Build                 | `npm run build`                                    |
| Dev (live TS)         | `npm run dev`                                      |
| Start (compiled)      | `npm run start`                                    |
| Type-check only       | `npm run typecheck`                                |
| Lint                  | `npm run lint`                                     |
| Format                | `npm run format`                                   |
| Format check (manual) | `npm run format:check`                             |
| Run all tests         | `npm run test`                                     |
| Run single test       | `node --import tsx/esm --test src/path/to.test.ts` |
| Check doc links       | `npm run docs:check`                               |

> **Pre-commit automation:** `npm run lint` and `npm run format` run automatically on staged files at commit time via husky + lint-staged. You do not need to run `format:check` manually before committing.

## Architecture

**Entry flow:** `src/index.ts` creates an MCP `Server`, calls `registerAllTools(server)`, then connects a `StdioServerTransport` for JSON-RPC over stdio.

**Key modules:**

- `src/client.ts` — `PaperclipClient`: typed HTTP wrapper (`get`, `post`, `patch`, `put`, `delete`). Injects `Authorization` header and `X-Paperclip-Run-Id` on mutations.
- `src/auth.ts` — Reads env vars at startup (fail-fast on missing required vars): `PAPERCLIP_API_KEY`, `PAPERCLIP_API_URL`, `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`, and optional `PAPERCLIP_RUN_ID`.
- `src/errors.ts` — `PaperclipApiError` for non-2xx HTTP responses.
- `src/types.ts` — Shared domain types.
- `src/tools/index.ts` — Tool registry. Collects `ToolDefinition[]` arrays from each tool module into `ALL_TOOLS`, builds a dispatch map, and registers MCP `ListTools` / `CallTool` handlers.
- `src/tools/validation.ts` — `validate(zodSchema, args)` helper and shared Zod schemas (`NoInput`, `IssueIdSchema`, `StatusSchema`, `PrioritySchema`).

**Tool modules** (each exports a `ToolDefinition[]`):

| Module         | Tools                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity.ts`  | `paperclip_get_me`, `paperclip_get_inbox`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `issues.ts`    | 7 issue lifecycle tools (list, get, checkout, release, update, create, heartbeat)                                                                                                                                                                                                                                                                                                                                                                                          |
| `comments.ts`  | `paperclip_list_comments`, `paperclip_add_comment`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `documents.ts` | `paperclip_list_documents`, `paperclip_get_document`, `paperclip_upsert_document`                                                                                                                                                                                                                                                                                                                                                                                          |
| `agents.ts`    | `paperclip_list_agents`, `paperclip_get_agent`, `paperclip_update_agent`, `paperclip_update_agent_permissions`, `paperclip_pause_agent`, `paperclip_resume_agent`, `paperclip_invoke_heartbeat`, `paperclip_terminate_agent`, `paperclip_create_agent_key`, `paperclip_list_agent_config_revisions`, `paperclip_rollback_agent_config`, `paperclip_set_agent_instructions_path`, `paperclip_get_org_chart`, `paperclip_sync_agent_skills`, `paperclip_list_company_skills` |
| `dashboard.ts` | `paperclip_get_dashboard`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `goals.ts`     | `paperclip_list_goals`, `paperclip_get_goal`, `paperclip_create_goal`, `paperclip_update_goal`                                                                                                                                                                                                                                                                                                                                                                             |
| `projects.ts`  | `paperclip_list_projects`, `paperclip_get_project`, `paperclip_create_project`, `paperclip_update_project`, `paperclip_list_workspaces`, `paperclip_create_workspace`, `paperclip_update_workspace`                                                                                                                                                                                                                                                                        |

## Adding a New Tool

1. Create or edit a file in `src/tools/` — define a Zod input schema and export a `ToolDefinition[]` array.
2. Each tool's handler: validate args with `validate(schema, args)`, call `client.get/post/patch/...`, return `{ content: [{ type: "text", text: JSON.stringify(data) }] }`.
3. If it's a new module, import and spread its array into `ALL_TOOLS` in `src/tools/index.ts`.

## Conventions

- **Formatting:** Prettier — double quotes, semicolons, 2-space indent, trailing commas in ES5 positions, 100-char print width.
- **Linting:** ESLint v9 flat config with `@eslint/js` + `typescript-eslint` recommended presets.
- **Pre-commit hooks:** husky + lint-staged auto-format and lint staged files on every commit. No manual format step needed before committing.
- **Testing:** Node.js built-in `node:test` (`describe`/`it`) with `assert/strict`. Tests run via `tsx` ESM loader. No external test framework.
- **TypeScript:** Strict mode, ES2022 target, Node16 module resolution. Test files excluded from compilation.
- **Tool naming:** `paperclip_<verb>_<noun>` (snake_case).
- **Branch strategy:** feature branches → `main` (squash-merge via PR). `main` is the default and release branch. CI quality gate runs on PRs to `main` and direct pushes to `main`.

## CI/CD

| Layer        | Tooling             | Triggers                              | What it does                                     |
| ------------ | ------------------- | ------------------------------------- | ------------------------------------------------ |
| Pre-commit   | husky + lint-staged | Every `git commit`                    | ESLint fix + Prettier write on staged files      |
| Quality gate | `quality-gate.yml`  | PR to `main`; push to `main`          | typecheck, lint, format:check, test, build, docs |
| Release      | `release.yml`       | Push to `main` (conventional commits) | semantic-release → npm publish + GitHub release  |

See [`docs/ci-strategy.md`](docs/ci-strategy.md) for rationale, trigger matrix, and how to extend CI steps.

## Paperclip Agent Workflow (moved)

The Paperclip-orchestrated agent protocol and BMAD integration details have moved to [`AGENTS.md`](AGENTS.md) at the repo root. This keeps `CLAUDE.md` focused on general Claude Code guidance for working in this repo.

## MCP Servers

Two MCP servers are available via `.mcp.json`. Use them when they help — don't force them into simple tasks.

| Server                | When to use                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `sequential-thinking` | Multi-step planning, architecture decisions, complex debugging                  |
| `memory`              | Persist project decisions, architecture context, or conventions across sessions |
