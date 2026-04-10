# Agent Capabilities Style Guide

## Why This Guide Exists

Paperclip's official documentation describes the `capabilities` field as "a short description of what this agent does." That baseline is fine for a human-readable directory listing. It is not enough to make an agent function correctly in a multi-agent company.

When a CEO or PM @-mentions an agent, the capabilities string is the primary signal the routing system uses to select the right specialist and scope the handoff. When the board reviews a hire request, the capabilities string is the contract they are approving. When an agent gets stuck, the capabilities string is what defines "stuck" versus "done." A vague or aspirational string in that field produces misrouted tasks, scope creep, and agents that loop indefinitely because they have no defined exit condition.

The paperclip-mcp project has converged on a 7-section procedural format that turns the capabilities field into an operating procedure rather than a job description. This document makes that format official, explains each section, and provides the review checklist the board uses to evaluate proposals.

---

## The 7 Required Sections

Every specialist agent capabilities string must contain all seven sections in order. Each section is prose — there are no headings inside the field itself, since `capabilities` is a plain string. The sections flow as a single paragraph or tightly grouped sentences.

### 1. One-Line Role Summary

**Purpose:** Establishes who the agent is for @-mention routing. This is the sentence that appears in search results and routing decisions. It must name the domain and the product context in enough specificity that a CEO can decide whether to route a task here without reading further.

**Format:** `[Role verb] [domain] for [product/scope].`

|      | Example                                                                                     |
| ---- | ------------------------------------------------------------------------------------------- |
| Good | `Implements MCP tool handlers and TypeScript features for paperclip-mcp.`                   |
| Bad  | `Owns CI/CD pipelines, pre-commit hooks, release automation, and GitHub Actions workflows.` |

The bad example names four domains simultaneously and uses "owns" — an ownership claim, not a functional description.

---

### 2. Scope

**Purpose:** Defines exactly which files, directories, or system domains this agent is authorized to modify. Must be a positive statement. The negative statement (what is out of scope) lives in section 7.

**Format:** `Scope: [path1], [path2] only.` or `Scope: [domain description] only.`

|      | Example                                |
| ---- | -------------------------------------- |
| Good | `Scope: src/tools/ and src/*.ts only.` |
| Bad  | `Scope: the codebase`                  |

The bad version gives no actionable boundary. An agent that can touch "the codebase" will eventually touch the wrong thing.

---

### 3. Core Procedures

**Purpose:** Numbered, verb-first steps that describe exactly what the agent does when it picks up a task. References specific tools, patterns, or commands by name. Another agent reading this section should be able to predict what this agent will do without ambiguity.

**Format:** Numbered list embedded in prose. Each step starts with a verb. Tool names and code patterns are quoted or typed exactly.

|      | Example                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Good | `Before writing code, read relevant source files and plan the implementation. Follow the ToolDefinition pattern: Zod schema with .describe() on every field → validate(schema, args) → typed client.get/post/patch → return { content: [{ type: text, text: JSON.stringify(data) }] }. Catch PaperclipApiError and return isError: true.` |
| Bad  | `Monitors CI resource usage, resolves pipeline failures, onboards agents to tooling.`                                                                                                                                                                                                                                                     |

"Monitors," "resolves," and "onboards" are vague verbs. They describe outcomes an agent might aspire to, not steps it will execute.

---

### 4. Quality Gates

**Purpose:** Exact shell commands that must pass before the agent marks work `in_review`. This section is what allows automated verification and gives the board a testable completion criterion.

**Format:** `Run [command1] && [command2] — all must pass before marking in_review.`

|      | Example                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| Good | `Run npm run test && npm run lint && npm run typecheck — all must pass before marking in_review.` |
| Bad  | `Ensures code quality and CI passes.`                                                             |

"Ensures" is a promise. The gate command is a procedure. Only one of these can be checked.

---

### 5. Conventions

**Purpose:** Commit format, branch naming, comment patterns, or any project-local convention the agent must follow. This prevents stylistic drift and makes the agent's output predictable when another agent reviews it.

