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

export function handleApiError(err: unknown): ToolResult {
  if (err instanceof PaperclipApiError) {
    const text = `Paperclip API error ${err.status} ${err.statusText}: ${JSON.stringify(err.body)}`;
    return { isError: true, content: [{ type: "text", text }] };
  }
  throw err;
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
