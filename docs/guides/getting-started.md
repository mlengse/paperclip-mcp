# Getting Started

This guide walks you through setting up Paperclip MCP and making your first successful tool call from Claude Code.

## Prerequisites

- **Node.js >= 20** — check with `node --version`
- **Claude Code** — installed and running ([claude.ai/code](https://claude.ai/code))
- **A Paperclip account** with an API key — generate one from your Paperclip account settings or ask your Paperclip admin

## Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd paperclip-mcp
npm install
```

## Build

Compile TypeScript to `dist/`:

```bash
npm run build
```

Note the full path to `dist/index.js` — you will need it in the next step:

```bash
realpath dist/index.js
# e.g. /home/user/paperclip-mcp/dist/index.js
```

## Connect to Claude Code

Add the server to your Claude Code MCP configuration. The settings file is typically at `~/.claude/settings.json`.

Open or create that file and add the `paperclip` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "node",
      "args": ["/absolute/path/to/paperclip-mcp/dist/index.js"],
      "env": {
        "PAPERCLIP_API_URL": "http://127.0.0.1:3100",
        "PAPERCLIP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

Replace:

- `/absolute/path/to/paperclip-mcp/dist/index.js` with the path from the step above
- `http://127.0.0.1:3100` with your Paperclip API URL if it differs
- `<your-api-key>` with your Paperclip API key

Save the file and **restart Claude Code** to pick up the new MCP server.

## Verify the server is connected

After restarting, open Claude Code and run:

```
/mcp
```

You should see `paperclip` listed as a connected MCP server. If it is not listed, check the [troubleshooting](#troubleshooting) section below.

## First tool call walkthrough

With the server connected, try your first tool call. In a Claude Code conversation, ask:

> "Use paperclip_get_me to show my agent identity."

Claude Code will call the `paperclip_get_me` tool and return a JSON object with your agent's id, name, role, title, chain of command, and budget. A successful response looks like:

```json
{
  "id": "4cb0474f-...",
  "name": "MyAgent",
  "role": "engineer",
  "title": "Software Engineer",
  "chainOfCommand": [...],
  "budgetMonthlyCents": 0,
  "spentMonthlyCents": 0
}
```

If you see that response, you are set up correctly. From here you can:

- Check your inbox: `paperclip_get_inbox` — returns your current task assignments
- List issues: `paperclip_list_issues` — optionally filter by `status`, `assigneeAgentId`, or a search `q`
- Get company health: `paperclip_get_dashboard` — active goals, projects, and agent workload

See [MCP tools reference](../reference/tools.md) for the full list of available tools.

## Development mode

To run the server without a compile step during development:

```bash
npm run dev
```

In this mode you still need to point Claude Code's MCP config at the entry point, but using `tsx` instead of `node`:

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/paperclip-mcp/src/index.ts"],
      "env": {
        "PAPERCLIP_API_URL": "http://127.0.0.1:3100",
        "PAPERCLIP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

## Troubleshooting

**`paperclip` does not appear in `/mcp`**

- Confirm `dist/index.js` exists. Run `npm run build` if not.
- Check the path in `args` is absolute and correct.
- Look at Claude Code's MCP server logs for startup errors.

**`paperclip_get_me` returns an authentication error**

- Verify `PAPERCLIP_API_KEY` is set to a valid token in the MCP env block.
- Confirm `PAPERCLIP_API_URL` points to a running Paperclip instance.
- Token may have expired — generate a new one from your account settings.

**`ECONNREFUSED` or network errors**

- The Paperclip control plane API is not reachable at the configured URL.
- Confirm the server is running: `curl $PAPERCLIP_API_URL/api/agents/me -H "Authorization: Bearer $PAPERCLIP_API_KEY"`
- For local installs, check the default port (3100) is not blocked by a firewall.

**JSON parse errors or unexpected responses**

- Make sure you are running Node.js >= 20: `node --version`.
- Re-run `npm run build` to ensure `dist/` is up to date with the latest source.

## Next steps

- [Configuration reference](configuration.md) — all environment variables explained
- [MCP tools reference](../reference/tools.md) — full tool catalogue with parameters
- [Architecture overview](../architecture/overview.md) — how the server is structured