**Format:** State the convention with the exact format string. No prose justification needed.

|      | Example                                        |
| ---- | ---------------------------------------------- |
| Good | `Commit as type(scope): description (PAP-XX).` |
| Bad  | `Follows project conventions for commits.`     |

---

### 6. Failure Behavior

**Purpose:** Defines what the agent does when it cannot make progress. Without this, agents retry indefinitely or silently drop tasks. The 3-strike rule and blocker comment format are project-wide conventions codified here per-agent.

**Format:** `If blocked after 3 attempts on the same problem, post a Blocked comment with [exact content] and exit. Never [specific forbidden action].`

|      | Example                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| Good | `If blocked after 3 attempts on the same problem, post a Blocked comment with the exact error and exit. Never retry a 409.` |
| Bad  | `Escalates blockers to the team.`                                                                                           |

"Escalates to the team" gives an agent nowhere actionable to go. The blocker comment format and the 409 prohibition are precise, verifiable behaviors.

---

### 7. Out of Scope

**Purpose:** Explicit negative scope, listed against each peer agent. This is the boundary enforcement mechanism. A capabilities string without negative scope will produce scope creep the first time the agent encounters a related-but-not-owned task.

**Format:** `Never [action] — that is [PeerAgent]'s domain.` One clause per peer whose territory is adjacent.

|      | Example                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| Good | `Never modify test files — that is QA's domain. Never touch .github/workflows/ — that is DevOps's domain.` |
| Bad  | (omitted entirely — the rejected DevOps proposal had no out-of-scope clause)                               |

---

## Length Guideline

| Agent type                                                        | Target length       |
| ----------------------------------------------------------------- | ------------------- |
| Specialist roles (Engineer, QA, TechWriter, DevOps, Scrum Master) | 800–1500 characters |
| Orchestrator roles (CEO, CTO, PM)                                 | 400–800 characters  |

Orchestrators operate at higher abstraction and route rather than execute. Their capabilities strings describe routing logic, not step-by-step procedures. Specialists must be long enough to include all 7 sections without omission. A string under 800 characters for a specialist role almost always means one or more sections were dropped.

If you are over 1500 characters for a specialist role, you have either duplicated information across sections or written a manual rather than a capabilities string. Cut to the minimum verifiable statement in each section.

---

## Taxonomy Note

Paperclip's documented role taxonomy is: `ceo`, `cto`, `manager`, `engineer`, `researcher`.

The paperclip-mcp project fields agents in roles not covered by this taxonomy: `qa`, `tech_writer`, `scrum_master`, `devops`. For these roles, use `role: general` at hire time.

`general` is a local extension, not an official Paperclip role. It signals to the routing system that the agent's role identity comes entirely from its capabilities string and title rather than from a platform-level role slot. When using `general`, the one-line role summary in section 1 carries extra weight — it is the only structured signal available for routing decisions.

Do not use `general` for agents that map cleanly to a documented role. An agent doing TypeScript implementation work should use `role: engineer`, not `general`.

---

## Hiring Workflow

The hire flow for a new agent has four steps. Steps must be followed in order.

**Step 1 — Check for a template.**
Look in `docs/agent-templates/` for a template matching the intended role. If one exists, start from it rather than drafting from scratch. Templates pre-fill the scope, quality gates, and out-of-scope clauses for common role patterns.

**Step 2 — Customize the capabilities string.**
Apply this style guide to every section. Run the review checklist (below) against your draft before submitting. The board will use the same checklist; catching failures before submission avoids a revision cycle.

**Step 3 — Submit the hire request.**
For agents invoking the hire flow (CEO, CTO) this happens via the `paperclip-hire-agent` skill which creates an approval record for board review. For board operators acting directly, two paths exist:

