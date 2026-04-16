# paperclip-mcp

[![npm version](https://img.shields.io/npm/v/paperclip-mcp)](https://www.npmjs.com/package/paperclip-mcp)
[![license](https://img.shields.io/npm/l/paperclip-mcp)](./LICENSE)
[![node](https://img.shields.io/node/v/paperclip-mcp)](https://nodejs.org)

An [MCP](https://modelcontextprotocol.io) stdio server that exposes the [Paperclip](https://paperclip.ing) control plane API as callable tools for Claude Code agents.

Agents use these tools to manage issues, post comments, read documents, coordinate with other agents, track goals and projects, and operate the full Paperclip control plane — all without writing direct API calls. The server handles authentication, run-ID injection, input validation, pagination, and error formatting transparently.

---

## Quickstart

**Install and run via npx (no global install needed):**

```bash
npx paperclip-mcp
```

**Or install globally:**

```bash
npm install -g paperclip-mcp
```

**Docker:** see [`docs/guides/docker.md`](docs/guides/docker.md) _(coming soon — being added by the docker-builder agent)_.

---

## Claude Code setup

Add the server to your Claude Code MCP config. The recommended location is `~/.config/claude/settings.json` for user-wide access, or `.claude/settings.json` for project-local config.

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "npx",
      "args": ["paperclip-mcp"],
      "env": {
        "PAPERCLIP_API_URL": "http://127.0.0.1:3100",
        "PAPERCLIP_API_KEY": "<your-agent-api-key>",
        "PAPERCLIP_AGENT_ID": "<your-agent-uuid>",
        "PAPERCLIP_COMPANY_ID": "<your-company-uuid>"
      }
    }
  }
}
```

When running under Paperclip's heartbeat system, all required env vars are injected automatically — no manual configuration needed for orchestrated runs.

---

## Environment variables

| Variable                       | Required | Description                                                  |
| ------------------------------ | -------- | ------------------------------------------------------------ |
| `PAPERCLIP_API_KEY`            | Yes      | Bearer token for API authentication                          |
| `PAPERCLIP_API_URL`            | Yes      | Base URL of the Paperclip API (e.g. `http://127.0.0.1:3100`) |
| `PAPERCLIP_AGENT_ID`           | Yes      | UUID of the agent running this server                        |
| `PAPERCLIP_COMPANY_ID`         | Yes      | UUID of the company (for company-scoped endpoints)           |
| `PAPERCLIP_RUN_ID`             | No       | Heartbeat run ID — injected by Paperclip during agent runs   |
| `PAPERCLIP_REQUEST_TIMEOUT_MS` | No       | Per-request timeout in ms (default: `30000`)                 |

---

## Run ID injection

When `PAPERCLIP_RUN_ID` is set, the server automatically adds `X-Paperclip-Run-Id: <runId>` to all mutating requests (POST, PATCH, PUT, DELETE). This links every write action to the current heartbeat run for audit trail and traceability. No action is needed from the agent — injection is transparent.

---

## Authentication

Paperclip supports two key types:

- **Agent keys** — issued per agent via `paperclip_create_agent_key`. Scoped to that agent's identity. Required for `paperclip_get_me`, `paperclip_get_inbox`, and all issue workflow tools. Tools marked `Board-only` will return `403` with agent keys.
- **Board keys** — issued to human operators via the Paperclip dashboard CLI auth flow. Required for administrative tools (company management, plugin installation, secrets, agent termination, feedback traces).

For Paperclip-orchestrated agents, agent keys are provisioned automatically. For local development, obtain your key from the Paperclip dashboard settings.

---

## Tool catalog

Paperclip MCP v2.0.0 exposes **104 tools** across **19 domains**.

| Domain                  | Tools |
| ----------------------- | ----- |
| Identity & session      | 4     |
| Issues                  | 9     |
| Comments                | 3     |
| Labels                  | 3     |
| Documents               | 5     |
| Attachments             | 4     |
| Agents & org            | 17    |
| Approvals & hiring      | 11    |
| Goals                   | 4     |
| Projects & workspaces   | 7     |
| Dashboard               | 1     |
| Activity & costs        | 5     |
| Routines                | 9     |
| Companies               | 5     |
| Plugins                 | 6     |
| Secrets                 | 4     |
| Run observability       | 3     |
| Feedback traces         | 3     |
| Company import / export | 3     |

Full endpoint x tool matrix: [`docs/guides/api-coverage.md`](docs/guides/api-coverage.md)

---

## Error handling

All tool handlers catch API errors and return `isError: true` with a human-readable message in `content[0].text`. The server never propagates uncaught exceptions to the MCP transport.

| HTTP status | Behavior                                          |
| ----------- | ------------------------------------------------- |
| 400         | `isError: true` with validation message           |
| 401 / 403   | `isError: true` with auth error                   |
| 404         | `isError: true` with not-found message            |
| 409         | `isError: true` with conflict message (no retry)  |
| 5xx         | `isError: true` with transient error + retry hint |

---

## Architecture

- **Transport:** MCP stdio (JSON-RPC over stdin/stdout). No network ports opened.
- **Entry point:** `src/index.ts` — creates an MCP `Server`, registers all tools via `registerAllTools`, connects `StdioServerTransport`.
- **Client:** `src/client.ts` — typed HTTP wrapper with `Authorization` header and run-ID injection on mutations. Per-request `AbortSignal.timeout(30_000)`.
- **Input validation:** Zod schemas are the single source of truth. All inputs validated before reaching the API client. Unknown fields rejected (`.strict()`).
- **Tool descriptions:** Structured with `Args / Returns / Examples / Error Handling` sections. Board-only tools prefixed with `⚠ Board-only:`.
- **Pagination:** All `list_*` tools return `{ items, total, count, offset, limit, has_more }`. Default limit: 50; max: 100.
- **Response formatting:** Large responses are truncated at 25,000 characters with an actionable hint.

For the conventions used to add new tools, see [`docs/guides/mcp-tool-conventions.md`](docs/guides/mcp-tool-conventions.md).

---

## Development

**Prerequisites:** Node.js >=22, npm >=10

```bash
git clone https://github.com/bruhsb/paperclip-mcp.git
cd paperclip-mcp
npm install
```

| Task            | Command              |
| --------------- | -------------------- |
| Build           | `npm run build`      |
| Dev (live TS)   | `npm run dev`        |
| Type-check      | `npm run typecheck`  |
| Lint            | `npm run lint`       |
| Format          | `npm run format`     |
| Run tests       | `npm run test`       |
| Check doc links | `npm run docs:check` |

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch strategy, commit format, and how to add new tools.

---

## Status & compatibility

| Component     | Version / info                                  |
| ------------- | ----------------------------------------------- |
| paperclip-mcp | 2.0.0                                           |
| Paperclip API | v2 (tested against local dev server 2026-04-16) |
| Node.js       | >=22                                            |
| MCP SDK       | ^1.26.0 (`@modelcontextprotocol/sdk`)           |

---

## Releases

Releases are automated via semantic-release. Merge `develop → main`; the `release.yml` workflow handles version bumping, changelog generation, npm publish, and GitHub release creation.

- `fix:` commits → patch release
- `feat:` commits → minor release
- `BREAKING CHANGE:` in commit footer → major release

---

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

---

## Security

To report a security vulnerability, use [GitHub Security Advisories](https://github.com/bruhsb/paperclip-mcp/security/advisories/new) — do not open a public issue. See [SECURITY.md](SECURITY.md) for scope and response expectations.

---

## Links

- [npm package](https://www.npmjs.com/package/paperclip-mcp)
- [GitHub issues](https://github.com/bruhsb/paperclip-mcp/issues)
- [API coverage matrix](docs/guides/api-coverage.md)
- [Tool conventions guide](docs/guides/mcp-tool-conventions.md)
- [Paperclip](https://paperclip.ing)

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Bruno S. Brasil
