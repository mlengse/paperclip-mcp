# Agent Scope Map — paperclip-mcp

Last audited: 2026-04-10

## Overview

This document maps every scope claim made by the eight Paperclip agents operating on the `paperclip-mcp` project. Scope claims are extracted from each agent's capabilities string as-is; they drive routing decisions (which agent handles a given file or domain) and guard rails (which agent must not touch a given file). Overlaps create ambiguous routing and risk concurrent conflicting edits. Gaps leave files unowned, meaning no agent will proactively maintain them and no agent knows whether it is allowed to touch them. Both conditions cause stalls or rework. The patches at the end of this document narrow overlaps to single owners and assign gaps to the most appropriate existing agent.

---

## Scope Claims by Agent

### CEO

- **Owns:** Paperclip dashboard (read-only consumer), budget visibility via `paperclip_get_me`, delegation routing decisions.
- **Explicit do-not-touch:** No code writing. No architecture decisions (escalate to CTO). No file system scope claimed.

### PM

- **Owns:** Paperclip issue backlog — titles, descriptions, acceptance criteria, goalId/parentId links. API coverage audit against `docs.paperclip.ing`. Issue specification for new MCP tools (tool name, HTTP method, endpoint, params, response shape, error cases).
- **Explicit do-not-touch:** No technical decisions (escalate API design to CTO). No source files. No docs files.

### CTO

- **Owns:** Architecture decisions, code review (git diff inspection), review checklist enforcement (architecture, security, error handling, tool contract, test coverage, TypeScript strictness, naming conventions, scope). Creates sub-issues for Engineer on FAIL. **After this audit:** also owns `tsconfig.json`, `eslint.config.js`, `.mcp.json`, and `CLAUDE.md` as architectural configuration.
- **Explicit do-not-touch:** Never writes implementation (`src/` is read-only for CTO). Delegates implementation → Engineer, testing → QA, docs → TechWriter.

### TechWriter

- **Owns:** `docs/**/*.md` (all markdown under docs/) **excluding `docs/ci-strategy.md`**, `description:` string literals in `ToolDefinition` objects in `src/tools/*.ts`. **After this audit:** also owns `README.md` and `CONTRIBUTING.md` at the project root.
- **Explicit do-not-touch:** Does not modify `src/` beyond tool description strings. No CI/CD files. Does not touch `docs/ci-strategy.md` or `docs/security/` or `docs/data/` or `docs/runbooks/` (all reserved for specialist agents).

### Scrum Master

- **Owns:** Kanban board state — issue transitions (backlog → todo), @-mention assignments, sprint health, epic closure. Scheduled heartbeat (30 min).
- **Explicit do-not-touch:** Does not implement, review, or write docs. Purely orchestration — no file system scope.

### QA

- **Owns:** `src/*.test.ts`, `src/tools/*.test.ts` (all test files under `src/`). **After this audit:** `.github/workflows/` ownership transferred to DevOps.
- **Explicit do-not-touch:** Never modifies test assertions to match new behavior without explicit instruction. Does not touch `src/tools/*.ts` implementation files. Does not touch `.github/workflows/`.

### Engineer

- **Owns:** `src/tools/` (all tool handler files), `src/*.ts` (all non-test TypeScript source files — `src/index.ts`, `src/client.ts`, `src/auth.ts`, `src/errors.ts`, `src/types.ts`, `src/tools/validation.ts`, `src/tools/index.ts`). **After this audit:** scope explicitly excludes `*.test.ts` files and `description:` string literals in `ToolDefinition` objects.
- **Explicit do-not-touch:** Test files (QA), description strings in tool definitions (TechWriter), CI, docs, config files.

### DevOps

- **Owns:** `.github/workflows/*.yml`, `.releaserc.json`, `.husky/`, `package.json` scripts block, `docs/ci-strategy.md`. **After this audit:** expanded to full `package.json` (except `version` field), `.prettierrc`, `.prettierignore`, `.gitignore`, `.npmrc`, `.env.example`, `.markdown-link-check.json`, `CHANGELOG.md` (machine-managed), `SECURITY.md` (content approved by CTO).
- **Explicit do-not-touch:** Does not modify `src/`, `src/*.test.ts`, or `docs/` outside `docs/ci-strategy.md`. Does not touch MCP tool implementation (Engineer), src tests (QA), other docs (TechWriter), agent creation/configuration (CTO). Does not hand-edit npm secrets (escalate via CEO).

---

## Cross-cutting Concerns (owned by no agent — before this audit)

