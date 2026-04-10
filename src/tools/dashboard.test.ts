import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { dashboardTools } from "./dashboard.js";

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
    const result = await getDashboard.handler({}, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/dashboard");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(summary) }] });
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
