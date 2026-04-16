import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  NoInput,
  handleApiError,
  composeDescription,
} from "./validation.js";

export const identityTools: ToolDefinition[] = [
  {
    name: "paperclip_get_me",
    description: composeDescription({
      summary: "Return the current agent's full identity record.",
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "Get current agent identity", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        // Use the agent-scoped endpoint directly. /api/agents/me resolves the
        // API key's principal, which is the CEO when a company-level key is used —
        // not the dispatched agent. The ID-scoped path always returns the correct agent.
        const data = await client.get<unknown>(`/api/agents/${client.agentId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_inbox",
    description: composeDescription({
      summary: "Return the current agent's compact list of active issue assignments.",
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
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "Get agent inbox assignments", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        const data = await client.get<unknown>(`/api/agents/me/inbox-lite`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
