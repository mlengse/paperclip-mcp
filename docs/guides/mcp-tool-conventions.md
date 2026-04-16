# MCP Tool Conventions

Canonical reference for adding or editing tools in `src/tools/` post-v2.0. Every new tool must conform to all sections below. Cross-cutting registry tests (`src/test/cross-cutting/registry.test.ts`) enforce most of these programmatically.

---

## 1. Schema patterns

### 1.1 Zod as single source of truth

Every tool defines its input as a Zod schema. The JSON Schema object sent to MCP clients is produced by `toJsonSchema()` in `validation.ts` — never written by hand.

```ts
// CORRECT
const MyInput = z.object({ id: z.string().min(1).describe("Resource UUID") }).strict();

export const myTools: ToolDefinition[] = [
  {
    name: "paperclip_do_thing",
    description: composeDescription({ ... }),
    inputSchema: toJsonSchema(MyInput),
    annotations: { ... },
    handler: async (args, client) => { ... },
  },
];

// WRONG — never write inputSchema: { type: "object", properties: { ... } } by hand
```

The lint guard (`scripts/check-no-raw-inputschema.sh`) enforces this: any `inputSchema: {` literal in `src/tools/*.ts` will fail pre-commit.

### 1.2 `.strict()` on every schema

All top-level input schemas must call `.strict()`. Nested sub-objects must also call `.strict()` where the API contract is known. This causes Zod (and therefore the MCP error handler) to reject unknown keys rather than silently ignore them.

```ts
const UpdateAgentInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID"),
    runtimeConfig: z.object({ ... }).strict().optional().describe("..."),
  })
  .strict(); // required at every level
```

### 1.3 `.describe()` on every field

Every field must have a `.describe()` call. This is the description MCP clients show in their UI. Descriptions must be meaningful — not just the field name.

```ts
// CORRECT
z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)");

// WRONG
z.string().describe("issueId");
```

### 1.4 Enum lifting to `validation.ts`

Enums shared across multiple modules belong in `src/tools/validation.ts`. Do not redefine them inline.

| Existing shared schema     | Use for                     |
| -------------------------- | --------------------------- |
| `StatusSchema`             | `status` on issues, goals   |
| `PrioritySchema`           | `priority` on issues, goals |
| `ApprovalTypeSchema`       | approval `type` field       |
| `RoutineTriggerTypeSchema` | routine trigger `type`      |

New enums used in two or more modules must be added to `validation.ts`.

### 1.5 Format validators

| Field type        | Zod call                      |
| ----------------- | ----------------------------- |
| ISO 8601 datetime | `.datetime()`                 |
| Hex color         | `.regex(/^#[0-9a-fA-F]{6}$/)` |
| 5-field cron      | `.regex(/^(\S+ ){4}\S+$/)`    |
| Non-negative int  | `.int().min(0)`               |
| Positive int      | `.int().positive()`           |

---

## 2. Description format

All descriptions are composed with `composeDescription()` from `validation.ts`. Never write a description string manually.

### 2.1 `composeDescription` signature

```ts
composeDescription({
  summary: string,       // ≤100 chars, required
  boardOnly?: boolean,   // prepends "⚠ Board-only: " to summary
  args?: string[],       // "- paramName: type — meaning (example: 'value')"
  returns?: string,      // shape sketch for the response
  examples?: { useWhen: string, dontUseWhen?: string },
  errors?: string[],     // "- 404: not found → verify with paperclip_list_*"
})
```

### 2.2 Section requirements

Every tool description must include all four sections. The registry tests verify `Returns:`, `Use when:`, and `Error Handling:` are present.

**Args** — List parameters in schema order. Format: `- paramName: type — meaning (example: 'value')`. Omit optional pagination params (`limit`, `offset`, `response_format`) — they are implied by convention.

**Returns** — Describe the shape. For single objects: key fields. For lists: `Pagination envelope { items: T[], total, count, offset, has_more, next_offset? }.`

