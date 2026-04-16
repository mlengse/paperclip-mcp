import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, IssueIdSchema, handleApiError } from "./validation.js";

const ListDocumentsInput = IssueIdSchema.strict();

const GetDocumentInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-22)"),
    key: z.string().min(1).describe("Document key (e.g. `plan`)"),
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

export const documentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_documents",
    description: "List all documents attached to an issue (e.g. plan, notes).",
    inputSchema: toJsonSchema(ListDocumentsInput),
    annotations: { title: "List issue documents", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId } = validate(ListDocumentsInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/documents`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_document",
    description: "Get the content of a specific issue document by key (e.g. `plan`).",
    inputSchema: toJsonSchema(GetDocumentInput),
    annotations: { title: "Get issue document", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, key } = validate(GetDocumentInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/documents/${key}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_upsert_document",
    description:
      "Create or update an issue document. Send `baseRevisionId` (from a prior get) for safe concurrent updates. Run ID is injected automatically.",
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
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_delete_document",
    description:
      "⚠ Board-only: Delete a document from an issue by key. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(DocumentKeyInput),
    annotations: { title: "Delete issue document", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, key } = validate(DocumentKeyInput, args);
        const data = await client.delete<unknown>(`/api/issues/${issueId}/documents/${key}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_document_revisions",
    description: "Get the revision history for an issue document.",
    inputSchema: toJsonSchema(DocumentKeyInput),
    annotations: {
      title: "Get document revision history",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { issueId, key } = validate(DocumentKeyInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/documents/${key}/revisions`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
