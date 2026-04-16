import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { dashboardTools } from "./dashboard.js";
import { CHARACTER_LIMIT } from "../constants.js";

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

const getDashboard = dashboardTools.find((t) => t.name === "paperclip_get_dashboard")!;

describe("paperclip_get_dashboard", () => {
  it("calls GET /api/companies/{id}/dashboard and returns health summary", async () => {
    const summary = { goals: 3, issuesByStatus: { todo: 5, in_progress: 2, done: 10 } };
    const { fn, calls } = mockFetch(200, summary);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDashboard.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/dashboard");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, summary);
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getDashboard.handler(42, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDashboard.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2/F3 — paperclip_get_dashboard
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_get_dashboard — truncation + format", () => {
  it("D1: response >25k chars is truncated with hint (json mode)", async () => {
    // Create a large dashboard payload
    const bigDashboard = {
      goals: Array.from({ length: 100 }, (_, i) => ({ id: `g-${i}`, title: "x".repeat(200) })),
      projects: Array.from({ length: 100 }, (_, i) => ({ id: `p-${i}`, name: "x".repeat(200) })),
      issuesByStatus: { todo: 999 },
      agentWorkload: [],
    };
    const { fn } = mockFetch(200, bigDashboard);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDashboard.handler({ response_format: "json" }, client);
    assert.equal(result.isError, undefined);
    assert.ok(result.content[0]!.text.length < CHARACTER_LIMIT + 200);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("D2: response ≤25k chars is not truncated (json mode)", async () => {
    const small = { goals: [], projects: [], issuesByStatus: { todo: 5 }, agentWorkload: [] };
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDashboard.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, {
      goals: [],
      projects: [],
      issuesByStatus: {},
      agentWorkload: [],
    });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDashboard.handler({}, client);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format: 'json' returns parseable JSON", async () => {
    const { fn } = mockFetch(200, { goals: [], issuesByStatus: { todo: 1 } });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getDashboard.handler({ response_format: "json" }, client);
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
  });
});