**Examples** — `Use when:` is required. `Don't use when:` is recommended for tools that are easy to misuse.

**Error Handling** — List the non-2xx codes the caller is likely to encounter. Use `→ <recovery action>` after each.

### 2.3 Board-only prefix

Use `boardOnly: true` in `composeDescription` — never put the prefix text in the `summary` string.

```ts
// CORRECT
composeDescription({ boardOnly: true, summary: "List all companies visible to this token." });

// WRONG
composeDescription({ summary: "⚠ Board-only: List all companies." });
```

### 2.4 Length limits

- Summary: ≤ 100 characters.
- Full description: ≥ 100 characters, ≤ 1500 characters. Registry tests enforce both bounds.

---

## 3. Annotations

Only the five MCP spec keys are permitted. Custom annotation keys are rejected by registry tests.

| Key               | Type              | When to set                                                                         |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `title`           | string ≤ 60 chars | **Always required.** Human-readable label for UI display.                           |
| `readOnlyHint`    | boolean           | `true` for all GET-only tools (no state mutations).                                 |
| `destructiveHint` | boolean           | `true` for DELETE, archive, terminate, rollback, revoke, rotate.                    |
| `idempotentHint`  | boolean           | `true` for PUT/PATCH operations safe to retry (update*\*, upsert*\*, pause/resume). |
| `openWorldHint`   | boolean           | Rarely needed. `true` if the tool makes calls to external systems.                  |

### 3.1 Title convention

Titles follow `<Verb> <Noun>` or `<Verb> <Noun> (<scope>)` patterns. Use title case. Stay under 60 characters.

```ts
// CORRECT
annotations: { title: "List Issues", readOnlyHint: true }
annotations: { title: "Checkout Issue", idempotentHint: false }
annotations: { title: "Delete Document", destructiveHint: true, readOnlyHint: false }

// WRONG
annotations: { title: "paperclip_list_issues tool" }  // no snake_case
annotations: { title: "This tool lists all issues for the current company" }  // too long
```

### 3.2 Annotation correctness rules (enforced by registry tests)

- Every tool in `READ_ONLY_TOOLS` must have `readOnlyHint: true`.
- Every tool in `DESTRUCTIVE_TOOLS` must have `destructiveHint: true`.
- Every tool in `IDEMPOTENT_TOOLS` must have `idempotentHint: true`.
- When adding a new tool, update the relevant list(s) in `src/test/cross-cutting/registry.test.ts`.

---

## 4. Response format

### 4.1 Markdown default on read-heavy tools

Tools that return a list or a rich object should accept a `response_format` parameter defaulting to `"markdown"`.

```ts
response_format: ResponseFormatSchema.optional()
  .default("markdown")
  .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
```

Write-only tools (create, update, delete) that return a confirmation or simple object may return JSON directly without offering `response_format`.

### 4.2 Format helpers (`src/tools/format.ts`)

| Helper                                | Returns                                            |
| ------------------------------------- | -------------------------------------------------- |
| `formatJson(data)`                    | `JSON.stringify(data, null, 2)`                    |
| `formatMarkdown(data, kind)`          | Domain-specific markdown (uses per-kind formatter) |
| `formatAgentList(envelope)`           | Markdown table of agents                           |
| `formatIssueList(envelope)`           | Markdown table of issues                           |
| `formatOrgChart(data)`                | Org chart markdown                                 |
| `formatGenericList(envelope, title?)` | Generic markdown list from any envelope            |
| `formatSingleIssue(issue)`            | Detailed issue markdown                            |
| `formatResult(data, format)`          | Dispatch helper (markdown or json branch)          |
| `applyCharLimit(text, hint)`          | Truncation with actionable hint appended           |

Add a new `format<Kind>` function to `format.ts` when introducing a domain that needs custom display.

### 4.3 25k character limit