- **Preferred (governance path):** Create a pending approval via the `paperclipai` CLI (`paperclipai approval create --type hire_agent --payload '<json>'`) or directly via the Paperclip API (`POST /api/companies/{cid}/approvals` with `type: hire_agent` and the full agent config in `payload`). Both preserve the full audit trail — rejection, revision, approval history are all captured. The CLI is shorter and preferred when running interactively.
- **Direct path (bypasses governance):** `POST /api/companies/{cid}/agents` with the agent config. This skips approval and creates the agent immediately. Use only when the board operator IS the reviewer and wants to skip the formality (e.g. scripted bulk onboarding with pre-reviewed configs). Every direct creation should be documented in a commit or chat log as "direct creation, reviewed by <name>".

Never use the direct path for agents proposed by other agents — that defeats the purpose of the approval flow.

**Step 4 — Board review.**
The board evaluates the hire request using the 7-section checklist below. If any section fails, the board either rejects (if the proposal is fundamentally wrong) or requests revision (if the proposal is fixable). The hiring agent addresses the feedback and resubmits.

---

## Anti-Patterns

The following patterns appear frequently in rejected capabilities proposals. None of them belong in a capabilities string.

**Marketing fluff.** Phrases like "world-class," "best-in-class," "comprehensive coverage," or "ensures excellence" carry no actionable content. They cannot be tested and they inflate character count at the expense of procedures.

**Aspirational promises without procedures.** "Will maintain high test coverage" is a promise. "For each tool, write three minimum test cases: (1) success path, (2) Zod validation failure, (3) API error path" is a procedure. Only procedures belong in capabilities strings.

**Vague verbs without exact commands.** The verbs "monitors," "orchestrates," "helps," "supports," "facilitates," and "ensures" are red flags. Every verb in sections 3–6 must map to a specific action an agent can execute: reads, writes, runs, posts, validates, returns, exits.

**Listing domains instead of procedures.** "Owns CI/CD pipelines, pre-commit hooks, release automation, and GitHub Actions workflows" is a domain inventory. It answers "what does this agent own?" not "what does this agent do?" The capabilities field answers the second question, not the first.

**Missing negative scope.** Omitting section 7 is not a neutral choice. It means the agent has no defined boundary against peer agents. In a multi-agent company with adjacent roles (Engineer/QA, DevOps/Engineer), unbounded scope causes task duplication and conflicting edits.

---

## Review Checklist

The board applies this checklist to every hire proposal. Each item is a YES/NO question. A single NO is grounds for a revision request.

| #   | Section          | Question                                                                                    |
| --- | ---------------- | ------------------------------------------------------------------------------------------- |
| 1   | Role summary     | Does the first sentence name a specific functional domain (not a list of domains)?          |
| 2   | Role summary     | Is the role summary one sentence only?                                                      |
| 3   | Scope            | Does the scope clause name exact file paths or directories, not general areas?              |
| 4   | Scope            | Does the scope end with "only" or an equivalent bounding word?                              |
| 5   | Core procedures  | Are the core procedures numbered and verb-first?                                            |
| 6   | Core procedures  | Does at least one procedure name a specific tool, pattern, or command by exact name?        |
| 7   | Core procedures  | Are "monitors," "orchestrates," "helps," "supports," "ensures" absent from this section?    |
| 8   | Quality gates    | Is there at least one exact shell command that must pass?                                   |
| 9   | Quality gates    | Does the quality gate clause name the target status (`in_review`)?                          |
| 10  | Conventions      | Is the commit format specified with the exact format string?                                |
| 11  | Failure behavior | Does the failure clause specify a maximum attempt count before escalating?                  |
| 12  | Failure behavior | Does the failure clause name the exact output (comment type, content) on failure?           |
| 13  | Failure behavior | Is at least one specific forbidden retry action named?                                      |
| 14  | Out of scope     | Is there at least one out-of-scope clause naming a peer agent?                              |
| 15  | Out of scope     | Does every adjacent peer agent (those with overlapping domain) appear in section 7?         |
| 16  | Length           | Is the total character count between 800 and 1500 for a specialist role?                    |
| 17  | Role field       | If the role is not in `{ceo, cto, manager, engineer, researcher}`, is `role: general` used? |

A proposal that passes all 17 items is ready for board approval. A proposal that fails items 7, 14, or 15 — the anti-pattern and scope checks — requires a full redraft of the affected sections, not a patch.
