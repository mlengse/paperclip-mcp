import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { identityTools } from "./identity.js";

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

function mockFetchSequential(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let callIndex = 0;
  const fn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const resp = responses[callIndex] ?? responses[responses.length - 1]!;
    callIndex++;
    return new Response(resp.body !== undefined ? JSON.stringify(resp.body) : null, {
      status: resp.status,
      statusText: resp.status >= 200 && resp.status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

const getMe = identityTools.find((t) => t.name === "paperclip_get_me")!;
const getInbox = identityTools.find((t) => t.name === "paperclip_get_inbox")!;

describe("paperclip_get_me", () => {
  it("returns agent data and calls GET /api/agents/me", async () => {
    const { fn, calls } = mockFetch(200, { id: "agent-1", name: "Engineer" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getMe.handler({}, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/me");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, {
      content: [{ type: "text", text: JSON.stringify({ id: "agent-1", name: "Engineer" }) }],
    });
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getMe.handler(null, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("falls back to /api/agents/{agentId} when /api/agents/me returns 401", async () => {
    const agentData = { id: "agent-1", name: "Engineer" };
    const { fn, calls } = mockFetchSequential([
      { status: 401, body: { error: "Agent authentication required" } },
      { status: 200, body: agentData },
    ]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getMe.handler({}, client);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/me");
    assert.equal(calls[1]!.url, "http://localhost:3100/api/agents/agent-1");
    assert.deepEqual(result, {
      content: [{ type: "text", text: JSON.stringify(agentData) }],
    });
  });

  it("returns isError when both /api/agents/me and fallback return 401", async () => {
    const { fn } = mockFetch(401, { message: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getMe.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });
});

describe("paperclip_get_inbox", () => {
  it("returns inbox data and calls GET /api/agents/me/inbox-lite", async () => {
    const inbox = [{ id: "issue-1", title: "Fix bug", status: "todo" }];
    const { fn, calls } = mockFetch(200, inbox);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getInbox.handler({}, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/me/inbox-lite");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, {
      content: [{ type: "text", text: JSON.stringify(inbox) }],
    });
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getInbox.handler("invalid", client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("falls back to company issues endpoint when /api/agents/me/inbox-lite returns 401", async () => {
    const issues = [{ id: "issue-1", title: "Fix bug", status: "todo" }];
    const { fn, calls } = mockFetchSequential([
      { status: 401, body: { error: "Agent authentication required" } },
      { status: 200, body: issues },
    ]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getInbox.handler({}, client);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/me/inbox-lite");
    assert.equal(
      calls[1]!.url,
      "http://localhost:3100/api/companies/company-1/issues?assigneeAgentId=agent-1"
    );
    assert.deepEqual(result, {
      content: [{ type: "text", text: JSON.stringify(issues) }],
    });
  });

  it("returns isError when both inbox-lite and fallback return 401", async () => {
    const { fn } = mockFetchSequential([
      { status: 401, body: { error: "Agent authentication required" } },
      { status: 401, body: { error: "Agent authentication required" } },
    ]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getInbox.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("returns isError response with status code on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getInbox.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });
});
