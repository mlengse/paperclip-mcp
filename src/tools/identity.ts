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

const GetCurrentUserInput = z
  .object({
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const RevokeCurrentSessionInput = z.object({}).strict();

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
  {
    name: "paperclip_get_current_user",
    description: composeDescription({
      summary: "Return the authenticated board user and their session identity.",
      args: [
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "{ userId: string|null, user: { id, email, ... }|null }. userId is null when no board session is active.",
      examples: {
        useWhen: "verifying which human operator is authenticated before performing board actions",
        dontUseWhen: "you need the current agent's identity — use paperclip_get_me instead",
      },
      errors: [
        "- 401: authentication failed → check that a board (human) API key is being used",
        "- 404: no active session → the board token may have expired",
      ],
      boardOnly: true,
    }),
    inputSchema: toJsonSchema(GetCurrentUserInput),
    annotations: {
      title: "Get authenticated board user",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { response_format: fmt } = validate(GetCurrentUserInput, args);
        const data = await client.get<unknown>(`/api/cli-auth/me`);
        const text = (fmt ?? "markdown") === "json" ? formatJson(data) : formatSingleIssue(data);
        const hint = "Entity response too large. This entity may have oversized fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_current_user" });
      }
    },
  },
  {
    name: "paperclip_revoke_current_session",
    description: composeDescription({
      summary:
        "Revoke the current board session token. WARNING: invalidates the token used to call this tool.",
      returns: "{ ok: true } on success. The token used for this call is immediately invalidated.",
      examples: {
        useWhen: "logging out a board session after completing administrative tasks",
        dontUseWhen:
          "you only want to check who is logged in — use paperclip_get_current_user instead",
      },
      errors: [
        "- 401: authentication failed → the token may already be invalid",
        "- 404: no active session found → nothing to revoke",
      ],
      boardOnly: true,
    }),
    inputSchema: toJsonSchema(RevokeCurrentSessionInput),
    annotations: {
      title: "Revoke current board session",
      destructiveHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        validate(RevokeCurrentSessionInput, args);
        const data = await client.post<unknown>(`/api/cli-auth/revoke-current`);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_revoke_current_session" });
      }
    },
  },
];
