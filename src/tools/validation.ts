import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PaperclipApiError } from "../errors.js";
import type { ToolResult } from "./index.js";

// ---------------------------------------------------------------------------
// composeDescription — canonical tool description builder (Stage 4)
// ---------------------------------------------------------------------------

export interface DescriptionSections {
  /** One-line summary of what the tool does (≤100 chars). */
  summary: string;
  /** Lines like "- paramName: type — meaning (example: 'value')" in schema order. */
  args?: string[];
  /** Shape sketch: key fields for single objects, or "Array of {fields}." for lists. */
  returns?: string;
  /** Realistic use-case guidance. */
  examples?: { useWhen: string; dontUseWhen?: string };
  /** Lines like "- 404: not found → verify ID with paperclip_list_*" */
  errors?: string[];
  /**
   * When true, prefixes the summary with "⚠ Board-only: ".
   * Must be set for tools restricted to board (human) API keys.
   */
  boardOnly?: boolean;
}

/**
 * Compose a standardised multi-line tool description from structured sections.
 *
 * Output format (sections present only when data supplied):
 *
 *   [⚠ Board-only: ]<summary>
 *
 *   Args:
 *   - param: type — meaning (example: "value")
 *
 *   Returns:
 *   - <shape sketch>
 *
 *   Examples:
 *   - Use when: <scenario>
 *   - Don't use when: <counter-scenario>
 *
 *   Error Handling:
 *   - 404: not found → verify with paperclip_list_*
 */
export function composeDescription(s: DescriptionSections): string {
  const parts: string[] = [];

  const rawSummary = s.summary.trim();
  const summary = s.boardOnly ? `⚠ Board-only: ${rawSummary}` : rawSummary;
  parts.push(summary);

  if (s.args && s.args.length > 0) {
    parts.push("Args:\n" + s.args.map((l) => l).join("\n"));
  }

  if (s.returns && s.returns.trim().length > 0) {
    parts.push("Returns:\n" + s.returns.trim());
  }

  if (s.examples) {
    const lines: string[] = [`- Use when: ${s.examples.useWhen}`];
    if (s.examples.dontUseWhen) {
      lines.push(`- Don't use when: ${s.examples.dontUseWhen}`);
    }
    parts.push("Examples:\n" + lines.join("\n"));
  }

  if (s.errors && s.errors.length > 0) {
    parts.push("Error Handling:\n" + s.errors.join("\n"));
  }

  return parts.join("\n\n");
}

/**
 * Convert a Zod schema to a JSON Schema object for use in MCP tool definitions.
 * Uses Zod 4's built-in toJSONSchema() which produces a standards-compliant
 * JSON Schema 2020-12 object with type, properties, and required.
 *
 * The $schema key is stripped: strict MCP clients may reject or mishandle it,
 * and MCP tool inputSchema fields are implicitly JSON Schema objects without
 * requiring an explicit $schema declaration.
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const out = schema.toJSONSchema() as Record<string, unknown>;
  delete out["$schema"];
  return out;
}

export function validate<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new McpError(ErrorCode.InvalidParams, result.error.message);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// handleApiError — Stage 7: LLM-actionable error messages
// ---------------------------------------------------------------------------

/** Optional context passed by each tool handler to produce actionable error text. */
export interface ApiErrorContext {
  /** Tool name, e.g. "paperclip_list_issues". Included in every message. */
  tool: string;
  /**
   * Singular resource noun, e.g. "issue", "agent". Used to construct
   * recovery hints like "verify with paperclip_list_issues".
   */
  resource?: string;
  /**
   * Per-tool additional guidance appended to the message.
   * Example: 500 on list_comments with `after` cursor → known Paperclip API bug hint.
   */
  hint?: string;
}

