# Running Paperclip Locally with podman-compose

This guide covers running the Paperclip control plane on your local machine using the
provided compose files. The default stack runs a single `paperclip` container with an
embedded PGlite database — no external database required. An optional `external-db`
profile adds a PostgreSQL container for teams that need a durable relational backend.

---

## Prerequisites

| Requirement                         | Minimum version | Check                      |
| ----------------------------------- | --------------- | -------------------------- |
| Podman                              | 3.4             | `podman --version`         |
| podman-compose                      | 1.0             | `podman-compose --version` |
| Docker (alternative)                | 20.10           | `docker --version`         |
| docker compose plugin (alternative) | v2.1            | `docker compose version`   |
| RAM                                 | 2 GB free       | —                          |
| Disk                                | 1 GB free       | —                          |

> **Podman < 3.4:** `network_mode: host` has known limitations in rootless mode.
> Upgrade Podman before proceeding.

---

## Quickstart

```bash
# 1. Copy the example env file and open it in your editor.
cp .env.example .env
$EDITOR .env

# 2. Set BETTER_AUTH_SECRET to any string >= 32 characters.
#    The server will not start without it — even in local_trusted mode.
#    Example (generate a strong secret):
#      openssl rand -base64 32

# 3. Start the stack (embedded PGlite, no external database).
podman-compose -f podman-compose.yaml up -d

# 4. Verify the server is healthy.
curl -s http://localhost:3100/api/health
# Expected: HTTP 200 with a JSON body indicating healthy status.
```

The server is ready when `curl` returns 200. First boot applies database migrations;
allow up to 30 seconds on slower machines.

---

## Default stack vs external-db profile

### Default (embedded PGlite)

The default stack runs a single service (`paperclip`) with an embedded PGlite
database stored inside the `paperclip-data` named volume. No database credentials
or `DATABASE_URL` are needed.

```bash
podman-compose -f podman-compose.yaml up -d
```

### External PostgreSQL (`--profile external-db`)

The `external-db` profile adds a `postgres` service. Paperclip connects to it via
`DATABASE_URL`. Use this when you need a full relational backend — for example,
for larger teams or when you want to inspect the database directly.

**Before switching from embedded to external PostgreSQL:** start with a fresh
`paperclip-data` volume. Existing embedded PGlite data is NOT automatically migrated
to PostgreSQL. Wipe both volumes together if you are switching modes.

```bash
# In .env, set (uncommenting if needed):
#   BETTER_AUTH_SECRET=<32+ chars>
#   DATABASE_URL=postgres://paperclip:CHANGE_ME@127.0.0.1:5432/paperclip
#   POSTGRES_PASSWORD=CHANGE_ME
#   POSTGRES_USER=paperclip  # default
#   POSTGRES_DB=paperclip    # default

podman-compose -f podman-compose.yaml --profile external-db up -d
```

Both `paperclip` and `postgres` run with `network_mode: host`, so Paperclip
reaches Postgres on `127.0.0.1:${POSTGRES_PORT:-5432}` without any port
publishing. Starting both services together is safe: Paperclip has built-in
retry logic and connects as soon as Postgres is ready (typically ~5–10s of
`ECONNREFUSED` log noise before the first successful migration query —
harmless and self-recovering).

---

## Version upgrade procedure