| File / Domain                                                       | Why it matters                                                                                                         | Assignment (after audit)                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `package.json` (non-scripts block)                                  | `dependencies`, `devDependencies`, `engines`, `publishConfig`, `lint-staged` config — changes affect build and publish | **DevOps** (except `version` field managed by semantic-release) |
| `tsconfig.json`                                                     | Compiler options govern strict mode, target, module resolution — architectural decisions                               | **CTO**                                                         |
| `eslint.config.js`                                                  | Linting ruleset affects what Engineer code must look like                                                              | **CTO**                                                         |
| `.prettierrc` / `.prettierignore`                                   | Formatting config affects Engineer commits and DevOps format:check gate                                                | **DevOps**                                                      |
| `CLAUDE.md`                                                         | Agent instructions file consumed by Claude Code; affects all agent behaviors                                           | **CTO**                                                         |
| `README.md`                                                         | Public-facing project readme                                                                                           | **TechWriter**                                                  |
| `CONTRIBUTING.md`                                                   | Contributor guide                                                                                                      | **TechWriter**                                                  |
| `SECURITY.md`                                                       | Security disclosure policy                                                                                             | **DevOps** (operational) with CTO content approval              |
| `CHANGELOG.md`                                                      | Auto-generated by semantic-release; machine-managed — no agent edits directly                                          | **DevOps** (documentation of machine-managed status)            |
| `.env.example`                                                      | Template for runtime env vars                                                                                          | **DevOps**                                                      |
| `.mcp.json`                                                         | MCP server configuration for Claude Code harness                                                                       | **CTO**                                                         |
| `.gitignore`                                                        | Controls what gets committed                                                                                           | **DevOps**                                                      |
| `.npmrc`                                                            | npm registry config affecting publish behavior                                                                         | **DevOps**                                                      |
| `.markdown-link-check.json`                                         | Config for `docs:check` script                                                                                         | **DevOps**                                                      |
| `dist/`                                                             | Compiled output — generated by `npm run build`                                                                         | None — build artifact                                           |
| `_bmad/` / `.claude/` / `.remember/` / `.paperclip/` / `worktrees/` | Framework/runtime directories                                                                                          | None — framework-managed                                        |
| `package-lock.json`                                                 | Lockfile managed by npm                                                                                                | **DevOps** (review only, never hand-edit)                       |

---

## Overlap Table

