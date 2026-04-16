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

See **[`docs/guides/mcp-tool-conventions.md`](docs/guides/mcp-tool-conventions.md)** for the full reference. Quick checklist:

1. Define a `.strict()` Zod schema with `.describe()` on every field. Use `toJsonSchema()` for `inputSchema` — never write JSON Schema by hand.
2. Use `composeDescription()` for the description (Args / Returns / Examples / Error Handling sections required).
3. Set all applicable annotations (`title` always required, ≤ 60 chars).
4. Wrap list responses in `paginate()`. Call `applyCharLimit()` on every return value.
5. Delegate all `catch` blocks to `handleApiError(err, { tool, resource })`.
6. Register in `src/tools/index.ts` → `ALL_TOOLS` and update registry test allow-lists.

## Conventions

- **Formatting:** Prettier — double quotes, semicolons, 2-space indent, trailing commas in ES5 positions, 100-char print width.
- **Linting:** ESLint v9 flat config with `@eslint/js` + `typescript-eslint` recommended presets.
- **Pre-commit hooks:** husky + lint-staged auto-format and lint staged files on every commit. No manual format step needed before committing.
- **Testing:** Node.js built-in `node:test` (`describe`/`it`) with `assert/strict`. Tests run via `tsx` ESM loader. No external test framework.
- **TypeScript:** Strict mode, ES2022 target, Node16 module resolution. Test files excluded from compilation.
- **Tool naming:** `paperclip_<verb>_<noun>` (snake_case).
- **Branch strategy:** feature branches → `develop` → `main`. CI quality gate runs on PRs and pushes to `main` only — not on `develop` pushes. Default working branch is `develop`. `main` is for releases only.

## CI/CD

| Layer        | Tooling             | Triggers                                  | What it does                                     |
| ------------ | ------------------- | ----------------------------------------- | ------------------------------------------------ |
| Pre-commit   | husky + lint-staged | Every `git commit`                        | ESLint fix + Prettier write on staged files      |
| Quality gate | `quality-gate.yml`  | PR to `main` or `develop`; push to `main` | typecheck, lint, format:check, test, build, docs |
| Release      | `release.yml`       | Push to `main` (conventional commits)     | semantic-release → npm publish + GitHub release  |

See [`docs/ci-strategy.md`](docs/ci-strategy.md) for rationale, trigger matrix, and how to extend CI steps.

## Paperclip Agent Workflow

This section is for Paperclip-orchestrated agents. Human developers can skip it.

**Do not invoke any `/bmad-*` skills.** These are for human operators only. Your workflow is below.

### Orchestration Model

- **Scrum Master is the SOLE agent with a scheduled heartbeat** (every 5 min). All 7 other agents (CEO, CTO, PM, Engineer, QA, DevOps, TechWriter) have `heartbeat.enabled: false` and wake ONLY on @-mention.
- **Max 3 agents running at any time** (Scrum Master + 2 IC agents).
- **One issue per agent** — finish it completely before picking up another.
- **QA is the SOLE merge owner.** IC agents push feature branches and set `in_review`; QA's APPROVE decision performs the merge, worktree cleanup, and `done` transition. IC agents never call `git merge` or `git push origin develop`.
- **CEO is the SOLE agent hirer.** All new specialist agents go through CEO using the `paperclip-hire-agent` skill, subject to board approval. CTO, Scrum Master, PM, and everyone else must NOT invoke the skill or draft hire proposals unilaterally.

### @-Mention Flow

```
Scrum Master (heartbeat) → picks backlog → assigns → @Engineer "PAP-XX ready"
Engineer → implements → commits → push branch → set in_review → @QA "ready for review" → EXIT
QA (sole reviewer + merger) → APPROVE (merge to develop + delete branch + done) / REQUEST_CHANGES (todo + @role) / ESCALATE (blocked + @CTO)
Scrum Master (next heartbeat) → catches orphaned in_review → @QA · clears stale locks · closes done epics · cleans board
```

### Agent Protocol (IC agents: Engineer / DevOps / TechWriter)

