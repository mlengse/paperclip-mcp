# CI Strategy

This document describes the CI/CD pipeline for paperclip-mcp — what runs, when, and why.

## Why Model B?

paperclip-mcp is a small, fast project (~20 source files, ~10s test suite, solo developer). Running the
full quality gate in CI on every push burns GitHub Actions minutes on a private repo budget with no
proportional benefit. The `modelcontextprotocol/typescript-sdk` uses this same pattern.

Key tradeoffs that make Model B the right fit:

- **Private repo, metered CI minutes** — every unnecessary run has a real cost.
- **Faster developer feedback** — typecheck + test + build runs locally in ~25–35s; failure surfaces before push.
- **One-push cost vs per-commit cost** — pre-push fires once per `git push`, not once per commit.
  A 10-commit rebase session costs one gate run, not ten.
- **CI becomes a backstop**, not the primary gate — it catches what only CI can catch (PAP-107
  regression script, docs link-check against live URLs), not what belongs in the local loop.

## Layers

### 1. Pre-commit (husky + lint-staged)

Runs locally on every `git commit` against staged files only. ~3–8s per commit.

| File pattern     | Actions                            |
| ---------------- | ---------------------------------- |
| `*.ts`           | `eslint --fix`, `prettier --write` |
| `*.{js,json,md}` | `prettier --write`                 |

Setup is automatic: `npm install` runs `prepare`, which installs husky. No manual step required.

The `prepare` script skips husky gracefully when devDependencies are not installed (e.g. `npm publish --dry-run`,
`npm pack`, CI publish environments). This prevents a `command not found` error while preserving normal hook
installation for local development.

**HEAD-drift guard (PAP-107):** `.husky/pre-commit` passes `--no-stash` to lint-staged and explicitly restores
`HEAD` to the original symbolic ref after the hook exits. This prevents lint-staged's stash backup/restore cycle
from drifting `HEAD` to the base branch when a feature branch and its base share the same commit SHA.

### 2. Pre-push (husky)

Runs locally once per `git push`, regardless of how many commits are in the push. ~25–35s.

Steps, in order:

1. `npm run typecheck` — full tsc type check (incremental via `.tsbuildinfo`; warm runs are fast)
2. `npm run test` — full test suite
3. `npm run build` — compile to `dist/`
4. `docs:generate` drift check — runs `npm run docs:generate` then fails if `docs/tools/` has uncommitted
   changes, prompting you to commit the generated output before pushing

This hook covers typecheck, test, build, and docs:generate drift-check locally before the push reaches CI. Lint and format are handled at pre-commit time (lint-staged) — they do not run again at pre-push.

### 3. Quality Gate (`quality-gate.yml`)

Runs on GitHub Actions. Triggered by **PR to `main` only**.

Single job — the former `pre-commit-regression` job is folded in, sharing the same `npm ci` install.

| Step                      | Why CI-only                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| PAP-107 regression script | Tests hook behavior — only valid in a clean, neutral CI environment  |
| `npm run test`            | Second pass in neutral environment before merging to `main`          |
| `npm run build`           | Confirms the build is clean on the merge candidate                   |
| `npm run docs:check`      | Markdown link-check hits live URLs — unsuitable to run on every push |

Removed from CI (now pre-push or pre-commit): typecheck + docs:generate drift (pre-push); lint + format:check (pre-commit via lint-staged).

All steps must pass for a PR to be mergeable to `main`.

### 4. Release (`release.yml`)

Triggered on every **push to `main`** (including squash-merge PR merges).

Runs `npx semantic-release`, which orchestrates the full plugin chain in this order:

| Plugin                                      | What it does                                                          |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `@semantic-release/commit-analyzer`         | Reads conventional commits since the last release; determines bump    |
| `@semantic-release/release-notes-generator` | Generates human-readable release notes                                |
| `@semantic-release/changelog`               | Writes/updates `CHANGELOG.md`                                         |
| `@semantic-release/npm`                     | Bumps `version` in `package.json` and publishes to npm                |
| `@semantic-release/git`                     | Back-commits `CHANGELOG.md` + `package.json` with `[skip ci]` message |
| `@semantic-release/github`                  | Creates a GitHub Release with the generated release notes             |

**`[skip ci]` back-commit:** After publishing, semantic-release commits the updated `CHANGELOG.md` and `package.json` back to `main` with the message `chore(release): <version> [skip ci]`. The `[skip ci]` marker prevents `release.yml` from re-triggering on that commit.

**Required secrets:** `NPM_TOKEN` (npm publish), `GITHUB_TOKEN` (auto-injected by Actions — no manual setup needed).

