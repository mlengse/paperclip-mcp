import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { labelTools } from "./labels.js";
import { labelFixture, largeLabelList } from "../test/helpers/fixtures.js";

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

const listLabels = labelTools.find((t) => t.name === "paperclip_list_labels")!;
const createLabel = labelTools.find((t) => t.name === "paperclip_create_label")!;

describe("paperclip_list_labels", () => {
  it("calls GET /api/companies/{id}/labels and returns labels", async () => {
    const labels = [
      { id: "label-1", name: "source:agent", color: "#6366f1" },
      { id: "label-2", name: "type:bug", color: "#ef4444" },
    ];
    const { fn, calls } = mockFetch(200, labels);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/labels");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, labels);
  });

  it("returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_create_label", () => {
  it("calls POST /api/companies/{id}/labels with name and color", async () => {
    const created = { id: "label-new", name: "type:feature", color: "#8b5cf6" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createLabel.handler({ name: "type:feature", color: "#8b5cf6" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/labels");
    assert.equal(calls[0]!.init.method, "POST");
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.name, "type:feature");
    assert.equal(sentBody.color, "#8b5cf6");
    const parsedCreate = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedCreate, created);
  });

  it("calls POST without color when color is omitted", async () => {
    const created = { id: "label-new", name: "source:agent" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createLabel.handler({ name: "source:agent" }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.name, "source:agent");
    assert.equal(sentBody.color, undefined);
  });

  it("throws McpError when name is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createLabel.handler({ name: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("throws McpError when name is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createLabel.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 400 API error", async () => {
    const { fn } = mockFetch(400, { message: "Label already exists" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createLabel.handler({ name: "duplicate-label" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });
});

// Stage 2 TDD: hex color format validation + A5 (.strict() rejects unknown fields)
describe("[stage-2] paperclip_create_label — hex color regex + A5: strict", () => {
  it("A4: rejects invalid hex color (no leading #)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createLabel.handler({ name: "bug", color: "FF0000" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: rejects invalid hex color (3-digit shorthand)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createLabel.handler({ name: "bug", color: "#F00" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: accepts valid 6-digit hex color", async () => {
    const created = { id: "label-1", name: "bug", color: "#ff0000" };
    const { fn } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createLabel.handler({ name: "bug", color: "#ff0000" }, client);
    assert.equal(result.isError, undefined);
  });

  it("A5: rejects unknown extra field (strict) for create_label", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createLabel.handler({ name: "bug", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2 — paperclip_list_labels
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_labels — truncation + format", () => {
  it("D1: response >25k chars is truncated with hint", async () => {
    const big = largeLabelList(500);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler({ limit: 100, response_format: "json" }, client);
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("D2: small response is not truncated", async () => {
    const small = [labelFixture()];
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [labelFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON array", async () => {
    const labels = [labelFixture()];
    const { fn } = mockFetch(200, labels);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, labels);
  });
});

// ---------------------------------------------------------------------------
// [stage-6] E1/E2/E3 pagination envelope — paperclip_list_labels
// ---------------------------------------------------------------------------
describe("[stage-6] paperclip_list_labels — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = Array.from({ length: 3 }, (_, i) => labelFixture({ id: `label-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler({ response_format: "json" }, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 3);
    assert.equal(data.count, 3);
    assert.equal(data.limit, 50);
    assert.equal(data.offset, 0);
    assert.equal(data.has_more, false);
    assert.ok(Array.isArray(data.items));
  });

  it("E2: explicit limit=2, offset=1 in envelope", async () => {
    const items = Array.from({ length: 4 }, (_, i) => labelFixture({ id: `l-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler(
      { response_format: "json", limit: 2, offset: 1 },
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
    const items = [labelFixture()];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listLabels.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});
