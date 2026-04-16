import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatGenericList,
  applyCharLimit,
  paginate,
} from "./format.js";

const ListHeartbeatRunsInput = z
  .object({
    companyId: z.string().min(1).describe("Company UUID"),
    agentId: z
      .string()
      .min(1)
      .optional()
      .describe("Filter by agent UUID (optional) — omit to list runs across all agents"),
    limit: PaginationLimitSchema.describe("Max runs per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of runs to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const ListRunEventsInput = z
  .object({
    runId: z.string().min(1).describe("Heartbeat run UUID"),
    afterSeq: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Return events with sequence number > afterSeq (cursor for streaming, default: 0 / start of run)"
      ),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .default(100)
      .describe("Max events to return (default 100) — note: cursor-based, not paginated"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetRunLogInput = z
  .object({
    runId: z.string().min(1).describe("Heartbeat run UUID"),
    offset: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .default(0)
      .describe("Byte offset into the log to start reading from (default 0)"),
    limitBytes: z
      .number()
      .int()
      .positive()
      .optional()
      .default(16384)
      .describe("Maximum bytes to return (default 16384 = 16 KiB)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

export const runTools: ToolDefinition[] = [
  {
    name: "paperclip_list_heartbeat_runs",
    description: composeDescription({
      boardOnly: true,
      summary: "List heartbeat runs for the company, optionally filtered by agent.",
      args: [
        '- companyId: string — Company UUID (example: "53caad5d-05d6-469d-b6eb-8961a71b615e")',
        '- agentId: string (optional) — Filter runs to a specific agent UUID (example: "agt_abc123")',
        "- limit: number (optional) — Max runs per page, 1–100 (default 50)",
        "- offset: number (optional) — Number of runs to skip (default 0)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: HeartbeatRun[], total, count, offset, limit, has_more, next_offset }. Each item: id, agentId, status, startedAt, finishedAt.",
      examples: {
        useWhen: "auditing recent agent execution runs or diagnosing agent heartbeat failures",
        dontUseWhen:
          "you need the raw event stream for a specific run — use paperclip_list_run_events instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → board-only endpoint, requires board API key",
      ],
    }),
    inputSchema: toJsonSchema(ListHeartbeatRunsInput),
    annotations: {
      title: "List heartbeat runs",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const {
          companyId,
          agentId,
          response_format: fmt,
          limit,
          offset,
        } = validate(ListHeartbeatRunsInput, args);
        const params = new URLSearchParams();
        if (agentId) params.set("agentId", agentId);
        const qs = params.toString();
        const url = `/api/companies/${companyId}/heartbeat-runs${qs ? `?${qs}` : ""}`;
        const all = await client.get<unknown[]>(url);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Heartbeat Runs", envelope);
        const hint =
          "Response too large. Use limit/offset to page or agentId to filter by a specific agent.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_heartbeat_runs", resource: "run" });
      }
    },
  },
  {
    name: "paperclip_list_run_events",
    description: composeDescription({
      boardOnly: true,
      summary:
        "Stream events for a heartbeat run using an afterSeq cursor (not paginated — cursor-based).",
      args: [
        '- runId: string — Heartbeat run UUID (example: "run_abc123")',
        "- afterSeq: number (optional) — Return events with seq > afterSeq to resume streaming (default: 0)",
        "- limit: number (optional) — Max events to return in one call (default 100)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Array of run events (no pagination envelope — use afterSeq cursor for continuation). Each event: seq, type, data, createdAt.",
      examples: {
        useWhen:
          "streaming execution events for a live or recently completed heartbeat run using the afterSeq cursor",
        dontUseWhen:
          "you need raw log bytes — use paperclip_get_run_log with offset/limitBytes instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → board-only endpoint, requires board API key",
        "- 404: run not found → verify runId with paperclip_list_heartbeat_runs",
      ],
    }),
    inputSchema: toJsonSchema(ListRunEventsInput),
    annotations: {
      title: "List run events (cursor)",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { runId, afterSeq, limit, response_format: fmt } = validate(ListRunEventsInput, args);
        const params = new URLSearchParams();
        if (afterSeq !== undefined) params.set("afterSeq", String(afterSeq));
        params.set("limit", String(limit ?? 100));
        const data = await client.get<unknown[]>(
          `/api/heartbeat-runs/${runId}/events?${params.toString()}`
        );
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList(data, "Run Events");
        const hint =
          "Response too large. Use afterSeq to resume from the last event seq, or reduce limit.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_run_events", resource: "run" });
      }
    },
  },
  {
    name: "paperclip_get_run_log",
    description: composeDescription({
      boardOnly: true,
      summary: "Read raw log bytes for a heartbeat run using a byte-offset cursor (not paginated).",
      args: [
        '- runId: string — Heartbeat run UUID (example: "run_abc123")',
        "- offset: number (optional) — Byte offset to start reading from (default 0)",
        "- limitBytes: number (optional) — Max bytes to return (default 16384 = 16 KiB)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Log slice object: { content: string, nextOffset: number, totalBytes: number }. Use nextOffset to continue reading.",
      examples: {
        useWhen:
          "reading raw execution log output for a heartbeat run, advancing via nextOffset for subsequent slices",
        dontUseWhen:
          "you need structured events — use paperclip_list_run_events with afterSeq cursor instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → board-only endpoint, requires board API key",
        "- 404: run not found → verify runId with paperclip_list_heartbeat_runs",
      ],
    }),
    inputSchema: toJsonSchema(GetRunLogInput),
    annotations: {
      title: "Get run log slice",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { runId, offset, limitBytes, response_format: fmt } = validate(GetRunLogInput, args);
        const params = new URLSearchParams();
        params.set("offset", String(offset ?? 0));
        params.set("limitBytes", String(limitBytes ?? 16384));
        const data = await client.get<unknown>(
          `/api/heartbeat-runs/${runId}/log?${params.toString()}`
        );
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList([data], "Run Log");
        const hint =
          "Response too large. Use offset/limitBytes to read in smaller slices; advance offset by limitBytes each call.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_run_log", resource: "run" });
      }
    },
  },
];
