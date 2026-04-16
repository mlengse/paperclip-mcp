# API Coverage Matrix

Full endpoint × tool mapping for Paperclip API v2.0. One row per endpoint. Sources: `docs/v2-reference/03-api-contracts.md` and `docs/v2-reference/06-live-verified.md`. Live-verified corrections are noted in the Notes column.

Legend:

- **Auth scope** — `agent` = agent API key; `board` = human-user board key; `either` = both accepted.
- **Run-ID** — whether `X-Paperclip-Run-Id` is injected on mutations.
- **SKIPPED** — endpoint intentionally not implemented (reason provided).

---

## Identity

| Endpoint                       | Method     | Tool                               | Source            | Auth   | Run-ID | Notes                                             |
| ------------------------------ | ---------- | ---------------------------------- | ----------------- | ------ | ------ | ------------------------------------------------- |
| `/api/me`                      | GET        | `paperclip_get_me`                 | `identity.ts:40`  | either | —      | Agent identity                                    |
| `/api/me/inbox`                | GET        | `paperclip_get_inbox`              | `identity.ts:76`  | either | —      | Assigned issues                                   |
| `/api/cli-auth/me`             | GET        | `paperclip_get_current_user`       | `identity.ts:112` | board  | —      | Board-only                                        |
| `/api/cli-auth/revoke-current` | POST       | `paperclip_revoke_current_session` | `identity.ts:149` | board  | —      | Board-only; destructive                           |
| `/api/cli-auth/challenges`     | POST + GET | SKIPPED                            | —                 | —      | —      | Browser-mediated PKCE; requires human interaction |

---

## Companies

| Endpoint                             | Method | Tool                        | Source           | Auth   | Run-ID | Notes                                                 |
| ------------------------------------ | ------ | --------------------------- | ---------------- | ------ | ------ | ----------------------------------------------------- |
| `/api/companies`                     | GET    | `paperclip_list_companies`  | `company.ts:80`  | board  | —      | Board-only                                            |
| `/api/companies`                     | POST   | `paperclip_create_company`  | `company.ts:155` | board  | yes    | Board-only                                            |
| `/api/companies/{companyId}`         | GET    | `paperclip_get_company`     | `company.ts:118` | board  | —      | Board-only                                            |
| `/api/companies/{companyId}`         | PATCH  | `paperclip_update_company`  | `company.ts:196` | either | yes    | Board-only fields filtered for agent keys             |
| `/api/companies/{companyId}/archive` | POST   | `paperclip_archive_company` | `company.ts:243` | board  | —      | Board-only; dedicated archive endpoint confirmed live |

---

## Agents

