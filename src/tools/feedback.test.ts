import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { feedbackTools } from "./feedback.js";
import { assertPaginationEnvelope } from "../test/helpers/assert-result.js";

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
    const nullBodyStatus = status === 204 || status === 304;
    return new Response(nullBodyStatus ? null : body !== undefined ? JSON.stringify(body) : null, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

const listFeedbackTraces = feedbackTools.find((t) => t.name === "paperclip_list_feedback_traces")!;
const listIssueFeedbackTraces = feedbackTools.find(
  (t) => t.name === "paperclip_list_issue_feedback_traces"
)!;
const getFeedbackTraceBundle = feedbackTools.find(
  (t) => t.name === "paperclip_get_feedback_trace_bundle"
)!;

// ---------------------------------------------------------------------------
// paperclip_list_feedback_traces
// ---------------------------------------------------------------------------

describe("paperclip_list_feedback_traces", () => {
  it("A1: calls GET /api/companies/{id}/feedback-traces and returns trace list", async () => {
    const traces = [{ id: "trace-1", targetType: "issue", vote: "up" }];
    const { fn, calls } = mockFetch(200, traces);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler(
      { companyId: "company-1", response_format: "json" },
      client
    );
    assert.ok(
      calls[0]!.url.startsWith("http://localhost:3100/api/companies/company-1/feedback-traces"),
      `URL mismatch: ${calls[0]!.url}`
    );
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, traces);
  });

  it("A2: includes targetType query param when provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listFeedbackTraces.handler({ companyId: "company-1", targetType: "issue" }, client);
    assert.ok(
      calls[0]!.url.includes("targetType=issue"),
      `Expected targetType query param in URL: ${calls[0]!.url}`
    );
  });

  it("A3: throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listFeedbackTraces.handler(null, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: throws McpError when companyId is empty string (validation failure)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listFeedbackTraces.handler({ companyId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: throws McpError when unknown extra field is provided (strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listFeedbackTraces.handler({ companyId: "company-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler({ companyId: "company-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("B2: returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler({ companyId: "company-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C1: description starts with '⚠ Board-only:'", () => {
    assert.ok(
      listFeedbackTraces.description.startsWith("⚠ Board-only:"),
      "Expected board-only prefix"
    );
  });

  it("C2: readOnlyHint is true", () => {
    assert.equal(listFeedbackTraces.annotations?.readOnlyHint, true);
  });

  it("C3: title is non-empty and ≤60 chars", () => {
    const title = listFeedbackTraces.annotations?.title ?? "";
    assert.ok(title.length > 0, "Expected non-empty title");
    assert.ok(title.length <= 60, `Expected title ≤60 chars, got ${title.length}: "${title}"`);
  });

  it("D1: response >25k chars is truncated with actionable hint", async () => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `trace-${i + 1}`,
      targetType: "issue",
      vote: "up",
      payload: "x".repeat(300),
    }));
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler(
      { companyId: "company-1", limit: 100, response_format: "json" },
      client
    );
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [{ id: "trace-1", targetType: "issue", vote: "up" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler(
      { companyId: "company-1", response_format: "json" },
      client
    );
    assertPaginationEnvelope(result, { total: 1, limit: 50, offset: 0, count: 1 });
  });

  it("E2: explicit limit=2, offset=1 slices correctly", async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `trace-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler(
      { companyId: "company-1", response_format: "json", limit: 2, offset: 1 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 4);
    assert.equal(data.count, 2);
    assert.equal(data.has_more, true);
    assert.equal(data.next_offset, 3);
  });

  it("E3: offset past end returns empty items", async () => {
    const items = [{ id: "trace-1" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler(
      { companyId: "company-1", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [{ id: "trace-1" }]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler({ companyId: "company-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON with items array", async () => {
    const traces = [{ id: "trace-1", targetType: "issue" }];
    const { fn } = mockFetch(200, traces);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listFeedbackTraces.handler(
      { companyId: "company-1", response_format: "json" },
      client
    );
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text).items, traces);
  });

  it("Query params: optional filters are encoded as query params", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listFeedbackTraces.handler(
      {
        companyId: "company-1",
        vote: "up",
        status: "resolved",
        projectId: "proj-1",
        issueId: "issue-1",
        from: "2024-01-01T00:00:00Z",
        to: "2024-12-31T23:59:59Z",
        sharedOnly: true,
        includePayload: false,
      },
      client
    );
    const url = calls[0]!.url;
    assert.ok(url.includes("vote=up"), `Expected vote=up in URL: ${url}`);
    assert.ok(url.includes("status=resolved"), `Expected status=resolved in URL: ${url}`);
    assert.ok(url.includes("projectId=proj-1"), `Expected projectId=proj-1 in URL: ${url}`);
    assert.ok(url.includes("issueId=issue-1"), `Expected issueId=issue-1 in URL: ${url}`);
    assert.ok(url.includes("from="), `Expected from param in URL: ${url}`);
    assert.ok(url.includes("to="), `Expected to param in URL: ${url}`);
    assert.ok(url.includes("sharedOnly=true"), `Expected sharedOnly=true in URL: ${url}`);
    assert.ok(url.includes("includePayload=false"), `Expected includePayload=false in URL: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// paperclip_list_issue_feedback_traces
// ---------------------------------------------------------------------------

describe("paperclip_list_issue_feedback_traces", () => {
  it("A1: calls GET /api/issues/{id}/feedback-traces and returns trace list", async () => {
    const traces = [{ id: "trace-1", targetType: "issue", vote: "up" }];
    const { fn, calls } = mockFetch(200, traces);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler(
      { issueId: "issue-abc", response_format: "json" },
      client
    );
    assert.ok(
      calls[0]!.url.startsWith("http://localhost:3100/api/issues/issue-abc/feedback-traces"),
      `URL mismatch: ${calls[0]!.url}`
    );
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, traces);
  });

  it("A2: includes vote query param when provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listIssueFeedbackTraces.handler({ issueId: "issue-abc", vote: "down" }, client);
    assert.ok(calls[0]!.url.includes("vote=down"), `Expected vote=down in URL: ${calls[0]!.url}`);
  });

  it("A3: throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listIssueFeedbackTraces.handler(null, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: throws McpError when issueId is empty string (validation failure)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listIssueFeedbackTraces.handler({ issueId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: throws McpError when unknown extra field is provided (strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listIssueFeedbackTraces.handler({ issueId: "issue-abc", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler({ issueId: "issue-abc" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("B2: returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Not Found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler({ issueId: "missing-issue" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("C1: description starts with '⚠ Board-only:'", () => {
    assert.ok(
      listIssueFeedbackTraces.description.startsWith("⚠ Board-only:"),
      "Expected board-only prefix"
    );
  });

  it("C2: readOnlyHint is true", () => {
    assert.equal(listIssueFeedbackTraces.annotations?.readOnlyHint, true);
  });

  it("C3: title is non-empty and ≤60 chars", () => {
    const title = listIssueFeedbackTraces.annotations?.title ?? "";
    assert.ok(title.length > 0, "Expected non-empty title");
    assert.ok(title.length <= 60, `Expected title ≤60 chars, got ${title.length}: "${title}"`);
  });

  it("D1: response >25k chars is truncated with actionable hint", async () => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `trace-${i + 1}`,
      vote: "up",
      payload: "x".repeat(300),
    }));
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler(
      { issueId: "issue-abc", limit: 100, response_format: "json" },
      client
    );
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [{ id: "trace-1", vote: "up" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler(
      { issueId: "issue-abc", response_format: "json" },
      client
    );
    assertPaginationEnvelope(result, { total: 1, limit: 50, offset: 0, count: 1 });
  });

  it("E2: explicit limit=2, offset=1 slices correctly", async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `trace-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler(
      { issueId: "issue-abc", response_format: "json", limit: 2, offset: 1 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 4);
    assert.equal(data.count, 2);
    assert.equal(data.has_more, true);
    assert.equal(data.next_offset, 3);
  });

  it("E3: offset past end returns empty items", async () => {
    const items = [{ id: "trace-1" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler(
      { issueId: "issue-abc", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [{ id: "trace-1" }]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler({ issueId: "issue-abc" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON with items array", async () => {
    const traces = [{ id: "trace-1", vote: "up" }];
    const { fn } = mockFetch(200, traces);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssueFeedbackTraces.handler(
      { issueId: "issue-abc", response_format: "json" },
      client
    );
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text).items, traces);
  });

  it("Query params: optional filters are encoded as query params", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listIssueFeedbackTraces.handler(
      {
        issueId: "issue-abc",
        targetType: "comment",
        vote: "up",
        status: "pending",
        from: "2024-01-01T00:00:00Z",
        to: "2024-06-30T23:59:59Z",
        sharedOnly: false,
        includePayload: true,
      },
      client
    );
    const url = calls[0]!.url;
    assert.ok(url.includes("targetType=comment"), `Expected targetType in URL: ${url}`);
    assert.ok(url.includes("vote=up"), `Expected vote=up in URL: ${url}`);
    assert.ok(url.includes("status=pending"), `Expected status=pending in URL: ${url}`);
    assert.ok(url.includes("from="), `Expected from param in URL: ${url}`);
    assert.ok(url.includes("to="), `Expected to param in URL: ${url}`);
    assert.ok(url.includes("sharedOnly=false"), `Expected sharedOnly=false in URL: ${url}`);
    assert.ok(url.includes("includePayload=true"), `Expected includePayload=true in URL: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// paperclip_get_feedback_trace_bundle
// ---------------------------------------------------------------------------

describe("paperclip_get_feedback_trace_bundle", () => {
  it("A1: calls GET /api/feedback-traces/{id}/bundle and returns bundle", async () => {
    const bundle = { traceId: "trace-1", events: [], metadata: {} };
    const { fn, calls } = mockFetch(200, bundle);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getFeedbackTraceBundle.handler(
      { traceId: "trace-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/feedback-traces/trace-1/bundle");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, bundle);
  });

  it("A2: uses traceId correctly in URL path", async () => {
    const { fn, calls } = mockFetch(200, { traceId: "abc-xyz", events: [] });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getFeedbackTraceBundle.handler({ traceId: "abc-xyz" }, client);
    assert.ok(
      calls[0]!.url.includes("/feedback-traces/abc-xyz/bundle"),
      `Expected correct traceId in URL: ${calls[0]!.url}`
    );
  });

  it("A3: throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getFeedbackTraceBundle.handler(null, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: throws McpError when traceId is empty string (validation failure)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getFeedbackTraceBundle.handler({ traceId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: throws McpError when unknown extra field is provided (strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getFeedbackTraceBundle.handler({ traceId: "trace-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Trace not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getFeedbackTraceBundle.handler({ traceId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("B2: returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getFeedbackTraceBundle.handler({ traceId: "trace-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C1: description starts with '⚠ Board-only:'", () => {
    assert.ok(
      getFeedbackTraceBundle.description.startsWith("⚠ Board-only:"),
      "Expected board-only prefix"
    );
  });

  it("C2: readOnlyHint is true", () => {
    assert.equal(getFeedbackTraceBundle.annotations?.readOnlyHint, true);
  });

  it("C3: title is non-empty and ≤60 chars", () => {
    const title = getFeedbackTraceBundle.annotations?.title ?? "";
    assert.ok(title.length > 0, "Expected non-empty title");
    assert.ok(title.length <= 60, `Expected title ≤60 chars, got ${title.length}: "${title}"`);
  });

  it("F1: defaults to markdown output", async () => {
    const bundle = { traceId: "trace-1", events: [], metadata: {} };
    const { fn } = mockFetch(200, bundle);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getFeedbackTraceBundle.handler({ traceId: "trace-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON object", async () => {
    const bundle = { traceId: "trace-1", events: [{ type: "click" }], metadata: { source: "web" } };
    const { fn } = mockFetch(200, bundle);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getFeedbackTraceBundle.handler(
      { traceId: "trace-1", response_format: "json" },
      client
    );
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text), bundle);
  });
});
