import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { commentTools } from "./comments.js";

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

const listComments = commentTools.find((t) => t.name === "paperclip_list_comments")!;
const addComment = commentTools.find((t) => t.name === "paperclip_add_comment")!;
const getComment = commentTools.find((t) => t.name === "paperclip_get_comment")!;

describe("paperclip_list_comments", () => {
  it("calls GET /api/issues/{id}/comments with no query params when only issueId given", async () => {
    const comments = [{ id: "c-1", body: "Hello" }];
    const { fn, calls } = mockFetch(200, comments);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler({ issueId: "issue-1" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/comments");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(comments) }] });
  });

  it("appends order query param when provided without after", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listComments.handler({ issueId: "issue-1", order: "desc" }, client);
    const url = calls[0]!.url;
    assert.ok(url.includes("order=desc"), `URL missing order param: ${url}`);
    assert.ok(!url.includes("after="), `URL should not include after param: ${url}`);
  });

  it("uses client-side workaround when after is provided: fetches with order=asc&limit=500, not after param", async () => {
    const allComments = [
      { id: "c-1", body: "First" },
      { id: "c-2", body: "Second" },
      { id: "c-3", body: "Third" },
    ];
    const { fn, calls } = mockFetch(200, allComments);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler({ issueId: "issue-1", after: "c-1" }, client);
    const url = calls[0]!.url;
    assert.ok(url.includes("order=asc"), `URL missing order=asc: ${url}`);
    assert.ok(url.includes("limit=500"), `URL missing limit=500: ${url}`);
    assert.ok(!url.includes("after="), `URL should not include after param: ${url}`);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok(parsed._note, "Result should include _note field");
    assert.deepEqual(parsed.comments, [
      { id: "c-2", body: "Second" },
      { id: "c-3", body: "Third" },
    ]);
  });

  it("returns all comments when after ID is not found in response", async () => {
    const allComments = [
      { id: "c-1", body: "First" },
      { id: "c-2", body: "Second" },
    ];
    const { fn } = mockFetch(200, allComments);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler({ issueId: "issue-1", after: "c-999" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.comments, allComments);
  });

  it("returns empty comments array when after ID is the last comment", async () => {
    const allComments = [
      { id: "c-1", body: "First" },
      { id: "c-2", body: "Last" },
    ];
    const { fn } = mockFetch(200, allComments);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler({ issueId: "issue-1", after: "c-2" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.comments, []);
  });

  it("throws McpError when issueId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listComments.handler({}, client),
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
    const result = await listComments.handler({ issueId: "PAP-99" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_add_comment", () => {
  it("calls POST /api/issues/{id}/comments with body payload", async () => {
    const created = { id: "c-new", body: "Work done." };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addComment.handler({ issueId: "issue-1", body: "Work done." }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/comments");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(calls[0]!.init.body, JSON.stringify({ body: "Work done." }));
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(created) }] });
  });

  it("throws McpError when body is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => addComment.handler({ issueId: "issue-1", body: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addComment.handler({ issueId: "issue-1", body: "Hello" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });
});

describe("paperclip_get_comment", () => {
  it("calls GET /api/issues/{id}/comments/{commentId}", async () => {
    const comment = { id: "c-42", body: "Wake comment body", authorAgentId: "agent-1" };
    const { fn, calls } = mockFetch(200, comment);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getComment.handler({ issueId: "issue-1", commentId: "c-42" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/comments/c-42");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(comment) }] });
  });

  it("throws McpError when commentId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getComment.handler({ issueId: "issue-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Comment not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getComment.handler(
      { issueId: "issue-1", commentId: "no-such-id" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});
