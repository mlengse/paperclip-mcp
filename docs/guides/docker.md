# Running paperclip-mcp in a Container

paperclip-mcp ships a production-ready `Dockerfile` that builds a lean, non-root image
suitable for use with Podman or Docker. The image is designed for MCP stdio transport:
no network ports are exposed, and the process communicates exclusively over stdin/stdout.

## Building the image

```bash
# Podman (recommended per project convention)
podman build -t paperclip-mcp:2.0.0 -t paperclip-mcp:latest .

# Or via npm script
npm run docker:build

# Docker is also supported (same Dockerfile)
docker build -t paperclip-mcp:2.0.0 -t paperclip-mcp:latest .
```

The build uses two stages:

1. **builder** — `node:22-slim` (glibc). Installs all dependencies (including devDependencies) and compiles TypeScript via `tsc`.
2. **runtime** — `node:22-alpine` (musl, hardened). Installs production-only dependencies (`npm ci --omit=dev --ignore-scripts`), copies `dist/`, and drops to a non-root `mcp` user. Both `@modelcontextprotocol/sdk` and `zod` are pure JS — no native compilation is needed, making musl fully compatible.

Typical final image size: ~186 MB (`node:22-alpine` runtime base).

### Hardening and CVE posture

The runtime stage is built on `node:22-alpine`, which carries **0 OS-layer CVEs** at release time (verified with Trivy). The only findings Trivy reports are in `npm`'s own bundled node_modules (`/usr/local/lib/node_modules/npm/`), which are not part of the application and are not reachable from a stdio-only MCP server.

See [`docs/security/trivy-report.md`](../security/trivy-report.md) for the full scan report and reproducibility instructions.

## Running via `.mcp.json`

Add paperclip-mcp to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "paperclip": {
      "command": "podman",
      "args": [
        "run",
        "-i",
        "--rm",
        "--network=host",
        "-e",
        "PAPERCLIP_API_KEY",
        "-e",
        "PAPERCLIP_API_URL",
        "-e",
        "PAPERCLIP_AGENT_ID",
        "-e",
        "PAPERCLIP_COMPANY_ID",
        "paperclip-mcp:2.0.0"
      ],
      "env": {
        "PAPERCLIP_API_KEY": "your-api-key-here",
        "PAPERCLIP_API_URL": "http://127.0.0.1:3100",
        "PAPERCLIP_AGENT_ID": "your-agent-uuid-here",
        "PAPERCLIP_COMPANY_ID": "your-company-uuid-here"
      }
    }
  }
}
```

The `-e KEY` form (without `=value`) passes the value from the outer `env` map into the
container without embedding the secret in the `args` array — keep secrets in `env`, not `args`.

### Optional env vars

| Variable               | Default      | Purpose                                        |
| ---------------------- | ------------ | ---------------------------------------------- |
| `PAPERCLIP_API_KEY`    | — (required) | Bearer token for the Paperclip API             |
| `PAPERCLIP_API_URL`    | — (required) | Base URL, e.g. `http://127.0.0.1:3100`         |
| `PAPERCLIP_AGENT_ID`   | — (required) | UUID of the agent running this MCP session     |
| `PAPERCLIP_COMPANY_ID` | — (required) | UUID of the Paperclip company/tenant           |
| `PAPERCLIP_RUN_ID`     | _(auto)_     | Optional execution run ID for mutation tracing |

## Networking

### Local Paperclip server (`--network=host`)

When the Paperclip API runs on the same host (e.g. `http://127.0.0.1:3100`), use
`--network=host` so the container can reach the host's loopback interface:

```bash
podman run -i --rm --network=host \
  -e PAPERCLIP_API_KEY=... \
  -e PAPERCLIP_API_URL=http://127.0.0.1:3100 \
  -e PAPERCLIP_AGENT_ID=... \
  -e PAPERCLIP_COMPANY_ID=... \
  paperclip-mcp:2.0.0
```

### Remote Paperclip server (explicit networking)

When connecting to a remote API, omit `--network=host` and set `PAPERCLIP_API_URL` to
the full public URL:

```bash
podman run -i --rm \
  -e PAPERCLIP_API_KEY=... \
  -e PAPERCLIP_API_URL=https://api.yourpaperclip.example.com \
  -e PAPERCLIP_AGENT_ID=... \
  -e PAPERCLIP_COMPANY_ID=... \
  paperclip-mcp:2.0.0
```

## Security

- **Non-root execution:** The image creates a dedicated `mcp` user (uid 1001) and runs
  the Node.js process as that user. Root access is never required at runtime.
- **No capabilities:** The process requires no Linux capabilities; run with `--cap-drop=all`
  for maximum hardening if your runtime supports it.
- **No network ports:** The image has no `EXPOSE` directive. The MCP server communicates
  exclusively via stdio — there is no inbound network attack surface.
- **Minimal runtime image:** Only `dist/`, production `node_modules`, and `tini`
  are present in the final stage. DevDependencies, test files, source TypeScript, and
  the `.husky/` hooks are excluded.
- **Alpine base:** The `node:22-alpine` runtime base carries 0 OS-layer CVEs at release
  time. Consumers can verify this with:

  ```bash
  trivy image --severity HIGH,CRITICAL paperclip-mcp:2.0.0
  ```

  See [`docs/security/trivy-report.md`](../security/trivy-report.md) for the baseline report.

## Signal handling

`tini` runs as PID 1 (via `ENTRYPOINT ["/sbin/tini", "--", "node", "dist/index.js"]`) and
forwards `SIGTERM` to the Node.js process, which the MCP SDK translates into a clean
shutdown (drain in-flight requests, close the stdio transport). This ensures that
`podman stop` or `docker stop` results in a graceful exit rather than a hard `SIGKILL`
after the stop timeout.

`tini` is installed from Alpine's official package registry (`apk add --no-cache tini`)
and is functionally equivalent to `dumb-init` for this use case.

## Smoke testing the image

After building, verify the image boots and enumerates tools correctly:

```bash
# Via npm script (requires Node.js on host)
npm run docker:smoke

# Or directly
node scripts/smoke-docker.mjs paperclip-mcp:2.0.0

# Use Docker instead of Podman
CONTAINER_RUNTIME=docker node scripts/smoke-docker.mjs paperclip-mcp:2.0.0
```

The smoke test sends an MCP initialize handshake followed by `tools/list` and asserts
that the response contains 100+ tools.
