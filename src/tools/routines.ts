import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  NoInput,
  handleApiError,
  RoutineTriggerTypeSchema,
  composeDescription,
} from "./validation.js";

// Basic 5-field cron regex: five whitespace-separated tokens
const CRON_REGEX = /^(\S+\s+){4}\S+$/;

const RoutineIdInput = z
  .object({
    routineId: z.string().min(1).describe("Routine UUID"),
  })
  .strict();

const TriggerIdInput = z
  .object({
    triggerId: z.string().min(1).describe("Routine trigger UUID"),
  })
  .strict();

const CreateRoutineInput = z
  .object({
    agentId: z.string().min(1).describe("Agent UUID to run the routine"),
    name: z.string().min(1).describe("Routine name"),
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
    name: z.string().optional().describe("New name"),
    description: z.string().optional().describe("New description"),
    concurrencyPolicy: z.string().optional().describe("New concurrency policy"),
    catchUpPolicy: z.string().optional().describe("New catch-up policy"),
  })
  .strict();

const AddTriggerInput = z
  .object({
    routineId: z.string().min(1).describe("Routine UUID"),
    type: RoutineTriggerTypeSchema.describe("Trigger type: schedule | webhook | api"),
    config: z
      .object({
        cron: z
          .string()
          .regex(CRON_REGEX, "Must be a valid 5-field cron expression (e.g. '*/5 * * * *')")
          .optional()
          .describe("5-field cron expression for schedule triggers (e.g. '*/5 * * * *')"),
      })
      .strict()
      .optional()
      .describe("Trigger configuration"),
  })
  .strict();

const UpdateTriggerInput = z
  .object({
    triggerId: z.string().min(1).describe("Routine trigger UUID"),
    type: RoutineTriggerTypeSchema.optional().describe("New trigger type"),
    config: z
      .object({
        cron: z
          .string()
          .regex(CRON_REGEX, "Must be a valid 5-field cron expression (e.g. '*/5 * * * *')")
          .optional()
          .describe("New 5-field cron expression for schedule triggers"),
      })
      .strict()
      .optional()
      .describe("New trigger configuration"),
  })
  .strict();

export const routineTools: ToolDefinition[] = [
  {
    name: "paperclip_list_routines",
    description: composeDescription({
      summary: "List all routines defined for the current company.",
      returns:
        "Array of routine objects: id, name, agentId, concurrencyPolicy, catchUpPolicy, createdAt.",
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "List company routines", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/routines`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_routine",
    description: composeDescription({
      summary: "Get a single routine by UUID, including its triggers and recent runs.",
      args: ['- routineId: string — Routine UUID (example: "rtn_abc123")'],
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
        const { routineId } = validate(RoutineIdInput, args);
        const data = await client.get<unknown>(`/api/routines/${routineId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_routine",
    description: composeDescription({
      summary:
        "Create a new routine for an agent. Add triggers separately with paperclip_add_routine_trigger.",
      args: [
        '- agentId: string — Agent UUID to run the routine (example: "agt_abc123")',
        '- name: string — Routine name (example: "daily-standup")',
        "- description: string (optional) — Routine description",
        "- concurrencyPolicy: string (optional) — allow | forbid | replace (default: forbid)",
        "- catchUpPolicy: string (optional) — skip | run_once for missed runs",
      ],
      returns: "Returns the created routine object: id, name, agentId, triggers:[], createdAt.",
      examples: {
        useWhen: "setting up a scheduled workflow for an agent before adding a cron trigger",
        dontUseWhen:
          "you want to trigger immediately — use paperclip_run_routine after creating the routine",
      },
      errors: [
        "- 400: validation failure → ensure name and agentId are non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agentId not found → verify with paperclip_list_agents",
      ],
    }),
    inputSchema: toJsonSchema(CreateRoutineInput),
    annotations: { title: "Create agent routine", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateRoutineInput, args);
        const body: Record<string, unknown> = { agentId: input.agentId, name: input.name };
        if (input.description !== undefined) body.description = input.description;
        if (input.concurrencyPolicy !== undefined) body.concurrencyPolicy = input.concurrencyPolicy;
        if (input.catchUpPolicy !== undefined) body.catchUpPolicy = input.catchUpPolicy;
        const data = await client.post<unknown>(
          `/api/companies/${client.companyId}/routines`,
          body
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_routine",
    description: composeDescription({
      summary: "Update a routine's name, description, or scheduling policies.",
      args: [
        '- routineId: string — Routine UUID (example: "rtn_abc123")',
        "- name: string (optional) — New name",
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
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_add_routine_trigger",
    description: composeDescription({
      summary:
        "Add a trigger to a routine. Supports schedule (cron), webhook, and api trigger types.",
      args: [
        '- routineId: string — Routine UUID (example: "rtn_abc123")',
        "- type: string — Trigger type: schedule | webhook | api",
        '- config.cron: string (optional) — 5-field cron expression, required for schedule triggers (example: "*/5 * * * *")',
      ],
      returns: "Returns the created trigger object: id, routineId, type, config, createdAt.",
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
        const { routineId, type, config } = validate(AddTriggerInput, args);
        const body: Record<string, unknown> = { type };
        if (config !== undefined) body.config = config;
        const data = await client.post<unknown>(`/api/routines/${routineId}/triggers`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_routine_trigger",
    description: composeDescription({
      summary: "Update an existing routine trigger's type or cron schedule.",
      args: [
        '- triggerId: string — Routine trigger UUID (example: "trg_abc123")',
        "- type: string (optional) — New trigger type: schedule | webhook | api",
        '- config.cron: string (optional) — New 5-field cron expression (example: "0 9 * * 1-5")',
      ],
      returns: "Returns the updated trigger object: id, routineId, type, config, updatedAt.",
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
        if (rest.type !== undefined) body.type = rest.type;
        if (rest.config !== undefined) body.config = rest.config;
        const data = await client.patch<unknown>(`/api/routine-triggers/${triggerId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
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
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_run_routine",
    description: composeDescription({
      summary: "Manually trigger a routine run immediately, bypassing its schedule.",
      args: ['- routineId: string — Routine UUID (example: "rtn_abc123")'],
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
    inputSchema: toJsonSchema(RoutineIdInput),
    annotations: { title: "Run routine now", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { routineId } = validate(RoutineIdInput, args);
        const data = await client.post<unknown>(`/api/routines/${routineId}/run`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_list_routine_runs",
    description: composeDescription({
      summary: "List historical runs for a routine, ordered most-recent first.",
      args: ['- routineId: string — Routine UUID (example: "rtn_abc123")'],
      returns: "Array of run objects: id, routineId, status, startedAt, finishedAt, triggerId.",
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
    inputSchema: toJsonSchema(RoutineIdInput),
    annotations: { title: "List routine run history", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { routineId } = validate(RoutineIdInput, args);
        const data = await client.get<unknown>(`/api/routines/${routineId}/runs`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
