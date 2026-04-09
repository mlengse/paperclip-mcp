import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { documentTools } from "./documents.js";

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
    return new Response(body !== undefined ? JSON.stringify(body) : null, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

const listDocuments = documentTools.find((t) => t.name === "paperclip_list_documents")!;
const getDocument = documentTools.find((t) => t.name === "paperclip_get_document")!;
const upsertDocument = documentTools.find((t) => t.name === "paperclip_upsert_document")!;

describe("paperclip_list_documents", () => {
  it("calls GET /api/issues/{id}/documents and returns document list", async () => {
    const docs = [{ key: "plan", title: "Implementation Plan" }];
    const { fn, calls } = mockFetch(200, docs);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listDocuments.handler({ issueId: "issue-1" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/documents");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(docs) }] });
  });

  it("throws McpError when issueId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listDocuments.handler({ issueId: "" }, client),
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
    const result = await listDocuments.handler({ issueId: "PAP-99" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_get_document", () => {
  it("calls GET /api/issues/{id}/documents/{key} and returns document", async () => {
    const doc = { key: "plan", title: "Plan", body: "## Step 1" };
    const { fn, calls } = mockFetch(200, doc);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDocument.handler({ issueId: "issue-1", key: "plan" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/documents/plan");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(doc) }] });
  });

  it("throws McpError when key is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getDocument.handler({ issueId: "issue-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Document not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDocument.handler({ issueId: "issue-1", key: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_upsert_document", () => {
  it("calls PUT /api/issues/{id}/documents/{key} with title, body, and format", async () => {
    const saved = { key: "plan", title: "Plan", revisionId: "rev-1" };
    const { fn, calls } = mockFetch(200, saved);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await upsertDocument.handler(
      { issueId: "issue-1", key: "plan", title: "Plan", body: "## Step 1" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/documents/plan");
    assert.equal(calls[0]!.init.method, "PUT");
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.title, "Plan");
    assert.equal(sentBody.body, "## Step 1");
    assert.equal(sentBody.format, "markdown");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(saved) }] });
  });

  it("includes baseRevisionId in payload when provided", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await upsertDocument.handler(
      { issueId: "issue-1", key: "plan", title: "Plan", body: "Updated", baseRevisionId: "rev-1" },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.baseRevisionId, "rev-1");
  });

  it("throws McpError when title is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => upsertDocument.handler({ issueId: "issue-1", key: "plan", body: "content" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 409 conflict (stale revision)", async () => {
    const { fn } = mockFetch(409, { message: "Revision conflict" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await upsertDocument.handler(
      { issueId: "issue-1", key: "plan", title: "Plan", body: "content", baseRevisionId: "old" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("409"));
  });
});
