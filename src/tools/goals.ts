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

const ListGoalsInput = z
  .object({
    limit: PaginationLimitSchema.describe("Max goals to return per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of goals to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GoalIdInput = z
  .object({
    goalId: z.string().min(1).describe("Goal UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const CreateGoalInput = z
  .object({
    title: z.string().min(1).describe("Goal title"),
    description: z.string().optional().describe("Goal description (markdown)"),
    status: z.string().optional().describe("Initial status (e.g. active)"),
    level: z.string().optional().describe("Goal level (e.g. company, team)"),
    parentId: z.string().optional().describe("Parent goal UUID"),
  })
  .strict();

const UpdateGoalInput = z
  .object({
    goalId: z.string().min(1).describe("Goal UUID"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description (markdown)"),
    status: z.string().optional().describe("New status (e.g. active, completed)"),
  })
  .strict();

export const goalTools: ToolDefinition[] = [
  {
    name: "paperclip_list_goals",
    description: composeDescription({
      summary: "List all goals for the current company.",
      args: [
        "- limit: integer (optional) — Max goals per page, 1–100 (default 50)",
        "- offset: integer (optional) — Skip N goals for pagination (default 0)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: Goal[], total, count, offset, limit, has_more, next_offset } with up to 50 goals per page (default, max 100).",
      examples: {
        useWhen: "finding the goalId to link when creating a new issue or project",
        dontUseWhen: "you need a single goal's full details — use paperclip_get_goal instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListGoalsInput),
    annotations: { title: "List company goals", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt, limit, offset } = validate(ListGoalsInput, args);
        const all = await client.get<unknown[]>(`/api/companies/${client.companyId}/goals`);
        const envelope = paginate(all, { limit, offset });
        const hint =
          "Response too large; use limit/offset to page through results or archive completed goals.";
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Goals", envelope);
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_goal",
    description: composeDescription({
      summary: "Get a single goal by UUID, including its status and linked projects.",
      args: [
        '- goalId: string — Goal UUID (example: "gol_abc123")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Goal object: id, title, description, status, level, parentId, linkedProjects[], createdAt.",
      examples: {
        useWhen:
          "reading a goal's current status or linked projects before creating an issue under it",
        dontUseWhen: "you need a list of goals — use paperclip_list_goals to discover IDs first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: goal not found → verify ID with paperclip_list_goals",
      ],
    }),
    inputSchema: toJsonSchema(GoalIdInput),
    annotations: { title: "Get goal by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { goalId, response_format: fmt } = validate(GoalIdInput, args);
        const data = await client.get<unknown>(`/api/goals/${goalId}`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList([data], "Goal");
        const hint = "Entity response too large. This goal may have oversized description fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_goal",
    description: composeDescription({
      summary: "Create a new company goal. companyId is injected from auth config.",
      args: [
        "- title: string — Goal title (required)",
        "- description: string (optional) — Goal description (markdown)",
        '- status: string (optional) — Initial status (example: "active")',
        '- level: string (optional) — Goal level (example: "company")',
        "- parentId: string (optional) — Parent goal UUID for hierarchical goals",
      ],
      returns: "Returns the created goal object with all fields including assigned UUID.",
      examples: {
        useWhen:
          "creating a new quarterly or product-level goal to link issues and projects against",
        dontUseWhen: "the goal already exists — use paperclip_update_goal to modify it",
      },
      errors: [
        "- 400: validation failure → ensure title is non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: parentId not found → verify with paperclip_list_goals",
      ],
    }),
    inputSchema: toJsonSchema(CreateGoalInput),
    annotations: { title: "Create new goal", destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateGoalInput, args);
        const body: Record<string, unknown> = { title: input.title };
        if (input.description !== undefined) body.description = input.description;
        if (input.status !== undefined) body.status = input.status;
        if (input.level !== undefined) body.level = input.level;
        if (input.parentId !== undefined) body.parentId = input.parentId;
        const data = await client.post<unknown>(`/api/companies/${client.companyId}/goals`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_goal",
    description: composeDescription({
      summary: "Update a goal's title, description, or status.",
      args: [
        '- goalId: string — Goal UUID (example: "gol_abc123")',
        "- title: string (optional) — New title",
        "- description: string (optional) — New description (markdown)",
        '- status: string (optional) — New status (example: "completed")',
      ],
      returns: "Returns the updated goal object with all fields.",
      examples: {
        useWhen: "closing a completed goal or updating its description after a planning session",
        dontUseWhen: "you need to create a goal — use paperclip_create_goal instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: goal not found → verify ID with paperclip_list_goals",
      ],
    }),
    inputSchema: toJsonSchema(UpdateGoalInput),
    annotations: {
      title: "Update goal fields",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { goalId, ...rest } = validate(UpdateGoalInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/goals/${goalId}`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
