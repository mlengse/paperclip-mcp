import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { routineTools } from "./routines.js";
import { routineFixture, largeRoutineList, largeRoutineRunList } from "../test/helpers/fixtures.js";

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
    const result = await listRoutines.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/routines");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, routines);
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
    const result = await getRoutine.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routines/routine-1");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedRoutine = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRoutine, routine);
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
    const parsedCreated = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedCreated, created);
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
    const parsedUpdated = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedUpdated, updated);
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
    const parsedTrigger = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedTrigger, trigger);
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
    const parsedTrigUpdated = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedTrigUpdated, updated);
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
    const parsedRun = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRun, run);
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
    const result = await listRuns.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/routines/routine-1/runs");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedRuns = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRuns.items, runs);
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

// Stage 2 TDD: A4 (enum rejection) + A5 (.strict() rejects unknown fields)
describe("[stage-2] paperclip_add_routine_trigger — A4: RoutineTriggerTypeSchema + A5: strict", () => {
  it("A4: rejects invalid trigger type enum value", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => addTrigger.handler({ routineId: "r-1", type: "cron" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: accepts valid trigger type schedule", async () => {
    const created = { id: "trig-1", type: "schedule" };
    const { fn } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addTrigger.handler(
      { routineId: "r-1", type: "schedule", config: { cron: "0 * * * *" } },
      client
    );
    assert.equal(result.isError, undefined);
  });

  it("A5: rejects unknown extra field (strict) for add_routine_trigger", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => addTrigger.handler({ routineId: "r-1", type: "api", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_add_routine_trigger — cron format validator", () => {
  it("rejects invalid cron expression (too few fields)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        addTrigger.handler({ routineId: "r-1", type: "schedule", config: { cron: "*/5" } }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("accepts valid 5-field cron expression", async () => {
    const created = { id: "trig-1" };
    const { fn } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addTrigger.handler(
      { routineId: "r-1", type: "schedule", config: { cron: "*/5 * * * *" } },
      client
    );
    assert.equal(result.isError, undefined);
  });
});

describe("[stage-2] paperclip_add_routine_trigger — A5: nested strict rejection", () => {
  it("A5: rejects unknown key inside config (nested strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        addTrigger.handler(
          { routineId: "r-1", type: "schedule", config: { cron: "* * * * *", unknownField: "x" } },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_update_routine_trigger — A4: cron + A5: nested strict rejection", () => {
  it("A4: rejects invalid cron format", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        updateTrigger.handler(
          { triggerId: "t-1", config: { cron: "* * * *" } }, // 4 fields, invalid
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown key inside config (nested strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        updateTrigger.handler(
          { triggerId: "t-1", config: { cron: "* * * * *", unknownField: "x" } },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/F1/F2 — paperclip_list_routines
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_routines — truncation + format", () => {
  it("[stage-5] D1: response >25k chars is truncated with actionable hint", async () => {
    const big = largeRoutineList(300);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler({ limit: 100, response_format: "json" }, client);
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("[stage-5] D2: small response is not truncated", async () => {
    const small = [routineFixture()];
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("[stage-5] F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [routineFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("[stage-5] F2: response_format 'json' returns parseable JSON array", async () => {
    const routines = [routineFixture()];
    const { fn } = mockFetch(200, routines);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler({ response_format: "json" }, client);
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text).items, routines);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/F1/F2 — paperclip_get_routine
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_get_routine — truncation + format", () => {
  it("[stage-5] D1: oversized routine response is truncated with actionable hint", async () => {
    const big = { id: "routine-1", name: "Big Routine", log: "x".repeat(30_000) };
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRoutine.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("[stage-5] D2: normal routine is not truncated", async () => {
    const routine = routineFixture();
    const { fn } = mockFetch(200, routine);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRoutine.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("[stage-5] F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, routineFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRoutine.handler({ routineId: "routine-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("[stage-5] F2: response_format 'json' returns valid JSON", async () => {
    const routine = routineFixture();
    const { fn } = mockFetch(200, routine);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getRoutine.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text), routine);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/F1/F2 — paperclip_list_routine_runs
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_routine_runs — truncation + format", () => {
  it("[stage-5] D1: response >25k chars is truncated with actionable hint", async () => {
    const big = largeRoutineRunList(500);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler(
      { routineId: "routine-1", limit: 100, response_format: "json" },
      client
    );
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("[stage-5] D2: small run list is not truncated", async () => {
    const small = [{ id: "run-1", routineId: "routine-1", status: "completed" }];
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("[stage-5] F1: defaults to markdown output", async () => {
    const runs = [{ id: "run-1", routineId: "routine-1", status: "completed" }];
    const { fn } = mockFetch(200, runs);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler({ routineId: "routine-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("[stage-5] F2: response_format 'json' returns parseable JSON array", async () => {
    const runs = [{ id: "run-1", routineId: "routine-1", status: "completed" }];
    const { fn } = mockFetch(200, runs);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
    assert.deepEqual(JSON.parse(result.content[0]!.text).items, runs);
  });
});

// ---------------------------------------------------------------------------
// [stage-6] E1/E2/E3 pagination envelope — list_routines / list_routine_runs
// ---------------------------------------------------------------------------
describe("[stage-6] paperclip_list_routines — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = Array.from({ length: 3 }, (_, i) => routineFixture({ id: `routine-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler({ response_format: "json" }, client);
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
    const items = Array.from({ length: 4 }, (_, i) => routineFixture({ id: `r-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler(
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
    const items = [routineFixture()];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRoutines.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});

describe("[stage-6] paperclip_list_routine_runs — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [{ id: "run-1", routineId: "routine-1", status: "completed" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler(
      { routineId: "routine-1", response_format: "json" },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 1);
    assert.equal(data.limit, 50);
    assert.equal(data.offset, 0);
    assert.equal(data.has_more, false);
    assert.ok(Array.isArray(data.items));
  });

  it("E3: offset past end returns empty items", async () => {
    const items = [{ id: "run-1", status: "completed" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listRuns.handler(
      { routineId: "routine-1", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});
