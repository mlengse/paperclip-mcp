import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, IssueIdSchema, handleApiError } from "./validation.js";

const ListDocumentsInput = IssueIdSchema;

const GetDocumentInput = z.object({
  issueId: z.string().min(1),
  key: z.string().min(1),
});

const UpsertDocumentInput = z.object({
  issueId: z.string().min(1),
  key: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  format: z.enum(["markdown"]).optional(),
  baseRevisionId: z.string().optional(),
});

const DocumentKeyInput = z.object({
  issueId: z.string().min(1),
  key: z.string().min(1),
});

export const documentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_documents",
    description: "List all documents attached to an issue (e.g. plan, notes).",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-22)" },
      },
      required: ["issueId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-22)" },
        key: { type: "string", description: "Document key (e.g. `plan`)" },
      },
      required: ["issueId", "key"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-22)" },
        key: { type: "string", description: "Document key (e.g. `plan`)" },
        title: { type: "string", description: "Document title" },
        body: { type: "string", description: "Document body (markdown)" },
        format: {
          type: "string",
          enum: ["markdown"],
          description: "Document format (default: markdown)",
        },
        baseRevisionId: {
          type: "string",
          description: "Current revision ID for optimistic concurrency — omit on first create",
        },
      },
      required: ["issueId", "key", "title", "body"],
    },
    annotations: { idempotentHint: true, openWorldHint: false },
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
      "Delete a document from an issue by key. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-22)" },
        key: { type: "string", description: "Document key to delete (e.g. `plan`)" },
      },
      required: ["issueId", "key"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
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
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID or identifier (e.g. PAP-22)" },
        key: { type: "string", description: "Document key (e.g. `plan`)" },
      },
      required: ["issueId", "key"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId, key } = validate(DocumentKeyInput, args);
        const data = await client.get<unknown>(
          `/api/issues/${issueId}/documents/${key}/revisions`
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
