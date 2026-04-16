import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolDefinition } from "./index.js";
import {
  validate,
  toJsonSchema,
  IssueIdSchema,
  handleApiError,
  composeDescription,
} from "./validation.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatGenericList,
  formatResult,
  applyCharLimit,
  paginate,
} from "./format.js";

const ListAttachmentsInput = IssueIdSchema.extend({
  limit: PaginationLimitSchema.describe("Max attachments per page (1–100, default 50)"),
  offset: PaginationOffsetSchema.describe("Number of attachments to skip (default 0)"),
  response_format: ResponseFormatSchema.optional()
    .default("markdown")
    .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
}).strict();

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

const DownloadAttachmentInput = z
  .object({
    attachmentId: z.string().min(1).describe("Attachment UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

export const attachmentTools: ToolDefinition[] = [
  {
    name: "paperclip_list_attachments",
    description: composeDescription({
      summary: "List all attachments on an issue.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        "- limit: number — Max attachments per page (1–100, default 50)",
        "- offset: number — Number of attachments to skip (default 0)",
        "- response_format: 'markdown' | 'json' — Output format (default 'markdown')",
      ],
      returns:
        "Pagination envelope { items: Attachment[], total, count, offset, limit, has_more, next_offset }. Each item: id, filename, mimeType, size, createdAt.",
      examples: {
        useWhen: "discovering attachment IDs before downloading or deleting a file",
        dontUseWhen:
          "you already have the attachment UUID — use paperclip_download_attachment directly",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
      ],
    }),
    inputSchema: toJsonSchema(ListAttachmentsInput),
    annotations: { title: "List issue attachments", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const {
          issueId,
          response_format: fmt,
          limit,
          offset,
        } = validate(ListAttachmentsInput, args);
        const all = await client.get<unknown[]>(`/api/issues/${issueId}/attachments`);
        const envelope = paginate(all, { limit, offset });
        const hint = `Use limit/offset to page through attachments on issue "${issueId}".`;
        const text =
          fmt === "json"
            ? applyCharLimit(formatJson(envelope), hint)
            : applyCharLimit(formatGenericList(envelope.items, "Attachments", envelope), hint);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_attachments", resource: "attachment" });
      }
    },
  },
  {
    name: "paperclip_upload_attachment",
    description: composeDescription({
      summary: "Upload a local file as an attachment to an issue.",
      args: [
        '- issueId: string — Issue ID or identifier (example: "PAP-42")',
        '- filePath: string — Absolute path to the local file (example: "/tmp/report.pdf")',
        "- filename: string (optional) — Override filename in the upload (defaults to basename of filePath)",
        '- mimeType: string (optional) — MIME type (example: "application/pdf")',
      ],
      returns: "Returns the created attachment record: id, filename, mimeType, size, createdAt.",
      examples: {
        useWhen: "attaching a generated report, diff, or log file to an issue",
        dontUseWhen:
          "you need to download an attachment — use paperclip_download_attachment instead",
      },
      errors: [
        "- 400: validation failure → check filePath is absolute and the file exists",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: issue not found → verify ID with paperclip_list_issues",
        "- 413: file too large → check Paperclip attachment size limits",
      ],
    }),
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
        const hint = `Use paperclip_list_attachments with issueId "${issueId}" to retrieve the full attachment list.`;
        return { content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_upload_attachment" });
      }
    },
  },
  {
    name: "paperclip_download_attachment",
    description: composeDescription({
      summary: "Fetch the content of an attachment by ID from the Paperclip API.",
      args: [
        '- attachmentId: string — Attachment UUID (example: "att_abc123")',
        "- response_format: 'markdown' | 'json' — Output format (default 'markdown')",
      ],
      returns:
        "Returns a fixed envelope with fields: attachmentId, contentType, size (bytes), contentBase64 (base64-encoded file content). When response_format is 'markdown', produces a compact summary (id, contentType, size, base64 snippet). When response_format is 'json', returns the full envelope as structured JSON.",
      examples: {
        useWhen: "reading a previously uploaded attachment to extract its content",
        dontUseWhen:
          "you need the attachment metadata only — use paperclip_list_attachments for id, filename, size",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: attachment not found → verify UUID with paperclip_list_attachments",
      ],
    }),
    inputSchema: toJsonSchema(DownloadAttachmentInput),
    annotations: { title: "Download attachment content", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { attachmentId, response_format: fmt } = validate(DownloadAttachmentInput, args);
        const raw = await client.getRaw(`/api/attachments/${attachmentId}/content`);
        const contentBase64 = Buffer.from(raw.bytes).toString("base64");
        const data = {
          attachmentId,
          contentType: raw.contentType,
          size: raw.bytes.byteLength,
          contentBase64,
        };
        const hint = `Use paperclip_list_attachments to retrieve attachment metadata. Decode contentBase64 to read the file content.`;
        let text: string;
        if (fmt === "json") {
          text = applyCharLimit(formatJson(data), hint);
        } else {
          const md = [
            `## Attachment ${attachmentId}`,
            `- Content-Type: ${data.contentType}`,
            `- Size: ${data.size} bytes`,
            `- Base64: ${contentBase64}`,
          ].join("\n");
          text = applyCharLimit(md, hint);
        }
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_download_attachment" });
      }
    },
  },
  {
    name: "paperclip_delete_attachment",
    description: composeDescription({
      summary: "Permanently delete an attachment by ID.",
      args: ['- attachmentId: string — Attachment UUID (example: "att_abc123")'],
      returns: "Returns the deleted attachment stub: id, filename, confirming deletion.",
      examples: {
        useWhen: "removing a superseded or mistakenly uploaded file from an issue",
        dontUseWhen:
          "you want to read the file first — use paperclip_download_attachment before deleting",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: attachment not found → verify UUID with paperclip_list_attachments",
      ],
    }),
    inputSchema: toJsonSchema(AttachmentIdInput),
    annotations: { title: "Delete attachment", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { attachmentId } = validate(AttachmentIdInput, args);
        const data = await client.delete<unknown>(`/api/attachments/${attachmentId}`);
        const hint = `Attachment "${attachmentId}" has been deleted.`;
        return { content: [{ type: "text", text: applyCharLimit(formatResult(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_delete_attachment", resource: "attachment" });
      }
    },
  },
];
