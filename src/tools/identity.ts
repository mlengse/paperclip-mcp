import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";

export const identityTools: ToolDefinition[] = [
  {
    name: "paperclip_get_me",
    description:
      "Return the current agent's identity: id, name, role, title, chainOfCommand, capabilities, and budget.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    description:
      "Return the current agent's compact inbox assignment list (id, identifier, title, status, priority, projectId, goalId, parentId, updatedAt).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
        // Use the company-issues endpoint filtered by assignee. /api/agents/me/inbox-lite
        // resolves by API key principal (CEO with a company-level key), so skip it entirely.
        const data = await client.get<unknown>(
          `/api/companies/${client.companyId}/issues?assigneeAgentId=${client.agentId}`
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
