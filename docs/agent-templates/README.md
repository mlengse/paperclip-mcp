# Agent Templates — Reference Examples

> **These files are reference examples, not templates to copy.**
> When hiring a new agent, invoke the `paperclip-hire-agent` skill instead. The skill runs a research phase, uses `sequential-thinking` to design the capabilities string, and produces a complete agent `.md` output ready for CTO review. The files in this directory are examples that the skill references internally to calibrate output format and scope decisions.

This directory contains reference examples for specialist Paperclip agents on the paperclip-mcp project. Each file covers one archetype that the CEO or CTO may hire when the workload or risk profile demands it.

## What these files are

Each example shows a completed hire design for one archetype:

- A front matter block with the canonical Paperclip configuration fields
- A role summary explaining when to hire this archetype
- A complete capabilities string as a format reference
- Suggested skills to sync
- A scope boundary table against every peer agent
- A bounded probe issue to validate the hire before promoting to the normal queue
- An instantiation checklist to follow during the hire process

These files are intentionally concrete. Commands reference actual scripts (`npm run test`, `gh workflow run`), actual paths (`.github/workflows/`, `docs/runbooks/`), and actual conventions from this repo. When invoking `paperclip-hire-agent`, the skill uses these examples to calibrate its output — the resulting `.md` file will be customized to the current project state and will not be a direct copy of any example here.

## Available templates

| File                   | Archetype         | Reports to | When to hire                                                                       |
| ---------------------- | ----------------- | ---------- | ---------------------------------------------------------------------------------- |
| `devops-engineer.md`   | DevOps Engineer   | CTO        | CI/CD pipelines need dedicated ownership or release automation requires tuning     |
| `sre.md`               | SRE               | CTO        | Agent fleet health, SLOs, and incident response need a dedicated owner             |
| `security-engineer.md` | Security Engineer | CTO        | Dependency audits, threat modeling, or Zod/auth review needs a dedicated owner     |
| `data-engineer.md`     | Data Engineer     | CTO        | Agent productivity analytics, cost tracking, or telemetry pipelines need ownership |
| `release-manager.md`   | Release Manager   | CTO        | Release coordination between Engineer/QA/DevOps needs a dedicated process owner    |

## How to hire a new agent

Invoke the `paperclip-hire-agent` skill. It will:

1. Collect the role name and need description.
2. Research comparable agent archetypes and tool patterns.
3. Use `sequential-thinking` to design scope, capabilities, procedures, and quality gates.
4. Produce a complete agent `.md` file (matching the format of the examples in this directory) ready for CTO review without further editing.
5. Guide you through governance submission (`POST /api/companies/{cid}/approvals` with `type: hire_agent`).
6. Define the probe issue to validate the hire before promoting to the normal queue.

These example files are available to consult when you want to understand the expected output format or review a comparable archetype's scope decisions. Do not copy them directly.

## Conventions shared across all specialist agents

- Commit prefix follows the archetype's declared type: `ci(scope):`, `ops(scope):`, `security(scope):`, `data(scope):`, `release(scope):`.
- Branch naming: `{archetype-slug}/PAP-XX` (e.g. `sre/PAP-55`).
- All work targets `develop`. `main` is touched only by DevOps via semantic-release.
- Every agent follows the standard Paperclip agent protocol: `paperclip_get_me` → check wake reason → checkout issue → work → set `in_review` → `@QA`.
- Scope tables in each template are the authoritative boundary definition. Overlap disputes escalate to CTO.
