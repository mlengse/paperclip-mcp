# MCP Reliability & API-Compatibility Validation Plan

**Version:** 1.0
**Owner:** CTO
**Status:** Living document — update on every new tool addition, known-bug resolution, or Paperclip API version bump.
**Last updated:** 2026-04-10

---

## 1. Purpose

This document is the authoritative reliability and API-compatibility standard for `paperclip-mcp`. It exists because MCP is now the **sole channel** through which Paperclip agents interact with the control-plane REST API during normal runs. Curl fallback is permitted only in MCP tool failure scenarios and human-operator contexts. Under that constraint, any gap or drift between the MCP surface and the underlying API is directly agent-visible: bad schemas produce agent misroutes, missing endpoints force unauthorized curl use, and silent serialization bugs produce state corruption without error signals.

The CTO owns this document. It is updated when:

- A new `paperclip_*` tool is added or removed from any `src/tools/*.ts` module.
- A Paperclip REST API change is detected (field rename, endpoint path change, new required parameter, error code change).
- A known workaround in `src/tools/*.ts` is resolved or a new one is introduced.
- The monthly drift check (Phase 4) flags any cell in the compatibility matrix as failing.

---

## 2. Scope

### In scope

- Every `paperclip_*` tool exported from `src/tools/*.ts` and registered via `src/tools/index.ts`.
- The Paperclip REST API endpoints those tools call, as documented at `https://docs.paperclip.ing`.
- The Zod input schemas in each tool module and their alignment with the API's accepted request bodies and query parameters.
- The HTTP response shapes returned by the API and forwarded as `JSON.stringify(data)` to callers.
- Error path behavior: what status codes reach agents and in what form.
- Startup env-var validation in `src/auth.ts`.
- Argument serialization edge cases introduced by the MCP JSON-RPC transport (e.g., arrays arriving as JSON-encoded strings).

### Out of scope

- Paperclip server-internal behavior (database queries, background jobs, platform-level bugs that are not MCP-observable — except where MCP compensates for them, which is in scope).
- Billing infrastructure and payment processing.
- Authentication infrastructure beyond env-var wiring (OAuth flows, key rotation policy).
- The MCP SDK itself (`@modelcontextprotocol/sdk`) — bugs there are upstream concerns.
- Non-`paperclip_*` MCP tools (sequential-thinking, memory servers).

---

## 3. Reliability Dimensions

### 3a. Schema Drift

Schema drift occurs when the Paperclip REST API adds, renames, removes, or retyps a field that an MCP tool's Zod schema relies on for input validation or that an agent parses from the tool's response. Because the Zod schemas in `src/tools/*.ts` are hand-maintained, they do not auto-update when the API changes.

**How we measure it:** During Phase 1, every tool's input schema is cross-checked against the corresponding API endpoint documented at `https://docs.paperclip.ing`. For mutations, we verify that optional fields in the schema match the API's documented optional vs. required distinction, and that no field names have drifted. For responses, we verify that the shape forwarded via `JSON.stringify(data)` contains the fields agents depend on (e.g., `executionRunId`, `status`, `id`, `identifier`). In Phase 4, a monthly automated audit re-runs this cross-check.

**PASS criteria:** Every field referenced in the tool's Zod schema exists in the API contract under the same name and type. No API-required fields are marked optional in the MCP schema. No fields deprecated by the API are still described as current in tool descriptions. Response shapes that agents parse are documented and stable.

### 3b. Idempotency and Retry Safety

Agents retry on transient failure per the MCP Tool Failover protocol: one automatic retry on any `isError` result before escalating. Some tools are inherently idempotent (`paperclip_upsert_document`, `paperclip_release_issue`), others are not (`paperclip_create_issue`, `paperclip_add_comment`). A double-fire of a non-idempotent tool due to an agent retry or Scrum Master stale-lock scan can create duplicate issues, comments, or approval requests.

**How we measure it:** For each tool, we identify the HTTP verb, classify the endpoint as idempotent or not, check whether the `idempotentHint` annotation in `src/tools/index.ts` is accurate, and verify that non-idempotent tools carry sufficient agent-side guard rails in their descriptions. We also verify that the `paperclip_checkout_issue` auto-release-and-retry path (implemented for PAP-123) cannot loop: the code in `src/tools/issues.ts` performs exactly one release and one retry before surfacing the original 409.