Every tool handler must call `applyCharLimit(text, hint)` before returning. The `hint` should name the parameter the caller should reduce to see more (e.g. `"Use a smaller 'limit' value or add filters to reduce the result set."`).

```ts
const text = format === "json" ? formatJson(envelope) : formatIssueList(envelope);
return {
  content: [
    { type: "text", text: applyCharLimit(text, "Use a smaller 'limit' value or add filters.") },
  ],
};
```

`CHARACTER_LIMIT = 25_000` is defined in `src/constants.ts`.

---

## 5. Pagination envelope

Every `list_*` tool must return the canonical pagination envelope.

### 5.1 Shape

```ts
{
  items: T[],
  total: number,    // full array length before slicing
  count: number,    // items in this page
  offset: number,   // requested offset
  limit: number,    // requested limit
  has_more: boolean,
  next_offset?: number  // present only when has_more is true
}
```

### 5.2 Usage

```ts
import { paginate, PaginationLimitSchema, PaginationOffsetSchema } from "./format.js";

// In schema:
limit: PaginationLimitSchema.describe("Max results per page (1–100, default 50)"),
offset: PaginationOffsetSchema.describe("Results to skip before this page (default 0)"),

// In handler:
const rawItems = await client.get<T[]>(`/api/companies/${companyId}/things`);
const envelope = paginate(rawItems, { limit: input.limit, offset: input.offset });
```

`PaginationLimitSchema` defaults to 50, max 100. `PaginationOffsetSchema` defaults to 0.

---

## 6. Error handling

### 6.1 `handleApiError`

All `catch` blocks must delegate to `handleApiError(err, ctx)` from `validation.ts`. Never construct error messages inline.

```ts
} catch (err) {
  return handleApiError(err, { tool: "paperclip_get_thing", resource: "thing" });
}
```

`resource` is the singular noun of the entity. It is used to construct recovery hints like "verify with `paperclip_list_things` or `paperclip_get_thing`".

### 6.2 Status-coded messages

`handleApiError` produces LLM-actionable messages:

| Status  | Message pattern                                                                      |
| ------- | ------------------------------------------------------------------------------------ |
| 400     | `400 Bad request in <tool>: <body>. Check the input parameters.`                     |
| 401     | `401 Authentication failed. Check PAPERCLIP_API_KEY.`                                |
| 403     | `403 Permission denied. This endpoint may require a board API key.`                  |
| 404     | `404 Not found: verify with paperclip_list_<resources> or paperclip_get_<resource>.` |
| 409     | `409 Conflict: <body>. Do not retry — refresh state with paperclip_get_<resource>.`  |
| 422     | `422 Validation failure: <body>. Check submitted values.`                            |
| 429     | `429 Rate limited. Wait before retrying.`                                            |
| 5xx     | `Paperclip API server error (5xx). Usually transient; retry in a few seconds.`       |
| Timeout | `Request timeout. Check PAPERCLIP_API_URL connectivity.`                             |
| Network | `Network error: could not reach Paperclip API. Check PAPERCLIP_API_URL.`             |

### 6.3 Per-tool hint

Pass `hint` in the context for known edge cases:

```ts
return handleApiError(err, {
  tool: "paperclip_list_comments",
  resource: "comment",
  hint: "The Paperclip API returns 500 when the 'after' cursor is invalid — retry without the cursor.",
});
```

### 6.4 Timeout configuration

`PaperclipClient` sets `AbortSignal.timeout(30_000)` by default. Override via `PAPERCLIP_REQUEST_TIMEOUT_MS` env var.

---

## 7. Board-only tools convention

Tools restricted to board (human-user) API keys must:

1. Use `boardOnly: true` in `composeDescription` (adds `⚠ Board-only:` prefix).
2. Be added to `BOARD_ONLY_TOOLS` in `src/test/cross-cutting/registry.test.ts`.
3. Have `readOnlyHint: true` (if GET-only) or other appropriate annotation.

