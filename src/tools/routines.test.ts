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
    // 204/304 are null body statuses — Response constructor rejects non-null body
    const nullBodyStatus = status === 204 || status === 304;
    return new Response(nullBodyStatus ? null : body !== undefined ? JSON.stringify(body) : null, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

const listRoutines = routineTools.find((t) => t.name === "paperclip_list_routines")!;
const getRoutine = routineTools.find((t) => t.name === "paperclip_get_routine")!;
const createRoutine = routineTools.find((t) => t.name === "paperclip_create_routine")!;
const updateRoutine = routineTools.find((t) => t.name === "paperclip_update_routine")!;
const addTrigger = routineTools.find((t) => t.name === "paperclip_add_routine_trigger")!;
const updateTrigger = routineTools.find((t) => t.name === "paperclip_update_routine_trigger")!;
const deleteTrigger = routineTools.find((t) => t.name === "paperclip_delete_routine_trigger")!;
const runRoutine = routineTools.find((t) => t.name === "paperclip_run_routine")!;
const listRuns = routineTools.find((t) => t.name === "paperclip_list_routine_runs")!;

describe("paperclip_list_routines", () => {
  it("calls GET /api/companies/{id}/routines and returns routine list", async () => {
    const routines = [{ id: "routine-1", name: "Daily Sync", agentId: "agent-1" }];
    const { fn, calls } = mockFetch(200, routines);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler({}, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/routines");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(routines) }] });
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listRoutines.handler(null, client),
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
    const result = await listRoutines.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_get_routine", () => {
  it("calls GET /api/routines/{id} and returns routine data with triggers", async () => {
    const routine = { id: "routine-1", name: "Daily Sync", triggers: [] };
    const { fn, calls } = mockFetch(200, routine);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRoutine.handler({ routineId: "routine-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routines/routine-1");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(routine) }] });
  });

  it("throws McpError when routineId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getRoutine.handler({ routineId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Routine not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRoutine.handler({ routineId: "missing-routine" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_create_routine", () => {
  it("calls POST /api/companies/{id}/routines with required and optional fields", async () => {
    const created = { id: "routine-new", name: "Weekly Report", agentId: "agent-1" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createRoutine.handler(
      { agentId: "agent-1", name: "Weekly Report", concurrencyPolicy: "forbid" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/routines");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.agentId, "agent-1");
    assert.equal(body.name, "Weekly Report");
    assert.equal(body.concurrencyPolicy, "forbid");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(created) }] });
  });

  it("throws McpError when name is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createRoutine.handler({ agentId: "agent-1", name: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 400 API error", async () => {
    const { fn } = mockFetch(400, { message: "Bad request" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createRoutine.handler(
      { agentId: "agent-1", name: "Valid Routine" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });
});

describe("paperclip_update_routine", () => {
  it("calls PATCH /api/routines/{id} with only provided fields", async () => {
    const updated = { id: "routine-1", name: "Renamed Routine", catchUpPolicy: "run_once" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateRoutine.handler(
      { routineId: "routine-1", name: "Renamed Routine", catchUpPolicy: "run_once" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routines/routine-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "Renamed Routine");
    assert.equal(body.catchUpPolicy, "run_once");
    assert.ok(!("routineId" in body), "routineId must not be in PATCH body");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
  });

  it("throws McpError when routineId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateRoutine.handler({ routineId: "", name: "New Name" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Routine not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateRoutine.handler({ routineId: "missing", name: "X" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_add_routine_trigger", () => {
  it("calls POST /api/routines/{id}/triggers with type and config", async () => {
    const trigger = { id: "trig-1", routineId: "routine-1", type: "schedule" };
    const { fn, calls } = mockFetch(200, trigger);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addTrigger.handler(
      { routineId: "routine-1", type: "schedule", config: { cron: "0 9 * * 1" } },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routines/routine-1/triggers");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.type, "schedule");
    assert.deepEqual(body.config, { cron: "0 9 * * 1" });
    assert.ok(!("routineId" in body), "routineId must not be in POST body");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(trigger) }] });
  });

  it("throws McpError when type is invalid enum value (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => addTrigger.handler({ routineId: "routine-1", type: "invalid-type" as never }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 400 API error", async () => {
    const { fn } = mockFetch(400, { message: "Invalid trigger config" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addTrigger.handler({ routineId: "routine-1", type: "schedule" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });
});

describe("paperclip_update_routine_trigger", () => {
  it("calls PATCH /api/routine-triggers/{id} with only provided fields", async () => {
    const updated = { id: "trig-1", type: "webhook", config: {} };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateTrigger.handler({ triggerId: "trig-1", type: "webhook" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routine-triggers/trig-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.type, "webhook");
    assert.ok(!("triggerId" in body), "triggerId must not be in PATCH body");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
  });

  it("throws McpError when triggerId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateTrigger.handler({ triggerId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Trigger not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateTrigger.handler({ triggerId: "missing-trig", type: "api" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_delete_routine_trigger", () => {
  it("calls DELETE /api/routine-triggers/{id} and returns 204 No Content", async () => {
    const { fn, calls } = mockFetch(204, null);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await deleteTrigger.handler({ triggerId: "trig-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routine-triggers/trig-1");
    assert.equal(calls[0]!.init.method, "DELETE");
    assert.equal(result.isError, undefined);
  });

  it("throws McpError when triggerId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => deleteTrigger.handler({ triggerId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Trigger not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await deleteTrigger.handler({ triggerId: "missing-trig" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_run_routine", () => {
  it("calls POST /api/routines/{id}/run and returns run data", async () => {
    const run = { id: "run-1", routineId: "routine-1", status: "running" };
    const { fn, calls } = mockFetch(200, run);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await runRoutine.handler({ routineId: "routine-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routines/routine-1/run");
    assert.equal(calls[0]!.init.method, "POST");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(run) }] });
  });

  it("throws McpError when routineId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => runRoutine.handler({ routineId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 409 API error (routine already running)", async () => {
    const { fn } = mockFetch(409, { message: "Routine already running" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await runRoutine.handler({ routineId: "routine-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("409"));
  });
});

describe("paperclip_list_routine_runs", () => {
  it("calls GET /api/routines/{id}/runs and returns run history", async () => {
    const runs = [
      { id: "run-1", status: "completed" },
      { id: "run-2", status: "failed" },
    ];
    const { fn, calls } = mockFetch(200, runs);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler({ routineId: "routine-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routines/routine-1/runs");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(runs) }] });
  });

  it("throws McpError when routineId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listRuns.handler({ routineId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Routine not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler({ routineId: "missing-routine" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});
