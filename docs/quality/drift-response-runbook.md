# MCP Drift-Response Runbook

**Owner:** CTO
**Last updated:** 2026-04-10

This runbook covers the operational response when the Phase 4 monthly drift check (`scripts/mcp-drift-check.ts` via `.github/workflows/mcp-drift-check.yml`) detects schema or coverage drift between `paperclip-mcp` and the Paperclip REST API. See [`mcp-reliability-plan.md`](mcp-reliability-plan.md) for the full validation plan.

---

## Notification path

The drift-check workflow files a Paperclip backlog issue assigned to CTO automatically. CTO triages and assigns remediation to Engineer (schema/implementation fixes) or TechWriter (description/docs updates). The drift issue identifier is included in the workflow run summary.

---

## Triage SLA

| Tool category                                     | SLA             |
| ------------------------------------------------- | --------------- |
| Mutation tools (`POST`, `PATCH`, `PUT`, `DELETE`) | 2 business days |
| Read-only tools (`GET`)                           | 5 business days |

---

## Remediation options

1. **Schema fix** — Update the Zod schema in the relevant `src/tools/*.ts` module to match the current API contract. Assign to Engineer.
2. **Description update** — Update the tool `description:` string literal to reflect API behavior changes. Assign to TechWriter.
3. **New tool** — If a net-new API endpoint is flagged, Engineer creates the tool; TechWriter documents it.
4. **Deprecation** — If an endpoint is removed upstream, Engineer removes the tool and TechWriter removes it from `docs/reference/tools.md`.

---

## Silencing a false positive

If the drift check flags a difference that is intentional (e.g., a documented workaround), add the tool name to the `DRIFT_IGNORE` list in `scripts/mcp-drift-check.ts` with a comment citing the PAP issue that approved the exception. CTO approves all silencing decisions.

---

## Canonical example: active workaround

The `paperclip_list_comments` tool implements a client-side workaround for a server-side HTTP 500 on the `after` cursor parameter. This workaround is intentional and documented in the tool description. It is tracked as a known active workaround in Section 3c of [`mcp-reliability-plan.md`](mcp-reliability-plan.md). The drift-check script must not flag it as drift.
