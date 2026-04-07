# Architecture Overview

## Purpose

Paperclip MCP is a thin adapter that translates [Model Context Protocol](https://modelcontextprotocol.io) tool calls into HTTP requests against the Paperclip control plane REST API. It runs as a stdio MCP server and is consumed by Claude Code (or any other MCP host).

## System diagram

```
┌──────────────────────────────────────┐
│              MCP Host                │
│  (Claude Code / other MCP client)    │
└──────────────┬───────────────────────┘
               │ MCP stdio (JSON-RPC)
               │ tools/list · tools/call
┌──────────────▼───────────────────────┐
│         paperclip-mcp server         │
│                                      │
│  src/index.ts       — entry point    │
│  src/tools/index.ts — registry       │
│  src/tools/*.ts     — handlers       │
│  src/client.ts      — HTTP client    │
│  src/auth.ts        — auth config    │
│  src/errors.ts      — error type     │
└──────────────┬───────────────────────┘
               │ HTTP/HTTPS
               │ Authorization: Bearer <token>
               │ X-Paperclip-Run-Id: <run-id>
┌──────────────▼───────────────────────┐
│      Paperclip control plane API     │
│         ($PAPERCLIP_API_URL)         │
└──────────────────────────────────────┘
```

```mermaid
graph TD
    Host["MCP Host<br/>(Claude Code)"]
    MCP["paperclip-mcp<br/>stdio server"]
    API["Paperclip API<br/>$PAPERCLIP_API_URL"]

    Host -- "tools/list · tools/call (JSON-RPC over stdio)" --> MCP
    MCP -- "HTTP REST (Bearer token)" --> API
```

## Key modules

### `src/index.ts` — Entry point

Creates the MCP `Server` instance with `{ capabilities: { tools: {} } }`, delegates tool registration to `registerAllTools`, and connects the stdio transport. On fatal error the process exits with code 1.

### `src/tools/index.ts` — Tool registry

Owns the `ToolDefinition` interface:

```ts
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema passed to the MCP host
  handler: (args: unknown, client: PaperclipClient) => Promise<ToolResult>;
}
```

`registerAllTools` builds a `Map<name, ToolDefinition>` from the `ALL_TOOLS` array (populated by tool modules) and registers two MCP request handlers:

| Handler                  | MCP schema   | What it does                                                           |
| ------------------------ | ------------ | ---------------------------------------------------------------------- |
| `ListToolsRequestSchema` | `tools/list` | Returns `name`, `description`, `inputSchema` for every registered tool |
| `CallToolRequestSchema`  | `tools/call` | Looks up the tool by name, calls its `handler`, returns `ToolResult`   |

An unknown tool name raises `McpError(ErrorCode.MethodNotFound)`.

### `src/tools/*.ts` — Tool handlers

Each file exports an array of `ToolDefinition` objects. Tool groups:

| Module         | Tools                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity.ts`  | `paperclip_get_me`, `paperclip_get_inbox`                                                                                                                                                |
| `issues.ts`    | `paperclip_list_issues`, `paperclip_get_issue`, `paperclip_checkout_issue`, `paperclip_update_issue`, `paperclip_create_issue`, `paperclip_get_issue_context`, `paperclip_release_issue` |
| `comments.ts`  | `paperclip_list_comments`, `paperclip_add_comment`                                                                                                                                       |
| `documents.ts` | `paperclip_list_documents`, `paperclip_get_document`, `paperclip_upsert_document`                                                                                                        |

### `src/client.ts` — `PaperclipClient`

Typed HTTP wrapper around the global `fetch`. Constructed once in `registerAllTools` and shared across all handler calls.

Key behaviours:

- Reads credentials from `getAuthConfig()` at construction time.
- `buildHeaders()` always injects `Authorization: Bearer <apiKey>` and `Content-Type: application/json`. When a `runId` is available (from env or the optional per-call argument), it also injects `X-Paperclip-Run-Id`.
- `handleResponse<T>()` parses JSON on 2xx, returns `undefined` on 204/empty, and throws `PaperclipApiError` on any non-ok status.

```
PaperclipClient
├── get<T>(path)
├── post<T>(path, body?, runId?)
├── patch<T>(path, body, runId?)
├── put<T>(path, body, runId?)
└── delete<T>(path, runId?)
```

### `src/auth.ts` — Auth config

Reads and validates five environment variables at startup:

| Variable               | Required | Purpose                                |
| ---------------------- | -------- | -------------------------------------- |
| `PAPERCLIP_API_KEY`    | yes      | Short-lived JWT injected per run       |
| `PAPERCLIP_API_URL`    | yes      | Base URL for the control plane         |
| `PAPERCLIP_AGENT_ID`   | yes      | Identity of the running agent          |
| `PAPERCLIP_COMPANY_ID` | yes      | Company scope for all requests         |
| `PAPERCLIP_RUN_ID`     | no       | Current heartbeat run ID (audit trail) |

Missing required variables throw at startup, not at first API call.

### `src/errors.ts` — Error type

`PaperclipApiError` extends `Error` and captures `status`, `statusText`, and the raw response `body`. Tool handlers propagate this as a `ToolResult` with `isError: true` so the MCP host sees a structured error rather than an unhandled exception.

## Authentication flow

```
Paperclip runtime
      │
      ├─ injects PAPERCLIP_API_KEY (short-lived JWT per run)
      ├─ injects PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID
      ├─ injects PAPERCLIP_API_URL
      └─ injects PAPERCLIP_RUN_ID  ← ties HTTP mutations to the audit trail

paperclip-mcp (at startup)
      │
      └─ src/auth.ts reads + validates all vars
            │
            └─ PaperclipClient stores them in-memory
                  │
                  └─ Every HTTP request → Authorization: Bearer <JWT>
                                          X-Paperclip-Run-Id: <runId>  (mutations)
```

The API key is a **run-scoped JWT** issued by the Paperclip runtime and valid only for the current heartbeat. It is never written to disk by this server. When the heartbeat ends, the token expires.

`X-Paperclip-Run-Id` is included on all mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`). The Paperclip API uses it to link each change to the originating run for traceability. Read requests (`GET`) do not require it.

