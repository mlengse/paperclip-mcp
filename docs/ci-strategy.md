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

| File pattern        | Actions                              |
| ------------------- | ------------------------------------ |
| `*.ts`              | `eslint --fix`, `prettier --write`   |
| `*.{js,json,md}`    | `prettier --write`                   |

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

| Job          | Steps                                                      |
| ------------ | ---------------------------------------------------------- |
| `build`      | typecheck → lint → format:check → test → build            |
| `docs-lint`  | markdown-link-check on `docs/**/*.md`                      |

All steps must pass for a PR to be mergeable to `main`.

### 3. Release (`release.yml`)

Triggered when a GitHub Release is published (which semantic-release creates automatically on push to `main`).

Steps: install → test → build → `npm publish`.

Requires `NPM_TOKEN` secret set in the repository.

## Workflow Trigger Matrix

| Event                          | Pre-commit | Quality gate | Release |
| ------------------------------ | :--------: | :----------: | :-----: |
| `git commit` (local)           | ✓          |              |         |
| Push to feature branch         |            |              |         |
| PR → `develop`                 |            | ✓            |         |
| PR → `main`                    |            | ✓            |         |
| Push to `main`                 |            | ✓            |         |
| GitHub Release published       |            |              | ✓       |

## Commit Convention (semantic-release)

Releases are version-bumped automatically based on commit message prefixes:

| Prefix      | Version bump | Example                                    |
| ----------- | ------------ | ------------------------------------------ |
| `fix:`      | patch        | `fix(auth): handle expired tokens`         |
| `feat:`     | minor        | `feat(tools): add paperclip_list_goals`    |
| `BREAKING CHANGE:` | major | `feat!: remove legacy endpoint`           |
| `chore:`, `docs:`, `test:` | none | `docs: update readme`         |

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
