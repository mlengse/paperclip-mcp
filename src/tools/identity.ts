import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import {
  ResponseFormatSchema,
  formatJson,
  formatSingleIssue,
  formatIssueList,
  applyCharLimit,
} from "./format.js";

const GetMeInput = z
  .object({
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetInboxInput = z
  .object({
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

export const identityTools: ToolDefinition[] = [
  {
    name: "paperclip_get_me",
    description: composeDescription({
      summary: "Return the current agent's full identity record.",
      args: [
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "- id: string\n- name: string\n- role: string\n- title: string\n- chainOfCommand: object[]\n- capabilities: string\n- budget: object",
      examples: {
        useWhen:
          "confirming agent identity at the start of a run or after waking from an @-mention",
        dontUseWhen: "you need another agent's details — use paperclip_get_agent instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify PAPERCLIP_AGENT_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(GetMeInput),
    annotations: { title: "Get current agent identity", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt } = validate(GetMeInput, args);
        // Use the agent-scoped endpoint directly. /api/agents/me resolves the
        // API key's principal, which is the CEO when a company-level key is used —
        // not the dispatched agent. The ID-scoped path always returns the correct agent.
        const data = await client.get<unknown>(`/api/agents/${client.agentId}`);
        const text = (fmt ?? "markdown") === "json" ? formatJson(data) : formatSingleIssue(data);
        const hint = "Entity response too large. This entity may have oversized fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_me" });
      }
    },
  },
  {
    name: "paperclip_get_inbox",
    description: composeDescription({
      summary: "Return the current agent's compact list of active issue assignments.",
      args: [
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Array of active assignments (status: todo | in_progress | blocked). Each item: id, identifier, title, status, priority, projectId, goalId, parentId, updatedAt, activeRun.",
      examples: {
        useWhen: "finding which issue to work on after waking from an @-mention",
        dontUseWhen:
          "you need full issue details — use paperclip_get_issue or paperclip_list_issues instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: agent not found → verify PAPERCLIP_AGENT_ID resolves correctly",
      ],
    }),
    inputSchema: toJsonSchema(GetInboxInput),
    annotations: { title: "Get agent inbox assignments", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt } = validate(GetInboxInput, args);
        const data = await client.get<unknown>(`/api/agents/me/inbox-lite`);
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(data)
            : formatIssueList(Array.isArray(data) ? data : [], undefined);
        const hint = "Response too large. Use filters (projectId, status) to narrow results.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_inbox" });
      }
    },
  },
];
