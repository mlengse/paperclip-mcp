import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";

const ReportCostEventInput = z.object({
  agentId: z.string().describe("ID of the agent that incurred the cost"),
  provider: z.string().describe("LLM provider name (e.g. anthropic, openai)"),
  model: z.string().describe("Model name (e.g. claude-sonnet-4-6)"),
  inputTokens: z.number().int().nonnegative().describe("Number of input tokens consumed"),
  outputTokens: z.number().int().nonnegative().describe("Number of output tokens generated"),
  costCents: z.number().nonnegative().describe("Total cost in cents"),
  occurredAt: z.string().describe("ISO 8601 timestamp of when the cost was incurred"),
});

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
  {
    name: "paperclip_report_cost_event",
    description:
      "Report an agent's token usage and cost to Paperclip for budget tracking and spend analytics. Calls POST /api/companies/{companyId}/cost-events.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "ID of the agent that incurred the cost" },
        provider: { type: "string", description: "LLM provider name (e.g. anthropic, openai)" },
        model: { type: "string", description: "Model name (e.g. claude-sonnet-4-6)" },
        inputTokens: {
          type: "number",
          description: "Number of input tokens consumed",
        },
        outputTokens: {
          type: "number",
          description: "Number of output tokens generated",
        },
        costCents: { type: "number", description: "Total cost in cents" },
        occurredAt: {
          type: "string",
          description: "ISO 8601 timestamp of when the cost was incurred",
        },
      },
      required: ["agentId", "provider", "model", "inputTokens", "outputTokens", "costCents", "occurredAt"],
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(ReportCostEventInput, args);
        const data = await client.post<unknown>(
          `/api/companies/${client.companyId}/cost-events`,
          input
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
