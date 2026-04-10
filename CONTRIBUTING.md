# Contributing to paperclip-mcp

## Development setup

**Prerequisites:** Node.js 22+, npm 10+

```bash
git clone <repo>
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

> **Important for `.mcp.json` users:** Do **not** set `PAPERCLIP_API_KEY` or `PAPERCLIP_AGENT_ID`
> inside the `paperclip` server's `env` block in `.mcp.json`. Values placed there override the shell
> environment and break agent-scoped authentication (`401` on `paperclip_get_me` /
> `paperclip_get_inbox`). Export these two variables from your shell profile or `.env.local` and let
> the MCP subprocess inherit them. See `.mcp.json.example` for the correct template.

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

## Branch strategy

```
feature/<topic>  →  develop  →  main
```

- `develop` is the default integration branch — all PRs target `develop`.
- `main` is for releases only. Never commit directly to `main`.
- Branch naming: `feature/<topic>` or `fix/<topic>` for human contributors. The `{agent-urlkey}/PAP-XX` pattern is reserved for Paperclip-orchestrated agent runs.

## Commit format

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

## Adding a new tool

1. Create or edit a file in `src/tools/`.
2. Define a Zod input schema and export a `ToolDefinition[]` array.
3. Each handler: `validate(schema, args)` → `client.get/post/patch/...` → `{ content: [{ type: "text", text: JSON.stringify(data) }] }`.
4. Add `annotations` (`readOnlyHint`, `destructiveHint`, etc.) to each tool.
5. If it's a new module, import and spread its array into `ALL_TOOLS` in `src/tools/index.ts`.
6. Add the tool to `docs/reference/tools.md`.
7. Update the tool count and table in `README.md`.
8. Run `npm run docs:check` — all links must pass.

## Pull request process

1. Open a PR from your feature branch to `develop`.
2. Ensure `npm run typecheck`, `npm run lint`, and `npm run test` all pass.
3. Update documentation for any user-facing changes.
4. At least one approval is required before merging.