**PASS criteria:** `idempotentHint: true` is set only on tools where the underlying endpoint is genuinely idempotent (verified against API docs). Destructive non-idempotent tools set `destructiveHint: true`. The `paperclip_checkout_issue` retry path executes at most three HTTP calls (checkout, release, checkout-retry) with no loop. Agent retry of a 5xx on a `paperclip_create_issue` call is documented as producing a potential duplicate and agents are instructed to search before retry.

### 3c. Error Surface Quality

Agents receive errors as `{ isError: true, content: [{ type: "text", text: "..." }] }`. The quality of that text determines whether the agent can self-diagnose without escalation. Prior to PAP-116, the error text omitted the response body, leaving agents with only the HTTP status code. PAP-116 landed `PaperclipApiError` with `body` inclusion in `src/errors.ts`, giving agents the full server message.

This dimension also tracks whether the correct HTTP error code reaches agents. A known concern (PAP-119, referenced in CLAUDE.md context) involves endpoints returning 422 where a 404 would be semantically correct. The `paperclip_get_agent` tool already works around a related issue by injecting `companyId` as a query parameter to prevent a server-side 422 fallback (documented in `src/tools/agents.test.ts`). The `paperclip_list_comments` tool documents that the server-side `after` cursor returns HTTP 500 and implements a client-side workaround.

**How we measure it:** For each tool, we verify that `handleApiError` in `src/tools/validation.ts` produces a text string containing the status code, status text, and the full `body` field. We check that error codes documented in the compatibility matrix (Section 4) match what the API actually returns for known bad-input scenarios. Workarounds for API bugs are tracked in the matrix and linked to Paperclip issues.

**PASS criteria:** Every `isError` response contains at minimum: HTTP status code, HTTP status text, and the raw API response body. No tool swallows errors silently (all handlers use `handleApiError` or re-throw). Status codes seen by agents match the API contract for 401/403/404/409/422/5xx scenarios. Each active client-side workaround is documented in both the tool description and this matrix.

### 3d. Argument Serialization Fidelity

MCP clients communicate with the server over JSON-RPC stdio. Some MCP client implementations serialize array-typed arguments as JSON-encoded strings (`"[\"todo\",\"in_progress\"]"` instead of `["todo","in_progress"]`). This was the root cause of PAP-120. The fix introduced `z.preprocess(jsonArrayPreprocess, z.array(...))` for `labelIds`, `expectedStatuses`, and `desiredSkills` in `src/tools/issues.ts` and `src/tools/agents.ts`.

**How we measure it:** We audit every Zod schema field of type `array` across all tool modules to confirm it uses the `jsonArrayPreprocess` wrapper. We check nullable fields (`assigneeAgentId: z.string().nullable().optional()`) to confirm they survive JSON-RPC null serialization. We check nested object fields (e.g., `workspace` in `CreateProjectInput` in `src/tools/projects.ts`) for any client-side coercion needs. Unit tests for each array field with a JSON-encoded-string input are required as regression guards (pattern established in `src/tools/issues.test.ts`).

**PASS criteria:** Every `array`-typed input field uses `jsonArrayPreprocess` or equivalent. Every `nullable` field is explicitly declared `z.string().nullable()` (not just `.optional()`). Each preprocessed field has at least one unit test exercising the JSON-string input form. No array field silently drops its value or throws an unhandled JSON parse error.

### 3e. Startup Fail-Fast

`src/auth.ts` reads four required environment variables at server startup: `PAPERCLIP_API_KEY`, `PAPERCLIP_API_URL`, `PAPERCLIP_AGENT_ID`, and `PAPERCLIP_COMPANY_ID`. If any are absent, `getAuthConfig()` throws synchronously before the MCP server binds. `PAPERCLIP_RUN_ID` is optional.

**How we measure it:** We verify that each of the four required vars triggers a thrown `Error` with a descriptive message when absent. We verify that a misconfigured `PAPERCLIP_API_URL` (e.g., wrong scheme, trailing slash causing double-slash in paths) is caught early — currently the URL is used verbatim without normalization, which could produce subtle 404s. We also verify that the `PaperclipClient` constructor (in `src/client.ts`) calls `getAuthConfig()` at construction time, not lazily, so any missing var crashes before the first tool call.

