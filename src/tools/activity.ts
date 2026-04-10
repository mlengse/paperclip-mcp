import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";

const GetActivityInput = z.object({
  agentId: z.string().optional().describe("Filter by agent ID"),
  entityType: z.string().optional().describe("Filter by entity type (e.g. issue, approval)"),
  entityId: z.string().optional().describe("Filter by entity ID"),
});

export const activityTools: ToolDefinition[] = [
  {
    name: "paperclip_get_activity",
    description:
      "Get audit trail activity for the current company. Optionally filter by agentId, entityType, or entityId.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Filter by agent ID" },
        entityType: {
          type: "string",
          description: "Filter by entity type (e.g. issue, approval)",
        },
        entityId: { type: "string", description: "Filter by entity ID" },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(GetActivityInput, args);
        const params = new URLSearchParams();
        if (input.agentId) params.set("agentId", input.agentId);
        if (input.entityType) params.set("entityType", input.entityType);
        if (input.entityId) params.set("entityId", input.entityId);
        const qs = params.toString();
        const path = `/api/companies/${client.companyId}/activity${qs ? `?${qs}` : ""}`;
        const data = await client.get<unknown>(path);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_cost_summary",
    description: "Get a cost summary for the current company across all agents and projects.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/costs/summary`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_costs_by_agent",
    description: "Get costs broken down by agent for the current company.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/costs/by-agent`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_costs_by_project",
    description: "Get costs broken down by project for the current company.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(
          `/api/companies/${client.companyId}/costs/by-project`
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
