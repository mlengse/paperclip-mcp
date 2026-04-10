import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { routineTools } from "./routines.js";

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

const addTrigger = routineTools.find((t) => t.name === "paperclip_add_routine_trigger")!;
const updateTrigger = routineTools.find((t) => t.name === "paperclip_update_routine_trigger")!;

describe("paperclip_add_routine_trigger — schedule config", () => {
  it("accepts schedule type with cron and optional timezone", async () => {
    const trigger = { id: "trig-1", type: "schedule" };
    const { fn, calls } = mockFetch(200, trigger);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addTrigger.handler(
      {
        routineId: "routine-1",
        type: "schedule",
        config: { cron: "0 9 * * 1", timezone: "America/New_York" },
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.type, "schedule");
    assert.deepEqual(body.config, { cron: "0 9 * * 1", timezone: "America/New_York" });
    assert.equal(result.isError, undefined);
  });

  it("accepts schedule type with cron only (timezone optional)", async () => {
    const { fn, calls } = mockFetch(200, { id: "trig-2" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await addTrigger.handler(
      { routineId: "routine-1", type: "schedule", config: { cron: "*/5 * * * *" } },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.config.cron, "*/5 * * * *");
    assert.equal(body.config.timezone, undefined);
  });
});

describe("paperclip_add_routine_trigger — webhook config", () => {
  it("accepts webhook type with signingMode and replayWindowSec", async () => {
    const trigger = { id: "trig-3", type: "webhook", publicId: "pub-abc" };
    const { fn, calls } = mockFetch(200, trigger);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addTrigger.handler(
      {
        routineId: "routine-1",
        type: "webhook",
        config: { signingMode: "hmac_sha256", replayWindowSec: 600 },
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.type, "webhook");
    assert.equal(body.config.signingMode, "hmac_sha256");
    assert.equal(body.config.replayWindowSec, 600);
    assert.equal(result.isError, undefined);
  });

  it("accepts webhook type with no config (all fields optional)", async () => {
    const { fn, calls } = mockFetch(200, { id: "trig-4" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await addTrigger.handler({ routineId: "routine-1", type: "webhook" }, client);
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.type, "webhook");
    assert.equal(body.config, undefined);
  });

  it("rejects invalid signingMode value (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        addTrigger.handler(
          { routineId: "routine-1", type: "webhook", config: { signingMode: "invalid" as never } },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("rejects replayWindowSec below minimum of 30 (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        addTrigger.handler(
          { routineId: "routine-1", type: "webhook", config: { replayWindowSec: 10 } },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("rejects replayWindowSec above maximum of 86400 (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        addTrigger.handler(
          { routineId: "routine-1", type: "webhook", config: { replayWindowSec: 100000 } },
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

describe("paperclip_add_routine_trigger — api config", () => {
  it("accepts api type with no config", async () => {
    const trigger = { id: "trig-5", type: "api" };
    const { fn, calls } = mockFetch(200, trigger);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addTrigger.handler({ routineId: "routine-1", type: "api" }, client);
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.type, "api");
    assert.equal(body.config, undefined);
    assert.equal(result.isError, undefined);
  });
});

describe("paperclip_update_routine_trigger — extended config schema", () => {
  it("accepts webhook update with signingMode", async () => {
    const updated = { id: "trig-1", type: "webhook" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateTrigger.handler(
      { triggerId: "trig-1", config: { signingMode: "bearer" } },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.config.signingMode, "bearer");
    assert.equal(result.isError, undefined);
  });

  it("accepts schedule update with cron and timezone", async () => {
    const { fn, calls } = mockFetch(200, { id: "trig-2" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateTrigger.handler(
      { triggerId: "trig-2", config: { cron: "0 10 * * 1", timezone: "Europe/Amsterdam" } },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.config.cron, "0 10 * * 1");
    assert.equal(body.config.timezone, "Europe/Amsterdam");
  });

  it("rejects replayWindowSec below minimum of 30 on update (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateTrigger.handler({ triggerId: "trig-1", config: { replayWindowSec: 5 } }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});
