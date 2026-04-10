import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PaperclipClient } from "./client.js";
import { PaperclipApiError } from "./errors.js";

const TEST_AUTH = {
  apiKey: "test-jwt",
  apiUrl: "http://localhost:3100",
  agentId: "agent-1",
  companyId: "company-1",
};

function mockFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): {
  fn: (url: string, init: RequestInit) => Promise<Response>;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const responseHeaders = new Headers({ "Content-Type": "application/json", ...headers });
    return new Response(body !== undefined ? JSON.stringify(body) : null, {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: responseHeaders,
    });
  };
  return { fn, calls };
}

describe("PaperclipClient.buildHeaders", () => {
  it("sets Authorization Bearer header", () => {
    const client = new PaperclipClient(TEST_AUTH);
    const headers = client.buildHeaders();
    assert.equal(headers["Authorization"], "Bearer test-jwt");
  });

  it("sets Content-Type application/json", () => {
    const client = new PaperclipClient(TEST_AUTH);
    const headers = client.buildHeaders();
    assert.equal(headers["Content-Type"], "application/json");
  });

  it("omits X-Paperclip-Run-Id when not provided", () => {
    const client = new PaperclipClient(TEST_AUTH);
    const headers = client.buildHeaders();
    assert.equal(headers["X-Paperclip-Run-Id"], undefined);
  });

  it("includes X-Paperclip-Run-Id from auth.runId", () => {
    const client = new PaperclipClient({ ...TEST_AUTH, runId: "run-abc" });
    const headers = client.buildHeaders();
    assert.equal(headers["X-Paperclip-Run-Id"], "run-abc");
  });

  it("uses explicit runId over auth.runId", () => {
    const client = new PaperclipClient({ ...TEST_AUTH, runId: "run-from-auth" });
    const headers = client.buildHeaders("run-explicit");
    assert.equal(headers["X-Paperclip-Run-Id"], "run-explicit");
  });
});

describe("PaperclipClient.get", () => {
  it("sends GET with correct URL and auth headers", async () => {
    const { fn, calls } = mockFetch(200, { ok: true });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await client.get("/api/agents/me");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/me");
    assert.equal(calls[0]!.init.method, "GET");
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer test-jwt");
  });

  it("returns parsed JSON body", async () => {
    const { fn } = mockFetch(200, { id: "agent-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await client.get<{ id: string }>("/api/agents/me");
    assert.equal(result.id, "agent-1");
  });

  it("throws PaperclipApiError on non-2xx", async () => {
    const { fn } = mockFetch(404, { message: "not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => client.get("/api/agents/missing"),
      (err: unknown) => {
        assert.ok(err instanceof PaperclipApiError);
        assert.equal(err.status, 404);
        return true;
      }
    );
  });
});

describe("PaperclipClient.post", () => {
  it("sends POST with JSON body and run ID header", async () => {
    const { fn, calls } = mockFetch(200, { status: "in_progress" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await client.post("/api/issues/1/checkout", { agentId: "agent-1" }, "run-xyz");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(calls[0]!.init.body, JSON.stringify({ agentId: "agent-1" }));
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["X-Paperclip-Run-Id"], "run-xyz");
  });
});

describe("PaperclipClient.patch", () => {
  it("sends PATCH with JSON body and run ID header", async () => {
    const { fn, calls } = mockFetch(200, { status: "done" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await client.patch("/api/issues/1", { status: "done" }, "run-xyz");
    assert.equal(calls[0]!.init.method, "PATCH");
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["X-Paperclip-Run-Id"], "run-xyz");
  });
});

describe("PaperclipClient.delete", () => {
  it("sends DELETE request", async () => {
    const { fn, calls } = mockFetch(204, undefined);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await client.delete("/api/attachments/1", "run-xyz");
    assert.equal(calls[0]!.init.method, "DELETE");
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["X-Paperclip-Run-Id"], "run-xyz");
  });

  it("returns undefined for 204 responses", async () => {
    const { fn } = mockFetch(204, undefined);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await client.delete("/api/attachments/1");
    assert.equal(result, undefined);
  });
});
