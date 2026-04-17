# Installation — Host Guides

Per-host setup guides for paperclip-mcp. Each guide covers both the npm (`npx`) and container (`podman`/`docker`) variants side-by-side.

| Host           | Config path                                                                                                                         | Guide                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Claude Code    | `~/.claude/settings.json` or `.claude/settings.json`                                                                                | [claude-code.md](claude-code.md)                     |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) · `%APPDATA%\Claude\claude_desktop_config.json` (Windows) | [claude-desktop.md](claude-desktop.md)               |
| Cursor         | `.cursor/mcp.json` (project) or global User Settings                                                                                | [cursor.md](cursor.md)                               |
| VS Code        | `.vscode/mcp.json` (workspace) or user `mcp.servers` setting                                                                        | [vscode.md](vscode.md)                               |
| Windsurf       | See Windsurf MCP docs — same `mcpServers` shape as Cursor                                                                           | [windsurf.md](windsurf.md)                           |
| Other (stdio)  | Any host that accepts `command` + `args` + `env`                                                                                    | [vscode.md](vscode.md) (use the JSON block directly) |

## Related

- [../troubleshooting.md](../troubleshooting.md) — common errors and fixes
- [../auth-keys.md](../auth-keys.md) — how to obtain and rotate API keys
- [../guides/configuration.md](../guides/configuration.md) — all environment variables
