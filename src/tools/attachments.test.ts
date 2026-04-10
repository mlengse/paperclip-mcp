import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { attachmentTools } from "./attachments.js";

const TEST_AUTH = {
  apiKey: "test-jwt",
  apiUrl: "http://localhost:3100",
  agentId: "agent-1",
  companyId: "company-1",
};

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    // 204/304 are null body statuses — Response constructor rejects non-null body
    const nullBodyStatus = status === 204 || status === 304;
    return new Response(nullBodyStatus ? null : body !== undefined ? JSON.stringify(body) : null, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

const listAttachments = attachmentTools.find((t) => t.name === "paperclip_list_attachments")!;
const uploadAttachment = attachmentTools.find((t) => t.name === "paperclip_upload_attachment")!;
const downloadAttachment = attachmentTools.find((t) => t.name === "paperclip_download_attachment")!;
const deleteAttachment = attachmentTools.find((t) => t.name === "paperclip_delete_attachment")!;

describe("paperclip_list_attachments", () => {
  it("calls GET /api/issues/{issueId}/attachments and returns attachment list", async () => {
    const attachments = [{ id: "att-1", filename: "report.pdf", mimeType: "application/pdf" }];
    const { fn, calls } = mockFetch(200, attachments);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAttachments.handler({ issueId: "issue-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/attachments");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(attachments) }] });
  });

  it("throws McpError when issueId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listAttachments.handler({ issueId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Issue not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAttachments.handler({ issueId: "missing-issue" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_upload_attachment", () => {
  it("calls POST /api/companies/{id}/issues/{issueId}/attachments with form data", async () => {
    const tmpFile = join(tmpdir(), "paperclip-test-upload.txt");
    writeFileSync(tmpFile, "hello test content");
    try {
      const created = { id: "att-new", filename: "paperclip-test-upload.txt" };
      const { fn, calls } = mockFetch(200, created);
      const client = new PaperclipClient(TEST_AUTH, fn);
      const result = await uploadAttachment.handler(
        { issueId: "issue-1", filePath: tmpFile },
        client
      );
      assert.equal(
        calls[0]!.url,
        "http://localhost:3100/api/companies/company-1/issues/issue-1/attachments"
      );
      assert.equal(calls[0]!.init.method, "POST");
      assert.ok(calls[0]!.init.body instanceof FormData, "body should be FormData");
      assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(created) }] });
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("throws McpError when filePath is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => uploadAttachment.handler({ issueId: "issue-1", filePath: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 413 API error (file too large)", async () => {
    const tmpFile = join(tmpdir(), "paperclip-test-upload-large.txt");
    writeFileSync(tmpFile, "data");
    try {
      const { fn } = mockFetch(413, { message: "Payload Too Large" });
      const client = new PaperclipClient(TEST_AUTH, fn);
      const result = await uploadAttachment.handler(
        { issueId: "issue-1", filePath: tmpFile },
        client
      );
      assert.equal(result.isError, true);
      assert.ok(result.content[0]!.text.includes("413"));
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe("paperclip_download_attachment", () => {
  it("calls GET /api/attachments/{attachmentId}/content and returns content", async () => {
    const content = { data: "base64encodedcontent==" };
    const { fn, calls } = mockFetch(200, content);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await downloadAttachment.handler({ attachmentId: "att-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/attachments/att-1/content");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(content) }] });
  });

  it("throws McpError when attachmentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => downloadAttachment.handler({ attachmentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Attachment not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await downloadAttachment.handler({ attachmentId: "missing-att" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_delete_attachment", () => {
  it("calls DELETE /api/attachments/{attachmentId} and returns 204 No Content", async () => {
    const { fn, calls } = mockFetch(204, null);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await deleteAttachment.handler({ attachmentId: "att-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/attachments/att-1");
    assert.equal(calls[0]!.init.method, "DELETE");
    assert.equal(result.isError, undefined);
  });

  it("throws McpError when attachmentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => deleteAttachment.handler({ attachmentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Attachment not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await deleteAttachment.handler({ attachmentId: "missing-att" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});
