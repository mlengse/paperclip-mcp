# Recipe: CI Invoker

An agent that, on an event (e.g. PR merged, QA approved), finds the matching routine
and triggers it immediately.

**Key tools:** `paperclip_list_routines`, `paperclip_get_routine`,
`paperclip_run_routine`, `paperclip_list_routine_runs`

**Auth:** Agent key sufficient for all steps.

---

## Goal

On wake (triggered by an @-mention or a webhook-type routine trigger):

1. List available routines to find the one matching the event type.
2. Confirm the routine is configured correctly.
3. Trigger an immediate run.
4. Poll the run list to confirm the routine started.

---

## Background: Routine triggers

A routine in Paperclip has one or more triggers that determine when it fires:

| Trigger type | When it fires                                   |
| ------------ | ----------------------------------------------- |
| `schedule`   | On a cron expression (e.g. `0 * * * *`)         |
| `webhook`    | When a specific webhook URL is called           |
| `api`        | When `paperclip_run_routine` is called manually |

This recipe uses the `api` trigger path — calling `paperclip_run_routine` fires the
routine immediately regardless of whether it also has a schedule trigger.

---

## Step 1 — List routines

```json
{ "name": "paperclip_list_routines", "arguments": {} }
```

Response: array of routine objects with `id`, `name`, `description`, `agentId`.
Identify the routine by matching its `name` or `description` to the event type (e.g.
`"run-quality-gate"`, `"post-merge-checks"`).

If no matching routine is found, post a comment on the triggering issue and exit:

```
No routine found for event type "post-merge-checks".
@CTO — please create the routine or update the routine name.
```

---

## Step 2 — Inspect the routine

```json
{
  "name": "paperclip_get_routine",
  "arguments": { "routineId": "<routine-uuid>" }
}
```

The response includes `triggers` and `recentRuns`. Check:

- The routine has an `api` trigger (or you are invoking it directly — `run_routine`
  works regardless of trigger type).
- The `concurrencyPolicy` (`allow`, `forbid`, `replace`) — if `forbid`, a currently
  running instance will block your invocation.

---

## Step 3 — Trigger a run

```json
{
  "name": "paperclip_run_routine",
  "arguments": { "routineId": "<routine-uuid>" }
}
```

Response: the newly created run object with `id`, `status`, and `startedAt`. A
status of `running` or `queued` means the routine was accepted.

If the response is `isError: true` with a 409, the routine has `concurrencyPolicy:
forbid` and another run is already active. Wait and retry, or check
`paperclip_list_routine_runs` for the active run's status.

---

## Step 4 — Confirm the run started

```json
{
  "name": "paperclip_list_routine_runs",
  "arguments": { "routineId": "<routine-uuid>" }
}
```

The most recent run should appear at the top. Verify its `startedAt` timestamp
matches the current run. A `status` of `running` or `completed` confirms success.

---

## Error handling

| Error                                                    | Action                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `list_routines` returns empty array                      | No routines exist. Create one with `paperclip_create_routine` + `paperclip_add_routine_trigger`, then retry. |
| `run_routine` returns 409                                | `concurrencyPolicy: forbid` — an instance is already running. Check `list_routine_runs` for current state.   |
| `run_routine` returns 404                                | Routine UUID is stale (routine was deleted). Re-run `list_routines` to find the current UUID.                |
| Run appears in `list_routine_runs` with `status: failed` | The routine itself failed. Check the run's error details and report to the owning agent or CTO.              |

---

## Creating a new routine from scratch

If no matching routine exists, create one with an `api` trigger:

```json
{
  "name": "paperclip_create_routine",
  "arguments": {
    "agentId": "<agent-uuid-to-run-it>",
    "name": "post-merge-checks",
    "description": "Runs quality gate after QA merges to main.",
    "concurrencyPolicy": "forbid",
    "catchUpPolicy": "skip"
  }
}
```

Then add the `api` trigger so it can be invoked manually:

```json
{
  "name": "paperclip_add_routine_trigger",
  "arguments": {
    "routineId": "<new-routine-uuid>",
    "type": "api"
  }
}
```

Now call `paperclip_run_routine` to fire it.

---

## Notes

- `paperclip_run_routine` is the correct tool name. There is no `trigger_routine` or
  `invoke_routine` tool.
- The run ID injected into mutating requests (`X-Paperclip-Run-Id`) is the
  **heartbeat run ID** of the invoking agent, not the routine run ID. These are
  separate concepts.
- Routines run asynchronously — `run_routine` returns immediately after enqueueing.
  Use `list_routine_runs` to observe completion status.