function makeError(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

/**
 * Convert an API error into a ToolResult.
 * - Re-throws `McpError` (protocol-level validation errors from Zod).
 * - All other errors (PaperclipApiError, AbortError, network, unknown) become
 *   { isError: true, content: [...] } with an LLM-actionable message.
 */
export function handleApiError(err: unknown, ctx?: ApiErrorContext): ToolResult {
  // McpError (from validate()) is a protocol-level error — let it propagate
  // to the MCP framework which translates it into a JSON-RPC error response.
  if (err instanceof McpError) {
    throw err;
  }

  const tool = ctx?.tool ?? "unknown tool";
  const resource = ctx?.resource;
  const hint = ctx?.hint;

  function withHint(msg: string): string {
    return hint ? `${msg} (Hint: ${hint})` : msg;
  }

  // ── PaperclipApiError ───────────────────────────────────────────────────
  if (err instanceof PaperclipApiError) {
    const { status, statusText, body } = err;
    const bodyMessage =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as Record<string, unknown>)["message"])
        : typeof body === "string"
          ? body
          : statusText;

    let msg: string;

    if (status === 400) {
      msg = `400 Bad request in ${tool}: ${bodyMessage}. Check the input parameters and try again.`;
    } else if (status === 401) {
      msg = `401 Authentication failed for ${tool}. Check PAPERCLIP_API_KEY is valid and not expired.`;
    } else if (status === 403) {
      msg = `403 Permission denied for ${tool}. This endpoint may require a board (human-user) API key.`;
    } else if (status === 404) {
      const listTool = resource ? `paperclip_list_${resource}s` : undefined;
      const getTool = resource ? `paperclip_get_${resource}` : undefined;
      const siblings = [listTool, getTool].filter(Boolean).join(" or ");
      const recovery = siblings
        ? `Verify the ID with ${siblings}.`
        : "Verify the ID is correct and you have access.";
      msg = `404 Not found in ${tool}: the ${resource ?? "resource"} ID may not exist or you don't have access. ${recovery}`;
    } else if (status === 409) {
      const refreshTool = resource ? `paperclip_get_${resource}` : undefined;
      const refreshHint = refreshTool ? ` Do not retry — refresh state with ${refreshTool}.` : "";
      msg = `409 Conflict in ${tool}: ${bodyMessage}.${refreshHint}`;
    } else if (status === 422) {
      msg = `422 Validation failure in ${tool}: ${bodyMessage}. Check the submitted values.`;
    } else if (status === 429) {
      msg = `429 Rate limited on ${tool}. Wait a few seconds before retrying.`;
    } else if (status >= 500) {
      msg = `Paperclip API server error (${status}) in ${tool}. This is usually transient; retry in a few seconds.`;
    } else {
      msg = `Paperclip API error ${status} ${statusText} in ${tool}: ${JSON.stringify(body)}`;
    }

    return makeError(withHint(msg));
  }

  // ── AbortError (timeout via AbortSignal.timeout) ─────────────────────────
  // Covers both DOMException (browser/Node globals) and plain Error (test
  // doubles and some runtimes that don't expose DOMException).
  if (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  ) {
    return makeError(
      withHint(
        `Request timeout in ${tool}. The Paperclip API took longer than the configured timeout. Retry, or check PAPERCLIP_API_URL connectivity.`
      )
    );
  }

  // ── Network error (fetch failed) ─────────────────────────────────────────
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
    return makeError(
      withHint(
        `Network error in ${tool}: could not reach Paperclip API. Check PAPERCLIP_API_URL is reachable.`
      )
    );
  }

  // ── Unknown error ─────────────────────────────────────────────────────────
  const msg = err instanceof Error ? err.message : String(err);
  return makeError(withHint(`Unexpected error in ${tool}: ${msg}`));
}

// Common input schemas reused across tool modules
export const NoInput = z.object({}).strict();

export const IssueIdSchema = z.object({
  issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-21)"),
});

export const StatusSchema = z
  .enum(["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"])
  .describe("Issue lifecycle status");

export const PrioritySchema = z
  .enum(["critical", "high", "medium", "low"])
  .describe("Issue priority level");

export const ApprovalTypeSchema = z
  .enum(["hire_agent", "approve_ceo_strategy", "budget_override_required"])
  .describe("Approval request type");

export const RoutineTriggerTypeSchema = z
  .enum(["schedule", "webhook", "api"])
  .describe("Routine trigger type");
