# paperclip-mcp

MCP server that exposes the [Paperclip](https://paperclip.ing) control plane API as tools for Claude Code agents — manage issues, coordinate agents, post comments, and orchestrate work without direct API calls.

[![npm](https://img.shields.io/npm/v/paperclip-mcp)](https://www.npmjs.com/package/paperclip-mcp)
[![MCP protocol](https://img.shields.io/badge/MCP-1.29.0-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Quickstart

```bash
npx paperclip-mcp
```

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "npx",
      "args": ["paperclip-mcp"],
      "env": {
        "PAPERCLIP_API_URL": "http://127.0.0.1:3100",
        "PAPERCLIP_API_KEY": "<your-api-key>",
        "PAPERCLIP_AGENT_ID": "<your-agent-id>",
        "PAPERCLIP_COMPANY_ID": "<your-company-id>"
      }
    }
  }
}
```

For heartbeat runs, Paperclip injects all required env vars automatically.

## Installation

Three first-class variants:

### npm

```bash
# one-shot (no install)
npx paperclip-mcp

# global install
npm install -g paperclip-mcp
```

### Docker / Podman

```bash
# Docker
docker run --rm -i \
  -e PAPERCLIP_API_URL=http://host.docker.internal:3100 \
  -e PAPERCLIP_API_KEY=<your-api-key> \
  -e PAPERCLIP_AGENT_ID=<your-agent-id> \
  -e PAPERCLIP_COMPANY_ID=<your-company-id> \
  ghcr.io/bruhsb/paperclip-mcp:2.1.0

# Podman (same flags, replace docker → podman)
podman run --rm -i \
  -e PAPERCLIP_API_URL=http://host.containers.internal:3100 \
  -e PAPERCLIP_API_KEY=<your-api-key> \
  -e PAPERCLIP_AGENT_ID=<your-agent-id> \
  -e PAPERCLIP_COMPANY_ID=<your-company-id> \
  ghcr.io/bruhsb/paperclip-mcp:2.1.0
```

### Compose stack (v2.1.0+)

Run the full Paperclip server + MCP server together via `podman-compose` (or `docker-compose`):

```bash
podman-compose up -d
```

See [`docs/guides/local-stack.md`](docs/guides/local-stack.md) for the full compose setup, volume config, and health-check instructions.

## Host integration

paperclip-mcp works with any MCP-compatible host. Platform-specific config files are in [`docs/installation/`](docs/installation/):

| Host           | Guide                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Claude Code    | [`docs/installation/claude-code.md`](docs/installation/claude-code.md)       |
| Claude Desktop | [`docs/installation/claude-desktop.md`](docs/installation/claude-desktop.md) |
| Cursor         | [`docs/installation/cursor.md`](docs/installation/cursor.md)                 |
| VS Code        | [`docs/installation/vscode.md`](docs/installation/vscode.md)                 |
| Windsurf       | [`docs/installation/windsurf.md`](docs/installation/windsurf.md)             |

Each guide includes the exact config block, where to place it, and verification steps. Do not copy configs from this README — use the host-specific guides so you get the right file paths and format.

## Environment variables

| Variable               | Required | Description                                                  |
| ---------------------- | -------- | ------------------------------------------------------------ |
| `PAPERCLIP_API_KEY`    | Yes      | Bearer token for API authentication                          |
| `PAPERCLIP_API_URL`    | Yes      | Base URL of the Paperclip API (e.g. `http://127.0.0.1:3100`) |
| `PAPERCLIP_AGENT_ID`   | Yes      | UUID of the agent running this MCP server                    |
| `PAPERCLIP_COMPANY_ID` | Yes      | UUID of the company (used for company-scoped endpoints)      |
| `PAPERCLIP_RUN_ID`     | No       | Heartbeat run ID — injected by Paperclip during agent runs   |
| `PAPERCLIP_TASK_ID`    | No       | Task ID injected by Paperclip on @-mention wakes             |

## Tool catalog

<!-- TOOLS-START -->

| Domain                  | Tools   |
| ----------------------- | ------- |
| Identity                | 4       |
| Issues                  | 7       |
| Comments                | 3       |
| Documents               | 5       |
| Agents & Organization   | 17      |
| Dashboard               | 1       |
| Approvals               | 11      |
| Goals                   | 4       |
| Projects & Workspaces   | 8       |
| Activity & Costs        | 5       |
| Routines                | 9       |
| Attachments             | 4       |
| Labels                  | 2       |
| Companies               | 5       |
| Plugins                 | 6       |
| Secrets                 | 4       |
| Run Observability       | 3       |
| Feedback Traces         | 3       |
| Company Import / Export | 3       |
| **Total**               | **104** |

<!-- TOOLS-END -->

Full per-tool reference: [`docs/tools/`](docs/tools/README.md). Generated from Zod schemas — run `npm run docs:generate` to refresh.

## Authentication

paperclip-mcp authenticates every request with a Bearer token derived from `PAPERCLIP_API_KEY`. The agent identity (`PAPERCLIP_AGENT_ID`) and company scope (`PAPERCLIP_COMPANY_ID`) are resolved at startup — the server will exit immediately if any required variable is missing. For details on generating API keys and scoping them to a specific agent, see [`docs/auth-keys.md`](docs/auth-keys.md).

## Run ID injection

When `PAPERCLIP_RUN_ID` is set, the server automatically adds `X-Paperclip-Run-Id: <runId>` to all mutating requests (POST, PATCH, PUT, DELETE). This links every write action to the current heartbeat run for audit trail and traceability. No action is needed from the agent — injection is transparent.

## Error handling

All tool handlers catch API errors and return `isError: true` results. The `content[0].text` field contains a human-readable message.

| HTTP status | Behaviour                                        |
| ----------- | ------------------------------------------------ |
| 400         | `isError: true` with validation message          |
| 401 / 403   | `isError: true` with auth error                  |
| 404         | `isError: true` with not-found message           |
| 409         | `isError: true` with conflict message (no retry) |
| 5xx         | `isError: true` with server error message        |

## Architecture

**Entry flow:** `src/index.ts` creates an MCP `Server`, calls `registerAllTools(server)`, then connects a `StdioServerTransport` for JSON-RPC over stdio.

**Key modules:**

- `src/client.ts` — `PaperclipClient`: typed HTTP wrapper (`get`, `post`, `patch`, `put`, `delete`). Injects `Authorization` header and `X-Paperclip-Run-Id` on mutations.
- `src/auth.ts` — Reads env vars at startup (fail-fast on missing required vars).
- `src/errors.ts` — `PaperclipApiError` for non-2xx HTTP responses.
- `src/types.ts` — Shared domain types.
- `src/tools/index.ts` — Tool registry. Collects `ToolDefinition[]` arrays from each tool module into `ALL_TOOLS`, builds a dispatch map, and registers MCP `ListTools` / `CallTool` handlers.
- `src/tools/validation.ts` — `validate(zodSchema, args)` helper and shared Zod schemas.

## Documentation

- **End-user** — [`docs/README.md`](docs/README.md): quickstart, auth keys, troubleshooting, cookbook, host install guides, tool reference.
- **Contributor** — [`CONTRIBUTING.md`](CONTRIBUTING.md): branch strategy, PR flow, dev environment, and conventions for adding new tools.
- **Agent-orchestration** — [`AGENTS.md`](AGENTS.md): Paperclip-orchestrated agent protocol, BMAD integration, and heartbeat model.

## Skills

paperclip-mcp ships public Claude Code skills under `skills/` — `paperclip-triage-inbox`, `paperclip-close-epic`, `paperclip-audit-approvals`, `paperclip-release-flow`. Copy the relevant skill directory to `~/.claude/skills/` to use it in your Claude Code session. See [`skills/README.md`](skills/README.md) for the full list and usage notes.

## Development

| Task                 | Command                 |
| -------------------- | ----------------------- |
| Build                | `npm run build`         |
| Dev (live TS)        | `npm run dev`           |
| Start (compiled)     | `npm run start`         |
| Type-check only      | `npm run typecheck`     |
| Lint                 | `npm run lint`          |
| Format               | `npm run format`        |
| Format check         | `npm run format:check`  |
| Run all tests        | `npm run test`          |
| Regenerate tool docs | `npm run docs:generate` |
| Check doc links      | `npm run docs:check`    |

Branch strategy: `feature/*` → `main` (squash-merge via PR)

## Status & compatibility

| Component                                  | Version |
| ------------------------------------------ | ------- |
| MCP protocol (`@modelcontextprotocol/sdk`) | 1.29.0  |
| Node.js (minimum)                          | 22      |
| Paperclip API                              | v2      |

## Releases

Releases are automated. Squash-merge a PR to `main`; semantic-release handles version bumping, changelog generation, npm publish, and GitHub release creation. No manual publish step is needed.

To trigger a release, open a PR from your feature branch to `main`. Once merged, the `release.yml` workflow runs `npx semantic-release` automatically. The version bump is determined by the commit types since the last release:

- `fix:` commits → patch release
- `feat:` commits → minor release
- `BREAKING CHANGE:` commits → major release
- `chore:`, `docs:`, `test:` commits → no release

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contributor guide, including how to add new tools, branch naming, commit format, and PR process.

## Security

Please report security vulnerabilities via the process described in [`SECURITY.md`](SECURITY.md). Do not open public issues for security bugs.

## Links

- [Paperclip](https://paperclip.ing) — the control plane this MCP server wraps
- [Model Context Protocol](https://modelcontextprotocol.io) — the open protocol standard
- [npm package](https://www.npmjs.com/package/paperclip-mcp)
- [GitHub](https://github.com/bruhsb/paperclip-mcp)

## License

MIT
