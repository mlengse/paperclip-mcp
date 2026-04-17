# Cursor

Use this guide when you are running paperclip-mcp as an MCP server inside Cursor.

## Config file location

| Scope   | Path                                                     |
| ------- | -------------------------------------------------------- |
| Project | `.cursor/mcp.json` in your project root                  |
| Global  | Cursor User Settings → MCP (GUI or `~/.cursor/mcp.json`) |

Use the project-scoped file to keep the config version-controlled alongside your code. Use the global location to share it across all projects.

## Environment variables

| Variable                       | Required | Description                                                              |
| ------------------------------ | -------- | ------------------------------------------------------------------------ |
| `PAPERCLIP_API_KEY`            | Yes      | Bearer token for API authentication                                      |
| `PAPERCLIP_API_URL`            | Yes      | Base URL of the Paperclip API (e.g. `http://127.0.0.1:3100`)             |
| `PAPERCLIP_AGENT_ID`           | Yes      | UUID of the agent running this MCP server                                |
| `PAPERCLIP_COMPANY_ID`         | Yes      | UUID of the company (used for company-scoped endpoints)                  |
| `PAPERCLIP_RUN_ID`             | No       | Heartbeat run ID — injected automatically by Paperclip during agent runs |
| `PAPERCLIP_REQUEST_TIMEOUT_MS` | No       | HTTP request timeout in milliseconds (default: `30000`)                  |

## Configuration

**npm variant** (recommended — requires Node.js >= 20 on the host):

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

**Docker/Podman variant** (isolated runtime, no Node.js required on the host):

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

Replace `podman` with `docker` in `command` if you are using Docker instead.

## After editing

Reload the MCP server in Cursor: open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Cursor: Reload MCP Servers**, or restart Cursor.

## Verification

Open a Cursor chat and ask:

> "What paperclip tools do you have?"

Expect **104 tools** listed. If the count is lower or the server does not appear, see [../troubleshooting.md](../troubleshooting.md).

## See also

- [../troubleshooting.md](../troubleshooting.md) — server not connecting, auth errors, network issues
- [../auth-keys.md](../auth-keys.md) — how to obtain and rotate your API key