## MCP protocol integration

The MCP SDK handles the JSON-RPC framing over stdio. The server declares a single capability — `tools` — and registers handlers for the two tool-related message types:

**`tools/list`** — sent by the host on startup. The registry maps `ALL_TOOLS` to `{ name, description, inputSchema }` tuples and returns them. The host uses `inputSchema` (JSON Schema) to know what arguments each tool accepts.

**`tools/call`** — sent by the host when the agent invokes a tool. Payload: `{ name, arguments }`. The registry:

1. Looks up `name` in `toolMap`. Unknown name → `McpError(MethodNotFound)`.
2. Calls `tool.handler(arguments, client)`.
3. The handler uses `validateInput` / `validate` (Zod) to parse `arguments`. Bad input → `McpError(InvalidParams)`.
4. The handler calls `PaperclipClient`, gets a response, and returns `ToolResult`.
5. The SDK serialises the result back over stdio.

All tool results share the shape:

```ts
{ content: [{ type: "text", text: string }], isError?: boolean }
```

## Error handling strategy

| Layer               | Error type                 | How it surfaces                                                                  |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| Argument validation | `McpError(InvalidParams)`  | Raised in handler before any HTTP call; SDK returns it as a JSON-RPC error       |
| Unknown tool name   | `McpError(MethodNotFound)` | Raised in the registry dispatcher                                                |
| HTTP 4xx/5xx        | `PaperclipApiError`        | Thrown by `handleResponse`; handlers should catch and return `{ isError: true }` |
| Startup / config    | `Error` (plain)            | Thrown by `getAuthConfig`; caught in `main()`, logged to stderr, process exits 1 |
| Unhandled fatal     | any                        | `main().catch(...)` logs and exits 1                                             |

Handlers follow the pattern:

```ts
async handler(args, client) {
  const input = validate(Schema, args);         // throws McpError on bad input
  const data = await client.get<unknown>(path); // throws PaperclipApiError on HTTP error
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
```

`PaperclipApiError` is not caught inside handlers today — it propagates to the MCP SDK, which converts it to a JSON-RPC internal error. A future improvement is to catch it and return `{ isError: true, content: [...] }` so the host can reason about the failure.

## Adding a new tool (step-by-step)

1. **Create or open a tool module** under `src/tools/`. Group related tools in one file (e.g. `src/tools/projects.ts`).

2. **Define input schema** with Zod:

```ts
import { z } from "zod";

const ListProjectsInput = z.object({
  status: z.string().optional(),
});
```

3. **Write the tool definition:**

```ts
import type { ToolDefinition } from "./index.js";

export const projectTools: ToolDefinition[] = [
  {
    name: "paperclip_list_projects",
    description: "List projects for the current company.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status" },
      },
      required: [],
    },
    async handler(args, client) {
      const input = validate(ListProjectsInput, args);
      const params = new URLSearchParams();
      if (input.status) params.set("status", input.status);
      const qs = params.toString();
      const data = await client.get<unknown>(
        `/api/companies/${client.companyId}/projects${qs ? `?${qs}` : ""}`
      );
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  },
];
```

4. **Register the tool group** in `src/tools/index.ts`:

```ts
import { projectTools } from "./projects.js";

const ALL_TOOLS: ToolDefinition[] = [
  ...identityTools,
  ...issueTools,
  ...commentTools,
  ...documentTools,
  ...projectTools, // ← add here
];
```

That's it. No changes to `src/index.ts` or any other file are needed.

5. **Add tests** (optional but recommended): see existing `*.test.ts` files for the pattern — construct a `PaperclipClient` with a mock `fetchFn` and assert the tool's handler output.

## Extension points

| What to change                          | Where                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Add new tools                           | `src/tools/<module>.ts` + `ALL_TOOLS` in `src/tools/index.ts`                |
| Switch transport (stdio → HTTP/WS)      | `src/index.ts` — swap `StdioServerTransport`                                 |
| Add auth schemes (OAuth, token refresh) | `src/auth.ts` and `src/client.ts`                                            |
| Richer error responses                  | Catch `PaperclipApiError` in handlers and return structured `isError` result |

## Related

- [MCP tools reference](../reference/tools.md)
- [Getting started guide](../guides/getting-started.md)
- [Configuration](../guides/configuration.md)
