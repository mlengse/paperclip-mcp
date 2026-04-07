# Configuration

Paperclip MCP is configured via environment variables. These can be set in a `.env` file (development) or injected by the MCP host (production).

## Environment variables

| Variable            | Required | Description                                                                |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `PAPERCLIP_API_URL` | Yes      | Base URL of the Paperclip control plane API (e.g. `http://127.0.0.1:3100`) |
| `PAPERCLIP_API_KEY` | Yes      | API key or short-lived run JWT for authentication                          |

## Authentication

The server uses Bearer token authentication. Every request to the Paperclip API includes:

```
Authorization: Bearer $PAPERCLIP_API_KEY
```

In heartbeat runs, the API key is a short-lived JWT injected by the Paperclip runtime. For standalone usage, supply a long-lived API key from your Paperclip account settings.

## MCP host configuration

When running under Claude Code, pass the variables through the MCP server `env` block rather than a `.env` file:

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "PAPERCLIP_API_URL": "https://your-paperclip-instance",
        "PAPERCLIP_API_KEY": "<token>"
      }
    }
  }
}
```

## Related

- [Getting started](getting-started.md)
- [Architecture overview](../architecture/overview.md)
