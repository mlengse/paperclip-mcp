import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";

const RoutineIdInput = z.object({
  routineId: z.string().min(1).describe("Routine UUID"),
});

const TriggerIdInput = z.object({
  triggerId: z.string().min(1).describe("Routine trigger UUID"),
});

const CreateRoutineInput = z.object({
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
});

const UpdateRoutineInput = z.object({
  routineId: z.string().min(1).describe("Routine UUID"),
  name: z.string().optional().describe("New name"),
  description: z.string().optional().describe("New description"),
  concurrencyPolicy: z.string().optional().describe("New concurrency policy"),
  catchUpPolicy: z.string().optional().describe("New catch-up policy"),
});

const TriggerConfigSchema = z
  .object({
    // schedule fields
    cron: z
      .string()
      .optional()
      .describe("Cron expression for schedule triggers (e.g. '0 9 * * 1'; 5-field standard cron)"),
    timezone: z
      .string()
      .optional()
      .describe(
        "IANA timezone string for schedule triggers (e.g. 'UTC', 'America/New_York'); defaults to UTC"
      ),
    // webhook fields
    signingMode: z
      .enum(["bearer", "hmac_sha256"])
      .optional()
      .describe(
        "Webhook signing mode: 'bearer' (default, Authorization header) or 'hmac_sha256' (X-Paperclip-Signature + X-Paperclip-Timestamp headers)"
      ),
    replayWindowSec: z
      .number()
      .int()
      .min(30)
      .max(86400)
      .optional()
      .describe(
        "Webhook replay window in seconds to reject replayed requests (30–86400, default 300; webhook type only)"
      ),
  })
  .optional()
  .describe(
    "Trigger configuration. schedule: provide cron + optional timezone. webhook: provide optional signingMode and replayWindowSec. api: no config needed."
  );

const AddTriggerInput = z.object({
  routineId: z.string().min(1).describe("Routine UUID"),
  type: z
    .enum(["schedule", "webhook", "api"])
    .describe(
      "Trigger type: 'schedule' (cron-based), 'webhook' (HTTP callback), or 'api' (manual via API)"
    ),
  config: TriggerConfigSchema,
});

const UpdateTriggerInput = z.object({
  triggerId: z.string().min(1).describe("Routine trigger UUID"),
  type: z
    .enum(["schedule", "webhook", "api"])
    .optional()
    .describe(
      "New trigger type: 'schedule' (cron-based), 'webhook' (HTTP callback), or 'api' (manual via API)"
    ),
  config: TriggerConfigSchema,
});

export const routineTools: ToolDefinition[] = [
  {
    name: "paperclip_list_routines",
    description: "List all routines for the current company.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string", description: "Routine UUID" },
      },
      required: ["routineId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent UUID to run the routine" },
        name: { type: "string", description: "Routine name" },
        description: { type: "string", description: "Routine description" },
        concurrencyPolicy: {
          type: "string",
          description: "Concurrency policy (e.g. allow, forbid, replace)",
        },
        catchUpPolicy: {
          type: "string",
          description: "Catch-up policy for missed runs (e.g. skip, run_once)",
        },
      },
      required: ["agentId", "name"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string", description: "Routine UUID" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        concurrencyPolicy: { type: "string", description: "New concurrency policy" },
        catchUpPolicy: { type: "string", description: "New catch-up policy" },
      },
      required: ["routineId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
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
      "Add a trigger to a routine. Supported types: 'schedule' (provide config.cron + optional config.timezone), 'webhook' (provide optional config.signingMode and config.replayWindowSec), 'api' (no config needed). Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string", description: "Routine UUID" },
        type: {
          type: "string",
          enum: ["schedule", "webhook", "api"],
          description:
            "Trigger type: 'schedule' (cron-based), 'webhook' (HTTP callback), or 'api' (manual via API)",
        },
        config: {
          type: "object",
          description:
            "Trigger configuration. schedule: provide cron + optional timezone. webhook: provide optional signingMode and replayWindowSec. api: no config needed.",
          properties: {
            cron: {
              type: "string",
              description: "Cron expression for schedule triggers (e.g. '0 9 * * 1')",
            },
            timezone: {
              type: "string",
              description:
                "IANA timezone string for schedule triggers (e.g. 'UTC', 'America/New_York')",
            },
            signingMode: {
              type: "string",
              enum: ["bearer", "hmac_sha256"],
              description: "Webhook signing mode: 'bearer' (default) or 'hmac_sha256'",
            },
            replayWindowSec: {
              type: "number",
              minimum: 30,
              maximum: 86400,
              description: "Webhook replay window in seconds (30–86400, default 300)",
            },
          },
        },
      },
      required: ["routineId", "type"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
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
      "Update an existing routine trigger's type or config. Supported types: 'schedule' (config.cron + optional config.timezone), 'webhook' (optional config.signingMode and config.replayWindowSec), 'api' (no config). Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        triggerId: { type: "string", description: "Routine trigger UUID" },
        type: {
          type: "string",
          enum: ["schedule", "webhook", "api"],
          description:
            "New trigger type: 'schedule' (cron-based), 'webhook' (HTTP callback), or 'api' (manual via API)",
        },
        config: {
          type: "object",
          description:
            "New trigger configuration. schedule: provide cron + optional timezone. webhook: provide optional signingMode and replayWindowSec. api: no config needed.",
          properties: {
            cron: {
              type: "string",
              description: "Cron expression for schedule triggers (e.g. '0 9 * * 1')",
            },
            timezone: {
              type: "string",
              description:
                "IANA timezone string for schedule triggers (e.g. 'UTC', 'America/New_York')",
            },
            signingMode: {
              type: "string",
              enum: ["bearer", "hmac_sha256"],
              description: "Webhook signing mode: 'bearer' (default) or 'hmac_sha256'",
            },
            replayWindowSec: {
              type: "number",
              minimum: 30,
              maximum: 86400,
              description: "Webhook replay window in seconds (30–86400, default 300)",
            },
          },
        },
      },
      required: ["triggerId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        triggerId: { type: "string", description: "Routine trigger UUID" },
      },
      required: ["triggerId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string", description: "Routine UUID" },
      },
      required: ["routineId"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string", description: "Routine UUID" },
      },
      required: ["routineId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
