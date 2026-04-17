# Troubleshooting

Symptom-to-action runbook for paperclip-mcp. Each section names the symptom, probable
causes, and the concrete steps to resolve it.

---

## Server won't start

**Symptoms:** The MCP server process exits immediately; Claude Code shows the server
as disconnected; startup logs show `Error: ... is required`.

**Causes and fixes:**

| Missing variable       | Error message                      | Fix                                              |
| ---------------------- | ---------------------------------- | ------------------------------------------------ |
| `PAPERCLIP_API_KEY`    | `PAPERCLIP_API_KEY is required`    | Add the variable to your MCP env block           |
| `PAPERCLIP_API_URL`    | `PAPERCLIP_API_URL is required`    | Set to your Paperclip API base URL               |
| `PAPERCLIP_AGENT_ID`   | `PAPERCLIP_AGENT_ID is required`   | Set to the UUID of the agent running this server |
| `PAPERCLIP_COMPANY_ID` | `PAPERCLIP_COMPANY_ID is required` | Set to your company UUID from Paperclip settings |

All four are required; `PAPERCLIP_RUN_ID` is optional (injected automatically by
Paperclip during production heartbeat runs).

**Bad URL format:** `PAPERCLIP_API_URL` must be the base URL with no trailing slash
and no path segment — for example `http://127.0.0.1:3100`, not
`http://127.0.0.1:3100/api`. The server prepends `/api/...` paths itself.

**Verify your config:**

```bash
node -e "
const vars = ['PAPERCLIP_API_KEY','PAPERCLIP_API_URL','PAPERCLIP_AGENT_ID','PAPERCLIP_COMPANY_ID'];
vars.forEach(v => console.log(v, process.env[v] ? 'SET' : 'MISSING'));
"
```

---

## 401 Unauthorized

**Symptoms:** Tool calls return `isError: true`; `content[0].text` contains `401` or
`Unauthorized`.

**Causes:**

1. **Wrong key type** — You are using a board key where an agent key is expected, or
   vice versa. See [auth-keys.md](auth-keys.md).
2. **Expired key** — Agent keys and board keys can be rotated or expire. Generate a
   new key from your Paperclip account settings and update `PAPERCLIP_API_KEY`.
3. **Mismatched agent** — The key was issued for a different agent than the one in
   `PAPERCLIP_AGENT_ID`. Verify both values match the same agent record.
4. **Copy-paste error** — A leading/trailing space in `PAPERCLIP_API_KEY` will silently
   produce a 401.

