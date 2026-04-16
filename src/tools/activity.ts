import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, NoInput, handleApiError } from "./validation.js";

const ReportCostEventInput = z
  .object({
    agentId: z.string().describe("ID of the agent that incurred the cost"),
    provider: z.string().describe("LLM provider name (e.g. anthropic, openai)"),
    model: z.string().describe("Model name (e.g. claude-sonnet-4-6)"),
    inputTokens: z.number().int().nonnegative().describe("Number of input tokens consumed"),
    outputTokens: z.number().int().nonnegative().describe("Number of output tokens generated"),
    costCents: z.number().nonnegative().describe("Total cost in cents"),
    occurredAt: z
      .string()
      .datetime({
        message: "Must be a valid ISO 8601 datetime string (e.g. '2026-04-16T12:00:00.000Z')",
      })
      .describe("ISO 8601 timestamp of when the cost was incurred"),
  })
  .strict();

const GetActivityInput = z
  .object({
    agentId: z.string().optional().describe("Filter by agent ID"),
    entityType: z.string().optional().describe("Filter by entity type (e.g. issue, approval)"),
    entityId: z.string().optional().describe("Filter by entity ID"),
  })
  .strict();

export const activityTools: ToolDefinition[] = [
  {
    name: "paperclip_get_activity",
    description:
      "Get audit trail activity for the current company. Optionally filter by agentId, entityType, or entityId.",
    inputSchema: toJsonSchema(GetActivityInput),
    annotations: { title: "Get company activity feed", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "Get company cost summary", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "Get costs by agent", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "Get costs by project", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(ReportCostEventInput),
    annotations: { title: "Report agent cost event", readOnlyHint: false, openWorldHint: false },
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
