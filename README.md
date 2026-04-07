# paperclip-mcp

Paperclip MCP server for Claude Code agents — exposes the Paperclip control plane API as MCP tools.

## Getting Started

### Prerequisites

- Node.js >= 20
- npm

### Install

```bash
npm install
```

### Development

```bash
cp .env.example .env
# edit .env with your credentials
npm run dev
```

### Build

```bash
npm run build
```

### Usage with Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "node",
      "args": ["/path/to/paperclip-mcp/dist/index.js"],
      "env": {
        "PAPERCLIP_API_URL": "http://127.0.0.1:3100",
        "PAPERCLIP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

## Documentation

Full documentation is in [`docs/`](docs/README.md):

- [Getting started](docs/guides/getting-started.md)
- [Configuration](docs/guides/configuration.md)
- [MCP tools reference](docs/reference/tools.md)
- [Architecture overview](docs/architecture/overview.md)

To check for broken links locally:

```bash
npm run docs:check
```

## Project Structure

```
src/
  index.ts        — Server entry point and tool registration
dist/             — Compiled JavaScript (generated, not committed)
.github/
  workflows/
    ci.yml        — CI pipeline (type-check, lint, format, build)
```

## Scripts

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `npm run build`        | Compile TypeScript to `dist/`    |
| `npm run dev`          | Run with `tsx` (no compile step) |
| `npm run typecheck`    | Type-check without emitting      |
| `npm run lint`         | ESLint                           |
| `npm run format`       | Prettier (write)                 |
| `npm run format:check` | Prettier (check only)            |

## Contributing

Branch strategy: `feature/*` → `develop` → `main`

## License

MIT
