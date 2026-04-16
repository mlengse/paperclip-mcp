# MCP v2.0 Full-Parity Charter — Agent Reference

**Branch:** `engineer/mcp-v2-full-parity` (base: `develop`)
**Goal:** Every Paperclip API endpoint reachable through the Paperclip MCP server.
**Authority:** [MCP Builder skill](./01-mcp-skill.md) is the design bible. When in doubt, it wins.

## Non-negotiables

1. **TDD red-before-green.** Every behavior change ships a failing test first, then the impl.
2. **No "skip low-severity" in QA.** If the QA agent reports an issue, the Dev agent fixes it or justifies not-fixing in writing. No silent drops.
3. **Skill alignment.** Design choices (response format, pagination, annotations, errors) follow `01-mcp-skill.md` and `02-node-guide.md`.
4. **Full API parity.** 29 new tools in Stage 8 — no endpoint dropped except the two explicitly skipped (`/api/health`, PKCE browser challenge flow).
5. **Per-stage local commits.** Each logical step is its own commit. Do NOT push. Do NOT open PR. The orchestrator handles final push + PR after Stage 9 approval.
6. **Version bump** happens only after Stage 9 passes QA. Bump to `2.0.0` in `package.json` + CHANGELOG entry at that moment, not before.

## Ralph Loop per stage

```
Dev(stage N) → commits locally
   ↓
QA(stage N) → reads commits, reports full issue list
   ↓
if issues: Dev-fix(issues) → commits → QA re-reviews
   ↓ (loop until QA reports zero issues)
Stage N complete → move to Stage N+1
```

## Existing test safety net

297 unit tests across `src/tools/*.test.ts` already pass. They stay green throughout the refactor. If any turns red during a Dev cycle, fix it before QA review.

## Communication primitive

- Dev agents commit with messages prefixed: `stage(N): <scope> — <change>`
- QA reports use the template in `04-qa-template.md`
- Orchestrator (main Claude) runs `npm test && npm run typecheck && npm run lint` between Dev and QA to verify state.
