import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  NoInput,
  handleApiError,
  composeDescription,
} from "./validation.js";

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
    description: composeDescription({
      summary: "Get the audit trail activity feed for the current company.",
      args: [
        '- agentId: string (optional) — Filter to a specific agent (example: "agt_abc123")',
        '- entityType: string (optional) — Filter by entity kind (example: "issue")',
        '- entityId: string (optional) — Filter to a specific entity (example: "PAP-42")',
      ],
      returns:
        "Array of activity events: id, agentId, entityType, entityId, action, occurredAt, metadata.",
      examples: {
        useWhen:
          "auditing what an agent did on a specific issue or reviewing recent company actions",
        dontUseWhen: "you need issue comments — use paperclip_list_comments instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
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
    description: composeDescription({
      summary:
        "Get a rolled-up cost summary for the current company across all agents and projects.",
      returns:
        "Object with total cost in cents, breakdown by period, and per-agent/per-project aggregates.",
      examples: {
        useWhen: "checking overall spend before requesting a budget override approval",
        dontUseWhen:
          "you need per-agent costs — use paperclip_get_costs_by_agent for a per-agent breakdown",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
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
    description: composeDescription({
      summary: "Get LLM token costs broken down by agent for the current company.",
      returns: "Array of per-agent cost records: agentId, agentName, totalCents, tokenCounts.",
      examples: {
        useWhen: "identifying which agent is consuming the most budget this period",
        dontUseWhen: "you need project-level costs — use paperclip_get_costs_by_project instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
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
    description: composeDescription({
      summary: "Get LLM token costs broken down by project for the current company.",
      returns:
        "Array of per-project cost records: projectId, projectName, totalCents, tokenCounts.",
      examples: {
        useWhen: "comparing spend across projects to prioritise budget allocation",
        dontUseWhen: "you need agent-level costs — use paperclip_get_costs_by_agent instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
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
    description: composeDescription({
      summary: "Report an agent's token usage and cost event to Paperclip for budget tracking.",
      args: [
        '- agentId: string — ID of the agent that incurred the cost (example: "agt_abc123")',
        '- provider: string — LLM provider name (example: "anthropic")',
        '- model: string — Model identifier (example: "claude-sonnet-4-6")',
        "- inputTokens: integer — Number of input tokens consumed",
        "- outputTokens: integer — Number of output tokens generated",
        "- costCents: number — Total cost in cents (non-negative)",
        '- occurredAt: string — ISO 8601 timestamp (example: "2026-04-16T12:00:00.000Z")',
      ],
      returns:
        "Returns the created cost event record: id, agentId, provider, model, costCents, occurredAt.",
      examples: {
        useWhen: "recording a completed LLM API call for spend analytics and budget enforcement",
        dontUseWhen:
          "you want a cost summary — use paperclip_get_cost_summary or paperclip_get_costs_by_agent",
      },
      errors: [
        "- 400: validation failure → check costCents ≥ 0, occurredAt is valid ISO 8601, tokens are integers",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
      ],
    }),
    inputSchema: toJsonSchema(ReportCostEventInput),
    annotations: {
      title: "Report agent cost event",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