1. `paperclip_get_me` — confirm identity.
2. Check `PAPERCLIP_TASK_ID` / `PAPERCLIP_WAKE_REASON` — find why you woke. You were woken by an explicit @-mention (no heartbeat fires for you); identify the trigger.
3. **Label Bootstrap.** Call `paperclip_list_labels` once and cache the `name → uuid` map for the run. If any required taxonomy labels are missing (`source:*`, `status:refined|unrefined`, `type:*`, `agent:*`), call `paperclip_create_label` to seed them before proceeding. Full taxonomy and colors: [`docs/guides/issue-creation-standard.md`](docs/guides/issue-creation-standard.md#label-taxonomy).
4. `paperclip_get_inbox` — find your assigned issue.
5. `paperclip_checkout_issue` — claim it, **passing `expectedStatuses` for your role** so the server atomically validates the kanban column before flipping status. Engineer / DevOps / TechWriter pass `["todo"]`; QA passes `["in_review"]` for code review or `["todo"]` for test-writing tasks. **Never retry a 409 and never retry a status-mismatch rejection.** If the checkout fails for either reason, post `Wake mismatch: PAP-XX is in status <X>, expected [<expected>]. Not claiming. @Scrum Master — please verify assignment.` on the issue, then exit cleanly. Do not mutate any other state.

   > **Checkout and `executionRunId`:** Always call `paperclip_checkout_issue` normally. If the issue has a stale `executionRunId` (`checkoutRunId=null`), the MCP layer auto-releases and retries transparently — no special agent logic needed. If the 409 persists with a non-null `checkoutRunId`, the issue is genuinely locked by another agent; post a wake-mismatch comment and exit.

6. **Board comment precedence check.** Immediately after a successful checkout, fetch the last 5 comments on the issue. If any were authored by `local-board` in the last 24h with blocking language (`blocked`, `cancelled`, `parked`, `hold`, `do not promote`, `needs board decision`, `board action`), release the checkout and exit with a deferral comment. The board's state takes precedence over a Scrum Master assignment.
7. Do the work on a feature branch (`{agent-urlkey}/{PAP-XX}`). Follow conventions above.
8. Commit all changes to the branch. **Verify `git rev-parse --abbrev-ref HEAD` after each commit** to catch any husky/lint-staged branch drift (PAP-107 regression guard). Push the branch. **Never merge to `develop` — QA is the sole merge owner.**
9. Set `in_review` + post `@QA — ready for review on PAP-XX. Changes: {summary}`.
10. **Exit cleanly.** Your run is done. QA will merge on APPROVE; you will only be re-woken if QA posts `@<your-role> — changes needed on PAP-XX` (REQUEST_CHANGES flow) or escalates to CTO. If you are woken on an issue already `done` or already merged, exit without action.

### QA Protocol (reviewer + merger)

Steps 1-4 are the same as the IC Protocol (identity, wake reason, Label Bootstrap, inbox).

- **Step 5** — `paperclip_checkout_issue` with `expectedStatuses: ["in_review"]` for code review, or `["todo"]` for test-writing tasks.
- **Step 6** — Board comment precedence check (same rule as IC).
- **Step 7** — Review the feature branch diff, run the full quality gate (`npm run test && npm run lint && npm run typecheck && npm run format:check && npm run docs:check` — all required).
- **Step 8 — Decision:**
  - **APPROVE** → execute the merge sequence: `git checkout develop && git pull`, `git merge --no-ff <feature-branch>`, re-run quality gate on merged develop, `git push origin develop`, delete local + remote feature branch, `paperclip_update_issue` to `done` with a structured closing comment.
  - **REQUEST_CHANGES** → set issue to `todo`, post `@<role> — changes needed on PAP-XX:\n- {bullet list}` matching the issue's `assigneeAgentId`. The feature branch stays open for the IC agent to push fixes.
  - **ESCALATE** → set issue to `blocked`, post `@CTO — needs escalation on PAP-XX: {reason}`.

### Coordinator Protocol (SM / CEO / CTO / PM)

These agents do NOT call `paperclip_checkout_issue`. They mutate via `paperclip_update_issue` and `paperclip_add_comment`. Their AGENTS.md files document per-role workflows — read the relevant file for your role. Key rules:

- **SM** is the only heartbeat-driven agent; runs every 5 minutes; owns promotions, refinement triggers, orphan catches, stale-lock scans (PAP-90 workaround), and epic closure.
- **CEO** is the sole agent hirer — invoke `.agents/skills/paperclip-hire-agent/SKILL.md` when the board approves a new specialist role. CTO, SM, and others must @-mention CEO with `@CEO — hire proposal: <role> for <scope>. Rationale: <one line>` rather than drafting proposals themselves.
- **CTO** owns technical decisions, unblocking, and architecture review. Never implements code, never reviews line-by-line, never hires.
- **PM** is the sole refiner — wakes on `@PM — please refine this issue` from SM or the board. Updates title/description/labels via `paperclip_update_issue`; never changes `status` (SM promotes).

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

Any agent can create a `backlog` issue when they discover a gap, blocker, or improvement. **Follow the full issue creation standard:** [`docs/guides/issue-creation-standard.md`](docs/guides/issue-creation-standard.md).

Quick reference — every issue an agent creates must:

- Be drafted with `sequential-thinking` before the `paperclip_create_issue` call (structure: title → context → scope → AC → fields → review).
- Include `goalId`, `projectId`, `priority`, and a three-section description (Context / What needs to happen / Acceptance Criteria).
- Pass `status: "backlog"` explicitly (API default is `todo`).
- Pass `labelIds` from the per-run label cache (see Label Bootstrap step in the Agent Protocol). Source, quality (refined/unrefined), type, and agent axes are all required.
- Conclude with `@Scrum Master — created PAP-XX for {reason}` on the current issue.

The standard defines five templates (Feature, Bug, MCP Failure, Chore, Docs) and the refinement flow for human-created issues.

### MCP Tool Failover

When any `paperclip_*` MCP tool call fails (returns `isError: true`, throws, times out, or is not found):

1. **Retry once.** If the second attempt also fails, do not retry again.
2. **Capture** before anything else: tool name, exact arguments passed (sanitized), full error text (`content[0].text`), `$PAPERCLIP_RUN_ID`, and what you were trying to accomplish.
3. **Use `sequential-thinking`** to structure a backlog issue using Template 3 (MCP Tool Failure) from [`docs/guides/issue-creation-standard.md`](docs/guides/issue-creation-standard.md):
   - Title exactly: `MCP tool failure: <tool_name> — <short error>`
   - Description: verbatim error in a fenced code block, sanitized input, observed vs. expected behavior.
4. **Create the issue via `paperclip_create_issue`** with `status: "backlog"`, `priority: "high"`, and `labelIds` for `type:mcp-failure` + `source:agent` + `agent:<your-role>` from the label cache.
5. **If `paperclip_create_issue` itself is the failing tool** (or the create call fails after one retry), fall back to curl:

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -d '{
    "title": "MCP tool failure: <tool_name> — <short error>",
    "description": "<structured description from sequential-thinking>",
    "status": "backlog",
    "priority": "high",
    "projectId": "<YOUR_PROJECT_ID>",
    "goalId": "<YOUR_GOAL_ID>",
    "labelIds": ["<type:mcp-failure-uuid>", "<source:agent-uuid>", "<agent:your-role-uuid>"]
  }' \
  "http://127.0.0.1:3100/api/companies/<YOUR_COMPANY_ID>/issues"
