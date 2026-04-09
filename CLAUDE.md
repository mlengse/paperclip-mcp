# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

paperclip-mcp is a Model Context Protocol (MCP) stdio server that exposes the Paperclip control plane API as callable tools for Claude Code agents. It translates MCP tool requests into Paperclip REST API calls over HTTP.

## Commands

| Task             | Command                                            |
| ---------------- | -------------------------------------------------- |
| Build            | `npm run build`                                    |
| Dev (live TS)    | `npm run dev`                                      |
| Start (compiled) | `npm run start`                                    |
| Type-check only  | `npm run typecheck`                                |
| Lint             | `npm run lint`                                     |
| Format           | `npm run format`                                   |
| Format check     | `npm run format:check`                             |
| Run all tests    | `npm run test`                                     |
| Run single test  | `node --import tsx/esm --test src/path/to.test.ts` |
| Check doc links  | `npm run docs:check`                               |

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

| Module         | Tools                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `identity.ts`  | `paperclip_get_me`, `paperclip_get_inbox`                                                                                                                                                                                                                                                                                                                                                                                            |
| `issues.ts`    | 7 issue lifecycle tools (list, get, checkout, release, update, create, heartbeat)                                                                                                                                                                                                                                                                                                                                                    |
| `comments.ts`  | `paperclip_list_comments`, `paperclip_add_comment`                                                                                                                                                                                                                                                                                                                                                                                   |
| `documents.ts` | `paperclip_list_documents`, `paperclip_get_document`, `paperclip_upsert_document`                                                                                                                                                                                                                                                                                                                                                    |
| `agents.ts`    | `paperclip_list_agents`, `paperclip_get_agent`, `paperclip_update_agent`, `paperclip_pause_agent`, `paperclip_resume_agent`, `paperclip_invoke_heartbeat`, `paperclip_terminate_agent`, `paperclip_create_agent_key`, `paperclip_list_agent_config_revisions`, `paperclip_rollback_agent_config`, `paperclip_set_agent_instructions_path`, `paperclip_get_org_chart`, `paperclip_sync_agent_skills`, `paperclip_list_company_skills` |
| `dashboard.ts` | `paperclip_get_dashboard`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `goals.ts`     | `paperclip_list_goals`, `paperclip_get_goal`, `paperclip_create_goal`, `paperclip_update_goal`                                                                                                                                                                                                                                                                                                                                       |
| `projects.ts`  | `paperclip_list_projects`, `paperclip_get_project`, `paperclip_create_project`, `paperclip_update_project`, `paperclip_list_workspaces`, `paperclip_create_workspace`, `paperclip_update_workspace`                                                                                                                                                                                                                                  |

## Adding a New Tool

1. Create or edit a file in `src/tools/` — define a Zod input schema and export a `ToolDefinition[]` array.
2. Each tool's handler: validate args with `validate(schema, args)`, call `client.get/post/patch/...`, return `{ content: [{ type: "text", text: JSON.stringify(data) }] }`.
3. If it's a new module, import and spread its array into `ALL_TOOLS` in `src/tools/index.ts`.

## Conventions

- **Formatting:** Prettier — double quotes, semicolons, 2-space indent, trailing commas in ES5 positions, 100-char print width.
- **Linting:** ESLint v9 flat config with `@eslint/js` + `typescript-eslint` recommended presets.
- **Testing:** Node.js built-in `node:test` (`describe`/`it`) with `assert/strict`. Tests run via `tsx` ESM loader. No external test framework.
- **TypeScript:** Strict mode, ES2022 target, Node16 module resolution. Test files excluded from compilation.
- **Tool naming:** `paperclip_<verb>_<noun>` (snake_case).
- **Branch strategy:** feature branches → `develop` → `main`. CI runs on push/PR to `main` and `develop`. Default working branch is `develop`. `main` is for releases only.

## Paperclip Agent Workflow

This section is for Paperclip-orchestrated agents. Human developers can skip it.

**Do not invoke any `/bmad-*` skills.** These are for human operators only. Your workflow is below.

### Orchestration Model

