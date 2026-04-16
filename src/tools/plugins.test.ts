/**
 * Stage 8d — paperclip_list_plugins, paperclip_get_plugin, paperclip_install_plugin,
 * paperclip_list_plugin_examples, paperclip_enable_plugin, paperclip_disable_plugin
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
 *   D1/E1/E2/E3 — pagination envelope (list_plugins)
 *   F1/F2 — markdown / json format toggle (list_plugins, get_plugin)
 *   ENC — encodeURIComponent applied for pluginKey containing @ and /
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { pluginTools } from "./plugins.js";
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

function pluginFixture(overrides: Record<string, unknown> = {}) {
  return {
    pluginKey: "paperclip.hello-world-example",
    packageName: "@paperclipai/plugin-hello-world-example",
    displayName: "Hello World Widget",
    description: "Reference plugin",
    status: "ready",
    version: "1.0.0",
    ...overrides,
  };
}

function largePluginList(count = 500) {
  return Array.from({ length: count }, (_, i) =>
    pluginFixture({
      pluginKey: `paperclip.plugin-${i + 1}`,
      displayName: `Plugin ${i + 1} — ${"x".repeat(300)}`,
    })
  );
}

const listPlugins = pluginTools.find((t) => t.name === "paperclip_list_plugins")!;
const getPlugin = pluginTools.find((t) => t.name === "paperclip_get_plugin")!;
const installPlugin = pluginTools.find((t) => t.name === "paperclip_install_plugin")!;
const listExamples = pluginTools.find((t) => t.name === "paperclip_list_plugin_examples")!;
const enablePlugin = pluginTools.find((t) => t.name === "paperclip_enable_plugin")!;
const disablePlugin = pluginTools.find((t) => t.name === "paperclip_disable_plugin")!;

// ---------------------------------------------------------------------------
// paperclip_list_plugins
// ---------------------------------------------------------------------------
describe("paperclip_list_plugins", () => {
  it("A1: calls GET /api/plugins without status filter", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listPlugins.handler({}, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/plugins");
    assert.equal(calls[0]!.init.method, "GET");
  });

  it("A1: calls GET /api/plugins?status=... when status is provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listPlugins.handler({ status: "installed" }, client);
    assert.ok(calls[0]!.url.includes("status=installed"), `URL was: ${calls[0]!.url}`);
  });

  it("A2: returns content on success", async () => {
    const plugins = [pluginFixture()];
    const { fn } = mockFetch(200, plugins);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({ response_format: "json" }, client);
    assert.equal(result.isError, undefined);
    assert.ok(result.content[0]!.text.length > 0);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, plugins);
  });

  it("A3: returns isError on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Server error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("A5: .strict() rejects unknown fields", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listPlugins.handler({ unknownField: "oops" }, client),
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
    const result = await listPlugins.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
    assert.ok(result.content[0]!.text.toLowerCase().includes("api_key"));
  });

  it("C1: large payload is truncated", async () => {
    const { fn } = mockFetch(200, largePluginList(500));
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({ limit: 100, response_format: "json" }, client);
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C2: small payload is not truncated", async () => {
    const { fn } = mockFetch(200, [pluginFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C3: response_format='json' returns parseable JSON envelope", async () => {
    const plugins = [pluginFixture()];
    const { fn } = mockFetch(200, plugins);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(parsed.items));
    assert.deepEqual(parsed.items, plugins);
  });

  it("D1: invalid status enum rejected by Zod → McpError (no fetch call)", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listPlugins.handler({ status: "active" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("E1: default limit=50, offset=0 in envelope", async () => {
    const plugins = Array.from({ length: 3 }, (_, i) =>
      pluginFixture({ pluginKey: `plugin-${i}` })
    );
    const { fn } = mockFetch(200, plugins);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({ response_format: "json" }, client);
    assertPaginationEnvelope(result, { total: 3, limit: 50, offset: 0, count: 3 });
  });

  it("E2: explicit limit=1, offset=1 yields has_more and next_offset", async () => {
    const plugins = Array.from({ length: 3 }, (_, i) =>
      pluginFixture({ pluginKey: `plugin-${i}` })
    );
    const { fn } = mockFetch(200, plugins);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler(
      { response_format: "json", limit: 1, offset: 1 },
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
    const { fn } = mockFetch(200, [pluginFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [pluginFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format='markdown' produces human-readable output", async () => {
    const { fn } = mockFetch(200, [pluginFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listPlugins.handler({ response_format: "markdown" }, client);
    assert.ok(!result.isError);
    // Markdown should contain either section header or bullet list
    assert.match(result.content[0]!.text, /##|^- /m);
  });
});

// ---------------------------------------------------------------------------
// paperclip_get_plugin
// ---------------------------------------------------------------------------
describe("paperclip_get_plugin", () => {
  it("A1: calls GET /api/plugins/{pluginKey}", async () => {
    const { fn, calls } = mockFetch(200, pluginFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getPlugin.handler(
      { pluginKey: "paperclip.hello-world-example", response_format: "json" },
      client
    );
    assert.equal(calls.length, 1);
    assert.ok(
      calls[0]!.url.endsWith("/api/plugins/paperclip.hello-world-example"),
      `URL was: ${calls[0]!.url}`
    );
    assert.equal(calls[0]!.init.method, "GET");
  });

  it("A2: returns content on success", async () => {
    const plugin = pluginFixture();
    const { fn } = mockFetch(200, plugin);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler(
      { pluginKey: "paperclip.hello-world-example", response_format: "json" },
      client
    );
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.pluginKey, plugin.pluginKey);
  });

  it("A3: returns isError on 404 API error", async () => {
    const { fn } = mockFetch(404, { error: "Plugin not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler({ pluginKey: "nonexistent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("A4: McpError when pluginKey is empty string", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getPlugin.handler({ pluginKey: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: McpError when pluginKey is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getPlugin.handler({}, client),
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
      () => getPlugin.handler({ pluginKey: "foo", extraField: "bar" }, client),
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
    const result = await getPlugin.handler({ pluginKey: "some-plugin" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("B2: 404 produces actionable error text mentioning paperclip_list_plugins", async () => {
    const { fn } = mockFetch(404, { error: "Plugin not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler({ pluginKey: "missing-plugin" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
    assert.ok(result.content[0]!.text.includes("paperclip_list_plugins"));
  });

  it("C1: large payload is truncated", async () => {
    const bigPlugin = { ...pluginFixture(), config: "x".repeat(30_000) };
    const { fn } = mockFetch(200, bigPlugin);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler({ pluginKey: "big-plugin" }, client);
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C2: small payload is not truncated", async () => {
    const { fn } = mockFetch(200, pluginFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler({ pluginKey: "small-plugin" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("C3: response_format='json' returns parseable JSON", async () => {
    const plugin = pluginFixture();
    const { fn } = mockFetch(200, plugin);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler(
      { pluginKey: "paperclip.hello-world-example", response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.pluginKey, plugin.pluginKey);
  });

  it("ENC: encodeURIComponent applied — @acme/plugin-linear → %40acme%2Fplugin-linear in URL", async () => {
    const { fn, calls } = mockFetch(200, pluginFixture({ pluginKey: "@acme/plugin-linear" }));
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getPlugin.handler({ pluginKey: "@acme/plugin-linear" }, client);
    assert.ok(
      calls[0]!.url.includes("%40acme%2Fplugin-linear"),
      `Expected encoded pluginKey in URL, got: ${calls[0]!.url}`
    );
  });

  it("F1: defaults to json output when response_format not specified", async () => {
    const { fn } = mockFetch(200, pluginFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler({ pluginKey: "some-plugin" }, client);
    assert.ok(!result.isError);
    // Should be parseable JSON
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok(typeof parsed === "object" && parsed !== null);
  });

  it("F2: response_format='json' returns parseable JSON object", async () => {
    const plugin = pluginFixture();
    const { fn } = mockFetch(200, plugin);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getPlugin.handler(
      { pluginKey: "paperclip.hello-world-example", response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "ready");
  });
});

// ---------------------------------------------------------------------------
// paperclip_install_plugin
// ---------------------------------------------------------------------------
describe("paperclip_install_plugin", () => {
  it("A1: calls POST /api/plugins/install with packageName", async () => {
    const { fn, calls } = mockFetch(200, { status: "installed", pluginKey: "test-plugin" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await installPlugin.handler({ packageName: "@paperclipai/plugin-hello-world-example" }, client);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith("/api/plugins/install"), `URL was: ${calls[0]!.url}`);
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.packageName, "@paperclipai/plugin-hello-world-example");
  });

  it("A1: includes version in body when provided", async () => {
    const { fn, calls } = mockFetch(200, { status: "installed" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await installPlugin.handler({ packageName: "my-plugin", version: "1.2.3" }, client);
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.version, "1.2.3");
  });

  it("A1: includes isLocalPath in body when provided", async () => {
    const { fn, calls } = mockFetch(200, { status: "installed" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await installPlugin.handler(
      { packageName: "/local/path/to/plugin", isLocalPath: true },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.isLocalPath, true);
  });

  it("A2: returns content on success", async () => {
    const { fn } = mockFetch(200, { status: "installed", pluginKey: "test-plugin" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await installPlugin.handler({ packageName: "test-pkg" }, client);
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "installed");
  });

  it("A3: returns isError on 400 API error (npm install failure)", async () => {
    const { fn } = mockFetch(400, { error: "npm install failed" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await installPlugin.handler({ packageName: "nonexistent-pkg" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });

  it("A4: McpError when packageName is empty string", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => installPlugin.handler({ packageName: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: McpError when packageName is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => installPlugin.handler({}, client),
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
      () => installPlugin.handler({ packageName: "foo", unknownField: "bar" }, client),
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
    const result = await installPlugin.handler({ packageName: "some-pkg" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("C3: response is parseable JSON", async () => {
    const { fn } = mockFetch(200, { status: "installed", pluginKey: "my-plugin" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await installPlugin.handler({ packageName: "my-plugin" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "installed");
  });
});

// ---------------------------------------------------------------------------
// paperclip_list_plugin_examples
// ---------------------------------------------------------------------------
describe("paperclip_list_plugin_examples", () => {
  it("A1: calls GET /api/plugins/examples", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listExamples.handler({}, client);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith("/api/plugins/examples"), `URL was: ${calls[0]!.url}`);
    assert.equal(calls[0]!.init.method, "GET");
  });

  it("A2: returns content on success", async () => {
    const examples = [
      {
        packageName: "@paperclipai/plugin-hello-world-example",
        pluginKey: "paperclip.hello-world-example",
        displayName: "Hello World",
        tag: "example",
      },
    ];
    const { fn } = mockFetch(200, examples);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listExamples.handler({ response_format: "json" }, client);
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
  });

  it("A3: returns isError on 500", async () => {
    const { fn } = mockFetch(500, { message: "Server error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listExamples.handler({}, client);
    assert.equal(result.isError, true);
  });

  it("A5: .strict() rejects unknown fields", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listExamples.handler({ unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C3: response_format='json' returns parseable JSON array", async () => {
    const examples = [{ packageName: "foo", pluginKey: "foo.plugin" }];
    const { fn } = mockFetch(200, examples);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listExamples.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(parsed));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [pluginFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listExamples.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /##|^- /m);
  });

  it("F2: response_format='json' returns raw JSON array (not envelope)", async () => {
    const examples = [{ packageName: "foo", pluginKey: "foo.plugin" }];
    const { fn } = mockFetch(200, examples);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listExamples.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    // list_plugin_examples returns raw array (no pagination)
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed[0].packageName, "foo");
  });
});

// ---------------------------------------------------------------------------
// paperclip_enable_plugin
// ---------------------------------------------------------------------------
describe("paperclip_enable_plugin", () => {
  it("A1: calls POST /api/plugins/{pluginKey}/enable", async () => {
    const { fn, calls } = mockFetch(200, { ...pluginFixture(), status: "ready" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await enablePlugin.handler({ pluginKey: "paperclip.hello-world-example" }, client);
    assert.equal(calls.length, 1);
    assert.ok(
      calls[0]!.url.endsWith("/api/plugins/paperclip.hello-world-example/enable"),
      `URL was: ${calls[0]!.url}`
    );
    assert.equal(calls[0]!.init.method, "POST");
  });

  it("A2: returns content on success", async () => {
    const { fn } = mockFetch(200, { ...pluginFixture(), status: "ready" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await enablePlugin.handler({ pluginKey: "some-plugin" }, client);
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "ready");
  });

  it("A3: returns isError on 404", async () => {
    const { fn } = mockFetch(404, { error: "Plugin not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await enablePlugin.handler({ pluginKey: "missing-plugin" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("A4: McpError when pluginKey is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => enablePlugin.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: McpError when pluginKey is empty string", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => enablePlugin.handler({ pluginKey: "" }, client),
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
      () => enablePlugin.handler({ pluginKey: "foo", unknownField: "bar" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B2: 404 produces actionable error text mentioning paperclip_list_plugins", async () => {
    const { fn } = mockFetch(404, { error: "Plugin not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await enablePlugin.handler({ pluginKey: "missing-plugin" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("paperclip_list_plugins"));
  });

  it("ENC: encodeURIComponent applied for pluginKey with @ and /", async () => {
    const { fn, calls } = mockFetch(200, { status: "ready" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await enablePlugin.handler({ pluginKey: "@acme/plugin-linear" }, client);
    assert.ok(
      calls[0]!.url.includes("%40acme%2Fplugin-linear"),
      `Expected encoded pluginKey in URL, got: ${calls[0]!.url}`
    );
  });

  it("C3: response is parseable JSON", async () => {
    const { fn } = mockFetch(200, { status: "ready", pluginKey: "my-plugin" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await enablePlugin.handler({ pluginKey: "my-plugin" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "ready");
  });
});

// ---------------------------------------------------------------------------
// paperclip_disable_plugin
// ---------------------------------------------------------------------------
describe("paperclip_disable_plugin", () => {
  it("A1: calls POST /api/plugins/{pluginKey}/disable", async () => {
    const { fn, calls } = mockFetch(200, { ...pluginFixture(), status: "disabled" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await disablePlugin.handler({ pluginKey: "paperclip.hello-world-example" }, client);
    assert.equal(calls.length, 1);
    assert.ok(
      calls[0]!.url.endsWith("/api/plugins/paperclip.hello-world-example/disable"),
      `URL was: ${calls[0]!.url}`
    );
    assert.equal(calls[0]!.init.method, "POST");
  });

  it("A2: returns content on success", async () => {
    const { fn } = mockFetch(200, { ...pluginFixture(), status: "disabled" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await disablePlugin.handler({ pluginKey: "some-plugin" }, client);
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "disabled");
  });

  it("A3: returns isError on 404", async () => {
    const { fn } = mockFetch(404, { error: "Plugin not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await disablePlugin.handler({ pluginKey: "missing-plugin" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("A4: McpError when pluginKey is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => disablePlugin.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: McpError when pluginKey is empty string", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => disablePlugin.handler({ pluginKey: "" }, client),
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
      () => disablePlugin.handler({ pluginKey: "foo", unknownField: "bar" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B2: 404 produces actionable error text mentioning paperclip_list_plugins", async () => {
    const { fn } = mockFetch(404, { error: "Plugin not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await disablePlugin.handler({ pluginKey: "missing-plugin" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("paperclip_list_plugins"));
  });

  it("ENC: encodeURIComponent applied for pluginKey with @ and /", async () => {
    const { fn, calls } = mockFetch(200, { status: "disabled" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await disablePlugin.handler({ pluginKey: "@acme/plugin-linear" }, client);
    assert.ok(
      calls[0]!.url.includes("%40acme%2Fplugin-linear"),
      `Expected encoded pluginKey in URL, got: ${calls[0]!.url}`
    );
  });

  it("C3: response is parseable JSON", async () => {
    const { fn } = mockFetch(200, { status: "disabled", pluginKey: "my-plugin" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await disablePlugin.handler({ pluginKey: "my-plugin" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "disabled");
  });
});