| Endpoint                                                       | Method | Tool                                    | Source           | Auth   | Run-ID | Notes                       |
| -------------------------------------------------------------- | ------ | --------------------------------------- | ---------------- | ------ | ------ | --------------------------- |
| `/api/companies/{companyId}/agents`                            | GET    | `paperclip_list_agents`                 | `agents.ts:359`  | either | —      |                             |
| `/api/companies/{companyId}/agents`                            | POST   | `paperclip_create_agent`                | `agents.ts:1067` | board  | yes    | Board-only; direct creation |
| `/api/agents/{agentId}`                                        | GET    | `paperclip_get_agent`                   | `agents.ts:393`  | either | —      |                             |
| `/api/agents/{agentId}`                                        | PATCH  | `paperclip_update_agent`                | `agents.ts:426`  | either | yes    |                             |
| `/api/agents/{agentId}/permissions`                            | PATCH  | `paperclip_update_agent_permissions`    | `agents.ts:489`  | board  | yes    | Board-only                  |
| `/api/agents/{agentId}/pause`                                  | POST   | `paperclip_pause_agent`                 | `agents.ts:548`  | either | —      |                             |
| `/api/agents/{agentId}/resume`                                 | POST   | `paperclip_resume_agent`                | `agents.ts:586`  | either | —      |                             |
| `/api/agents/{agentId}/heartbeat/invoke`                       | POST   | `paperclip_invoke_heartbeat`            | `agents.ts:625`  | either | —      |                             |
| `/api/agents/{agentId}/wakeup`                                 | POST   | `paperclip_wakeup_agent`                | `agents.ts:1019` | either | yes    | Stage 8a                    |
| `/api/agents/{agentId}/terminate`                              | POST   | `paperclip_terminate_agent`             | `agents.ts:669`  | board  | —      | Board-only; destructive     |
| `/api/agents/{agentId}/keys`                                   | POST   | `paperclip_create_agent_key`            | `agents.ts:712`  | board  | —      | Board-only                  |
| `/api/agents/{agentId}/config-revisions`                       | GET    | `paperclip_list_agent_config_revisions` | `agents.ts:762`  | either | —      |                             |
| `/api/agents/{agentId}/config-revisions/{revisionId}/rollback` | POST   | `paperclip_rollback_agent_config`       | `agents.ts:809`  | board  | yes    | Board-only; destructive     |
| `/api/agents/{agentId}/instructions-path`                      | PATCH  | `paperclip_set_agent_instructions_path` | `agents.ts:858`  | board  | yes    | Board-only                  |
| `/api/companies/{companyId}/org-chart`                         | GET    | `paperclip_get_org_chart`               | `agents.ts:912`  | either | —      |                             |
| `/api/agents/{agentId}/sync-skills`                            | POST   | `paperclip_sync_agent_skills`           | `agents.ts:940`  | either | yes    |                             |
| `/api/companies/{companyId}/skills`                            | GET    | `paperclip_list_company_skills`         | `agents.ts:985`  | either | —      |                             |

---

## Issues

| Endpoint                            | Method | Tool                              | Source          | Auth   | Run-ID | Notes                              |
| ----------------------------------- | ------ | --------------------------------- | --------------- | ------ | ------ | ---------------------------------- |
| `/api/companies/{companyId}/issues` | GET    | `paperclip_list_issues`           | `issues.ts:150` | either | —      |                                    |
| `/api/companies/{companyId}/issues` | POST   | `paperclip_create_issue`          | `issues.ts:459` | either | yes    |                                    |
| `/api/issues/{issueId}`             | GET    | `paperclip_get_issue`             | `issues.ts:201` | either | —      |                                    |
| `/api/issues/{issueId}`             | PATCH  | `paperclip_update_issue`          | `issues.ts:400` | either | yes    |                                    |
| `/api/issues/{issueId}/context`     | GET    | `paperclip_get_heartbeat_context` | `issues.ts:235` | either | —      |                                    |
| `/api/issues/{issueId}/checkout`    | POST   | `paperclip_checkout_issue`        | `issues.ts:270` | either | yes    | Atomic claim with expectedStatuses |
| `/api/issues/{issueId}/release`     | POST   | `paperclip_release_issue`         | `issues.ts:369` | either | —      |                                    |

---

## Comments

| Endpoint                         | Method | Tool                      | Source            | Auth   | Run-ID | Notes                           |
| -------------------------------- | ------ | ------------------------- | ----------------- | ------ | ------ | ------------------------------- |
| `/api/issues/{issueId}/comments` | GET    | `paperclip_list_comments` | `comments.ts:54`  | either | —      | `after`-cursor pagination quirk |
| `/api/issues/{issueId}/comments` | POST   | `paperclip_add_comment`   | `comments.ts:120` | either | yes    |                                 |
| `/api/comments/{commentId}`      | GET    | `paperclip_get_comment`   | `comments.ts:156` | either | —      |                                 |

---

## Documents

