# QA Review Template

QA agents: report every issue you find. No "skip if low severity". Classify but do not drop.

## Report structure

```
# Stage N QA Review — <timestamp>

Scope: commits <sha>..<sha> on branch engineer/mcp-v2-full-parity
Files reviewed: <count>
Tests: <N passing / M failing> (ran: `npm test && npm run typecheck && npm run lint`)

## Blockers (must fix before next stage)
- <issue 1>: <file:line> — <description + why it blocks>
- ...

## Quality issues (must fix before next stage, but not blocking build)
- <issue>: <file:line> — <description + suggested fix>

## Nits (must fix — NO SKIP POLICY)
- <issue>: <file:line> — <description>

## Skill-alignment check
- [ ] Zod `.strict()` on every new schema
- [ ] Description has Args/Returns/Examples/Error Handling (stage-appropriate)
- [ ] Annotations per MCP spec only (no custom keys)
- [ ] Error messages actionable (see skill §Error Handling)
- [ ] Response format handled (markdown default for read-heavy, char-limit applied)
- [ ] Existing 297 tests still passing
- [ ] New tests' red-then-green confirmed (the specific RED tests named in 02-stage-plan.md now pass)

## TDD audit (false-positive hunt)
For at least 3 new tests per stage:
- Would the test still pass if the handler returned `{ content: [{ type: "text", text: "{}" }] }`? If yes → false positive.
- Is `isError: true` asserted separately from the text match? If no → false positive.
- Are URL + method + body all asserted on mutations? If not → missing assertion.

## Decision
- [ ] APPROVE — no issues, stage complete
- [ ] REQUEST_CHANGES — see lists above; Dev must address ALL items before re-review
```

## No-skip policy

QA must not self-censor. If an issue is trivial (typo, unused import, missing space), still list it under Nits. The Dev agent handles nits in its fix cycle. Only way an issue exits the list is with a written justification by Dev, acknowledged by QA on re-review.

## Re-review cadence

Ralph Loop continues until QA returns zero issues across Blockers + Quality + Nits. Dev commits fix → QA runs again → reports remaining issues (ideally fewer) → Dev fixes → ... until clean.
