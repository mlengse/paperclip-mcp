import type { ToolDefinition } from "./index.js";
import { validate, NoInput, handleApiError } from "./validation.js";
import { PaperclipApiError } from "../errors.js";

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
        try {
          const data = await client.get<unknown>("/api/agents/me");
          return { content: [{ type: "text", text: JSON.stringify(data) }] };
        } catch (primaryErr) {
          if (primaryErr instanceof PaperclipApiError && primaryErr.status === 401) {
            // /api/agents/me requires a JWT with agent sub claim; fall back to the
            // agent-scoped endpoint which works with any company-level API key.
            const data = await client.get<unknown>(`/api/agents/${client.agentId}`);
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
          }
          throw primaryErr;
        }
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
        try {
          const data = await client.get<unknown>("/api/agents/me/inbox-lite");
          return { content: [{ type: "text", text: JSON.stringify(data) }] };
        } catch (primaryErr) {
          if (primaryErr instanceof PaperclipApiError && primaryErr.status === 401) {
            // /api/agents/me/inbox-lite requires a JWT with agent sub claim; fall back
            // to filtering company issues by assignee, which works with any API key.
            const data = await client.get<unknown>(
              `/api/companies/${client.companyId}/issues?assigneeAgentId=${client.agentId}`
            );
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
          }
          throw primaryErr;
        }
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