**Quick check:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/agents/me"
# Expect 200. If 401, the key is wrong.
```

---

## 403 Forbidden

**Symptoms:** Tool call returns `isError: true` with a `403` status; message often
contains `Forbidden` or `Insufficient permissions`.

**Cause:** You are calling a board-only tool with an agent key. Board-only tools
require a key issued with board (admin) scope — they are not callable by regular agent
keys regardless of the agent's role.

**Fix:** Switch to a board-scope key for the specific operation, or use a board-capable
agent (e.g., CEO, CTO) that holds a board key.

**Reference:** See [auth-keys.md](auth-keys.md) for the full list of board-only tools
and how to obtain a board key.

---

## 404 Not Found

**Symptoms:** Tool call returns `isError: true` with a `404` status.

**Causes:**

1. **Wrong UUID** — The `issueId`, `goalId`, `approvalId`, etc. does not exist in this
   company. UUIDs are not portable across environments.
2. **Typo in identifier** — `PAP-33` vs `PAP-333`. Use `paperclip_list_issues` to
   confirm the correct identifier.
3. **Deleted resource** — The issue, goal, or document was deleted. Check the dashboard
   or ask a board operator.
4. **Wrong company** — `PAPERCLIP_COMPANY_ID` points to a different company than where
   the resource lives.

**Tip:** Use the human-readable identifier (e.g. `PAP-33`) rather than the UUID when
calling tools interactively — it is harder to mistype.

---

## 409 Conflict on checkout_issue

**Symptoms:** `paperclip_checkout_issue` returns `isError: true` with a `409` status.

**Two distinct causes:**

### Cause A: Issue is locked by another agent

The issue has a non-null `checkoutRunId` belonging to a different run. The lock is
genuine.

**Do NOT retry.** Post a comment on the issue: `Checkout blocked: PAP-XX is already
locked by another run. @Scrum Master — please verify.` Then exit cleanly.

### Cause B: Status mismatch (expectedStatuses guard fired)

You passed `expectedStatuses: ["todo"]` but the issue is in a different column (e.g.
`in_review`). The server rejected the checkout atomically to prevent a race condition.

**Do NOT retry.** Fetch the issue to see its current status, then decide: if the
status is unexpected, post a wake-mismatch comment and exit without touching state.

### Stale lock (auto-released)

If the issue has a stale `checkoutRunId` from a crashed run (`checkoutRunId` is set
but the run is no longer active), the MCP layer auto-releases it and retries
transparently — you do not need to handle this case. If the 409 persists after that
transparent retry, treat it as Cause A.

**Manual stale-lock release (board operator only):**

```json
{
  "name": "paperclip_update_issue",
  "arguments": {
    "issueId": "PAP-33",
    "executionRunId": null,
    "executionLockedAt": null
  }
}
```

This requires a board-scope key.

---

## Request timed out

**Symptoms:** Tool call hangs and then fails with a timeout or network error; no HTTP
status returned.

**Cause:** The underlying `fetch()` call has no built-in timeout in Node.js by default.
Slow upstream responses or a network partition will cause the call to hang indefinitely
unless the MCP client enforces a deadline.

**Fix:**

- Confirm the Paperclip API is reachable: `curl -s "$PAPERCLIP_API_URL/health"`.
- If the API is behind a VPN or firewall, verify connectivity from the machine running
  the MCP server.
- For large list calls, note that `paperclip_list_issues` implements **client-side**
  pagination: the server fetches the full matching result set first, then this tool
  slices it locally by `limit`/`offset`. Passing a smaller `limit` does not reduce
  upstream server work. To genuinely reduce the data the server must process, use
  server-side filters: `status`, `assigneeAgentId`, `projectId`, `goalId`, `labelId`,
  or `q` (full-text search). `paperclip_list_comments` sends `limit` upstream and the
  server respects it, so smaller `limit` values do help there.

> There is no `PAPERCLIP_REQUEST_TIMEOUT_MS` env var in the current codebase — timeout
> enforcement is delegated to the MCP client or the OS TCP stack. If you need a hard
> deadline, wrap the MCP call at the agent layer.

---

## Response truncated

**Symptoms:** `paperclip_list_issues` returns fewer items than expected; `total` in
the response is larger than the number of items in `issues`.

**What it means:** `list_issues` applies client-side pagination. The server fetches all
matching issues but returns a slice of `limit` size. `total` is the full count.

**Pagination strategy:**

```json
// First page
{ "limit": 50, "offset": 0 }

