import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  IssueIdSchema,
  handleApiError,
  composeDescription,
} from "./validation.js";
import { ResponseFormatSchema, formatJson, formatGenericList, applyCharLimit } from "./format.js";

const ListDocumentsInput = IssueIdSchema.extend({ response_format: ResponseFormatSchema }).strict();

const GetDocumentInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-22)"),
    key: z.string().min(1).describe("Document key (e.g. `plan`)"),
    response_format: ResponseFormatSchema,
  })
  .strict();

const UpsertDocumentInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-22)"),
    key: z.string().min(1).describe("Document key (e.g. `plan`)"),
    title: z.string().min(1).describe("Document title"),
    body: z.string().min(1).describe("Document body (markdown)"),
    format: z.enum(["markdown"]).optional().describe("Document format (default: markdown)"),
    baseRevisionId: z
      .string()
      .optional()
      .describe("Current revision ID for optimistic concurrency — omit on first create"),
  })
  .strict();

const DocumentKeyInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-22)"),
    key: z.string().min(1).describe("Document key (e.g. `plan`)"),
  })
  .strict();

const GetDocumentRevisionsInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-22)"),
    key: z.string().min(1).describe("Document key (e.g. `plan`)"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const documentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_documents",
    description: composeDescription({
      summary: "List all documents attached to an issue (e.g. plan, notes).",
      args: ['- issueId: string — Issue ID or identifier (example: "PAP-42")'],
      returns:
        "Array of document stubs: key, title, format, createdAt, updatedAt. Body not included — use paperclip_get_document.",
      examples: {
        useWhen: "discovering which document keys exist on an issue before reading or updating one",
        dontUseWhen: "you already know the key — use paperclip_get_document directly",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
      ],
    }),
    inputSchema: toJsonSchema(ListDocumentsInput),
    annotations: { title: "List issue documents", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, response_format: fmt } = validate(ListDocumentsInput, args);
        const data = await client.get<unknown[]>(`/api/issues/${issueId}/documents`);
        const hint = `Use paperclip_list_documents with issueId "${issueId}" to retrieve the full list.`;
        const text =
          fmt === "json"
            ? applyCharLimit(formatJson(data), hint)
            : applyCharLimit(formatGenericList(data, "Documents"), hint);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_document",
    description: composeDescription({
      summary: "Get the full content of a specific issue document by key.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- key: string — Document key (example: "plan")',
      ],
      returns:
        "Document object: key, title, body (markdown), format, revisionId, createdAt, updatedAt.",
      examples: {
        useWhen: "reading the plan or notes document before writing an update",
        dontUseWhen:
          "you need all document keys — use paperclip_list_documents first to discover them",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: document or issue not found → verify both issueId and key with paperclip_list_documents",
      ],
    }),
    inputSchema: toJsonSchema(GetDocumentInput),
    annotations: { title: "Get issue document", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, key, response_format: fmt } = validate(GetDocumentInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/documents/${key}`);
        const hint = `Use paperclip_get_document with issueId "${issueId}" and key "${key}" to retrieve the full document.`;
        const text =
          fmt === "json"
            ? applyCharLimit(formatJson(data), hint)
            : applyCharLimit(formatGenericList([data], "Document"), hint);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_upsert_document",
    description: composeDescription({
      summary:
        "Create or update an issue document. Send baseRevisionId for safe concurrent updates.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- key: string — Document key (example: "plan")',
        "- title: string — Document title",
        "- body: string — Document body (markdown)",
        '- format: "markdown" (optional) — Document format (default: markdown)',
        "- baseRevisionId: string (optional) — Current revision ID from a prior get; omit on first create",
      ],
      returns: "Returns the updated document object: key, title, body, revisionId, updatedAt.",
      examples: {
        useWhen: "writing or updating the implementation plan document on an issue mid-run",
        dontUseWhen: "you want to delete a document — use paperclip_delete_document (board-only)",
      },
      errors: [
        "- 400: validation failure → check title and body are non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
        "- 409: conflict — baseRevisionId mismatch → re-read with paperclip_get_document and retry",
      ],
    }),
    inputSchema: toJsonSchema(UpsertDocumentInput),
    annotations: {
      title: "Create or update issue document",
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { issueId, key, title, body, format, baseRevisionId } = validate(
          UpsertDocumentInput,
          args
        );
        const payload: Record<string, unknown> = { title, body, format: format ?? "markdown" };
        if (baseRevisionId !== undefined) payload.baseRevisionId = baseRevisionId;
        const data = await client.put<unknown>(`/api/issues/${issueId}/documents/${key}`, payload);
        const hint = `Use paperclip_get_document with issueId "${issueId}" and key "${key}" to retrieve the updated document.`;
        return { content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_delete_document",
    description: composeDescription({
      summary: "Delete a document from an issue by key.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- key: string — Document key to delete (example: "plan")',
      ],
      returns: "Returns the deleted document stub confirming the key and issueId.",
      examples: {
        useWhen: "removing an obsolete document from an issue (requires board API key)",
        dontUseWhen:
          "you want to clear the body — use paperclip_upsert_document with an empty body instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human) API key",
        "- 404: document or issue not found → verify both issueId and key",
      ],
      boardOnly: true,
    }),
    inputSchema: toJsonSchema(DocumentKeyInput),
    annotations: { title: "Delete issue document", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, key } = validate(DocumentKeyInput, args);
        const data = await client.delete<unknown>(`/api/issues/${issueId}/documents/${key}`);
        const hint = `Document "${key}" on issue "${issueId}" has been deleted.`;
        return { content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_document_revisions",
    description: composeDescription({
      summary: "Get the full revision history for an issue document.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- key: string — Document key (example: "plan")',
      ],
      returns: "Array of revision objects: revisionId, authorId, createdAt, changeSummary.",
      examples: {
        useWhen:
          "auditing who changed a document or finding a revisionId to pass to paperclip_upsert_document",
        dontUseWhen: "you need the current document body — use paperclip_get_document instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: document or issue not found → verify both issueId and key with paperclip_list_documents",
      ],
    }),
    inputSchema: toJsonSchema(GetDocumentRevisionsInput),
    annotations: {
      title: "Get document revision history",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { issueId, key, response_format: fmt } = validate(GetDocumentRevisionsInput, args);
        const data = await client.get<unknown[]>(
          `/api/issues/${issueId}/documents/${key}/revisions`
        );
        const hint = `Use paperclip_get_document_revisions with issueId "${issueId}" and key "${key}" to retrieve the full revision history.`;
        const text =
          fmt === "json"
            ? applyCharLimit(formatJson(data), hint)
            : applyCharLimit(formatGenericList(data, "Revisions"), hint);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
