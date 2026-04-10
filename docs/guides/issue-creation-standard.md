# Paperclip Issue Creation Standard

This document defines the quality bar, label taxonomy, refinement workflow, and agent protocol for creating issues in the Paperclip kanban. It applies to all agents and to human-created issues that enter the refinement pipeline.

---

## Quality Criteria

An issue is **refined** when every applicable criterion below is satisfied. An issue that fails any criterion is **unrefined** and must not be promoted past `backlog` until resolved.

### Title

Format: `<Verb> <noun phrase> <so that / to enable> <outcome>`

- Verb is imperative and specific: `Add`, `Fix`, `Expose`, `Migrate`, `Remove`, `Document`, `Validate`. Never `Update` when a more specific verb fits.
- Outcome clause is optional for bugs (the fix is implicit) but required for features and chores.
- Max 120 characters.
- No issue identifier in the title (the system assigns it).

| Good                                                                      | Bad           |
| ------------------------------------------------------------------------- | ------------- |
| `Add paperclip_list_labels tool to expose label endpoints`                | `Labels`      |
| `Fix 409 retry loop in checkout when expectedStatuses is empty`           | `Fix bug`     |
| `Migrate auth.ts to read PAPERCLIP_RUN_ID from env so runs are traceable` | `Update auth` |

### Description

The description is markdown. It must contain three sections in order:

**Context** — why this issue exists. What triggered it? Which goal or gap does it serve? Reference the parent issue or PAP identifier if applicable. One to three sentences.

**What needs to happen** — the technical scope. What files or endpoints are touched? What behavior changes? Be specific enough that a fresh engineer agent can start without asking questions.

**Acceptance Criteria** — a testable bullet list. Each item is a binary pass/fail statement written in present tense: "The tool returns...", "The handler returns `isError: true` when...", "All existing tests pass." Minimum two AC items for any issue. Bugs need at least: (1) the incorrect behavior no longer occurs, (2) a regression test covers the scenario.

### Required fields (API)

| Field             | Required for                   | Notes                                                                                |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `title`           | All issues                     | See title format above                                                               |
| `description`     | All issues                     | Markdown, structured per above                                                       |
| `goalId`          | All issues                     | Link to the active company goal. If no goal applies, escalate to PM before creating. |
| `projectId`       | All issues                     | Link to the owning project.                                                          |
| `parentId`        | Sub-tasks, follow-up tasks     | Required when the issue is a decomposition of a larger issue.                        |
| `priority`        | All issues                     | `critical`, `high`, `medium`, or `low`. Default `medium` if genuinely unclear.       |
| `status`          | All issues                     | Agents create as `backlog`. Scrum Master promotes to `todo`.                         |
| `assigneeAgentId` | When the target agent is known | Leave unset if routing is uncertain — Scrum Master assigns.                          |

### Affected files / components (in description)

For any code issue, the description's "What needs to happen" section must name the specific files or modules involved. Example: `src/tools/issues.ts`, `src/tools/index.ts`. If the scope is unknown, state that explicitly and note it is a discovery task.

### Error details (bug / MCP failure issues)

Bug and MCP failure issues must additionally include in the description:

- The exact error message or stack trace (verbatim, in a fenced code block).
- The tool or endpoint that failed.
- The input that triggered the failure (sanitized if it contains secrets).
- Observed vs. expected behavior.

---

## Label Taxonomy

Labels are managed via the Paperclip UI (or a direct API call — `labelId` is accepted as a filter by `paperclip_list_issues` but label creation and assignment are not yet exposed via MCP tools). Until a `paperclip_create_label` / `paperclip_add_label_to_issue` tool is available, agents must note the intended labels in a comment on the issue immediately after creation, and Carlos or the Scrum Master applies them via the UI.

The comment format is: `Labels: <label-name>, <label-name>`

### Source axis

| Label          | Purpose                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `source:agent` | Issue was created by an autonomous agent.                                  |
| `source:human` | Issue was created by a human via the UI. Assumed unrefined until reviewed. |

### Quality axis

| Label              | Purpose                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `status:refined`   | All quality criteria above are satisfied. Safe to promote to `todo`.         |
| `status:unrefined` | One or more quality criteria are missing. Blocked from `todo` until refined. |

Every new issue starts as `status:unrefined`. The refiner agent (PM) switches it to `status:refined` after completing refinement.

### Type axis

| Label              | Purpose                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `type:feature`     | New capability or user-visible behavior.                                                    |
| `type:bug`         | Incorrect behavior in an existing capability.                                               |
| `type:chore`       | Internal improvement with no direct user impact (refactor, dependency bump, config change). |
| `type:docs`        | Documentation-only changes.                                                                 |
| `type:security`    | Security concern, dependency audit, or threat vector.                                       |
| `type:mcp-failure` | A Paperclip MCP tool call returned an error or behaved unexpectedly. Subset of `type:bug`.  |

### Agent axis (optional)

Used when an issue is created by or for a specific agent type and routing clarity is needed.

