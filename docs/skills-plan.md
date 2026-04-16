# Workflow Skills Plan

This document records the rationale and design decisions behind the six project-local skills added in `feat/workflow-skills`. Future contributors can use this to understand why the skills exist and how they relate to each other.

## Background

The v2.0.0 release exposed two recurring failure modes in this repo:

1. **Silent no-release:** A squash-merge with `feat!:` but no `BREAKING CHANGE:` footer caused semantic-release to skip the major bump. This went undetected until the tag was missing.
2. **Branch drift (PAP-107):** A husky/lint-staged regression caused the working branch to silently change after a commit. Without a guard, agents pushed to the wrong branch.

These skills encode the safeguards and institutional knowledge to prevent recurrence.

## Skills

### `/commit` — `.claude/skills/commit/SKILL.md`

**Purpose:** Conventional-commit discipline with PAP-107 branch guard and Paperclip co-author trailer.

**Key rules encoded:**

- Conventional-commits format `<type>(<scope>): <subject>` with scope guidance for this repo's modules.
- Breaking changes require BOTH `!` marker AND `BREAKING CHANGE:` footer.
- PAP-107 guard: `git rev-parse --abbrev-ref HEAD` must match before and after commit.
- Paperclip agents append `Co-Authored-By: Paperclip <noreply@paperclip.ing>` when `PAPERCLIP_RUN_ID` is set.
- `--no-verify` is banned unconditionally.

### `/create-pr` — `.claude/skills/create-pr/SKILL.md`

**Purpose:** Open PRs with conforming titles, correct base branch, and the standard test-plan checklist.

**Key rules encoded:**

- Feature branches default to `develop`; `main` is only for release promotions.
- PR title = future squash commit subject for `main`-targeted PRs — non-conforming title = silent no-release.
- Standard body template with test-plan checklist mirrors `quality-gate.yml`.

### `/squash-merge-pr` — `.claude/skills/squash-merge-pr/SKILL.md`

**Purpose:** Squash-merge with a conforming subject and the `BREAKING CHANGE:` footer when applicable. Encodes the v2.0.0 trap.

**Key rules encoded:**

- Breaking-change detection scans both branch commits and PR body.
- The `BREAKING CHANGE:` literal footer (not a markdown heading) is the authoritative signal.
- Non-conforming PR title must be corrected before merging — never let GitHub's default become the squash subject.
- No `BREAKING CHANGE:` footer on `develop`-targeted merges.

### `/quality-gate` — `.claude/skills/quality-gate/SKILL.md`

**Purpose:** Run the full local quality gate mirroring `quality-gate.yml`. Stop on first failure; fix and retry.

**Key rules encoded:**

- Six steps in order: typecheck, lint, format:check, test, build, docs:check.
- Failure-specific handling for each step (auto-fix paths for lint and format).
- Distinguishes the pre-commit hook scope (staged files only) from the full gate (entire codebase).

### `/diagnose-release` — `.claude/skills/diagnose-release/SKILL.md`

**Purpose:** 4-path decision tree for diagnosing missed semantic-release tags or npm publishes.

**Key rules encoded:**

- Path 1: `release.yml` didn't run (check `[skip ci]`).
- Path 2: workflow ran but commit-analyzer said no release.
- Path 3: causes for "no release" — non-conforming title, all non-releasing types, or missing `BREAKING CHANGE:` footer.
- Path 4: workflow failed — token expiry, permissions, version conflict.
- Fix path: empty follow-up commit to trigger re-analysis; never manual tags.

### `/semver-strategy` — `.claude/skills/semver-strategy/SKILL.md`

**Purpose:** Reference for the bump table, `!` marker behavior, footer requirements, and scope guidance.

**Key rules encoded:**

- Bump table from `.releaserc.json` `releaseRules`.
- `!` marker pre-/post-`b407bba` behavior difference (the v2.0.0 bungle).
- `BREAKING CHANGE:` footer syntax and what it is NOT (markdown heading vs footer token).
- Squash-merge gotcha: only the squash commit is analyzed, not branch commits.

## Integration Points

- `CLAUDE.md` Agent Protocol step 8 points to `/commit`.
- `CLAUDE.md` QA Protocol step 7 points to `/quality-gate`.
- `CLAUDE.md` Workflow Skills table maps trigger phrases to skills.
- `/create-pr` cross-references `/quality-gate` (pre-flight) and `/squash-merge-pr` (breaking PRs).
- `/squash-merge-pr` cross-references `/diagnose-release` (post-merge monitoring).
- `/diagnose-release` cross-references `/semver-strategy` (for release config inspection).