| Endpoint                                           | Method | Tool                               | Source             | Auth   | Run-ID | Notes                   |
| -------------------------------------------------- | ------ | ---------------------------------- | ------------------ | ------ | ------ | ----------------------- |
| `/api/issues/{issueId}/documents`                  | GET    | `paperclip_list_documents`         | `documents.ts:72`  | either | —      |                         |
| `/api/issues/{issueId}/documents/{slug}`           | GET    | `paperclip_get_document`           | `documents.ts:106` | either | —      |                         |
| `/api/issues/{issueId}/documents/{slug}`           | PUT    | `paperclip_upsert_document`        | `documents.ts:143` | either | yes    |                         |
| `/api/issues/{issueId}/documents/{slug}`           | DELETE | `paperclip_delete_document`        | `documents.ts:190` | board  | yes    | Board-only; destructive |
| `/api/issues/{issueId}/documents/{slug}/revisions` | GET    | `paperclip_get_document_revisions` | `documents.ts:224` | either | —      |                         |

---

## Attachments

| Endpoint                            | Method | Tool                            | Source               | Auth   | Run-ID | Notes                                      |
| ----------------------------------- | ------ | ------------------------------- | -------------------- | ------ | ------ | ------------------------------------------ |
| `/api/issues/{issueId}/attachments` | GET    | `paperclip_list_attachments`    | `attachments.ts:63`  | either | —      |                                            |
| `/api/issues/{issueId}/attachments` | POST   | `paperclip_upload_attachment`   | `attachments.ts:103` | either | yes    |                                            |
| `/api/attachments/{attachmentId}`   | GET    | `paperclip_download_attachment` | `attachments.ts:153` | either | —      | Returns upstream response JSON, not base64 |
| `/api/attachments/{attachmentId}`   | DELETE | `paperclip_delete_attachment`   | `attachments.ts:187` | either | yes    | Destructive                                |

---

## Labels

| Endpoint                            | Method | Tool                     | Source         | Auth   | Run-ID | Notes |
| ----------------------------------- | ------ | ------------------------ | -------------- | ------ | ------ | ----- |
| `/api/companies/{companyId}/labels` | GET    | `paperclip_list_labels`  | `labels.ts:39` | either | —      |       |
| `/api/companies/{companyId}/labels` | POST   | `paperclip_create_label` | `labels.ts:77` | either | yes    |       |

---

## Goals

| Endpoint                           | Method | Tool                    | Source         | Auth   | Run-ID | Notes |
| ---------------------------------- | ------ | ----------------------- | -------------- | ------ | ------ | ----- |
| `/api/companies/{companyId}/goals` | GET    | `paperclip_list_goals`  | `goals.ts:54`  | either | —      |       |
| `/api/companies/{companyId}/goals` | POST   | `paperclip_create_goal` | `goals.ts:128` | either | yes    |       |
| `/api/goals/{goalId}`              | GET    | `paperclip_get_goal`    | `goals.ts:93`  | either | —      |       |
| `/api/goals/{goalId}`              | PATCH  | `paperclip_update_goal` | `goals.ts:171` | either | yes    |       |

---

## Projects

| Endpoint                                             | Method | Tool                         | Source            | Auth   | Run-ID | Notes                                                                             |
| ---------------------------------------------------- | ------ | ---------------------------- | ----------------- | ------ | ------ | --------------------------------------------------------------------------------- |
| `/api/companies/{companyId}/projects`                | GET    | `paperclip_list_projects`    | `projects.ts:99`  | either | —      |                                                                                   |
| `/api/companies/{companyId}/projects`                | POST   | `paperclip_create_project`   | `projects.ts:171` | either | yes    |                                                                                   |
| `/api/projects/{projectId}`                          | GET    | `paperclip_get_project`      | `projects.ts:136` | either | —      |                                                                                   |
| `/api/projects/{projectId}`                          | PATCH  | `paperclip_update_project`   | `projects.ts:220` | either | yes    |                                                                                   |
| `/api/projects/{projectId}/workspaces`               | GET    | `paperclip_list_workspaces`  | `projects.ts:265` | either | —      |                                                                                   |
| `/api/projects/{projectId}/workspaces`               | POST   | `paperclip_create_workspace` | `projects.ts:309` | either | yes    |                                                                                   |
| `/api/projects/{projectId}/workspaces/{workspaceId}` | PATCH  | `paperclip_update_workspace` | `projects.ts:353` | either | yes    |                                                                                   |
| `/api/projects/{projectId}/workspaces/{workspaceId}` | DELETE | `paperclip_delete_workspace` | `projects.ts:399` | board  | yes    | Board-only; returns deleted workspace object (live-verified — not `{ ok: true }`) |

