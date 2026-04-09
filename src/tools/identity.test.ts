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

  it("returns isError response with status code on 401 API error", async () => {
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

  it("returns isError response with status code on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getInbox.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });
});