| File / Domain                             | Agent A                               | Agent B                                        | Severity                                                             | Proposed Resolution                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/*.yml`                 | **QA** (claimed `.github/workflows/`) | **DevOps** (claimed `.github/workflows/*.yml`) | **High** — both claim full ownership; ambiguous on who makes changes | **Transfer**: QA loses `.github/workflows/`; DevOps is sole owner. QA's gate is that CI must pass before marking done — QA enforces this by running `npm run test` locally, not by editing workflows. |
| `src/*.test.ts`                           | **QA** (explicit)                     | **Engineer** (`src/*.ts` wildcard overlaps)    | **Medium**                                                           | **Transfer**: Engineer's scope explicitly excludes `*.test.ts` files.                                                                                                                                 |
| `docs/ci-strategy.md`                     | **TechWriter** (`docs/**/*.md` glob)  | **DevOps** (explicit)                          | **Medium**                                                           | **Transfer**: TechWriter's scope explicitly excludes `docs/ci-strategy.md`.                                                                                                                           |
| `description:` fields in `src/tools/*.ts` | **TechWriter** (explicit)             | **Engineer** (`src/tools/` wildcard)           | **Medium**                                                           | **Split (narrowed)**: TechWriter may only edit the `description:` string literal in `ToolDefinition` objects; Engineer owns all other content.                                                        |
| `package.json` scripts block              | **DevOps** (explicit)                 | _(implicit Engineer references)_               | **Low**                                                              | **Clarify**: DevOps owns scripts block exclusively. Engineer files issues for new scripts.                                                                                                            |

---

## Proposed Patches (apply via `PATCH /api/agents/{id}`)

### QA — remove `.github/workflows/` ownership

**Before (in capabilities string):**

> "Owns test coverage and CI quality gates for paperclip-mcp. Scope: src/\*.test.ts and .github/workflows/."

**After:**

> "Owns test coverage for paperclip-mcp. Scope: src/_.test.ts and src/tools/_.test.ts only. CI workflows are owned by DevOps — do not modify .github/workflows/."

---

### Engineer — exclude test files and description strings

**Before:**

> "Scope: src/tools/ and src/\*.ts only."

**After:**

> "Scope: src/tools/ and src/_.ts only, excluding _.test.ts files (owned by QA) and excluding description: string literals in ToolDefinition objects in src/tools/\*.ts (owned by TechWriter for wording updates)."

---

### TechWriter — exclude `docs/ci-strategy.md` and claim root markdown files

**Before:**

> "Owns docs/ directory and tool description strings for paperclip-mcp. Scope: docs/\*_/_.md and description fields in src/tools/\*.ts."

**After:**

> "Owns user-facing documentation for paperclip-mcp. Scope: docs/\*_/_.md excluding docs/ci-strategy.md (DevOps), docs/security/ (Security Engineer), docs/data/ (Data Engineer), docs/runbooks/ (SRE), plus README.md and CONTRIBUTING.md at the project root, and the description: string literal within ToolDefinition objects in src/tools/\*.ts — no other content in src/ may be modified."

---

### DevOps — expand `package.json` scope and claim unowned config files

**Before:**

> "Scope: .github/workflows/\*.yml, .releaserc.json, .husky/, package.json scripts block, docs/ci-strategy.md."

**After:**

> "Scope: .github/workflows/\*.yml, .releaserc.json, .husky/, package.json (full file; version field is machine-managed by semantic-release — do not hand-edit it), docs/ci-strategy.md, .prettierrc, .prettierignore, .gitignore, .npmrc, .env.example, .markdown-link-check.json, CHANGELOG.md (machine-managed — do not hand-edit), SECURITY.md (content approved by CTO)."

---

### CTO — claim ownership of architectural config files

Append to CTO's capabilities string:

> "Owns tsconfig.json, eslint.config.js, .mcp.json, and CLAUDE.md as architectural configuration. Changes to these files require a CTO-approved issue; Engineer or DevOps may propose changes but may not merge without CTO review pass."

---

## Routing Decision Matrix

| Issue about...                                                          | Route to                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| New MCP tool specification (name, endpoint, params, errors)             | PM                                                      |
| New MCP tool implementation (`src/tools/*.ts`, `src/*.ts`)              | Engineer                                                |
| Tool description string wording only (`description:` field)             | TechWriter                                              |
| Test coverage for a tool (`src/**/*.test.ts`)                           | QA                                                      |
| `.github/workflows/*.yml` — any change                                  | DevOps                                                  |
| `.releaserc.json` — semantic-release config                             | DevOps                                                  |
| `.husky/` — git hook changes                                            | DevOps                                                  |
| `package.json` scripts block or any other section                       | DevOps                                                  |
| `tsconfig.json` — compiler options                                      | CTO (approve) + Engineer (propose)                      |
| `eslint.config.js` — lint rules                                         | CTO                                                     |
| `.prettierrc` / `.prettierignore`                                       | DevOps                                                  |
| `.gitignore` / `.npmrc` / `.env.example`                                | DevOps                                                  |
| `.mcp.json` — MCP server config                                         | CTO                                                     |
| `CLAUDE.md` — agent instructions                                        | CTO                                                     |
| `docs/**/*.md` (except specialist subfolders and `docs/ci-strategy.md`) | TechWriter                                              |
| `docs/ci-strategy.md`                                                   | DevOps                                                  |
| `docs/security/` / `SECURITY.md`                                        | Security Engineer (when hired) / DevOps + CTO currently |
| `docs/runbooks/` / `docs/slo.md`                                        | SRE (when hired)                                        |
| `docs/data/`                                                            | Data Engineer (when hired)                              |
| `docs/releases/` / `RELEASES.md`                                        | Release Manager (when hired)                            |
| `README.md` / `CONTRIBUTING.md`                                         | TechWriter                                              |
| `CHANGELOG.md`                                                          | Machine-managed (semantic-release); no agent edits      |
| Architecture decisions (module structure, transport, auth)              | CTO                                                     |
| Kanban board / sprint orchestration                                     | Scrum Master                                            |
| Backlog issue creation / product requirements                           | PM                                                      |
| Budget / CEO-level escalation                                           | CEO                                                     |
| Agent hiring approval                                                   | CEO → approval flow                                     |
| CI auth failures / secret rotation                                      | DevOps → escalate to CEO for secret rotation            |
| Code review of any PR                                                   | CTO                                                     |
| `_bmad/` / `.claude/` / `.remember/` / `.paperclip/` / `worktrees/`     | No agent — framework-managed, read-only                 |