// Second page (if total > 50)
{ "limit": 50, "offset": 50 }
```

Repeat until `offset + limit >= total`.

**For comments:** Use the `after` cursor parameter on `paperclip_list_comments` to
fetch only comments posted after a known comment ID. The `paperclip_get_heartbeat_context`
tool returns `commentCursor.latestCommentId` — pass that as `after` on subsequent
calls to get only new comments.

**Reducing response size:** Add filters (`status`, `assigneeAgentId`, `projectId`,
`goalId`, `labelId`, `q`) to `list_issues` to narrow the result set before paginating.

---

## MCP initialization hangs

**Symptoms:** Claude Code shows the MCP server as connecting indefinitely; no tools
appear; no error is logged.

**Diagnosis steps:**

1. Confirm the server binary exists and is executable:

   ```bash
   node /absolute/path/to/paperclip-mcp/dist/index.js
   # Should output nothing and wait (stdio transport). Ctrl-C to exit.
   ```

2. Check Claude Code's MCP server list:

   ```
   /mcp
   ```

   If `paperclip` does not appear, the config was not picked up — restart Claude Code
   after editing `~/.claude/settings.json`.

3. Inspect raw JSON-RPC by sending an `initialize` message manually:

   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' \
     | PAPERCLIP_API_KEY=... PAPERCLIP_API_URL=... PAPERCLIP_AGENT_ID=... PAPERCLIP_COMPANY_ID=... \
       node /path/to/paperclip-mcp/dist/index.js
   ```

   A valid server responds with a JSON `result` object. An error message means the
   server crashed at startup — check for missing env vars (see
   [Server won't start](#server-wont-start)).

4. Check Node.js version — the server requires Node.js >= 22:
   ```bash
   node --version
   ```

**Logs:** The server writes startup errors to `stderr`. In Claude Code, MCP server
stderr is captured in the app's log output — check the Claude Code log viewer or
redirect stderr when running manually.

---

## Tool not found

**Symptoms:** The agent or user references a tool name that is not in the tool list;
Claude Code says the tool does not exist.

**Causes:**

1. **Typo** — Tool names are `paperclip_<verb>_<noun>` in snake_case. Common mistakes:
   `paperclip_getMe` (wrong — use `paperclip_get_me`), `paperclip_trigger_routine`
   (wrong — use `paperclip_run_routine`).

2. **Version mismatch** — The installed version of paperclip-mcp does not include the
   tool yet. Run `npm list paperclip-mcp` to check the installed version and compare
   to the release notes.

3. **Server not connected** — The tool list is empty because the MCP server failed to
   start. See [MCP initialization hangs](#mcp-initialization-hangs).

**List available tools:**

In Claude Code, ask: "List all paperclip tools available." Claude Code will enumerate
them from the live tool registry. Alternatively, send a `tools/list` JSON-RPC call
directly to the server process.

---

## Rate limited (429)

**Symptoms:** Tool calls return `isError: true` with a `429` status or a message
containing `Too Many Requests` or `rate limit`.

**Cause:** The Paperclip API enforces per-key or per-company rate limits.

**Fix:**

- Back off and retry after the interval indicated in the `Retry-After` response header
  (if present).
- Reduce call frequency — for heartbeat agents, increase the heartbeat interval or
  add a cooldown.
- Avoid tight polling loops; use the `after` cursor on `list_comments` rather than
  refetching the full thread on every tick.

There is no built-in retry logic in paperclip-mcp — backoff must be implemented at the
agent layer.

---

## 500 Internal Server Error

**Symptoms:** Tool calls return `isError: true` with a `500` status.

**Cause:** An unexpected error occurred in the upstream Paperclip API, not in
paperclip-mcp itself.

**Steps:**

1. Retry once — transient 500s are common during deployments.
2. Check Paperclip API status / release notes for known incidents.
3. Capture the full error text from `content[0].text` and the tool arguments you used.
4. File a bug against the Paperclip API (not paperclip-mcp) if the error is
   reproducible. Include: tool name, sanitized arguments, error body, and
   `PAPERCLIP_RUN_ID` if set.

---

## Debugging

**Where logs go**

The MCP server writes to `stdout` (JSON-RPC responses) and `stderr` (startup errors,
unhandled rejections). In Claude Code, both streams are captured internally. To inspect
them directly, run the server process manually and redirect stderr:

```bash
PAPERCLIP_API_KEY=... PAPERCLIP_API_URL=... PAPERCLIP_AGENT_ID=... PAPERCLIP_COMPANY_ID=... \
  node /path/to/dist/index.js 2>mcp-errors.log
```

**PAPERCLIP_DEBUG**

There is no `PAPERCLIP_DEBUG` environment variable in the current codebase. The server
does not emit verbose request/response logs. To inspect what is being sent to the API,
use a local proxy (e.g. `mitmproxy`) or add temporary `console.error()` statements in
`src/client.ts` during development.

**Inspecting raw JSON-RPC**

The stdio transport sends and receives newline-delimited JSON. You can pipe messages
manually to test tool calls without a full MCP client:

```bash
# List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | PAPERCLIP_API_KEY=... node dist/index.js

# Call a tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"paperclip_get_me","arguments":{}}}' \
  | PAPERCLIP_API_KEY=... PAPERCLIP_API_URL=... PAPERCLIP_AGENT_ID=... PAPERCLIP_COMPANY_ID=... \
    node dist/index.js
```

Each message must be followed by a newline. The server responds with a single JSON
line per request.

**Checking the MCP connection in Claude Code**

```
/mcp
```

Shows all registered servers, their connection status, and the number of tools loaded.
If `paperclip` shows 0 tools, the server started but the tool registration failed —
check stderr for a TypeScript/runtime error.
