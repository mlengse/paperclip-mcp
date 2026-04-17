# Run Observability

Tools for listing and inspecting agent execution runs and event streams.

---

## paperclip_get_run_log

⚠ Board-only: Read raw log bytes for a heartbeat run using a byte-offset cursor (not paginated).

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `runId`           | `string`               | yes      | Heartbeat run UUID                                                         |
| `offset`          | `integer`              | no       | Byte offset into the log to start reading from (default 0)                 |
| `limitBytes`      | `integer`              | no       | Maximum bytes to return (default 16384 = 16 KiB)                           |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Log slice object: { content: string, nextOffset: number, totalBytes: number }. Use nextOffset to continue reading.

**Examples**

- Use when: reading raw execution log output for a heartbeat run, advancing via nextOffset for subsequent slices
- Don't use when: you need structured events — use paperclip_list_run_events with afterSeq cursor instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → board-only endpoint, requires board API key
- 404: run not found → verify runId with paperclip_list_heartbeat_runs

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_heartbeat_runs

⚠ Board-only: List heartbeat runs for the company, optionally filtered by agent.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `companyId`       | `string`               | yes      | Company UUID                                                               |
| `agentId`         | `string`               | no       | Filter by agent UUID (optional) — omit to list runs across all agents      |
| `limit`           | `integer`              | no       | Max runs per page (1–100, default 50)                                      |
| `offset`          | `integer`              | no       | Number of runs to skip (default 0)                                         |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: HeartbeatRun[], total, count, offset, limit, has_more, next_offset }. Each item: id, agentId, status, startedAt, finishedAt.

**Examples**

- Use when: auditing recent agent execution runs or diagnosing agent heartbeat failures
- Don't use when: you need the raw event stream for a specific run — use paperclip_list_run_events instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → board-only endpoint, requires board API key

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_run_events

⚠ Board-only: Stream events for a heartbeat run using an afterSeq cursor (not paginated — cursor-based).

**Inputs**

| Parameter         | Type                   | Required | Description                                                                                     |
| ----------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `runId`           | `string`               | yes      | Heartbeat run UUID                                                                              |
| `afterSeq`        | `integer`              | no       | Return events with sequence number > afterSeq (cursor for streaming, default: 0 / start of run) |
| `limit`           | `integer`              | no       | Max events to return (default 100) — note: cursor-based, not paginated                          |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured)                      |

**Returns**

Array of run events (no pagination envelope — use afterSeq cursor for continuation). Each event: seq, type, data, createdAt.

**Examples**

- Use when: streaming execution events for a live or recently completed heartbeat run using the afterSeq cursor
- Don't use when: you need raw log bytes — use paperclip_get_run_log with offset/limitBytes instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → board-only endpoint, requires board API key
- 404: run not found → verify runId with paperclip_list_heartbeat_runs

**Annotations**

`readOnly`, `closedWorld`

---
