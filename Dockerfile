# syntax=docker/dockerfile:1

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
# Install all dependencies (dev + prod) and compile TypeScript.
# Uses node:22-slim (glibc) for full toolchain compatibility with tsc and npm.
FROM node:22-slim AS builder

WORKDIR /app

# Copy manifests first — leverages layer cache on unchanged deps.
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for tsc).
# --ignore-scripts prevents husky / postinstall hooks from running in CI/container.
RUN npm ci --ignore-scripts

# Copy source and compile.
COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc --project tsconfig.json

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
# node:22-alpine: ~115 MB compressed, musl libc, no bundled npm after --omit=dev
# install, minimal attack surface. Both @modelcontextprotocol/sdk and zod are
# pure JS — no native compilation needed, musl is fully compatible.
# tini (Alpine's built-in init) replaces dumb-init for SIGTERM forwarding.
FROM node:22-alpine AS runtime

# tini: minimal PID-1 init that forwards SIGTERM → Node and reaps zombies.
# apk keeps no package cache after install, so no extra layer to clean up.
RUN apk add --no-cache tini

WORKDIR /app

# Create a dedicated non-root user/group for the MCP server process.
RUN addgroup -S -g 1001 mcp && \
    adduser -S -u 1001 -G mcp -H -s /sbin/nologin mcp

# Copy manifests for production install.
COPY --chown=mcp:mcp package.json package-lock.json ./

# Install production dependencies only.
# --ignore-scripts: skip husky, postinstall, and any other lifecycle hooks.
ENV NODE_ENV=production
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy compiled output from builder stage.
COPY --chown=mcp:mcp --from=builder /app/dist ./dist/

# Drop to non-root before process start.
USER mcp

# ─── Metadata ─────────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="paperclip-mcp" \
      org.opencontainers.image.description="Paperclip MCP stdio server — exposes the Paperclip control plane API as MCP tools for Claude Code agents" \
      org.opencontainers.image.source="https://github.com/bruhsb/paperclip-mcp" \
      org.opencontainers.image.url="https://github.com/bruhsb/paperclip-mcp" \
      org.opencontainers.image.version="2.0.0" \
      org.opencontainers.image.licenses="MIT"

# ─── Environment variable documentation ───────────────────────────────────────
# These must be supplied at runtime via -e or an env file:
#   PAPERCLIP_API_KEY      — Bearer token for the Paperclip API (required)
#   PAPERCLIP_API_URL      — Base URL of the Paperclip server, e.g. http://127.0.0.1:3100 (required)
#   PAPERCLIP_AGENT_ID     — UUID of the agent running this MCP session (required)
#   PAPERCLIP_COMPANY_ID   — UUID of the Paperclip company/tenant (required)
#   PAPERCLIP_RUN_ID       — Optional execution run ID for tracing mutations

# ─── Entrypoint ───────────────────────────────────────────────────────────────
# tini wraps Node so SIGTERM is forwarded correctly through the PID chain.
# No CMD — stdio MCP servers require no default arguments.
ENTRYPOINT ["/sbin/tini", "--", "node", "dist/index.js"]
