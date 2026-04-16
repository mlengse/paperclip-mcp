import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { runTools } from "./runs.js";
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

const listHeartbeatRuns = runTools.find((t) => t.name === "paperclip_list_heartbeat_runs")!;
const listRunEvents = runTools.find((t) => t.name === "paperclip_list_run_events")!;
const getRunLog = runTools.find((t) => t.name === "paperclip_get_run_log")!;

// ---------------------------------------------------------------------------
// paperclip_list_heartbeat_runs
// ---------------------------------------------------------------------------

describe("paperclip_list_heartbeat_runs", () => {
  it("A1: calls GET /api/companies/{id}/heartbeat-runs and returns run list", async () => {
    const runs = [{ id: "run-1", agentId: "agent-1", status: "completed" }];
    const { fn, calls } = mockFetch(200, runs);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler(
      { companyId: "company-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/heartbeat-runs");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, runs);
  });

  it("A2: includes agentId query param when provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listHeartbeatRuns.handler(
      { companyId: "company-1", agentId: "agent-42", response_format: "json" },
      client
    );
    assert.ok(
      calls[0]!.url.includes("agentId=agent-42"),
      `Expected agentId query param in URL: ${calls[0]!.url}`
    );
  });

  it("A3: throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listHeartbeatRuns.handler(null, client),
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
      () => listHeartbeatRuns.handler({ companyId: "" }, client),
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
      () => listHeartbeatRuns.handler({ companyId: "company-1", unknownField: "oops" }, client),
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
    const result = await listHeartbeatRuns.handler({ companyId: "company-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("B2: returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler({ companyId: "company-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C1: description starts with '⚠ Board-only:'", () => {
    assert.ok(
      listHeartbeatRuns.description.startsWith("⚠ Board-only:"),
      "Expected board-only prefix"
    );
  });

  it("C2: readOnlyHint is true", () => {
    assert.equal(listHeartbeatRuns.annotations?.readOnlyHint, true);
  });

  it("C3: title is non-empty and ≤60 chars", () => {
    const title = listHeartbeatRuns.annotations?.title ?? "";
    assert.ok(title.length > 0, "Expected non-empty title");
    assert.ok(title.length <= 60, `Expected title ≤60 chars, got ${title.length}: "${title}"`);
  });

  it("D1: response >25k chars is truncated with actionable hint", async () => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `run-${i + 1}`,
      agentId: "agent-1",
      status: "completed",
      log: "x".repeat(300),
    }));
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler(
      { companyId: "company-1", limit: 100, response_format: "json" },
      client
    );
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [{ id: "run-1", agentId: "agent-1", status: "completed" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler(
      { companyId: "company-1", response_format: "json" },
      client
    );
    assertPaginationEnvelope(result, { total: 1, limit: 50, offset: 0, count: 1 });
  });

  it("E2: explicit limit=2, offset=1 slices correctly", async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `run-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler(
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
    const items = [{ id: "run-1" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler(
      { companyId: "company-1", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [{ id: "run-1" }]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler({ companyId: "company-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON with items array", async () => {
    const runs = [{ id: "run-1", agentId: "agent-1" }];
    const { fn } = mockFetch(200, runs);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listHeartbeatRuns.handler(
      { companyId: "company-1", response_format: "json" },
      client
    );
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text).items, runs);
  });
});

// ---------------------------------------------------------------------------
// paperclip_list_run_events
// ---------------------------------------------------------------------------

describe("paperclip_list_run_events", () => {
  it("A1: calls GET /api/heartbeat-runs/{id}/events and returns events array", async () => {
    const events = [{ seq: 1, type: "log", data: "hello" }];
    const { fn, calls } = mockFetch(200, events);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRunEvents.handler(
      { runId: "run-abc", response_format: "json" },
      client
    );
    assert.ok(
      calls[0]!.url.startsWith("http://localhost:3100/api/heartbeat-runs/run-abc/events"),
      `URL mismatch: ${calls[0]!.url}`
    );
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, events);
  });

  it("A2: includes afterSeq query param when provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listRunEvents.handler({ runId: "run-abc", afterSeq: 42 }, client);
    assert.ok(
      calls[0]!.url.includes("afterSeq=42"),
      `Expected afterSeq=42 in URL: ${calls[0]!.url}`
    );
  });

  it("A3: includes limit query param when provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listRunEvents.handler({ runId: "run-abc", limit: 25 }, client);
    assert.ok(calls[0]!.url.includes("limit=25"), `Expected limit=25 in URL: ${calls[0]!.url}`);
  });

  it("A4: throws McpError when runId is empty string (validation failure)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listRunEvents.handler({ runId: "" }, client),
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
      () => listRunEvents.handler({ runId: "run-abc", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Run not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRunEvents.handler({ runId: "missing-run" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("B2: returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRunEvents.handler({ runId: "run-abc" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("C1: description starts with '⚠ Board-only:'", () => {
    assert.ok(listRunEvents.description.startsWith("⚠ Board-only:"), "Expected board-only prefix");
  });

  it("C2: readOnlyHint is true", () => {
    assert.equal(listRunEvents.annotations?.readOnlyHint, true);
  });

  it("C3: title is non-empty and ≤60 chars", () => {
    const title = listRunEvents.annotations?.title ?? "";
    assert.ok(title.length > 0, "Expected non-empty title");
    assert.ok(title.length <= 60, `Expected title ≤60 chars, got ${title.length}: "${title}"`);
  });

  it("D1: response >25k chars is truncated with actionable hint", async () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({
      seq: i,
      type: "log",
      data: "x".repeat(100),
    }));
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRunEvents.handler(
      { runId: "run-abc", response_format: "json" },
      client
    );
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [{ seq: 1, type: "log", data: "hello" }]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRunEvents.handler({ runId: "run-abc" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON array (no envelope)", async () => {
    const events = [
      { seq: 1, type: "log" },
      { seq: 2, type: "heartbeat" },
    ];
    const { fn } = mockFetch(200, events);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRunEvents.handler(
      { runId: "run-abc", response_format: "json" },
      client
    );
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text), events);
  });
});

// ---------------------------------------------------------------------------
// paperclip_get_run_log
// ---------------------------------------------------------------------------

describe("paperclip_get_run_log", () => {
  it("A1: calls GET /api/heartbeat-runs/{id}/log and returns log object", async () => {
    const log = { content: "hello world", nextOffset: 11, totalBytes: 11 };
    const { fn, calls } = mockFetch(200, log);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRunLog.handler({ runId: "run-abc", response_format: "json" }, client);
    assert.ok(
      calls[0]!.url.startsWith("http://localhost:3100/api/heartbeat-runs/run-abc/log"),
      `URL mismatch: ${calls[0]!.url}`
    );
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, log);
  });

  it("A2: includes offset query param when provided", async () => {
    const { fn, calls } = mockFetch(200, { content: "", nextOffset: 0, totalBytes: 0 });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getRunLog.handler({ runId: "run-abc", offset: 512 }, client);
    assert.ok(calls[0]!.url.includes("offset=512"), `Expected offset=512 in URL: ${calls[0]!.url}`);
  });

  it("A3: includes limitBytes query param when provided", async () => {
    const { fn, calls } = mockFetch(200, { content: "", nextOffset: 0, totalBytes: 0 });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getRunLog.handler({ runId: "run-abc", limitBytes: 4096 }, client);
    assert.ok(
      calls[0]!.url.includes("limitBytes=4096"),
      `Expected limitBytes=4096 in URL: ${calls[0]!.url}`
    );
  });

  it("A4: applies default limitBytes=16384 when not provided", async () => {
    const { fn, calls } = mockFetch(200, { content: "", nextOffset: 0, totalBytes: 0 });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getRunLog.handler({ runId: "run-abc" }, client);
    assert.ok(
      calls[0]!.url.includes("limitBytes=16384"),
      `Expected default limitBytes=16384 in URL: ${calls[0]!.url}`
    );
  });

  it("A5: throws McpError when unknown extra field is provided (strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getRunLog.handler({ runId: "run-abc", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Run not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRunLog.handler({ runId: "missing-run" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("B2: returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRunLog.handler({ runId: "run-abc" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("C1: description starts with '⚠ Board-only:'", () => {
    assert.ok(getRunLog.description.startsWith("⚠ Board-only:"), "Expected board-only prefix");
  });

  it("C2: readOnlyHint is true", () => {
    assert.equal(getRunLog.annotations?.readOnlyHint, true);
  });

  it("C3: title is non-empty and ≤60 chars", () => {
    const title = getRunLog.annotations?.title ?? "";
    assert.ok(title.length > 0, "Expected non-empty title");
    assert.ok(title.length <= 60, `Expected title ≤60 chars, got ${title.length}: "${title}"`);
  });

  it("D1: response >25k chars is truncated with actionable hint", async () => {
    const big = { content: "x".repeat(30_000), nextOffset: 30_000, totalBytes: 30_000 };
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRunLog.handler({ runId: "run-abc", response_format: "json" }, client);
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const log = { content: "hello world", nextOffset: 11, totalBytes: 11 };
    const { fn } = mockFetch(200, log);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRunLog.handler({ runId: "run-abc" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON object", async () => {
    const log = { content: "hello world", nextOffset: 11, totalBytes: 11 };
    const { fn } = mockFetch(200, log);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRunLog.handler({ runId: "run-abc", response_format: "json" }, client);
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text), log);
  });
});