1. Check [github.com/paperclipai/paperclip/releases](https://github.com/paperclipai/paperclip/releases)
   for the new release.
2. Find the git SHA for the release tag and confirm the `sha-*` tag exists on GHCR:
   ```bash
   skopeo list-tags docker://ghcr.io/paperclipai/paperclip | grep <short-sha>
   ```
3. Update `PAPERCLIP_VERSION` in `.env` (and `.env.example` if committing the pin).
4. Pull and restart:
   ```bash
   podman-compose -f podman-compose.yaml pull
   podman-compose -f podman-compose.yaml up -d
   ```

---

## Common operations

```bash
# Tail logs for the paperclip service
podman-compose -f podman-compose.yaml logs -f paperclip

# Restart the paperclip service
podman-compose -f podman-compose.yaml restart paperclip

# Open a shell inside the running container
podman exec -it paperclip sh

# List pulled images
podman images | grep paperclip

# List named volumes
podman volume ls | grep paperclip
```

---

## Cleanup

```bash
# Stop and remove containers (volumes are preserved — data is safe).
podman-compose -f podman-compose.yaml down

# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
# WARNING: -v removes ALL named volumes. This deletes the embedded database,
# uploaded files, secrets, and workspace data. You will start with a blank
# Paperclip installation on the next `up`. This cannot be undone.
# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
podman-compose -f podman-compose.yaml down -v
```

If you use the `external-db` profile, always wipe **both** `paperclip-data` and
`paperclip-pg-data` together (or neither). The `master.key` stored in
`paperclip-data` must match the encrypted secrets in the database. Partial wipes
will break secret decryption on restart.

---

## MCP client configuration

`paperclip-mcp` is not a compose service — it is a stdio subprocess spawned by
Claude Code's MCP client. It communicates with the running Paperclip server over
HTTP on `http://127.0.0.1:3100`.

Add the following to your Claude Code `.mcp.json`:

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
        "PAPERCLIP_API_URL=http://127.0.0.1:3100",
        "-e",
        "PAPERCLIP_AGENT_ID",
        "-e",
        "PAPERCLIP_COMPANY_ID",
        "ghcr.io/bruhsb/paperclip-mcp:2.1.0"
      ],
      "env": {
        "PAPERCLIP_API_KEY": "<your-agent-key>",
        "PAPERCLIP_AGENT_ID": "<your-agent-uuid>",
        "PAPERCLIP_COMPANY_ID": "<your-company-uuid>"
      }
    }
  }
}
```

`--network=host` is required so the containerized MCP process can reach
`http://127.0.0.1:3100` on the host loopback. The image tag should match
`MCP_VERSION` in your `.env`.

---

## Docker alternative

If you prefer Docker, use the compatibility file:

```bash
# Default stack
docker compose -f docker-compose.yaml up -d

# With external PostgreSQL
docker compose -f docker-compose.yaml --profile external-db up -d
```

The `docker-compose.yaml` file is identical to `podman-compose.yaml` except that
volume mounts omit the `:Z` SELinux label (not needed on Docker Desktop).

---

## Troubleshooting

### Server fails to start: auth-secret error

```
BETTER_AUTH_SECRET (or PAPERCLIP_AGENT_JWT_SECRET) must be set.
```

`BETTER_AUTH_SECRET` is mandatory in all deployment modes, including `local_trusted`.
Set it in `.env` to any string of at least 32 characters. This is not optional.

### Port conflict on 3100

Another process is already listening on port 3100. Find and stop it:

```bash
ss -tlnp | grep 3100
# or
lsof -i :3100
```

Alternatively, change `PORT` in `.env` and update `PAPERCLIP_API_URL` to match.

### Rootless UID mismatch (permission denied on volume)

If you see `EACCES: permission denied, mkdir '/paperclip/...'` in container logs, the
volume mount path or ownership is incorrect. The Paperclip image's entrypoint (`gosu`)
runs the server as the `node` user (UID 1000), and embedded PostgreSQL refuses to start
as root.

**Cause:** The volume is mounted at the wrong path, or the image's data directory
(`/paperclip`) is being shadowed by a mount at `/root/.paperclip` which is only
accessible to root inside the container.

**Fix:** Ensure `PAPERCLIP_HOME=/paperclip` (the default in the provided compose files)
and that the volume mounts at `/paperclip`, not `/root/.paperclip`. The `/paperclip`
directory is pre-owned by the `node` user in the image, so named volumes require no
extra chown step.

```bash
# If you see permission errors, try a clean start:
podman-compose -f podman-compose.yaml down -v
podman-compose -f podman-compose.yaml up -d
```

### Healthcheck failing / container stuck in `(health: starting)`

First boot runs all database migrations. Allow up to 30 seconds (`start_period: 30s`
is set in the healthcheck). If the container remains unhealthy after 2–3 minutes:

```bash
# Check logs for startup errors
podman logs paperclip

# Manually test the health endpoint
podman exec paperclip wget -qO- http://127.0.0.1:3100/api/health
```

Common causes: missing `BETTER_AUTH_SECRET`, `DATABASE_URL` pointing to an
unreachable host, or a stale volume from a failed previous run (try `down -v` for a
clean start).

### SELinux permission denied (Fedora / RHEL)

If Podman reports an SELinux denial when accessing the volume, verify that the volume
mounts in `podman-compose.yaml` include `:Z`. The `:Z` label sets the SELinux private
unshared context on the volume's backing directory. It is present in the provided
`podman-compose.yaml` by default.
