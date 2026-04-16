/**
 * Stage 8e — paperclip_list_secrets, paperclip_create_secret,
 * paperclip_update_secret, paperclip_rotate_secret
 *
 * Test matrix per tool:
 *   A1 — happy path: correct HTTP method + URL
 *   A2 — returns structured content on success
 *   A3 — isError on 4xx/5xx API error
 *   A4 — validation: required field missing → McpError
 *   A5 — .strict(): unknown field rejected → McpError
 *   B1 — 401 produces actionable error text
 *   B2 — 404 produces actionable error text
 *   C1 — applyCharLimit: large payload is truncated
 *   C2 — small payload is not truncated
 *   C3 — response_format='json' returns parseable JSON
 * Extra:
 *   D1/E1/E2/E3 — pagination envelope (list_secrets)
 *   F1/F2 — markdown / json format toggle (list_secrets)
 *   A5-special — update_secret: value field rejected by strict schema
 *   ROTATE-B1 — rotate: missing value → McpError
 *   ROTATE-B2 — rotate: correct URL/method/body
 *   ROTATE-B3 — rotate: response has incremented latestVersion
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { secretTools } from "./secrets.js";
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
    return new Response(body !== undefined ? JSON.stringify(body) : null, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

function secretFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "secret-1",
    companyId: "company-1",
    name: "MY_SECRET",
    provider: "local_encrypted",
    externalRef: null,
    latestVersion: 1,
    description: "A test secret",
    createdByAgentId: null,
    createdByUserId: "local-board",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function largeSecretList(count = 500) {
  return Array.from({ length: count }, (_, i) =>
    secretFixture({
      id: `secret-${i + 1}`,
      name: `SECRET_${i + 1}_${"x".repeat(300)}`,
    })
  );
}

const listSecrets = secretTools.find((t) => t.name === "paperclip_list_secrets")!;
const createSecret = secretTools.find((t) => t.name === "paperclip_create_secret")!;
const updateSecret = secretTools.find((t) => t.name === "paperclip_update_secret")!;
const rotateSecret = secretTools.find((t) => t.name === "paperclip_rotate_secret")!;

// ---------------------------------------------------------------------------
// paperclip_list_secrets
// ---------------------------------------------------------------------------
describe("paperclip_list_secrets", () => {
  it("A1: calls GET /api/companies/{companyId}/secrets", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listSecrets.handler({ companyId: "co-1" }, client);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith("/api/companies/co-1/secrets"), `URL was: ${calls[0]!.url}`);
    assert.equal(calls[0]!.init.method, "GET");
  });

  it("A2: returns content on success", async () => {
    const secrets = [secretFixture()];
    const { fn } = mockFetch(200, secrets);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", response_format: "json" },
      client
    );
    assert.equal(result.isError, undefined);
    assert.ok(result.content[0]!.text.length > 0);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, secrets);
  });

  it("A3: returns isError on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Server error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler({ companyId: "co-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("A4: McpError when companyId is missing", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listSecrets.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: .strict() rejects unknown fields", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listSecrets.handler({ companyId: "co-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: 401 produces actionable error text", async () => {
    const { fn } = mockFetch(401, { message: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler({ companyId: "co-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
    assert.ok(result.content[0]!.text.toLowerCase().includes("api_key"));
  });

  it("C1: large payload is truncated", async () => {
    const { fn } = mockFetch(200, largeSecretList(500));
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", limit: 100, response_format: "json" },
      client
    );
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C2: small payload is not truncated", async () => {
    const { fn } = mockFetch(200, [secretFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", response_format: "json" },
      client
    );
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C3: response_format='json' returns parseable JSON envelope", async () => {
    const secrets = [secretFixture()];
    const { fn } = mockFetch(200, secrets);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(parsed.items));
    assert.deepEqual(parsed.items, secrets);
  });

  it("D1: invalid limit (0) rejected by Zod → McpError (no fetch call)", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listSecrets.handler({ companyId: "co-1", limit: 0 }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("E1: default limit=50, offset=0 in envelope", async () => {
    const secrets = Array.from({ length: 3 }, (_, i) => secretFixture({ id: `s-${i}` }));
    const { fn } = mockFetch(200, secrets);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", response_format: "json" },
      client
    );
    assertPaginationEnvelope(result, { total: 3, limit: 50, offset: 0, count: 3 });
  });

  it("E2: explicit limit=1, offset=1 yields has_more and next_offset", async () => {
    const secrets = Array.from({ length: 3 }, (_, i) => secretFixture({ id: `s-${i}` }));
    const { fn } = mockFetch(200, secrets);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", response_format: "json", limit: 1, offset: 1 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 3);
    assert.equal(data.count, 1);
    assert.equal(data.has_more, true);
    assert.equal(data.next_offset, 2);
  });

  it("E3: offset past end returns empty items", async () => {
    const { fn } = mockFetch(200, [secretFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [secretFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler({ companyId: "co-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format='markdown' produces human-readable output", async () => {
    const { fn } = mockFetch(200, [secretFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listSecrets.handler(
      { companyId: "co-1", response_format: "markdown" },
      client
    );
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /##|^- /m);
  });
});

// ---------------------------------------------------------------------------
// paperclip_create_secret
// ---------------------------------------------------------------------------
describe("paperclip_create_secret", () => {
  it("A1: calls POST /api/companies/{companyId}/secrets with name+value", async () => {
    const { fn, calls } = mockFetch(200, secretFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createSecret.handler({ companyId: "co-1", name: "MY_KEY", value: "my-value" }, client);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith("/api/companies/co-1/secrets"), `URL was: ${calls[0]!.url}`);
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "MY_KEY");
    assert.equal(body.value, "my-value");
  });

  it("A1: includes optional provider, description, externalRef in body", async () => {
    const { fn, calls } = mockFetch(200, secretFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createSecret.handler(
      {
        companyId: "co-1",
        name: "MY_KEY",
        value: "val",
        provider: "aws_secrets_manager",
        description: "desc",
        externalRef: "arn:aws:secretsmanager:us-east-1:123:secret:MY_KEY",
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.provider, "aws_secrets_manager");
    assert.equal(body.description, "desc");
    assert.equal(body.externalRef, "arn:aws:secretsmanager:us-east-1:123:secret:MY_KEY");
  });

  it("A2: returns content on success (value NOT in response)", async () => {
    const { fn } = mockFetch(200, secretFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createSecret.handler(
      { companyId: "co-1", name: "MY_KEY", value: "secret" },
      client
    );
    assert.equal(result.isError, undefined);
    assert.ok(result.content[0]!.text.length > 0);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.value, undefined, "value must not appear in response");
  });

  it("A3: returns isError on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Server error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createSecret.handler(
      { companyId: "co-1", name: "MY_KEY", value: "v" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("A4: McpError when name is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createSecret.handler({ companyId: "co-1", value: "v" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: McpError when value is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createSecret.handler({ companyId: "co-1", name: "MY_KEY" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: McpError when name is empty string", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createSecret.handler({ companyId: "co-1", name: "", value: "v" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: McpError when value is empty string", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createSecret.handler({ companyId: "co-1", name: "MY_KEY", value: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: .strict() rejects unknown fields", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        createSecret.handler(
          { companyId: "co-1", name: "MY_KEY", value: "v", unknownField: "oops" },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: 401 produces actionable error text", async () => {
    const { fn } = mockFetch(401, { message: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createSecret.handler(
      { companyId: "co-1", name: "MY_KEY", value: "v" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("C3: response is parseable JSON", async () => {
    const { fn } = mockFetch(200, secretFixture({ name: "MY_KEY" }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createSecret.handler(
      { companyId: "co-1", name: "MY_KEY", value: "v" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.name, "MY_KEY");
  });

  it("D1: invalid provider enum rejected by Zod → McpError", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        createSecret.handler(
          { companyId: "co-1", name: "MY_KEY", value: "v", provider: "invalid_provider" },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// paperclip_update_secret
// ---------------------------------------------------------------------------
describe("paperclip_update_secret", () => {
  it("A1: calls PATCH /api/secrets/{secretId} with metadata fields", async () => {
    const { fn, calls } = mockFetch(200, secretFixture({ description: "new desc" }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateSecret.handler({ secretId: "s-1", description: "new desc" }, client);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith("/api/secrets/s-1"), `URL was: ${calls[0]!.url}`);
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.description, "new desc");
  });

  it("A1: name, description, externalRef are all sent when provided", async () => {
    const { fn, calls } = mockFetch(200, secretFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateSecret.handler(
      { secretId: "s-1", name: "RENAMED", description: "desc", externalRef: "ref-1" },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "RENAMED");
    assert.equal(body.description, "desc");
    assert.equal(body.externalRef, "ref-1");
  });

  it("A2: returns content on success", async () => {
    const { fn } = mockFetch(200, secretFixture({ name: "RENAMED" }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateSecret.handler({ secretId: "s-1", name: "RENAMED" }, client);
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.name, "RENAMED");
  });

  it("A3: returns isError on 404 API error", async () => {
    const { fn } = mockFetch(404, { error: "Secret not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateSecret.handler({ secretId: "nonexistent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("A4: McpError when secretId is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateSecret.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("[stage-8e] A5-special: value field is rejected by strict schema (caller must use rotate)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateSecret.handler({ secretId: "s-1", value: "attempted-rotate" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: .strict() rejects other unknown fields", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateSecret.handler({ secretId: "s-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: 401 produces actionable error text", async () => {
    const { fn } = mockFetch(401, { message: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateSecret.handler({ secretId: "s-1", name: "X" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("B2: 404 produces actionable error text mentioning paperclip_list_secrets", async () => {
    const { fn } = mockFetch(404, { error: "Secret not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateSecret.handler({ secretId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("paperclip_list_secrets"));
  });

  it("C2: small payload is not truncated", async () => {
    const { fn } = mockFetch(200, secretFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateSecret.handler({ secretId: "s-1", name: "X" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C3: response is parseable JSON", async () => {
    const { fn } = mockFetch(200, secretFixture({ name: "UPDATED" }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateSecret.handler({ secretId: "s-1", name: "UPDATED" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.name, "UPDATED");
  });
});

// ---------------------------------------------------------------------------
// paperclip_rotate_secret
// ---------------------------------------------------------------------------
describe("paperclip_rotate_secret", () => {
  it("ROTATE-B1: McpError when value is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => rotateSecret.handler({ secretId: "s-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("ROTATE-B1: McpError when value is empty string", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => rotateSecret.handler({ secretId: "s-1", value: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("ROTATE-B2: correct URL, method, body", async () => {
    const { fn, calls } = mockFetch(200, secretFixture({ latestVersion: 2 }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    await rotateSecret.handler({ secretId: "s-1", value: "v2-secret" }, client);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith("/api/secrets/s-1/rotate"), `URL was: ${calls[0]!.url}`);
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.value, "v2-secret");
    assert.equal(body.secretId, undefined, "secretId must not appear in request body");
  });

  it("ROTATE-B2: includes externalRef in body when provided", async () => {
    const { fn, calls } = mockFetch(200, secretFixture({ latestVersion: 2 }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    await rotateSecret.handler(
      { secretId: "s-1", value: "v2-secret", externalRef: "ref-v2" },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.externalRef, "ref-v2");
  });

  it("ROTATE-B3: response has incremented latestVersion", async () => {
    const rotatedSecret = secretFixture({ latestVersion: 2 });
    const { fn } = mockFetch(200, rotatedSecret);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rotateSecret.handler({ secretId: "s-1", value: "v2-secret" }, client);
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.latestVersion, 2);
  });

  it("A1: calls POST /api/secrets/{secretId}/rotate", async () => {
    const { fn, calls } = mockFetch(200, secretFixture({ latestVersion: 2 }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    await rotateSecret.handler({ secretId: "secret-abc", value: "new-val" }, client);
    assert.ok(
      calls[0]!.url.endsWith("/api/secrets/secret-abc/rotate"),
      `URL was: ${calls[0]!.url}`
    );
  });

  it("A3: returns isError on 404 API error", async () => {
    const { fn } = mockFetch(404, { error: "Secret not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rotateSecret.handler({ secretId: "missing", value: "v" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("A4: McpError when secretId is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => rotateSecret.handler({ value: "v" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: .strict() rejects unknown fields", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => rotateSecret.handler({ secretId: "s-1", value: "v", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: 401 produces actionable error text", async () => {
    const { fn } = mockFetch(401, { message: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rotateSecret.handler({ secretId: "s-1", value: "v" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("B2: 404 produces actionable error text mentioning paperclip_list_secrets", async () => {
    const { fn } = mockFetch(404, { error: "Secret not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rotateSecret.handler({ secretId: "missing", value: "v" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("paperclip_list_secrets"));
  });

  it("C2: small payload is not truncated", async () => {
    const { fn } = mockFetch(200, secretFixture({ latestVersion: 2 }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rotateSecret.handler({ secretId: "s-1", value: "v2" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C3: response is parseable JSON with latestVersion", async () => {
    const { fn } = mockFetch(200, secretFixture({ latestVersion: 3 }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rotateSecret.handler({ secretId: "s-1", value: "v3" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.latestVersion, 3);
  });
});
