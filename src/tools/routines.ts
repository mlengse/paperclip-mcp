import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  NoInput,
  handleApiError,
  RoutineTriggerTypeSchema,
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
      .optional()
      .describe("New trigger configuration"),
  })
  .strict();

export const routineTools: ToolDefinition[] = [
  {
    name: "paperclip_list_routines",
    description: "List all routines for the current company.",
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
    description: "Get a single routine by ID, including its triggers and recent runs.",
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
    description:
      "Create a new routine for an agent. Add triggers separately with paperclip_add_routine_trigger. Run ID header is injected automatically.",
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
    description:
      "Update a routine's name, description, or scheduling policies. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(UpdateRoutineInput),
    annotations: { title: "Update routine settings", destructiveHint: true, openWorldHint: false },
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
    description:
      "Add a trigger to a routine (schedule, webhook, or api). Run ID header is injected automatically.",
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
    description:
      "Update an existing routine trigger's type or config. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(UpdateTriggerInput),
    annotations: {
      title: "Update routine trigger",
      destructiveHint: true,
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
    description:
      "Delete a routine trigger. The routine itself is not deleted. Run ID header is injected automatically.",
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
    description:
      "Manually trigger a routine run immediately. Run ID header is injected automatically.",
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
    description: "List historical runs for a routine.",
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