- **Scrum Master is the sole coordinator** — only agent with a scheduled heartbeat (every 30 min).
- **All other agents wake only when @-mentioned** in a Paperclip issue comment.
- **Max 3 agents running at any time** (Scrum Master + 2 IC agents).
- **One issue per agent** — finish it completely before picking up another.

### @-Mention Flow

```
Scrum Master (heartbeat) → picks backlog → assigns → @Engineer "PAP-XX ready"
Engineer → implements → commits → merges to develop → sets in_review → @QA "ready for review"
QA (sole reviewer) → APPROVE (done) / REQUEST_CHANGES (todo + @Engineer) / ESCALATE (blocked + @CTO)
Scrum Master (next heartbeat) → catches orphaned in_review → @QA · closes done epics · cleans board
```

### Agent Protocol (all agents)

1. `paperclip_get_me` — confirm identity.
2. Check `PAPERCLIP_TASK_ID` / `PAPERCLIP_WAKE_REASON` — find why you woke.
3. `paperclip_get_inbox` — find your assigned issue.
4. `paperclip_checkout_issue` — claim it. **Never retry a 409.**
5. Do the work on a feature branch (`{agent-urlkey}/{PAP-XX}`). Follow conventions above.
6. Commit all changes to the branch. Push the branch. **Do NOT merge to develop yet.**
7. Set `in_review` + post `@QA — ready for review on PAP-XX`.
8. Exit and wait for QA.

**After QA approves (APPROVE):** 9. Merge branch to `develop`, clean worktree. No leftovers. 10. Set issue to `done`. Post closing comment. 11. Exit cleanly.

**Merge to develop happens ONLY after all "done" requirements are met (code + review + tests pass).**

### Comment Format

Use structured comments with @-mentions:

- `@QA — ready for review on PAP-XX. Changes: {summary}`
- `@Engineer — changes needed: {bullet list}`
- `@CTO — blocked on PAP-XX: {reason}`

### Git Workflow

- Default branch: `develop`. All agent work targets `develop`.
- Branch naming: `{agent-urlkey}/{PAP-XX}` (e.g. `engineer/PAP-40`).
- **Commit, merge to develop, and clean worktree before closing any issue.** No leftovers.
- `main` is updated only for releases via PR from `develop`.

### Creating Issues

Any agent can create a `backlog` issue when they discover a gap, blocker, or improvement:

- Use `sequential-thinking` MCP server to structure the issue well.
- Include: clear title, description with context, acceptance criteria, goalId, parentId.
- Post `@Scrum Master — created PAP-XX for {reason}`.

### Role-Specific Guidance

**Scrum Master (coordinator)** — Only scheduled heartbeat. Feeds pipeline: backlog → todo → assign → @-mention. Closes done epics. Cleans the board. Max 2 IC agents active at once.

**CTO** — Technical authority. Wakes on @-mention. Architecture decisions, unblocking, escalation handling. Never coordinates kanban, never reviews code.

**Engineer** — Implements tools. Wakes on @-mention. One issue at a time. Marks `in_review` → @QA.

**QA (sole reviewer)** — Reviews code + writes tests. Wakes on @-mention. APPROVE/REQUEST_CHANGES/ESCALATE.

**TechWriter** — Updates docs. Wakes on @-mention. Marks done → @Scrum Master.

**PM (Feature Guardian)** — Validates features against Paperclip API specs. Creates backlog issues for requirement adjustments. Ensures product alignment.

**CEO** — Escalation point. Handles blocked issues. Guided by goals. Opens adjustment issues.

**PM (Feature Guardian)** — Validates features against Paperclip API specs. Creates backlog issues for requirement adjustments. Ensures product alignment.

**CEO** — Escalation point. Handles blocked issues. Guided by goals. Opens adjustment issues.

## BMAD + Paperclip Integration

> **Paperclip agents: ignore this section entirely — follow the Paperclip Agent Workflow above.**

BMAD owns planning and decisions. Paperclip owns autonomous execution. The bridge is the `/bmad-paperclip-dispatch` skill.

### Flow

1. Human uses BMAD skills (`/bmad-brainstorming`, `/bmad-create-prd`, `/bmad-create-architecture`) to plan.
2. Human runs `/bmad-paperclip-dispatch` to create Paperclip issues from decisions.
3. Dispatch assigns issues to CTO and optionally triggers a heartbeat.
4. Paperclip agents execute autonomously until goals are met.
5. Human checks progress via Paperclip dashboard or `/bmad-sprint-status`.
6. Human runs `/bmad-retrospective` to review and create improvement issues.

