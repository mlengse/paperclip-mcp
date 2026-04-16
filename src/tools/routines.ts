import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  handleApiError,
  RoutineTriggerTypeSchema,
  composeDescription,
} from "./validation.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatGenericList,
  formatResult,
  applyCharLimit,
  paginate,
} from "./format.js";

// Basic 5-field cron regex: five whitespace-separated tokens
const CRON_REGEX = /^(\S+\s+){4}\S+$/;

const ListRoutinesInput = z
  .object({
    limit: PaginationLimitSchema.describe("Max routines per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of routines to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const RoutineIdInput = z
  .object({
    routineId: z.string().min(1).describe("Routine UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const ListRoutineRunsInput = z
  .object({
    routineId: z.string().min(1).describe("Routine UUID"),
    limit: PaginationLimitSchema.describe("Max runs per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of runs to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const RunRoutineInput = z
  .object({
    routineId: z.string().min(1).describe("Routine UUID"),
    agentId: z
      .string()
      .min(1)
      .optional()
      .describe("Agent UUID to run the routine (overrides routine's default assignee)"),
  })
  .strict();

const TriggerIdInput = z
  .object({
    triggerId: z.string().min(1).describe("Routine trigger UUID"),
  })
  .strict();

const CreateRoutineInput = z
  .object({
    assigneeAgentId: z.string().min(1).describe("Agent UUID to run the routine"),
    title: z.string().min(1).describe("Routine title"),
    description: z.string().optional().describe("Routine description"),
    concurrencyPolicy: z
      .string()
      .optional()
      .describe("Concurrency policy (e.g. allow, forbid, replace)"),
    catchUpPolicy: z
      .string()
      .optional()
      .describe("Catch-up policy for missed runs (e.g. skip, run_once)"),
  })
  .strict();

const UpdateRoutineInput = z
  .object({
    routineId: z.string().min(1).describe("Routine UUID"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    concurrencyPolicy: z.string().optional().describe("New concurrency policy"),
    catchUpPolicy: z.string().optional().describe("New catch-up policy"),
  })
  .strict();

const AddTriggerInput = z
  .object({
    routineId: z.string().min(1).describe("Routine UUID"),
    kind: RoutineTriggerTypeSchema.describe("Trigger kind: schedule | webhook | api"),
    cronExpression: z
      .string()
      .regex(CRON_REGEX, "Must be a valid 5-field cron expression (e.g. '*/5 * * * *')")
      .optional()
      .describe(
        "5-field cron expression for schedule triggers (e.g. '*/5 * * * *'). Required when kind is 'schedule'."
      ),
    timezone: z
      .string()
      .optional()
      .describe("Timezone for schedule triggers (e.g. 'UTC', 'America/New_York'). Default: UTC"),
  })
  .strict();

const UpdateTriggerInput = z
  .object({
    triggerId: z.string().min(1).describe("Routine trigger UUID"),
    kind: RoutineTriggerTypeSchema.optional().describe("New trigger kind"),
    cronExpression: z
      .string()
      .regex(CRON_REGEX, "Must be a valid 5-field cron expression (e.g. '*/5 * * * *')")
      .optional()
      .describe("New 5-field cron expression for schedule triggers"),
    timezone: z.string().optional().describe("New timezone for schedule triggers"),
  })
  .strict();

export const routineTools: ToolDefinition[] = [
  {
    name: "paperclip_list_routines",
    description: composeDescription({
      summary: "List all routines defined for the current company.",
      returns:
        "Pagination envelope { items: Routine[], total, count, offset, limit, has_more, next_offset }. Each item: id, name, agentId, concurrencyPolicy, catchUpPolicy, createdAt.",
      examples: {
        useWhen: "finding routineIds before adding a trigger or checking routine status",
        dontUseWhen:
          "you need a specific routine's triggers and run history — use paperclip_get_routine instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListRoutinesInput),
    annotations: { title: "List company routines", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt, limit, offset } = validate(ListRoutinesInput, args);
        const all = await client.get<unknown[]>(`/api/companies/${client.companyId}/routines`);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Routines", envelope);
        const hint =
          "Response too large. Use limit/offset to page. Consider deleting unused routines.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_routines", resource: "routine" });
      }
    },
  },
  {
    name: "paperclip_get_routine",
    description: composeDescription({
      summary: "Get a single routine by UUID, including its triggers and recent runs.",
      args: [
        '- routineId: string — Routine UUID (example: "rtn_abc123")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Routine object: id, name, agentId, triggers[], recentRuns[], concurrencyPolicy, catchUpPolicy.",
      examples: {
        useWhen: "inspecting a routine's current triggers before modifying them",
        dontUseWhen: "you need all routine IDs — use paperclip_list_routines first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: routine not found → verify ID with paperclip_list_routines",
      ],
    }),
    inputSchema: toJsonSchema(RoutineIdInput),
    annotations: { title: "Get routine by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { routineId, response_format: fmt } = validate(RoutineIdInput, args);
        const data = await client.get<unknown>(`/api/routines/${routineId}`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList([data], "Routine");
        const hint =
          "Entity response too large. This routine may have an unusually long run history or oversized fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_routine", resource: "routine" });
      }
    },
  },
  {
    name: "paperclip_create_routine",
    description: composeDescription({
      summary:
        "Create a new routine for an agent. Add triggers separately with paperclip_add_routine_trigger.",
      args: [
        '- assigneeAgentId: string — Agent UUID to run the routine (example: "agt_abc123")',
        '- title: string — Routine title (example: "daily-standup")',
        "- description: string (optional) — Routine description",
        "- concurrencyPolicy: string (optional) — allow | forbid | replace (default: forbid)",
        "- catchUpPolicy: string (optional) — skip | run_once for missed runs",
      ],
      returns:
        "Returns the created routine object: id, title, assigneeAgentId, triggers:[], createdAt.",
      examples: {
        useWhen: "setting up a scheduled workflow for an agent before adding a cron trigger",
        dontUseWhen:
          "you want to trigger immediately — use paperclip_run_routine after creating the routine",
      },
      errors: [
        "- 400: validation failure → ensure title and assigneeAgentId are non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: assigneeAgentId not found → verify with paperclip_list_agents",
      ],
    }),
    inputSchema: toJsonSchema(CreateRoutineInput),
    annotations: { title: "Create agent routine", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateRoutineInput, args);
        const body: Record<string, unknown> = {
          assigneeAgentId: input.assigneeAgentId,
          title: input.title,
        };
        if (input.description !== undefined) body.description = input.description;
        if (input.concurrencyPolicy !== undefined) body.concurrencyPolicy = input.concurrencyPolicy;
        if (input.catchUpPolicy !== undefined) body.catchUpPolicy = input.catchUpPolicy;
        const data = await client.post<unknown>(
          `/api/companies/${client.companyId}/routines`,
          body
        );
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_create_routine", resource: "routine" });
      }
    },
  },
  {
    name: "paperclip_update_routine",
    description: composeDescription({
      summary: "Update a routine's title, description, or scheduling policies.",
      args: [
        '- routineId: string — Routine UUID (example: "rtn_abc123")',
        "- title: string (optional) — New title",
        "- description: string (optional) — New description",
        "- concurrencyPolicy: string (optional) — New concurrency policy",
        "- catchUpPolicy: string (optional) — New catch-up policy",
      ],
      returns: "Returns the updated routine object with all fields.",
      examples: {
        useWhen: "changing a routine's concurrency policy after observing overlapping runs",
        dontUseWhen:
          "you need to change the trigger schedule — use paperclip_update_routine_trigger instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: routine not found → verify ID with paperclip_list_routines",
      ],
    }),
    inputSchema: toJsonSchema(UpdateRoutineInput),
    annotations: {
      title: "Update routine settings",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { routineId, ...rest } = validate(UpdateRoutineInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/routines/${routineId}`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_update_routine", resource: "routine" });
      }
    },
  },
  {
    name: "paperclip_add_routine_trigger",
    description: composeDescription({
      summary:
        "Add a trigger to a routine. Supports schedule (cron), webhook, and api trigger kinds.",
      args: [
        '- routineId: string — Routine UUID (example: "rtn_abc123")',
        "- kind: string — Trigger kind: schedule | webhook | api",
        '- cronExpression: string (optional) — 5-field cron expression, required for schedule triggers (example: "*/5 * * * *")',
        "- timezone: string (optional) — Timezone for schedule triggers (default: UTC)",
      ],
      returns:
        "Returns the created trigger object: id, routineId, kind, cronExpression, createdAt.",
      examples: {
        useWhen: "scheduling a routine to run every 5 minutes after creating it",
        dontUseWhen:
          "the trigger already exists — use paperclip_update_routine_trigger to modify it",
      },
      errors: [
        "- 400: invalid cron expression → must be a 5-field cron (e.g. '*/5 * * * *')",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: routine not found → verify ID with paperclip_list_routines",
      ],
    }),
    inputSchema: toJsonSchema(AddTriggerInput),
    annotations: { title: "Add routine trigger", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { routineId, kind, cronExpression, timezone } = validate(AddTriggerInput, args);
        const body: Record<string, unknown> = { kind };
        if (cronExpression !== undefined) body.cronExpression = cronExpression;
        if (timezone !== undefined) body.timezone = timezone;
        const data = await client.post<unknown>(`/api/routines/${routineId}/triggers`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_add_routine_trigger", resource: "routine" });
      }
    },
  },
  {
    name: "paperclip_update_routine_trigger",
    description: composeDescription({
      summary: "Update an existing routine trigger's kind or cron schedule.",
      args: [
        '- triggerId: string — Routine trigger UUID (example: "trg_abc123")',
        "- kind: string (optional) — New trigger kind: schedule | webhook | api",
        '- cronExpression: string (optional) — New 5-field cron expression (example: "0 9 * * 1-5")',
        "- timezone: string (optional) — New timezone for schedule triggers",
      ],
      returns:
        "Returns the updated trigger object: id, routineId, kind, cronExpression, updatedAt.",
      examples: {
        useWhen: "changing a routine from every 5 minutes to daily at 9 AM on weekdays",
        dontUseWhen: "you need to add a new trigger — use paperclip_add_routine_trigger instead",
      },
      errors: [
        "- 400: invalid cron expression → ensure 5 whitespace-separated fields",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: trigger not found → verify ID with paperclip_get_routine",
      ],
    }),
    inputSchema: toJsonSchema(UpdateTriggerInput),
    annotations: {
      title: "Update routine trigger",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { triggerId, ...rest } = validate(UpdateTriggerInput, args);
        const body: Record<string, unknown> = {};
        if (rest.kind !== undefined) body.kind = rest.kind;
        if (rest.cronExpression !== undefined) body.cronExpression = rest.cronExpression;
        if (rest.timezone !== undefined) body.timezone = rest.timezone;
        const data = await client.patch<unknown>(`/api/routine-triggers/${triggerId}`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_update_routine_trigger",
          resource: "routine",
        });
      }
    },
  },
  {
    name: "paperclip_delete_routine_trigger",
    description: composeDescription({
      summary: "Delete a routine trigger. The routine itself is not deleted.",
      args: ['- triggerId: string — Routine trigger UUID (example: "trg_abc123")'],
      returns: "Returns a confirmation object indicating the trigger was deleted.",
      examples: {
        useWhen: "removing a cron schedule from a routine without deleting the routine itself",
        dontUseWhen: "you want to delete the entire routine — use paperclip_delete_routine instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: trigger not found → verify ID with paperclip_get_routine",
      ],
    }),
    inputSchema: toJsonSchema(TriggerIdInput),
    annotations: {
      title: "Delete routine trigger",
      destructiveHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { triggerId } = validate(TriggerIdInput, args);
        const data = await client.delete<unknown>(`/api/routine-triggers/${triggerId}`);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(formatResult(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_delete_routine_trigger",
          resource: "routine",
        });
      }
    },
  },
  {
    name: "paperclip_run_routine",
    description: composeDescription({
      summary: "Manually trigger a routine run immediately, bypassing its schedule.",
      args: [
        '- routineId: string — Routine UUID (example: "rtn_abc123")',
        "- agentId: string (optional) — Agent UUID to run the routine (overrides routine's default assignee)",
      ],
      returns: "Returns the created run object: id, routineId, status, startedAt.",
      examples: {
        useWhen: "testing a routine on demand before its next scheduled fire",
        dontUseWhen: "you want to check past runs — use paperclip_list_routine_runs instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: routine not found → verify ID with paperclip_list_routines",
        "- 409: concurrency policy forbids concurrent run → wait for the active run to finish",
      ],
    }),
    inputSchema: toJsonSchema(RunRoutineInput),
    annotations: { title: "Run routine now", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { routineId, agentId } = validate(RunRoutineInput, args);
        const body: Record<string, unknown> = {};
        if (agentId !== undefined) body.agentId = agentId;
        const data = await client.post<unknown>(`/api/routines/${routineId}/run`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_run_routine", resource: "routine" });
      }
    },
  },
  {
    name: "paperclip_list_routine_runs",
    description: composeDescription({
      summary: "List historical runs for a routine, ordered most-recent first.",
      args: [
        '- routineId: string — Routine UUID (example: "rtn_abc123")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: Run[], total, count, offset, limit, has_more, next_offset }. Each item: id, routineId, status, startedAt, finishedAt, triggerId.",
      examples: {
        useWhen: "auditing whether a scheduled routine has been firing and completing successfully",
        dontUseWhen:
          "you need the routine's triggers or settings — use paperclip_get_routine instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: routine not found → verify ID with paperclip_list_routines",
      ],
    }),
    inputSchema: toJsonSchema(ListRoutineRunsInput),
    annotations: { title: "List routine run history", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const {
          routineId,
          response_format: fmt,
          limit,
          offset,
        } = validate(ListRoutineRunsInput, args);
        const all = await client.get<unknown[]>(`/api/routines/${routineId}/runs`);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Routine Runs", envelope);
        const hint =
          "Response too large. Use limit/offset to page. This routine has an unusually long run history.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_routine_runs", resource: "routine" });
      }
    },
  },
];
