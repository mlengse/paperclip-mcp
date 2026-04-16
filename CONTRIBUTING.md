# Contributing to paperclip-mcp

Thank you for your interest in contributing. Please read this guide before opening issues or pull requests.

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Development setup

**Prerequisites:** Node.js >=22, npm >=10

```bash
git clone https://github.com/bruhsb/paperclip-mcp.git
cd paperclip-mcp
npm install
```

**Required environment variables** (copy from your Paperclip settings):

```bash
export PAPERCLIP_API_KEY=<your-api-key>
export PAPERCLIP_API_URL=<your-paperclip-api-url>  # local dev default: http://127.0.0.1:3100
export PAPERCLIP_AGENT_ID=<your-agent-id>
export PAPERCLIP_COMPANY_ID=<your-company-id>
```

> **Note for `.mcp.json` users:** Do **not** set `PAPERCLIP_API_KEY` or `PAPERCLIP_AGENT_ID` inside the `paperclip` server's `env` block in `.mcp.json`. Values placed there override the shell environment and break agent-scoped authentication (`401` on `paperclip_get_me` / `paperclip_get_inbox`). Export these variables from your shell profile or `.env.local` and let the MCP subprocess inherit them.

---

## Common commands

| Task            | Command              |
| --------------- | -------------------- |
| Build           | `npm run build`      |
| Dev (live TS)   | `npm run dev`        |
| Type-check      | `npm run typecheck`  |
| Lint            | `npm run lint`       |
| Format          | `npm run format`     |
| Run tests       | `npm run test`       |
| Check doc links | `npm run docs:check` |

Pre-commit hooks (husky + lint-staged) run ESLint and Prettier automatically on staged files at commit time. You do not need to run `format:check` manually before committing.

---

## Branch strategy

```
feature/<topic>  →  develop  →  main
```

- `develop` is the default integration branch — all PRs target `develop`.
- `main` is for releases only. Never commit directly to `main`.
- Branch naming: `feature/<topic>` or `fix/<topic>` for human contributors.
- The `{agent-urlkey}/PAP-XX` pattern is reserved for Paperclip-orchestrated agent runs.

---

## Commit format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description (PAP-XX if applicable)
```

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`

Examples:

```
feat(tools): add paperclip_list_goals tool (PAP-41)
fix(client): clear stale run ID on checkout failure (PAP-64)
docs: update tool reference for v2 tools (PAP-39)
```

The `type` determines release versioning: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` in commit footer → major.

---

## Adding a new tool

Follow the conventions in [`docs/guides/mcp-tool-conventions.md`](docs/guides/mcp-tool-conventions.md) — this is the canonical reference for v2.0+ tool authoring.

Quick checklist:

1. Create or edit a file in `src/tools/`.
2. Define a Zod input schema with `.describe()` on every field and `.strict()` on the object.
3. Export a `ToolDefinition[]` array with `name`, `description` (use `composeDescription`), `inputSchema`, `annotations`, and `handler`.
4. Add correct `annotations`: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `title`.
5. Prefix board-only tool descriptions with `⚠ Board-only:`.
6. In the handler: `validate(schema, args)` → `client.get/post/patch/...` → wrap with `handleApiError` → return `formatJson(data)` or a markdown formatter.
7. If it's a new module, import and spread its array into `ALL_TOOLS` in `src/tools/index.ts`.
8. Update the tool count and domain table in `README.md`.
9. Update `docs/guides/api-coverage.md` with the new endpoint row.
10. Run `npm run docs:check` — all links must pass.

---

## Testing

Tests use Node.js built-in `node:test` with `assert/strict`. No external test framework is required.

- **Unit tests:** co-located with source files or in `src/tools/*.test.ts`. Test each tool's handler with mock API responses.
- **Contract tests:** in `src/contract/`. These verify the shape of live API responses (optional for contributors without a running Paperclip instance).
- Run the full suite with `npm test` before opening a PR.
- Coverage thresholds: 80% line, 70% branch. Check with `npm run test:coverage`.

---

## Pull request process

1. Open a PR from your feature branch to `develop`.
2. Ensure the full quality gate passes: `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run docs:check`.
3. Update documentation for any user-facing changes (README tool table, api-coverage.md, CHANGELOG entry if relevant).
4. Fill out the PR template — summary, breaking changes, and test plan.
5. At least one maintainer approval is required before merging.
6. Squash or conventional-commit your history — the merge commit triggers semantic-release version detection.

---

## Reporting issues

- Bug reports and feature requests go to [GitHub Issues](https://github.com/bruhsb/paperclip-mcp/issues).
- For security vulnerabilities, use [GitHub Security Advisories](https://github.com/bruhsb/paperclip-mcp/security/advisories/new) — see [SECURITY.md](SECURITY.md).