---

## Approvals

| Endpoint                                       | Method | Tool                               | Source             | Auth   | Run-ID | Notes                               |
| ---------------------------------------------- | ------ | ---------------------------------- | ------------------ | ------ | ------ | ----------------------------------- |
| `/api/companies/{companyId}/approvals`         | GET    | `paperclip_list_approvals`         | `approvals.ts:124` | either | —      |                                     |
| `/api/companies/{companyId}/approvals`         | POST   | `paperclip_create_approval`        | `approvals.ts:200` | either | yes    |                                     |
| `/api/approvals/{approvalId}`                  | GET    | `paperclip_get_approval`           | `approvals.ts:165` | either | —      |                                     |
| `/api/approvals/{approvalId}/approve`          | POST   | `paperclip_approve`                | `approvals.ts:242` | board  | yes    | Board-only; destructive             |
| `/api/approvals/{approvalId}/reject`           | POST   | `paperclip_reject`                 | `approvals.ts:277` | board  | yes    | Board-only; destructive             |
| `/api/approvals/{approvalId}/request-revision` | POST   | `paperclip_request_revision`       | `approvals.ts:316` | board  | yes    | Board-only                          |
| `/api/approvals/{approvalId}/resubmit`         | POST   | `paperclip_resubmit_approval`      | `approvals.ts:363` | either | yes    |                                     |
| `/api/approvals/{approvalId}/comments`         | GET    | `paperclip_list_approval_comments` | `approvals.ts:404` | either | —      |                                     |
| `/api/approvals/{approvalId}/comments`         | POST   | `paperclip_add_approval_comment`   | `approvals.ts:452` | either | yes    |                                     |
| `/api/approvals/{approvalId}/issues`           | GET    | `paperclip_list_approval_issues`   | `approvals.ts:546` | either | —      | Stage 8a                            |
| `/api/companies/{companyId}/agent-hires`       | POST   | `paperclip_create_agent_hire`      | `approvals.ts:494` | either | yes    | Creates agent-hire approval request |

---

## Routines

| Endpoint                                         | Method | Tool                               | Source            | Auth   | Run-ID | Notes       |
| ------------------------------------------------ | ------ | ---------------------------------- | ----------------- | ------ | ------ | ----------- |
| `/api/companies/{companyId}/routines`            | GET    | `paperclip_list_routines`          | `routines.ts:130` | either | —      |             |
| `/api/companies/{companyId}/routines`            | POST   | `paperclip_create_routine`         | `routines.ts:200` | either | yes    |             |
| `/api/routines/{routineId}`                      | GET    | `paperclip_get_routine`            | `routines.ts:165` | either | —      |             |
| `/api/routines/{routineId}`                      | PATCH  | `paperclip_update_routine`         | `routines.ts:246` | either | yes    |             |
| `/api/routines/{routineId}/triggers`             | POST   | `paperclip_add_routine_trigger`    | `routines.ts:292` | either | yes    |             |
| `/api/routines/{routineId}/triggers/{triggerId}` | PATCH  | `paperclip_update_routine_trigger` | `routines.ts:331` | either | yes    |             |
| `/api/routines/{routineId}/triggers/{triggerId}` | DELETE | `paperclip_delete_routine_trigger` | `routines.ts:377` | either | yes    | Destructive |
| `/api/routines/{routineId}/run`                  | POST   | `paperclip_run_routine`            | `routines.ts:414` | either | yes    |             |
| `/api/routines/{routineId}/runs`                 | GET    | `paperclip_list_routine_runs`      | `routines.ts:445` | either | —      |             |

