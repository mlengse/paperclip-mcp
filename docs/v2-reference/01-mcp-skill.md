# MCP Builder Skill — Authoritative Reference

Source: https://github.com/ComposioHQ/awesome-claude-skills/blob/master/mcp-builder/SKILL.md (fetched 2026-04-16)

## Agent-centric design principles (TOP PRIORITY)

- **Build for workflows, not API endpoints** — consolidate related operations when the workflow demands it.
- **Optimize for limited context** — high-signal over exhaustive data; "concise" vs "detailed" formats; human-readable IDs.
- **Actionable error messages** — guide agents toward correct usage, not just diagnose.
- **Natural task subdivisions** — tool names reflect how humans think about the task.

## Response formats

- **Markdown** (default for human-readable surfaces): headers, lists, human timestamps (`2024-01-15 10:30:00 UTC`), display-name-then-ID (`@john.doe (U123456)`).
- **JSON** (for programmatic): complete fields + metadata, consistent types.
- **`response_format`** parameter on read-heavy tools: `"markdown" | "json"`, default `"markdown"` per skill.

## Pagination — mandatory envelope shape

```json
{
  "items": [...],
  "total": 1234,
  "count": 50,
  "offset": 0,
  "has_more": true,
  "next_offset": 50
}
```

- Default limit: 50 (acceptable range 20–50).
- `next_offset` is `undefined` at end-of-list.

## Character limits

- `CHARACTER_LIMIT = 25_000`.
- Check before returning. On truncation include a hint naming the param the agent should pass to see more (`offset`, `limit`, filters).

## Tool naming and structure

- `{service}_{action}_{resource}` snake*case → `paperclip*<verb>\_<noun>`.
- Tool registration MUST include: `title`, `description`, `inputSchema` (Zod), `annotations`.
- Annotations are the fixed set: `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. No custom keys (clients silently ignore).
- Board-only intent goes in description text (prefix `⚠ Board-only:`), not a custom annotation.

## Description format (every tool)

```
<One-line summary>

Args:
- <param>: <type> — <meaning> (example: <realistic>)

Returns:
- <shape sketch — name the envelope / list fields>

Examples:
- Use when: <scenario>
- Don't use when: <counter-scenario — often points to a sibling tool>

Error Handling:
- <status>: <what happened → what the agent should do>
```

## Error handling

- **Tool errors use `isError: true` in the result**, not protocol-level JSON-RPC errors.
- Error text must be LLM-actionable:
  - `400` → "Bad request: <details>. Check <params>."
  - `401` → "Authentication failed. Check PAPERCLIP_API_KEY."
  - `403` → "Permission denied. <resource> may require a board (human) key."
  - `404` → "Not found. Verify <id> with paperclip*list*<resource>."
  - `409` → "Conflict: <details>. Do not retry — refresh with paperclip*get*<resource>."
  - `429` → "Rate limited. Wait a few seconds before retrying."
  - `5xx` → "Paperclip API server error (<status>). Usually transient; retry in a few seconds."
- Network errors and timeouts flow through the same formatter.

## TypeScript quality checklist (must all be true before QA sign-off)

- [ ] `registerTool` (or equivalent registry path) with full config per tool.
- [ ] `title`, `description`, `inputSchema` (Zod), `annotations` all present.
- [ ] Annotations correct per tool intent.
- [ ] All Zod schemas use `.strict()`.
- [ ] All Zod fields have `.describe()` + constraints.
- [ ] Descriptions include Returns / Examples / Error Handling sections.
- [ ] TS strict mode; no `any`; explicit `Promise<T>` returns.
- [ ] `axios.isAxiosError` / equivalent type guards in error paths (we use `PaperclipApiError instanceof`).
- [ ] Pagination envelope on all `list_*`.
- [ ] Character-limit check on every response.
- [ ] Server name, build, exports correct.

## Transport (stdio)

- **NEVER write to stdout** except MCP messages.
- All logging goes to **stderr**.
- Timeouts on all fetch calls (30s default, env-overridable).