If semantic-release finds no `fix:`, `feat:`, or `BREAKING CHANGE:` commits since the last release tag, it exits with no release and no publish.

## Workflow Trigger Matrix

| Event                | Pre-commit | Pre-push | Quality gate (CI) | Release | Stale-lock detector |
| -------------------- | :--------: | :------: | :---------------: | :-----: | :-----------------: |
| `git commit` (local) |     ✓      |          |                   |         |                     |
| `git push` (local)   |            |    ✓     |                   |         |                     |
| PR → `main`          |            |          |         ✓         |         |                     |
| Push to `main`       |            |          |                   |    ✓    |                     |
| `[skip ci]` push     |            |          |                   |         |                     |
| Schedule (hourly)    |            |          |                   |         |          ✓          |
| Manual dispatch      |            |          |                   |         |          ✓          |

## Performance Guards

Three caches reduce repeat-run cost for unchanged inputs:

| Cache               | Location          | Gitignored | Activated by                       |
| ------------------- | ----------------- | :--------: | ---------------------------------- |
| tsc incremental     | `.tsbuildinfo`    |     ✓      | `"incremental": true` in tsconfig  |
| ESLint result cache | `.eslintcache`    |     ✓      | `--cache --cache-strategy content` |
| Prettier cache      | `.prettier-cache` |     ✓      | `--cache`                          |

All three are listed in `.gitignore`. After the first pre-push run, typecheck on an unchanged codebase
is typically <2s; lint is near-instant.

## Escape Hatch

`git push --no-verify` bypasses the pre-push hook entirely. Reserve this for:

- Broken upstream type declaration that blocks typecheck/build (and fixing it is not your task)
- Emergency hotfix where the pre-push gate would delay an urgent production fix

When using `--no-verify`, immediately create a follow-up commit or issue documenting why the bypass was
used and what the plan is to address it. The CI quality gate on PR to `main` still runs regardless.

### 5. Stale-Lock Detector (`stale-lock-detector.yml`)

Triggered hourly (reduced from every 30 min — stale locks are not real-time critical) and on-demand
via `workflow_dispatch`.

Detects Paperclip issues that are in the stale-lock state caused by the platform bug tracked in PAP-127 (tracked in the Paperclip issue tracker): `POST /api/issues/{id}/release` clears `checkoutRunId` but does not clear `executionRunId`. A new agent dispatch then receives a persistent 409 on checkout even though no active agent holds the lock.

**What it does:**

| Step   | Action                                                                                       |
| ------ | -------------------------------------------------------------------------------------------- |
| Fetch  | Queries all `in_progress` issues (or a single issue if `issue_id` input is provided)         |
| Detect | Identifies issues with `checkoutRunId = null` AND `executionRunId != null`                   |
| Report | Writes a step summary listing affected issues; fails the run to trigger GitHub notifications |

**Required secrets** (must be set in the repo's Actions secrets before this workflow is useful):

| Secret                 | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `PAPERCLIP_API_KEY`    | Agent API key with issue read access                                 |
| `PAPERCLIP_API_URL`    | Paperclip API base URL (e.g. via ngrok tunnel for local deployments) |
| `PAPERCLIP_COMPANY_ID` | Company UUID                                                         |

**Limitations:** This workflow detects and reports stale locks but cannot clear them. Clearing `executionRunId` requires a platform-side fix to the `/release` endpoint (PAP-127). Until that fix is deployed, board intervention (direct DB patch) is required for each detected stale lock.

## Commit Convention (semantic-release)

Releases are version-bumped automatically based on commit message prefixes:

| Prefix                     | Version bump | Example                                 |
| -------------------------- | ------------ | --------------------------------------- |
| `fix:`                     | patch        | `fix(auth): handle expired tokens`      |
| `feat:`                    | minor        | `feat(tools): add paperclip_list_goals` |
| `BREAKING CHANGE:`         | major        | `feat!: remove legacy endpoint`         |
| `chore:`, `docs:`, `test:` | none         | `docs: update readme`                   |

Non-conforming commits are ignored by semantic-release and produce no release.

## Adding or Modifying CI Steps

1. Edit `.github/workflows/quality-gate.yml` (or `release.yml` for publish steps).
2. Add the step under the appropriate job.
3. If the step needs a new script, add it to `package.json` `scripts` and update the **Commands** table in `CLAUDE.md`.
4. Test locally with `act` or push to a draft PR — do not push directly to `main`.

## Hook Setup Verification

To confirm both hooks are installed after a fresh clone:

```sh
ls .husky/pre-commit .husky/pre-push   # both should exist
```

If missing, run `npm install` to trigger the `prepare` script (husky v9 — no `husky install` needed).
