# CI Strategy

This document describes the CI/CD pipeline for paperclip-mcp — what runs, when, and why.

## Motivation

GitHub Actions minutes are a shared budget. Running the full quality gate on every `develop` push generates noise and burns minutes on work-in-progress commits. The strategy is:

- **Pre-commit hooks** catch formatting and lint issues instantly, before any push.
- **CI only gates PRs and `main` pushes** — where code quality actually matters for the shared history.
- **Releases are automatic** from conventional commits on `main` via semantic-release.

## Layers

### 1. Pre-commit (husky + lint-staged)

Runs locally on every `git commit` against staged files only.

| File pattern     | Actions                            |
| ---------------- | ---------------------------------- |
| `*.ts`           | `eslint --fix`, `prettier --write` |
| `*.{js,json,md}` | `prettier --write`                 |

Setup is automatic: `npm install` runs `prepare`, which installs husky. No manual step required.

To skip the hook in an emergency (not recommended):

```sh
git commit --no-verify -m "your message"
```

### 2. Quality Gate (`quality-gate.yml`)

Runs on GitHub Actions. Triggered by:

- Pull request opened/updated targeting `main` or `develop`
- Direct push to `main`

Does **not** run on pushes to `develop` — those are covered by pre-commit and by the PR gate when the branch is promoted.

**Jobs:**

| Job         | Steps                                          |
| ----------- | ---------------------------------------------- |
| `build`     | typecheck → lint → format:check → test → build |
| `docs-lint` | markdown-link-check on `docs/**/*.md`          |

All steps must pass for a PR to be mergeable to `main`.

### 3. Release (`release.yml`)

Triggered on every **push to `main`** (including PR merges from `develop`).

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

| Event                  | Pre-commit | Quality gate | Release |
| ---------------------- | :--------: | :----------: | :-----: |
| `git commit` (local)   |     ✓      |              |         |
| Push to feature branch |            |              |         |
| PR → `develop`         |            |      ✓       |         |
| PR → `main`            |            |      ✓       |         |
| Push to `main`         |            |      ✓       |    ✓    |
| `[skip ci]` back-push  |            |              |         |

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

## Pre-commit Setup Verification

To confirm hooks are installed after a fresh clone:

```sh
ls .husky/pre-commit   # should exist
cat .husky/pre-commit  # should contain: npx lint-staged
```

If missing, run `npm install` to trigger the `prepare` script.