**PASS criteria:** Each missing required env var produces a thrown Error with a message naming the missing variable, before any MCP tool request is accepted. A malformed `PAPERCLIP_API_URL` (e.g., no scheme) is either rejected at startup or documented as a known limitation. The server does not start in a degraded state with some tools working and others failing due to env-var absence.

### 3f. Response Shape Stability

All tool handlers return `{ content: [{ type: "text", text: JSON.stringify(data) }] }`. Agents parse this text with `JSON.parse()`. If the API ever returns a non-JSON content type, or a 204 with an unexpected body, or if `JSON.stringify` is called on a value that is already a string (double-serialization), the downstream parse fails silently or throws.

**How we measure it:** We verify that `client.handleResponse` in `src/client.ts` handles 204 responses correctly (returns `undefined as T`). We check whether any tool handler double-serializes by calling `JSON.stringify` on an already-stringified value. We verify that timestamps in responses are ISO-8601 strings (not epoch integers) and that UUIDs are lowercase hex with dashes. We check whether the `_note` wrapper object added by `paperclip_list_comments` when the `after` cursor is used is documented and known to downstream agents.

**PASS criteria:** All tool responses are valid JSON strings. No double-serialization occurs. 204 responses return `undefined` without throwing. The `_note` wrapper in `paperclip_list_comments` is documented. Timestamps, UUIDs, and enum values in responses are in the formats agents expect (documented per-tool in the compatibility matrix).

### 3g. Coverage Completeness

Coverage completeness tracks whether every Paperclip API endpoint used by the 8 orchestrated agents is exposed as an MCP tool. Gaps force agents to fall back to curl, violating the MCP-only policy. Conversely, tools that expose endpoints agents never need add attack surface and maintenance burden.

**How we measure it:** We cross-reference the agent AGENTS.md files (8 agents) and the Scrum Master heartbeat workflow against the tool list in `src/tools/index.ts`. For each agent action described in CLAUDE.md (checkout, release, update, comment, approve, hire, etc.), we confirm a corresponding `paperclip_*` tool exists. We also flag tools that exist in the codebase but are not referenced in any agent workflow, to confirm they are intentional.

**PASS criteria:** Every action described in the Paperclip Agent Workflow section of CLAUDE.md maps to at least one `paperclip_*` tool. No agent workflow step requires a direct curl call during normal operation. The full tool inventory in `ALL_TOOLS` in `src/tools/index.ts` is documented in `docs/reference/tools.md` and matches the actual exports.

---

## 4. Compatibility Matrix

The table below has one row per `paperclip_*` tool. Column definitions:

- **Input coverage:** PASS if all API-accepted input fields are represented in the Zod schema; FAIL if required fields are missing or field names are wrong; PARTIAL if optional fields are absent.
- **Required-param enforcement:** PASS if Zod marks the same fields as required that the API requires; FAIL otherwise.
- **Response shape:** PASS if the fields agents consume are present and typed correctly in a real API response; UNKNOWN if not yet verified against a live instance.
- **Error codes (401/404/409/422/5xx):** PASS if the tool surfaces each relevant status code correctly; FAIL if any status is swallowed or mapped incorrectly; N/A if a code is not applicable.
- **Tests:** PASS if unit tests cover happy path + validation failure + at least one error status; PARTIAL if only some scenarios are covered; FAIL if no tests exist.
- **Last verified:** Date the row was last audited against the live API.
- **Status:** PASS / FAIL / NEEDS-REVIEW.