---

## Activity & Costs

| Endpoint                                      | Method | Tool                             | Source            | Auth   | Run-ID | Notes |
| --------------------------------------------- | ------ | -------------------------------- | ----------------- | ------ | ------ | ----- |
| `/api/companies/{companyId}/activity`         | GET    | `paperclip_get_activity`         | `activity.ts:54`  | either | —      |       |
| `/api/companies/{companyId}/costs/summary`    | GET    | `paperclip_get_cost_summary`     | `activity.ts:102` | either | —      |       |
| `/api/companies/{companyId}/costs/by-agent`   | GET    | `paperclip_get_costs_by_agent`   | `activity.ts:140` | either | —      |       |
| `/api/companies/{companyId}/costs/by-project` | GET    | `paperclip_get_costs_by_project` | `activity.ts:175` | either | —      |       |
| `/api/companies/{companyId}/costs/events`     | POST   | `paperclip_report_cost_event`    | `activity.ts:213` | either | yes    |       |

---

## Dashboard

| Endpoint                               | Method | Tool                      | Source            | Auth   | Run-ID | Notes |
| -------------------------------------- | ------ | ------------------------- | ----------------- | ------ | ------ | ----- |
| `/api/companies/{companyId}/dashboard` | GET    | `paperclip_get_dashboard` | `dashboard.ts:16` | either | —      |       |

---

## Plugins

All tools in this domain are board-only (`⚠ Board-only:` description prefix).

| Endpoint                           | Method | Tool                             | Source           | Auth  | Run-ID | Notes                 |
| ---------------------------------- | ------ | -------------------------------- | ---------------- | ----- | ------ | --------------------- |
| `/api/plugins`                     | GET    | `paperclip_list_plugins`         | `plugins.ts:81`  | board | —      |                       |
| `/api/plugins/examples`            | GET    | `paperclip_list_plugin_examples` | `plugins.ts:201` | board | —      |                       |
| `/api/plugins/install`             | POST   | `paperclip_install_plugin`       | `plugins.ts:161` | board | yes    |                       |
| `/api/plugins/{pluginKey}`         | GET    | `paperclip_get_plugin`           | `plugins.ts:124` | board | —      | pluginKey URL-encoded |
| `/api/plugins/{pluginKey}/enable`  | POST   | `paperclip_enable_plugin`        | `plugins.ts:241` | board | yes    |                       |
| `/api/plugins/{pluginKey}/disable` | POST   | `paperclip_disable_plugin`       | `plugins.ts:283` | board | yes    | Destructive           |

---

## Secrets

All tools in this domain are board-only (`⚠ Board-only:` description prefix). Secret values are never returned by GET endpoints.

| Endpoint                             | Method | Tool                      | Source           | Auth  | Run-ID | Notes                                                                          |
| ------------------------------------ | ------ | ------------------------- | ---------------- | ----- | ------ | ------------------------------------------------------------------------------ |
| `/api/companies/{companyId}/secrets` | GET    | `paperclip_list_secrets`  | `secrets.ts:76`  | board | —      | Metadata only; value never returned                                            |
| `/api/companies/{companyId}/secrets` | POST   | `paperclip_create_secret` | `secrets.ts:119` | board | yes    |                                                                                |
| `/api/secrets/{secretId}`            | PATCH  | `paperclip_update_secret` | `secrets.ts:165` | board | yes    | Metadata only; does NOT rotate value (live-verified)                           |
| `/api/secrets/{secretId}/rotate`     | POST   | `paperclip_rotate_secret` | `secrets.ts:213` | board | yes    | Value rotation (live-verified — separate endpoint); increments `latestVersion` |

---

## Runs (Heartbeat Observability)

All tools in this domain are board-only (`⚠ Board-only:` description prefix).

