import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, NoInput } from "./validation.js";

const GoalIdInput = z.object({
  goalId: z.string().min(1).describe("Goal UUID"),
});

const CreateGoalInput = z.object({
  title: z.string().min(1).describe("Goal title"),
  description: z.string().optional().describe("Goal description (markdown)"),
  status: z.string().optional().describe("Initial status (default: active)"),
  level: z.string().optional().describe("Goal level (e.g. company, team)"),
  parentId: z.string().optional().describe("Parent goal UUID"),
});

const UpdateGoalInput = z.object({
  goalId: z.string().min(1).describe("Goal UUID"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description (markdown)"),
  status: z.string().optional().describe("New status"),
});

export const goalTools: ToolDefinition[] = [
  {
    name: "paperclip_list_goals",
    description: "List goals for the current company.",
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "List company goals", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/goals`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_goal",
    description: "Get a single goal by ID, including its status and linked projects.",
    inputSchema: toJsonSchema(GoalIdInput),
    annotations: { title: "Get goal by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { goalId } = validate(GoalIdInput, args);
        const data = await client.get<unknown>(`/api/goals/${goalId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_goal",
    description:
      "Create a new goal. companyId is injected from auth config. Run ID header is injected automatically.",
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
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_goal",
    description:
      "Update a goal's title, description, or status. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(UpdateGoalInput),
    annotations: { title: "Update goal fields", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { goalId, ...rest } = validate(UpdateGoalInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/goals/${goalId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
