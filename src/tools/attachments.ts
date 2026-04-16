import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, IssueIdSchema, handleApiError } from "./validation.js";

const ListAttachmentsInput = IssueIdSchema.strict();

const UploadAttachmentInput = z
  .object({
    issueId: z.string().min(1).describe("Issue ID or identifier (e.g. PAP-22)"),
    filePath: z.string().min(1).describe("Absolute path to the local file to upload"),
    filename: z
      .string()
      .optional()
      .describe("Override filename in the upload (defaults to basename of filePath)"),
    mimeType: z
      .string()
      .optional()
      .describe("MIME type of the file (e.g. text/plain, application/pdf)"),
  })
  .strict();

const AttachmentIdInput = z
  .object({
    attachmentId: z.string().min(1).describe("Attachment UUID"),
  })
  .strict();

export const attachmentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_attachments",
    description: "List all attachments on an issue.",
    inputSchema: toJsonSchema(ListAttachmentsInput),
    annotations: { title: "List issue attachments", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { issueId } = validate(ListAttachmentsInput, args);
        const data = await client.get<unknown>(`/api/issues/${issueId}/attachments`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_upload_attachment",
    description:
      "Upload a local file as an attachment to an issue. Provide the absolute file path. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(UploadAttachmentInput),
    annotations: {
      title: "Upload file attachment to issue",
      destructiveHint: false,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { issueId, filePath, filename, mimeType } = validate(UploadAttachmentInput, args);
        const fileBuffer = await readFile(filePath);
        const uploadName = filename ?? basename(filePath);
        const form = new FormData();
        const blob = new Blob([fileBuffer], { type: mimeType ?? "application/octet-stream" });
        form.append("file", blob, uploadName);
        const data = await client.postForm<unknown>(
          `/api/companies/${client.companyId}/issues/${issueId}/attachments`,
          form
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_download_attachment",
    description: "Download the content of an attachment by ID. Returns the content as base64.",
    inputSchema: toJsonSchema(AttachmentIdInput),
    annotations: { title: "Download attachment content", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { attachmentId } = validate(AttachmentIdInput, args);
        const data = await client.get<unknown>(`/api/attachments/${attachmentId}/content`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_delete_attachment",
    description: "Delete an attachment from an issue. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(AttachmentIdInput),
    annotations: { title: "Delete attachment", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { attachmentId } = validate(AttachmentIdInput, args);
        const data = await client.delete<unknown>(`/api/attachments/${attachmentId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