| Label                | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `agent:engineer`     | Created by or assigned to the Engineer agent.                       |
| `agent:qa`           | Created by or assigned to the QA agent.                             |
| `agent:devops`       | Created by or assigned to the DevOps agent.                         |
| `agent:pm`           | Created by or for the PM agent (usually refinement or spec issues). |
| `agent:scrum-master` | Orchestration-level issue owned by the Scrum Master.                |

### Priority hints

Priority is already a first-class field on the issue (`critical` / `high` / `medium` / `low`). Do not use labels to duplicate priority. Only add a label if the priority field is unavailable for some reason.

---

## Refinement Workflow

### Trigger

When Carlos sees an issue in `backlog` that lacks structure, he posts a comment on the issue:

```
@PM — please refine this issue
```

Optionally he can add context: `@PM — please refine this issue. Original intent: {one sentence from memory}`.

### Refiner agent

The **PM agent** is the sole refiner. PM owns the issue backlog per the agent scope map. The Scrum Master does not refine — it orchestrates flow. The CTO does not refine — it architects. PM wakes on `@PM` mentions.

### What PM does on refinement

1. `paperclip_get_me` — confirm identity.
2. Read `PAPERCLIP_WAKE_COMMENT_ID` via `paperclip_get_comment` to get the trigger comment and the issue identifier.
3. `paperclip_get_issue` — read the full issue state.
4. Use `sequential-thinking` to structure the refined content:
   - Draft a conforming title.
   - Write Context, What needs to happen, and Acceptance Criteria sections.
   - Determine `goalId`, `projectId`, `parentId`, `priority`.
   - Choose labels from the taxonomy above.
5. `paperclip_update_issue` — patch `title`, `description`, `goalId`, `projectId`, `parentId`, `priority` in a single call.
6. `paperclip_add_comment` — post the label instruction comment (`Labels: type:feature, status:refined, source:human`) so Carlos can apply them via UI.
7. `paperclip_add_comment` — post: `@Scrum Master — PAP-XX refined and ready for promotion`.
8. Exit.

### PM must not

- Checkout the issue (refinement is not implementation work).
- Change `status` — Scrum Master promotes status.
- Create sub-issues without explicitly noting them as `@Scrum Master — created PAP-YY as sub-task of PAP-XX`.

---

## Agent Issue Creation Protocol

Follow these steps in order every time an agent needs to create a new issue.

### Step 1 — Decide whether to create

Before creating, check:

- Does a similar issue already exist? Call `paperclip_list_issues` with a `q` parameter (title keywords) and scan results.
- Is this a scope gap that should be escalated to PM instead of created directly? If the issue represents a product decision, escalate via comment on the current issue rather than creating a new one.

If the issue is genuinely new, proceed.

### Step 2 — Structure content with sequential-thinking

Call the `sequential-thinking` MCP server. Use it to think through:

- A conforming title (verb + noun + outcome).
- Context: what triggered this, which PAP issue or event surfaced it.
- What needs to happen: exact files, endpoints, or behavior.
- Acceptance Criteria: minimum two testable items.
- Correct `goalId` and `projectId` (look up via `paperclip_list_goals` and `paperclip_list_projects` if not in memory).
- Correct `parentId` if this is a sub-task.
- Correct `priority`.
- Which labels to apply (from taxonomy above).

### Step 3 — Create the issue

Call `paperclip_create_issue` with all required fields:

```json
{
  "title": "<verb> <noun> <outcome>",
  "description": "## Context\n\n<why this exists>\n\n## What needs to happen\n\n<technical scope, files affected>\n\n## Acceptance Criteria\n\n- [ ] <testable statement>\n- [ ] <testable statement>",
  "status": "backlog",
  "priority": "<critical|high|medium|low>",
  "goalId": "<uuid>",
  "projectId": "<uuid>",
  "parentId": "<uuid or omit>",
  "assigneeAgentId": "<uuid or omit>"
}
```

If the MCP call fails (tool returns `isError: true`), fall back to curl:

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -d '{"title":"...","description":"...","status":"backlog","priority":"medium","goalId":"...","projectId":"..."}' \
  "http://127.0.0.1:3100/api/companies/$PAPERCLIP_COMPANY_ID/issues"
```

Capture the returned `identifier` (e.g. `PAP-42`).

### Step 4 — Post label comment

Immediately after creation, call `paperclip_add_comment` on the new issue:

```
Labels: source:agent, status:unrefined, type:<feature|bug|chore|docs|security|mcp-failure>, agent:<your-role>
```

### Step 5 — Notify Scrum Master

Post a comment on the **current issue** (the one you are working on) or on the new issue itself:

```
@Scrum Master — created PAP-XX for <one-sentence reason>. Needs refinement before promotion.
```

If the new issue is directly actionable without refinement (e.g. you have full context and wrote a complete description), instead post:

```
@Scrum Master — created PAP-XX for <one-sentence reason>. Refined and ready for assignment.
```

And post the label comment as `Labels: source:agent, status:refined, type:...`.

---

## Issue Templates

Paperclip's API does not expose a native template endpoint — `paperclip_create_issue` accepts freeform `title` and `description` fields. Templates are therefore embedded here as fill-in strings that agents copy into the `description` parameter. Do not add template scaffolding that is not filled in — remove any section that does not apply.

### Template 1: Feature Request

**Title pattern:** `Add <capability> to <component> so that <outcome>`

**Description:**

```markdown
## Context