<!-- populated by QA audit Workstream B — Phase 1 static audit completed 2026-04-11 -->
<!--
  Audit methodology: read all src/tools/*.ts and src/tools/*.test.ts; cross-check Zod schemas;
  verify jsonArrayPreprocess usage on all array fields; check annotation correctness; review test coverage.
  Response shape column is UNKNOWN throughout — static audit cannot verify live API response shapes.
  See child issues filed under PAP-166 for FAIL and PARTIAL cells.
-->

| Tool                                    | HTTP verb        | Endpoint                                                       | Input coverage | Required-param enforcement | Response shape | Error codes | Tests   | Last verified | Status       |
| --------------------------------------- | ---------------- | -------------------------------------------------------------- | -------------- | -------------------------- | -------------- | ----------- | ------- | ------------- | ------------ |
| `paperclip_get_me`                      | GET              | `/api/agents/{agentId}`                                        | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_inbox`                   | GET              | `/api/agents/me/inbox-lite`                                    | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_issues`                 | GET              | `/api/companies/{companyId}/issues`                            | PASS           | PASS                       | PASS           | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_issue`                   | GET              | `/api/issues/{issueId}`                                        | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_heartbeat_context`       | GET              | `/api/issues/{issueId}/heartbeat-context`                      | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_checkout_issue`              | POST             | `/api/issues/{issueId}/checkout`                               | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_release_issue`               | POST             | `/api/issues/{issueId}/release`                                | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_update_issue`                | PATCH            | `/api/issues/{issueId}`                                        | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_issue`                | POST             | `/api/companies/{companyId}/issues`                            | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_comments`               | GET              | `/api/issues/{issueId}/comments`                               | PASS           | PASS                       | PASS           | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_add_comment`                 | POST             | `/api/issues/{issueId}/comments`                               | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_comment`                 | GET              | `/api/issues/{issueId}/comments/{commentId}`                   | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_documents`              | GET              | `/api/issues/{issueId}/documents`                              | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_document`                | GET              | `/api/issues/{issueId}/documents/{key}`                        | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_upsert_document`             | PUT              | `/api/issues/{issueId}/documents/{key}`                        | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_delete_document`             | DELETE           | `/api/issues/{issueId}/documents/{key}`                        | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_document_revisions`      | GET              | `/api/issues/{issueId}/documents/{key}/revisions`              | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_agents`                 | GET              | `/api/companies/{companyId}/agents`                            | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_agent`                   | GET              | `/api/agents/{agentId}?companyId={companyId}`                  | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_update_agent`                | PATCH            | `/api/agents/{agentId}`                                        | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_pause_agent`                 | POST             | `/api/agents/{agentId}/pause`                                  | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_resume_agent`                | POST             | `/api/agents/{agentId}/resume`                                 | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_invoke_heartbeat`            | POST             | `/api/agents/{agentId}/heartbeat/invoke`                       | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_terminate_agent`             | POST             | `/api/agents/{agentId}/terminate`                              | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_agent_key`            | POST             | `/api/agents/{agentId}/keys`                                   | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_agent_config_revisions` | GET              | `/api/agents/{agentId}/config-revisions`                       | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_rollback_agent_config`       | POST             | `/api/agents/{agentId}/config-revisions/{revisionId}/rollback` | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_set_agent_instructions_path` | PATCH            | `/api/agents/{agentId}/instructions-path`                      | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_org_chart`               | GET              | `/api/companies/{companyId}/org`                               | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_sync_agent_skills`           | POST             | `/api/agents/{agentId}/skills/sync`                            | FAIL           | PASS                       | UNKNOWN        | PASS        | PARTIAL | 2026-04-11    | FAIL         |
| `paperclip_list_company_skills`         | GET              | `/api/companies/{companyId}/skills`                            | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_dashboard`               | GET              | `/api/companies/{companyId}/dashboard`                         | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_approvals`              | GET              | `/api/companies/{companyId}/approvals`                         | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_approval`                | GET              | `/api/approvals/{approvalId}`                                  | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_approval`             | POST             | `/api/companies/{companyId}/approvals`                         | PARTIAL        | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | NEEDS-REVIEW |
| `paperclip_approve`                     | POST             | `/api/approvals/{approvalId}/approve`                          | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_reject`                      | POST             | `/api/approvals/{approvalId}/reject`                           | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_request_revision`            | POST             | `/api/approvals/{approvalId}/request-revision`                 | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_resubmit_approval`           | POST             | `/api/approvals/{approvalId}/resubmit`                         | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_approval_comments`      | GET              | `/api/approvals/{approvalId}/comments`                         | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_add_approval_comment`        | POST             | `/api/approvals/{approvalId}/comments`                         | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_agent_hire`           | POST             | `/api/companies/{companyId}/agent-hires`                       | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_goals`                  | GET              | `/api/companies/{companyId}/goals`                             | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_goal`                    | GET              | `/api/goals/{goalId}`                                          | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_goal`                 | POST             | `/api/companies/{companyId}/goals`                             | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_update_goal`                 | PATCH            | `/api/goals/{goalId}`                                          | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_projects`               | GET              | `/api/companies/{companyId}/projects`                          | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_project`                 | GET              | `/api/projects/{projectId}`                                    | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_project`              | POST             | `/api/companies/{companyId}/projects`                          | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_update_project`              | PATCH            | `/api/projects/{projectId}`                                    | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_workspaces`             | GET              | `/api/projects/{projectId}/workspaces`                         | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_workspace`            | POST             | `/api/projects/{projectId}/workspaces`                         | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_update_workspace`            | PATCH            | `/api/projects/{projectId}/workspaces/{workspaceId}`           | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_activity`                | GET              | `/api/companies/{companyId}/activity`                          | PARTIAL        | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | NEEDS-REVIEW |
| `paperclip_get_cost_summary`            | GET              | `/api/companies/{companyId}/costs/summary`                     | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_costs_by_agent`          | GET              | `/api/companies/{companyId}/costs/by-agent`                    | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_costs_by_project`        | GET              | `/api/companies/{companyId}/costs/by-project`                  | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_report_cost_event`           | POST             | `/api/companies/{companyId}/cost-events`                       | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_routines`               | GET              | `/api/companies/{companyId}/routines`                          | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_get_routine`                 | GET              | `/api/routines/{routineId}`                                    | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_routine`              | POST             | `/api/companies/{companyId}/routines`                          | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_update_routine`              | PATCH            | `/api/routines/{routineId}`                                    | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_add_routine_trigger`         | POST             | `/api/routines/{routineId}/triggers`                           | PARTIAL        | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | NEEDS-REVIEW |
| `paperclip_update_routine_trigger`      | PATCH            | `/api/routine-triggers/{triggerId}`                            | PARTIAL        | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | NEEDS-REVIEW |
| `paperclip_delete_routine_trigger`      | DELETE           | `/api/routine-triggers/{triggerId}`                            | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_run_routine`                 | POST             | `/api/routines/{routineId}/run`                                | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_routine_runs`           | GET              | `/api/routines/{routineId}/runs`                               | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_attachments`            | GET              | `/api/issues/{issueId}/attachments`                            | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_upload_attachment`           | POST (multipart) | `/api/companies/{companyId}/issues/{issueId}/attachments`      | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_download_attachment`         | GET              | `/api/attachments/{attachmentId}/content`                      | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_delete_attachment`           | DELETE           | `/api/attachments/{attachmentId}`                              | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_list_labels`                 | GET              | `/api/companies/{companyId}/labels`                            | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |
| `paperclip_create_label`                | POST             | `/api/companies/{companyId}/labels`                            | PASS           | PASS                       | UNKNOWN        | PASS        | PASS    | 2026-04-11    | PASS         |

**Matrix notes (Phase 1 static audit, 2026-04-11):**

- **Response shape UNKNOWN across all tools:** Static audit cannot verify live API response shapes without a running Paperclip server. Contract tests (Phase 2) will resolve these to PASS/FAIL.
- **`paperclip_sync_agent_skills` FAIL — input coverage:** `desiredSkills` uses plain `z.array(z.string())` without `z.preprocess(jsonArrayPreprocess, ...)`. All other array fields in the codebase use this preprocess (PAP-120 fix pattern). If an MCP client sends `desiredSkills` as a JSON-encoded string, the tool will throw a validation error instead of normalizing it. Also missing a JSON-encoded string regression test. Child issue filed: see Section 6.
- **`paperclip_create_approval` NEEDS-REVIEW — input coverage PARTIAL:** `payload` is typed as `z.record(z.string(), z.unknown())` with no inner schema per `type` discriminant. This is intentional — the API accepts arbitrary payloads — but provides no compile-time or runtime guard against sending an incorrect payload for `hire_agent` vs `approve_ceo_strategy` vs `budget_override_required`. Tracked in Section 6.
- **`paperclip_get_activity` NEEDS-REVIEW — input coverage PARTIAL:** Schema exposes `agentId`, `entityType`, `entityId` filters but no pagination parameters (limit/offset/cursor). If the API supports pagination for this endpoint, agents will always receive unbounded result sets. Cannot verify without live API docs. Tracked in Section 6.
- **`paperclip_add_routine_trigger` / `paperclip_update_routine_trigger` NEEDS-REVIEW — input coverage PARTIAL:** `config` object only exposes `cron` field (for schedule triggers). Webhook triggers likely require additional config fields (e.g., URL, secret). `api` type triggers may not need config. Cannot verify without live API docs. Tracked in Section 6.

---

## 5. Phased Validation Approach

### Phase 1 — Static Audit (baseline)

Read every file in `src/tools/*.ts` and every `src/tools/*.test.ts`. For each tool: identify the HTTP verb and endpoint path; compare the Zod schema fields against `https://docs.paperclip.ing`; identify any field name mismatches, missing required fields, or incorrectly typed fields; check that `idempotentHint`, `destructiveHint`, and `readOnlyHint` annotations match the verb and endpoint semantics; audit every `array`-typed Zod field for `jsonArrayPreprocess` usage (PAP-120 pattern); and flag any tool whose description references a known workaround (currently: `paperclip_list_comments` `after` cursor, `paperclip_get_agent` `companyId` injection).

The output of Phase 1 is a fully populated compatibility matrix (Section 4) with PASS/FAIL/PARTIAL/UNKNOWN cells, and a set of backlog issues filed against failing or unknown cells (Section 6). Phase 1 baseline was performed on 2026-04-10 by the QA audit.

### Phase 2 — Contract Tests

Build a test harness that exercises each tool against a live local Paperclip server instance. The harness extends the existing `node:test` + `tsx` pattern established in `src/tools/*.test.ts`. For each tool, define five test scenarios:

1. **Happy path** — valid input, assert response shape contains expected fields.
2. **Known-bad input** — deliberately invalid field values, assert `isError: true` and a descriptive message.
3. **Not-found resource** — reference a non-existent UUID, assert the correct 404 response.
4. **Permission error** — use a key that lacks the required scope, assert 401 or 403.
5. **Server error simulation** — where the Paperclip API supports it (or via an intercepting proxy), inject a 500 and verify the tool returns `isError: true` with the status code in the message.

Contract tests are gated behind an environment variable (`PAPERCLIP_CONTRACT_TESTS=1`) so they do not run in unit-test mode where no live API is available. They integrate into `npm run test` as a conditional suite.

### Phase 3 — CI Integration Gate (deferred)

Add a `contract-tests` job to `.github/workflows/quality-gate.yml` that spins up a local Paperclip server, seeds it with fixture data, runs the Phase 2 contract tests against it, and tears down.

**Status: DEFERRED.** Two prerequisites are not yet decided and are explicitly parked for future review:

1. **Container image** — whether a Podman-compatible image of the Paperclip server is available for CI use, or whether the project builds its own.
2. **CI secrets** — how `PAPERCLIP_API_KEY`, `PAPERCLIP_AGENT_ID`, and `PAPERCLIP_COMPANY_ID` are seeded in the GH Actions runner, and the rotation policy.

Phase 2 contract tests can run locally without Phase 3. This section remains in the plan as a placeholder so the eventual CI integration has a home, but no issue is filed for Phase 3 yet. Revisit when the container story and secrets story are decided.

### Phase 4 — Monthly Drift Check

A scheduled GH Actions workflow (`cron: '0 9 1 * *'`) runs the standalone static-audit script (Phase 1 tooling, factored into `scripts/mcp-drift-check.ts`) and compares its output against the last-known-good baseline committed in `docs/quality/mcp-reliability-plan.md`. Any drift triggers the workflow to file a Paperclip backlog issue automatically via the MCP server, assigned to CTO. The drift check covers: new endpoints in the API not yet exposed as tools, deprecated endpoints still implemented as tools, and field name changes in documented request/response bodies.

Rationale for the GH Actions path (instead of a Paperclip routine): no machine-readable Paperclip API spec is currently published (see Open Question Q3 resolution). A standalone static-audit script is the only option until an OpenAPI spec exists.

For the drift-response runbook (triage SLA, remediation options, silencing procedure), see [`docs/quality/drift-response-runbook.md`](drift-response-runbook.md).

### Phase 5 — OpenAPI Contract (stretch)

If Paperclip ever publishes an OpenAPI 3.x specification, generate Zod schemas from it using `openapi-zod-client` or equivalent, diff the generated schemas against the hand-maintained schemas in `src/tools/*.ts`, and run this diff as a CI step on every PR. This eliminates manual schema drift detection and makes Phase 4 deterministic. Stretch goal: auto-generate stub tool definitions for newly documented endpoints and file a Paperclip issue for each stub, assigning it to Engineer for implementation.

---

## 6. Sub-Issues to File

The following Paperclip backlog issues execute Phases 1–4. All issues follow `docs/guides/issue-creation-standard.md`. Filed with this plan (PAP IDs will be listed here after the filing pass lands).

### Issue W1 — Commit `docs/quality/mcp-reliability-plan.md`

**Assignee:** TechWriter · **Priority:** high · **Labels:** `type:docs`, `source:agent`, `agent:techwriter`, `status:refined`
Commit the validated content of `mcp-reliability-plan.md` as approved by Bruno. Create `docs/quality/` directory. Verify all internal cross-references are accurate.

### Issue W2 — Phase 1: Populate compatibility matrix

**Assignee:** QA · **Priority:** high · **Labels:** `type:chore`, `source:agent`, `agent:qa`, `status:refined`
For each of the 73 tools across 13+ modules in `src/tools/*.ts`, cross-check Zod schema against `https://docs.paperclip.ing` and fill the matrix in Section 4. File a child backlog issue for each FAIL cell.

### Issue W3 — Phase 2: Contract test harness

**Assignee:** QA · **Priority:** medium · **Labels:** `type:chore`, `source:agent`, `agent:qa`, `status:refined`
Design and implement a contract test harness gated by `PAPERCLIP_CONTRACT_TESTS=1`. Implement for highest-risk groups first: issues, agents, approvals. Define fixture seed script.

### Issue W4 — Phase 2: Contract tests for docs/comments/attachments

**Assignee:** QA · **Priority:** medium · **Labels:** `type:chore`, `source:agent`, `agent:qa`, `status:refined`
Extend the harness. Specifically verify the `paperclip_list_comments` `after` cursor workaround against a real server and the `paperclip_upload_attachment` multipart path.

### Issue W5 — Phase 2: Contract tests for routines/goals/projects/activity

**Assignee:** QA · **Priority:** medium · **Labels:** `type:chore`, `source:agent`, `agent:qa`, `status:refined`
Extend the harness to remaining modules. Verify trigger lifecycle, nested workspace object round-trip, activity pagination.

### Issue W6 — Phase 3: CI contract-test job — DEFERRED

Not filed in this pass. Revisit when container image and CI secrets decisions are made (see Section 7 Q1 and Q2).

### Issue W7 — Phase 4: Monthly drift-check GH Actions workflow

**Assignee:** CTO · **Priority:** low · **Labels:** `type:chore`, `source:agent`, `agent:cto`, `status:refined`
Implement `scripts/mcp-drift-check.ts` and `.github/workflows/mcp-drift-check.yml` with `cron: '0 9 1 * *'`. File Paperclip issue on drift. Include cooldown to prevent duplicate filings.

### Issue W8 — Drift-response runbook

**Assignee:** TechWriter · **Priority:** low · **Labels:** `type:docs`, `source:agent`, `agent:techwriter`, `status:refined`
Create `docs/quality/drift-response-runbook.md`. Cover notification path (CTO), triage SLA (2 business days for mutation tools, 5 for read-only), remediation options, silencing procedure. Link from Phase 4 of this plan.

---

## 7. Open Questions

### Deferred (revisit before Phase 3 starts)

**Q1 — Local Paperclip container for CI.** **Deferred.** Container image source (upstream vs. self-built), registry, and tag strategy to be decided when Phase 3 (CI integration) is reopened.

**Q2 — CI secrets.** **Deferred.** `PAPERCLIP_API_KEY`, `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID` seeding strategy for GH Actions runners to be decided when Phase 3 is reopened. Rotation policy also deferred.

### Resolved 2026-04-10

**Q3 — Monthly drift mechanism.** **Resolved:** GH Actions scheduled workflow with a standalone static-audit script. No OpenAPI spec currently published; Phase 5 remains stretch.

**Q4 — API source of truth.** **Resolved:** `docs.paperclip.ing` is canonical. Observed lag → file a Paperclip upstream bug report + note in drift-response runbook.

**Q5 — Node fetch FormData boundary for `paperclip_upload_attachment`.** **Resolved:** Current behavior trusted; Issue W4 adds a regression test to lock it in.

**Q6 — `/api/agents/me` principal resolution.** **Resolved:** Current workaround (`/api/agents/{agentId}`) stays permanently. Upstream fix deferred to Paperclip server team. No removal planned.

**Q7 — `paperclip_list_comments` server-side `after` cursor HTTP 500.** **Resolved:** Client-side workaround stays. A Paperclip upstream bug report is filed as part of the Phase 2 comment-contract-test task (Issue W4). Drift-response runbook (Issue W8) references this as a canonical example of an active workaround.
