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
const deleteDocument = documentTools.find((t) => t.name === "paperclip_delete_document")!;
const getDocumentRevisions = documentTools.find(
  (t) => t.name === "paperclip_get_document_revisions"
)!;

describe("paperclip_list_documents", () => {
  it("calls GET /api/issues/{id}/documents and returns document list", async () => {
    const docs = [{ key: "plan", title: "Implementation Plan" }];
    const { fn, calls } = mockFetch(200, docs);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listDocuments.handler(
      { issueId: "issue-1", response_format: "json" },
      client
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/documents");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, docs);
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
    const result = await getDocument.handler(
      { issueId: "issue-1", key: "plan", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/documents/plan");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedDoc = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedDoc, doc);
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
    const parsedSaved = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedSaved, saved);
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

describe("paperclip_delete_document", () => {
  it("calls DELETE /api/issues/{id}/documents/{key} and returns result", async () => {
    const { fn, calls } = mockFetch(200, { deleted: true });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await deleteDocument.handler({ issueId: "issue-1", key: "plan" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/documents/plan");
    assert.equal(calls[0]!.init.method, "DELETE");
    const parsedDeleted = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedDeleted, { deleted: true });
  });

  it("throws McpError when key is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => deleteDocument.handler({ issueId: "issue-1", key: "" }, client),
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
    const result = await deleteDocument.handler({ issueId: "issue-1", key: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_get_document_revisions", () => {
  it("calls GET /api/issues/{id}/documents/{key}/revisions and returns revisions", async () => {
    const revisions = [
      { id: "rev-1", createdAt: "2026-01-01T00:00:00Z", agentId: "agent-1" },
      { id: "rev-2", createdAt: "2026-01-02T00:00:00Z", agentId: "agent-2" },
    ];
    const { fn, calls } = mockFetch(200, revisions);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDocumentRevisions.handler(
      { issueId: "issue-1", key: "plan", response_format: "json" },
      client
    );
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      "http://localhost:3100/api/issues/issue-1/documents/plan/revisions"
    );
    assert.equal(calls[0]!.init.method, "GET");
    const parsedRevisions = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRevisions, revisions);
  });

  it("throws McpError when issueId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getDocumentRevisions.handler({ issueId: "", key: "plan" }, client),
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
    const result = await getDocumentRevisions.handler(
      { issueId: "issue-1", key: "missing" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

// ---------------------------------------------------------------------------
// [stage-6] E1/E2/E3 pagination envelope — paperclip_list_documents
// ---------------------------------------------------------------------------
describe("[stage-6] paperclip_list_documents — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [
      { id: "doc-1", key: "plan", title: "Plan" },
      { id: "doc-2", key: "notes", title: "Notes" },
    ];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listDocuments.handler(
      { issueId: "PAP-1", response_format: "json" },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 2);
    assert.equal(data.count, 2);
    assert.equal(data.limit, 50);
    assert.equal(data.offset, 0);
    assert.equal(data.has_more, false);
    assert.ok(Array.isArray(data.items));
  });

  it("E3: offset past end returns empty items with correct total", async () => {
    const items = [{ id: "doc-1", key: "plan", title: "Plan" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listDocuments.handler(
      { issueId: "PAP-1", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 1);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});
