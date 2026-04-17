# Claude Code

Use this guide when you are running paperclip-mcp as an MCP server inside Claude Code — either for local development or for Paperclip-orchestrated agent runs.

## Environment variables

| Variable                       | Required | Description                                                              |
| ------------------------------ | -------- | ------------------------------------------------------------------------ |
| `PAPERCLIP_API_KEY`            | Yes      | Bearer token for API authentication                                      |
| `PAPERCLIP_API_URL`            | Yes      | Base URL of the Paperclip API (e.g. `http://127.0.0.1:3100`)             |
| `PAPERCLIP_AGENT_ID`           | Yes      | UUID of the agent running this MCP server                                |
| `PAPERCLIP_COMPANY_ID`         | Yes      | UUID of the company (used for company-scoped endpoints)                  |
| `PAPERCLIP_RUN_ID`             | No       | Heartbeat run ID — injected automatically by Paperclip during agent runs |
| `PAPERCLIP_REQUEST_TIMEOUT_MS` | No       | HTTP request timeout in milliseconds (default: `30000`)                  |

## Option A — CLI (`claude mcp add`)

Run one of the commands below once. Claude Code writes the config entry for you.

**npm variant** (recommended for most users — no install required):

```bash
claude mcp add paperclip \
  -e PAPERCLIP_API_KEY=YOUR_API_KEY \
  -e PAPERCLIP_API_URL=YOUR_API_URL \
  -e PAPERCLIP_AGENT_ID=YOUR_AGENT_ID \
  -e PAPERCLIP_COMPANY_ID=YOUR_COMPANY_ID \
  -- npx -y paperclip-mcp
```

**Docker/Podman variant** (isolated runtime, no Node.js required on the host):

```bash
claude mcp add paperclip \
  -- podman run -i --rm \
  -e PAPERCLIP_API_KEY=YOUR_API_KEY \
  -e PAPERCLIP_API_URL=YOUR_API_URL \
  -e PAPERCLIP_AGENT_ID=YOUR_AGENT_ID \
  -e PAPERCLIP_COMPANY_ID=YOUR_COMPANY_ID \
  ghcr.io/bruhsb/paperclip-mcp:2.1.0
```

Replace `podman` with `docker` if you are using Docker instead.

## Option B — settings.json

Add the `paperclip` entry under `mcpServers` in `~/.claude/settings.json` (global) or `.claude/settings.json` (project-scoped). Create the file if it does not exist.

**npm variant:**

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "npx",
      "args": ["-y", "paperclip-mcp"],
      "env": {
        "PAPERCLIP_API_KEY": "YOUR_API_KEY",
        "PAPERCLIP_API_URL": "YOUR_API_URL",
        "PAPERCLIP_AGENT_ID": "YOUR_AGENT_ID",
        "PAPERCLIP_COMPANY_ID": "YOUR_COMPANY_ID"
      }
    }
  }
}
```

**Docker/Podman variant:**

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "podman",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "PAPERCLIP_API_KEY=YOUR_API_KEY",
        "-e",
        "PAPERCLIP_API_URL=YOUR_API_URL",
        "-e",
        "PAPERCLIP_AGENT_ID=YOUR_AGENT_ID",
        "-e",
        "PAPERCLIP_COMPANY_ID=YOUR_COMPANY_ID",
        "ghcr.io/bruhsb/paperclip-mcp:2.1.0"
      ]
    }
  }
}
```

Replace `podman` with `docker` in both `command` and the equivalent args if you are using Docker.

> For Paperclip heartbeat runs, `PAPERCLIP_RUN_ID` is injected automatically — no manual entry needed.

## Verification

After saving the config, restart Claude Code (or run `/mcp` to reload servers), then ask:

> "What paperclip tools do you have?"

Expect **104 tools** listed. If the count is lower or the server does not appear, see [../troubleshooting.md](../troubleshooting.md).

## See also

- [../troubleshooting.md](../troubleshooting.md) — server not connecting, auth errors, network issues
- [../auth-keys.md](../auth-keys.md) — how to obtain and rotate your API key
