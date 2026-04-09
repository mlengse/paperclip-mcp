import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PaperclipApiError } from "../errors.js";
import type { ToolResult } from "./index.js";

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
export const NoInput = z.object({});

export const IssueIdSchema = z.object({
  issueId: z.string().min(1),
});

export const StatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
]);

export const PrioritySchema = z.enum(["critical", "high", "medium", "low"]);
