# Routines

Tools for managing automated routines: creating, updating, triggering, and viewing run history.

---

## paperclip_add_routine_trigger

Add a trigger to a routine. Supports schedule (cron), webhook, and api trigger kinds.

**Inputs**

| Parameter        | Type                               | Required | Description                                                                                              |
| ---------------- | ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `routineId`      | `string`                           | yes      | Routine UUID                                                                                             |
| `kind`           | `"schedule" \| "webhook" \| "api"` | yes      | Trigger kind: schedule \| webhook \| api                                                                 |
| `cronExpression` | `string`                           | no       | 5-field cron expression for schedule triggers (e.g. '_/5 _ \* \* \*'). Required when kind is 'schedule'. |
| `timezone`       | `string`                           | no       | Timezone for schedule triggers (e.g. 'UTC', 'America/New_York'). Default: UTC                            |

**Returns**

Returns the created trigger object: id, routineId, kind, cronExpression, createdAt.

**Examples**

- Use when: scheduling a routine to run every 5 minutes after creating it
- Don't use when: the trigger already exists — use paperclip_update_routine_trigger to modify it

**Errors**

- 400: invalid cron expression → must be a 5-field cron (e.g. '_/5 _ \* \* \*')
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: routine not found → verify ID with paperclip_list_routines

**Annotations**

`closedWorld`

---

## paperclip_create_routine

Create a new routine for an agent. Add triggers separately with paperclip_add_routine_trigger.

**Inputs**

| Parameter           | Type     | Required | Description                                           |
| ------------------- | -------- | -------- | ----------------------------------------------------- |
| `assigneeAgentId`   | `string` | yes      | Agent UUID to run the routine                         |
| `title`             | `string` | yes      | Routine title                                         |
| `description`       | `string` | no       | Routine description                                   |
| `concurrencyPolicy` | `string` | no       | Concurrency policy (e.g. allow, forbid, replace)      |
| `catchUpPolicy`     | `string` | no       | Catch-up policy for missed runs (e.g. skip, run_once) |

**Returns**

Returns the created routine object: id, title, assigneeAgentId, triggers:[], createdAt.

**Examples**

- Use when: setting up a scheduled workflow for an agent before adding a cron trigger
- Don't use when: you want to trigger immediately — use paperclip_run_routine after creating the routine

**Errors**

- 400: validation failure → ensure title and assigneeAgentId are non-empty
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: assigneeAgentId not found → verify with paperclip_list_agents

**Annotations**

`closedWorld`

---

## paperclip_delete_routine_trigger

Delete a routine trigger. The routine itself is not deleted.

**Inputs**

| Parameter   | Type     | Required | Description          |
| ----------- | -------- | -------- | -------------------- |
| `triggerId` | `string` | yes      | Routine trigger UUID |

**Returns**

Returns a confirmation object indicating the trigger was deleted.

**Examples**

- Use when: removing a cron schedule from a routine without deleting the routine itself
- Don't use when: you want to delete the entire routine — use paperclip_delete_routine instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: trigger not found → verify ID with paperclip_get_routine

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_get_routine

Get a single routine by UUID, including its triggers and recent runs.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `routineId`       | `string`               | yes      | Routine UUID                                                               |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Routine object: id, name, agentId, triggers[], recentRuns[], concurrencyPolicy, catchUpPolicy.

**Examples**

- Use when: inspecting a routine's current triggers before modifying them
- Don't use when: you need all routine IDs — use paperclip_list_routines first

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: routine not found → verify ID with paperclip_list_routines

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_routine_runs

List historical runs for a routine, ordered most-recent first.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `routineId`       | `string`               | yes      | Routine UUID                                                               |
| `limit`           | `integer`              | no       | Max runs per page (1–100, default 50)                                      |
| `offset`          | `integer`              | no       | Number of runs to skip (default 0)                                         |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Run[], total, count, offset, limit, has_more, next_offset }. Each item: id, routineId, status, startedAt, finishedAt, triggerId.

**Examples**

- Use when: auditing whether a scheduled routine has been firing and completing successfully
- Don't use when: you need the routine's triggers or settings — use paperclip_get_routine instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: routine not found → verify ID with paperclip_list_routines

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_routines

List all routines defined for the current company.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `limit`           | `integer`              | no       | Max routines per page (1–100, default 50)                                  |
| `offset`          | `integer`              | no       | Number of routines to skip (default 0)                                     |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Routine[], total, count, offset, limit, has_more, next_offset }. Each item: id, name, agentId, concurrencyPolicy, catchUpPolicy, createdAt.

**Examples**

- Use when: finding routineIds before adding a trigger or checking routine status
- Don't use when: you need a specific routine's triggers and run history — use paperclip_get_routine instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_run_routine

Manually trigger a routine run immediately, bypassing its schedule.

**Inputs**

| Parameter   | Type     | Required | Description                                                          |
| ----------- | -------- | -------- | -------------------------------------------------------------------- |
| `routineId` | `string` | yes      | Routine UUID                                                         |
| `agentId`   | `string` | no       | Agent UUID to run the routine (overrides routine's default assignee) |

**Returns**

Returns the created run object: id, routineId, status, startedAt.

**Examples**

- Use when: testing a routine on demand before its next scheduled fire
- Don't use when: you want to check past runs — use paperclip_list_routine_runs instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: routine not found → verify ID with paperclip_list_routines
- 409: concurrency policy forbids concurrent run → wait for the active run to finish

**Annotations**

`closedWorld`

---

## paperclip_update_routine

Update a routine's title, description, or scheduling policies.

**Inputs**

| Parameter           | Type     | Required | Description            |
| ------------------- | -------- | -------- | ---------------------- |
| `routineId`         | `string` | yes      | Routine UUID           |
| `title`             | `string` | no       | New title              |
| `description`       | `string` | no       | New description        |
| `concurrencyPolicy` | `string` | no       | New concurrency policy |
| `catchUpPolicy`     | `string` | no       | New catch-up policy    |

**Returns**

Returns the updated routine object with all fields.

**Examples**

- Use when: changing a routine's concurrency policy after observing overlapping runs
- Don't use when: you need to change the trigger schedule — use paperclip_update_routine_trigger instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: routine not found → verify ID with paperclip_list_routines

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---

## paperclip_update_routine_trigger

Update an existing routine trigger's kind or cron schedule.

**Inputs**

| Parameter        | Type                               | Required | Description                                       |
| ---------------- | ---------------------------------- | -------- | ------------------------------------------------- |
| `triggerId`      | `string`                           | yes      | Routine trigger UUID                              |
| `kind`           | `"schedule" \| "webhook" \| "api"` | no       | New trigger kind                                  |
| `cronExpression` | `string`                           | no       | New 5-field cron expression for schedule triggers |
| `timezone`       | `string`                           | no       | New timezone for schedule triggers                |

**Returns**

Returns the updated trigger object: id, routineId, kind, cronExpression, updatedAt.

**Examples**

- Use when: changing a routine from every 5 minutes to daily at 9 AM on weekdays
- Don't use when: you need to add a new trigger — use paperclip_add_routine_trigger instead

**Errors**

- 400: invalid cron expression → ensure 5 whitespace-separated fields
- 401: authentication failed → check PAPERCLIP_API_KEY
- 404: trigger not found → verify ID with paperclip_get_routine

**Annotations**

`idempotent`, `destructive`, `closedWorld`

---