| Endpoint                                    | Method | Tool                            | Source        | Auth  | Run-ID | Notes                        |
| ------------------------------------------- | ------ | ------------------------------- | ------------- | ----- | ------ | ---------------------------- |
| `/api/companies/{companyId}/heartbeat-runs` | GET    | `paperclip_list_heartbeat_runs` | `runs.ts:79`  | board | —      | Filter by `agentId`          |
| `/api/heartbeat-runs/{runId}/events`        | GET    | `paperclip_list_run_events`     | `runs.ts:136` | board | —      | `afterSeq` cursor pagination |
| `/api/heartbeat-runs/{runId}/log`           | GET    | `paperclip_get_run_log`         | `runs.ts:187` | board | —      | Byte-offset log streaming    |

---

## Feedback Traces

All tools in this domain are board-only (`⚠ Board-only:` description prefix) — confirmed by live-API 403 on all three endpoints with agent keys (see `docs/v2-reference/06-live-verified.md`).

| Endpoint                                     | Method | Tool                                   | Source            | Auth  | Run-ID | Notes                            |
| -------------------------------------------- | ------ | -------------------------------------- | ----------------- | ----- | ------ | -------------------------------- |
| `/api/companies/{companyId}/feedback-traces` | GET    | `paperclip_list_feedback_traces`       | `feedback.ts:126` | board | —      | Live-verified: 403 on agent keys |
| `/api/issues/{issueId}/feedback-traces`      | GET    | `paperclip_list_issue_feedback_traces` | `feedback.ts:213` | board | —      | Live-verified: board-only        |
| `/api/feedback-traces/{traceId}/bundle`      | GET    | `paperclip_get_feedback_trace_bundle`  | `feedback.ts:294` | board | —      | Live-verified: board-only        |

---

## Company Import/Export

All tools in this domain are board-only (`⚠ Board-only:` description prefix).

| Endpoint                                     | Method | Tool                               | Source                  | Auth  | Run-ID | Notes                        |
| -------------------------------------------- | ------ | ---------------------------------- | ----------------------- | ----- | ------ | ---------------------------- |
| `/api/companies/{companyId}/export`          | POST   | `paperclip_export_company`         | `company-import.ts:155` | board | yes    |                              |
| `/api/companies/{companyId}/imports/preview` | POST   | `paperclip_preview_company_import` | `company-import.ts:215` | board | —      | Read-only preview            |
| `/api/companies/{companyId}/imports/apply`   | POST   | `paperclip_apply_company_import`   | `company-import.ts:278` | board | yes    | Destructive; applies preview |

---

## Skipped Endpoints

| Endpoint                                                              | Reason                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                     | Infrastructure probe. Not useful to agents or board users.                                                  |
| `POST /api/cli-auth/challenges` + `GET /api/cli-auth/challenges/{id}` | Browser-mediated PKCE OAuth flow. Requires human browser interaction; cannot be driven by an MCP tool call. |

---

## Summary

| Domain                | Endpoints covered | Tools   | Skipped  |
| --------------------- | ----------------- | ------- | -------- |
| Identity              | 4                 | 4       | 1 (PKCE) |
| Companies             | 5                 | 5       | —        |
| Agents                | 17                | 17      | —        |
| Issues                | 7                 | 7       | —        |
| Comments              | 3                 | 3       | —        |
| Documents             | 5                 | 5       | —        |
| Attachments           | 4                 | 4       | —        |
| Labels                | 2                 | 2       | —        |
| Goals                 | 4                 | 4       | —        |
| Projects              | 8                 | 8       | —        |
| Approvals             | 11                | 11      | —        |
| Routines              | 9                 | 9       | —        |
| Activity & Costs      | 5                 | 5       | —        |
| Dashboard             | 1                 | 1       | —        |
| Plugins               | 6                 | 6       | —        |
| Secrets               | 4                 | 4       | —        |
| Runs                  | 3                 | 3       | —        |
| Feedback Traces       | 3                 | 3       | —        |
| Company Import/Export | 3                 | 3       | —        |
| **Total**             | **104**           | **104** | **2**    |