### BMAD Override Rules

When BMAD workflows would normally write local epic/story/sprint files, follow these overrides:

- **No local story files.** Paperclip issues ARE the stories. Never write to `_bmad-output/implementation-artifacts/` for stories or sprint tracking.
- **`/bmad-create-epics-and-stories`** — After designing the epic/story breakdown, use `/bmad-paperclip-dispatch` to create Paperclip issues instead of writing local files.
- **`/bmad-sprint-planning`** — Read Paperclip issues via `curl -s "http://127.0.0.1:3100/api/companies/00041315-a3cb-4cd0-99e4-c715ebf13326/issues"` instead of `sprint-status.yaml`.
- **`/bmad-dev-story`** — Do NOT use this skill. Paperclip agents handle implementation autonomously.
- **`/bmad-sprint-status`** — Read Paperclip dashboard via `curl -s "http://127.0.0.1:3100/api/companies/00041315-a3cb-4cd0-99e4-c715ebf13326/dashboard"`.
- **`/bmad-retrospective`** — Read completed issues and comments from Paperclip for context. Action items become new Paperclip issues via dispatch.
- **Any identified code changes** — Always create a Paperclip issue. Never modify `src/` directly from BMAD.

### BMAD Ownership of Paperclip Quality

BMAD agents Quinn (QA) and Amelia (Developer) have fundamental ownership to review and improve Paperclip-correlated agents and skills. They apply BMAD methodology expertise to the Paperclip autonomous system:

- **`/bmad-agent-qa` (Quinn)** — Audits Paperclip agent test coverage, CI quality gates, heartbeat reliability, and error handling patterns. Reviews agent capabilities descriptions for clarity and completeness.
- **`/bmad-agent-dev` (Amelia)** — Reviews Paperclip agent code patterns, skill design, adapter configs, and tool handler implementations. Ensures agent configurations follow best practices.
- **`/bmad-code-review`** — Use to review Paperclip agent config changes (capabilities, skills, heartbeat configs) before applying them via the API.
- **`/bmad-retrospective`** — Must include a "Paperclip Agent Health" assessment: which agents struggled, which skills were missing, what configs need tuning. Improvement actions become Paperclip issues.

### Paperclip API (Direct Access)

While the MCP server is under development, use curl for Paperclip operations:

| Operation     | Command                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| List issues   | `curl -s "http://127.0.0.1:3100/api/companies/00041315-a3cb-4cd0-99e4-c715ebf13326/issues"`                                                                                                                                                                                                                                                                  |
| Create issue  | `curl -s -X POST -H "Content-Type: application/json" -d '{"title":"...","status":"todo","priority":"medium","projectId":"b368fc4b-b137-42c6-8038-a699cb32f609","goalId":"467f800f-b971-4494-b25e-bc1d573ad70c","assigneeAgentId":"959ce36e-5398-4980-b5b3-df7dd999bcb3"}' "http://127.0.0.1:3100/api/companies/00041315-a3cb-4cd0-99e4-c715ebf13326/issues"` |
| Get dashboard | `curl -s "http://127.0.0.1:3100/api/companies/00041315-a3cb-4cd0-99e4-c715ebf13326/dashboard"`                                                                                                                                                                                                                                                               |
| Trigger CTO   | `curl -s -X POST "http://127.0.0.1:3100/api/agents/959ce36e-5398-4980-b5b3-df7dd999bcb3/heartbeat/invoke"`                                                                                                                                                                                                                                                   |
| List agents   | `curl -s "http://127.0.0.1:3100/api/companies/00041315-a3cb-4cd0-99e4-c715ebf13326/agents"`                                                                                                                                                                                                                                                                  |

## MCP Servers

Two MCP servers are available via `.mcp.json`. Use them when they help — don't force them into simple tasks.

| Server                | When to use                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `sequential-thinking` | Multi-step planning, architecture decisions, complex debugging                  |
| `memory`              | Persist project decisions, architecture context, or conventions across sessions |