```

If label UUIDs are also unavailable, omit `labelIds` and post a `Labels: type:mcp-failure, source:agent, agent:<your-role>` comment on the new issue as fallback.

6. **Stop work on the original task immediately.** Post a comment on the current issue: `Blocked: MCP tool failure on <tool_name>. Created PAP-XX to track. Stopping this run.`
7. **Exit without marking the original issue done.** Do not continue any work that depended on the failed tool.

### Role-Specific Guidance

**Scrum Master (coordinator)** — Only scheduled heartbeat. Feeds pipeline: backlog → todo → assign → @-mention. Closes done epics. Cleans the board. Max 2 IC agents active at once. When a new specialist agent is needed, invoke the `paperclip-hire-agent` skill to draft the hire proposal.

**CTO** — Technical authority. Wakes on @-mention. Architecture decisions, unblocking, escalation handling. Never coordinates kanban, never reviews code. When a new specialist agent is needed, invoke the `paperclip-hire-agent` skill — it guides research, sequential-thinking design, and governance submission.

**Engineer** — Implements tools. Wakes on @-mention. One issue at a time. Marks `in_review` → @QA.

**QA (sole reviewer)** — Reviews code + writes tests. Wakes on @-mention. APPROVE/REQUEST_CHANGES/ESCALATE.

**TechWriter** — Updates docs. Wakes on @-mention. Marks done → @Scrum Master.

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
- **`/bmad-sprint-planning`** — Read Paperclip issues via `curl -s "http://127.0.0.1:3100/api/companies/<YOUR_COMPANY_ID>/issues"` instead of `sprint-status.yaml`.
- **`/bmad-dev-story`** — Do NOT use this skill. Paperclip agents handle implementation autonomously.
- **`/bmad-sprint-status`** — Read Paperclip dashboard via `curl -s "http://127.0.0.1:3100/api/companies/<YOUR_COMPANY_ID>/dashboard"`.
- **`/bmad-retrospective`** — Read completed issues and comments from Paperclip for context. Action items become new Paperclip issues via dispatch.
- **Any identified code changes** — Always create a Paperclip issue. Never modify `src/` directly from BMAD.

### BMAD Ownership of Paperclip Quality

BMAD agents Quinn (QA) and Amelia (Developer) have fundamental ownership to review and improve Paperclip-correlated agents and skills. They apply BMAD methodology expertise to the Paperclip autonomous system:

- **`/bmad-agent-qa` (Quinn)** — Audits Paperclip agent test coverage, CI quality gates, heartbeat reliability, and error handling patterns. Reviews agent capabilities descriptions for clarity and completeness.
- **`/bmad-agent-dev` (Amelia)** — Reviews Paperclip agent code patterns, skill design, adapter configs, and tool handler implementations. Ensures agent configurations follow best practices.
- **`/bmad-code-review`** — Use to review Paperclip agent config changes (capabilities, skills, heartbeat configs) before applying them via the API.
- **`/bmad-retrospective`** — Must include a "Paperclip Agent Health" assessment: which agents struggled, which skills were missing, what configs need tuning. Improvement actions become Paperclip issues.

### Paperclip API (Direct Access)

> Replace `<YOUR_COMPANY_ID>`, `<YOUR_PROJECT_ID>`, `<YOUR_GOAL_ID>`, and `<YOUR_CTO_AGENT_ID>` with the actual UUIDs from your Paperclip account settings.

While the MCP server is under development, use curl for Paperclip operations:

| Operation     | Command                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List issues   | `curl -s "http://127.0.0.1:3100/api/companies/<YOUR_COMPANY_ID>/issues"`                                                                                                                                                                                                        |
| Create issue  | `curl -s -X POST -H "Content-Type: application/json" -d '{"title":"...","status":"todo","priority":"medium","projectId":"<YOUR_PROJECT_ID>","goalId":"<YOUR_GOAL_ID>","assigneeAgentId":"<YOUR_CTO_AGENT_ID>"}' "http://127.0.0.1:3100/api/companies/<YOUR_COMPANY_ID>/issues"` |
| Get dashboard | `curl -s "http://127.0.0.1:3100/api/companies/<YOUR_COMPANY_ID>/dashboard"`                                                                                                                                                                                                     |
| Trigger CTO   | `curl -s -X POST "http://127.0.0.1:3100/api/agents/<YOUR_CTO_AGENT_ID>/heartbeat/invoke"`                                                                                                                                                                                       |
| List agents   | `curl -s "http://127.0.0.1:3100/api/companies/<YOUR_COMPANY_ID>/agents"`                                                                                                                                                                                                        |

## MCP Servers

Two MCP servers are available via `.mcp.json`. Use them when they help — don't force them into simple tasks.

| Server                | When to use                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `sequential-thinking` | Multi-step planning, architecture decisions, complex debugging                  |
| `memory`              | Persist project decisions, architecture context, or conventions across sessions |