Do **not** add a `boardOnlyHint` annotation key — it is not part of the MCP spec and is blocked by registry tests.

---

## 8. Testing expectations

Every tool module `src/tools/<name>.ts` must have a co-located test file `src/tools/<name>.test.ts`. Tests use Node.js built-in `node:test` (`describe`/`it`) with `assert/strict`. No external test framework.

### 8.1 Per-tool test categories

| Category | What it tests                                                                 |
| -------- | ----------------------------------------------------------------------------- |
| **A1**   | Happy-path: correct URL, method, and return value                             |
| **A2**   | Query params / body fields forwarded correctly                                |
| **A3**   | Optional fields omitted from request when not supplied                        |
| **A4**   | Enum validation rejects invalid values (Zod throws McpError)                  |
| **A5**   | `.strict()` rejects unknown fields (Zod throws McpError)                      |
| **B1**   | 404 returns `isError: true` with actionable message                           |
| **B2**   | 409/403/5xx returns `isError: true` with status in message                    |
| **C1**   | Timeout (AbortError) returns `isError: true` with timeout message             |
| **C2**   | Network error (TypeError fetch) returns `isError: true` with network message  |
| **C3**   | Unknown error returns `isError: true` with generic message                    |
| **D1**   | Response truncated at CHARACTER_LIMIT when result is large                    |
| **E1**   | Pagination envelope returned with correct `items`, `total`, `count`, `offset` |
| **E2**   | `has_more: true` and `next_offset` set when more items exist                  |
| **E3**   | `has_more: false` and no `next_offset` on last page                           |
| **F1**   | `response_format: "json"` returns raw JSON                                    |
| **F2**   | Default `response_format` (`"markdown"`) returns markdown                     |

Not every category applies to every tool. Write-only tools without pagination skip E1-E3, F1-F2.

### 8.2 Cross-cutting tests

`src/test/cross-cutting/registry.test.ts` — structural invariants for `ALL_TOOLS`:

- No duplicate names.
- All names start with `paperclip_`, snake_case.
- Non-empty description, inputSchema, handler.
- Tool count within expected bounds (update after adding tools).
- inputSchema is a valid JSON Schema object.
- No `$schema` key in inputSchema.
- Annotations are valid spec keys only.
- Read-only / destructive / idempotent / board-only allow-lists enforced.
- Description quality: `Returns:`, `Use when:`, `Error Handling:` sections present; length 100–1500 chars.

### 8.3 Test helper utilities

| Helper                             | Location                            | Purpose                            |
| ---------------------------------- | ----------------------------------- | ---------------------------------- |
| `assertPaginationEnvelope(parsed)` | `src/test/helpers/assert-result.ts` | Assert envelope shape              |
| `issueFixture(overrides?)`         | `src/test/helpers/fixtures.ts`      | Build a stub issue                 |
| `largeIssueList(count?)`           | `src/test/helpers/fixtures.ts`      | 200-item list for truncation tests |
| `mockFetch(status, body)`          | Inline in each test file            | Stub HTTP responses                |

---

## 9. Module registration checklist

When adding a new tool module:

1. Create `src/tools/<name>.ts` — define schemas, descriptions, handlers, export `<name>Tools: ToolDefinition[]`.
2. Create `src/tools/<name>.test.ts` — cover all applicable categories.
3. Import and spread in `src/tools/index.ts` → `ALL_TOOLS`.
4. Update `BOARD_ONLY_TOOLS`, `READ_ONLY_TOOLS`, `DESTRUCTIVE_TOOLS`, `IDEMPOTENT_TOOLS` lists in `registry.test.ts`.
5. Update the tool count comment and bounds in the `"tool count is within expected bounds"` test.
6. Add a row to `docs/guides/api-coverage.md`.

See the full conventions above for schema, description, annotation, response, pagination, and error requirements.