<Why this feature is needed. Which goal does it serve? What user or agent action is currently impossible or painful without it? Reference the parent issue or triggering event.>

## What needs to happen

- Expose `<endpoint or tool name>` via a new `ToolDefinition` in `src/tools/<module>.ts`.
- Input schema: `<field>: <type> (<required|optional>)` — list all fields.
- Handler: call `client.<method>('/api/<path>')`, validate with Zod schema, return `{ content: [{ type: "text", text: JSON.stringify(data) }] }`.
- Register in `src/tools/index.ts` by spreading the new array into `ALL_TOOLS`.
- Add the tool to `docs/reference/tools.md`.

## Acceptance Criteria

- [ ] `paperclip_<tool_name>` appears in the MCP tool list.
- [ ] Success path: valid input returns the expected API response as JSON text.
- [ ] Zod validation failure: invalid input returns `isError: true` without calling the API.
- [ ] API error path: non-2xx response returns `isError: true` with the error message.
- [ ] `npm run test && npm run typecheck && npm run lint` all pass.
```

---

### Template 2: Bug Report

**Title pattern:** `Fix <incorrect behavior> in <component> when <condition>`

**Description:**

```markdown
## Context

<Which issue or agent run surfaced this bug? When did it first appear? Is it blocking other work?>

## What needs to happen

Fix the incorrect behavior in `<file path>`. The root cause is: <describe if known, otherwise "TBD — investigation required">.

Affected files: `<path>`, `<path>`

## Error details
```

<Paste exact error message or stack trace here>
```

Tool/endpoint that failed: `<tool name or HTTP method + path>`

Input that triggered the failure:

```json
<sanitized input object>
```

Observed behavior: <what happened>

Expected behavior: <what should have happened>

## Acceptance Criteria

- [ ] The incorrect behavior no longer occurs with the input described above.
- [ ] A regression test in `src/tools/<module>.test.ts` covers this scenario.
- [ ] `npm run test && npm run typecheck && npm run lint` all pass.

````

---

### Template 3: MCP Tool Failure

**Title pattern:** `Fix <tool_name> returning <error type> when <input condition>`

Use this template when a Paperclip MCP tool call returned `isError: true`, threw an exception, or produced structurally wrong output during an agent run. This is a specialised bug template with mandatory run context.

**Description:**

```markdown
## Context

This issue was created during agent run `<PAPERCLIP_RUN_ID>` on issue `<PAP-XX>`. The `<tool_name>` MCP tool failed. This is blocking <describe impact>.

## What needs to happen

Investigate and fix the handler in `src/tools/<module>.ts`. The fix may involve:
- Correcting the Zod input schema (wrong type, missing `.optional()`).
- Fixing the HTTP path construction.
- Adding a missing error case to the `handleApiError` catch block.
- Adjusting the API payload shape.

## Error details

Tool: `<tool_name>`

MCP result:
```json
<paste the full content[0].text from the failed tool call>
````

Input passed to the tool:

```json
<sanitized args object>
```

HTTP status returned by Paperclip API (if known): `<status code>`

Observed behavior: `isError: true` / wrong output shape / exception thrown

Expected behavior: `{ content: [{ type: "text", text: "<valid JSON>" }] }`

## Acceptance Criteria

- [ ] `<tool_name>` returns the correct response for the input described above.
- [ ] `<tool_name>` returns `isError: true` (not an uncaught exception) for invalid input.
- [ ] The test file `src/tools/<module>.test.ts` has a test case covering this failure path.
- [ ] `npm run test && npm run typecheck && npm run lint` all pass.

````

---

## CLAUDE.md Snippet

Add the following section to `CLAUDE.md` under the **Paperclip Agent Workflow** heading, after the `### Creating Issues` subsection:

```markdown
### Issue Quality Standard

Every issue an agent creates must meet the refined quality bar defined in [`docs/guides/issue-creation-standard.md`](docs/guides/issue-creation-standard.md). Key requirements:

- **Title:** `<Verb> <noun phrase> [to enable <outcome>]` — imperative, specific, max 120 chars.
- **Description:** three sections — Context, What needs to happen, Acceptance Criteria.
- **Required fields:** `goalId`, `projectId`, `priority`, `status: "backlog"`.
- **parentId:** required for sub-tasks and follow-up tasks on the same epic.
- **Bug/MCP failure issues:** must include verbatim error message, failing tool/endpoint, and sanitized input.

After creating, immediately post a label comment: `Labels: source:agent, status:unrefined, type:<type>, agent:<role>`

Then notify Scrum Master: `@Scrum Master — created PAP-XX for <reason>.`

Full protocol, label taxonomy, templates, and refinement workflow: [`docs/guides/issue-creation-standard.md`](docs/guides/issue-creation-standard.md).
````
