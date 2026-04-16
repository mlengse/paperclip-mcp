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
  it("returns agent data and calls GET /api/agents/{agentId}", async () => {
    const { fn, calls } = mockFetch(200, { id: "agent-1", name: "Engineer" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getMe.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, { id: "agent-1", name: "Engineer" });
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

  it("calls GET /api/agents/{agentId} directly (no /api/agents/me fallback)", async () => {
    const agentData = { id: "agent-1", name: "Engineer" };
    const { fn, calls } = mockFetch(200, agentData);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getMe.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, agentData);
  });

  it("returns isError when /api/agents/{agentId} returns 401", async () => {
    const { fn } = mockFetch(401, { message: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getMe.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });
});

describe("paperclip_get_inbox", () => {
  it("returns inbox data and calls GET /api/agents/me/inbox-lite", async () => {
    const inbox = [
      {
        id: "issue-1",
        identifier: "PAP-1",
        title: "Fix bug",
        status: "todo",
        priority: "high",
        projectId: "project-1",
        goalId: "goal-1",
        parentId: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
        activeRun: null,
      },
    ];
    const { fn, calls } = mockFetch(200, inbox);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getInbox.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/me/inbox-lite");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, inbox);
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

  it("calls GET /api/agents/me/inbox-lite (agent-scoped endpoint, no company fallback)", async () => {
    const issues = [
      {
        id: "issue-1",
        identifier: "PAP-1",
        title: "Fix bug",
        status: "in_progress",
        priority: "medium",
        projectId: "project-1",
        goalId: "goal-1",
        parentId: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
        activeRun: { id: "run-1" },
      },
    ];
    const { fn, calls } = mockFetch(200, issues);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getInbox.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/me/inbox-lite");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, issues);
  });

  it("returns isError when inbox-lite endpoint returns 401", async () => {
    const { fn } = mockFetch(401, { error: "Agent authentication required" });
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

// ---------------------------------------------------------------------------
// [stage-8a] paperclip_get_current_user
// ---------------------------------------------------------------------------
describe("[stage-8a] paperclip_get_current_user — schema (A1–A5)", () => {
  const getCurrentUser = identityTools.find((t) => t.name === "paperclip_get_current_user")!;

  it("A1: tool must exist in registry", () => {
    assert.ok(getCurrentUser, "paperclip_get_current_user must be in identityTools");
  });

  it("A5: rejects unknown extra field (.strict())", async () => {
    assert.ok(getCurrentUser, "tool must exist");
    const { fn, calls } = mockFetch(200, { userId: "user-1", user: null });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getCurrentUser.handler({ unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-8a] paperclip_get_current_user — happy path (B1–B2)", () => {
  const getCurrentUser = identityTools.find((t) => t.name === "paperclip_get_current_user")!;

  it("B1: calls GET /api/cli-auth/me with correct URL and method", async () => {
    const userData = { userId: "user-1", user: { id: "user-1", email: "alice@example.com" } };
    const { fn, calls } = mockFetch(200, userData);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCurrentUser.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/cli-auth/me");
    assert.equal(calls[0]!.init.method, "GET");
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.userId, "user-1");
  });

  it("B2: handles userId: null (no session user)", async () => {
    const userData = { userId: null, user: null };
    const { fn } = mockFetch(200, userData);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCurrentUser.handler({ response_format: "json" }, client);
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.userId, null);
    assert.equal(parsed.user, null);
  });
});

describe("[stage-8a] paperclip_get_current_user — error paths (C1–C3)", () => {
  const getCurrentUser = identityTools.find((t) => t.name === "paperclip_get_current_user")!;

  it("C1: returns isError on 404", async () => {
    const { fn } = mockFetch(404, { error: "Not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCurrentUser.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("C2: returns isError on 401", async () => {
    const { fn } = mockFetch(401, { error: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCurrentUser.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("C3: returns isError on 500", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCurrentUser.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("[stage-8a] paperclip_get_current_user — format (F1–F2)", () => {
  const getCurrentUser = identityTools.find((t) => t.name === "paperclip_get_current_user")!;

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, { userId: "user-1", user: { id: "user-1" } });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCurrentUser.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON", async () => {
    const userData = { userId: "user-1", user: { id: "user-1" } };
    const { fn } = mockFetch(200, userData);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCurrentUser.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.userId, "user-1");
  });
});

// ---------------------------------------------------------------------------
// [stage-8a] paperclip_revoke_current_session
// ---------------------------------------------------------------------------
describe("[stage-8a] paperclip_revoke_current_session — schema (A1–A5)", () => {
  const revokeSession = identityTools.find((t) => t.name === "paperclip_revoke_current_session")!;

  it("A1: tool must exist in registry", () => {
    assert.ok(revokeSession, "paperclip_revoke_current_session must be in identityTools");
  });

  it("A5: rejects unknown extra field (.strict())", async () => {
    assert.ok(revokeSession, "tool must exist");
    const { fn, calls } = mockFetch(200, { ok: true });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => revokeSession.handler({ unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-8a] paperclip_revoke_current_session — happy path (B1–B2)", () => {
  const revokeSession = identityTools.find((t) => t.name === "paperclip_revoke_current_session")!;

  it("B1: calls POST /api/cli-auth/revoke-current with correct URL and method", async () => {
    const { fn, calls } = mockFetch(200, { ok: true });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await revokeSession.handler({}, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/cli-auth/revoke-current");
    assert.equal(calls[0]!.init.method, "POST");
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.ok, true);
  });

  it("B2: returns { ok: true } on success", async () => {
    const { fn } = mockFetch(200, { ok: true });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await revokeSession.handler({}, client);
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.ok, true);
  });
});

describe("[stage-8a] paperclip_revoke_current_session — error paths (C1–C3)", () => {
  const revokeSession = identityTools.find((t) => t.name === "paperclip_revoke_current_session")!;

  it("C1: returns isError on 404", async () => {
    const { fn } = mockFetch(404, { error: "Not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await revokeSession.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("C2: returns isError on 401", async () => {
    const { fn } = mockFetch(401, { error: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await revokeSession.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("C3: returns isError on 500", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await revokeSession.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});
