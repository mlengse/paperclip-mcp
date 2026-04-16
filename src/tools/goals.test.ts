import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { goalTools } from "./goals.js";
import { goalFixture, largeGoalList } from "../test/helpers/fixtures.js";

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

const listGoals = goalTools.find((t) => t.name === "paperclip_list_goals")!;
const getGoal = goalTools.find((t) => t.name === "paperclip_get_goal")!;
const createGoal = goalTools.find((t) => t.name === "paperclip_create_goal")!;
const updateGoal = goalTools.find((t) => t.name === "paperclip_update_goal")!;

describe("paperclip_list_goals", () => {
  it("calls GET /api/companies/{id}/goals and returns goal list", async () => {
    const goals = [{ id: "goal-1", title: "Ship V1", status: "active" }];
    const { fn, calls } = mockFetch(200, goals);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/goals");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, goals);
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listGoals.handler(null, client),
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
    const result = await listGoals.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_get_goal", () => {
  it("calls GET /api/goals/{id} and returns goal data", async () => {
    const goal = { id: "goal-1", title: "Ship V1", status: "active" };
    const { fn, calls } = mockFetch(200, goal);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getGoal.handler({ goalId: "goal-1", response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/goals/goal-1");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, goal);
  });

  it("throws McpError when goalId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getGoal.handler({ goalId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Goal not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getGoal.handler({ goalId: "missing-goal" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_create_goal", () => {
  it("calls POST /api/companies/{id}/goals with required and optional fields", async () => {
    const created = { id: "goal-new", title: "New Goal", status: "active" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createGoal.handler(
      { title: "New Goal", status: "active", level: "company" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/goals");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.title, "New Goal");
    assert.equal(body.status, "active");
    assert.equal(body.level, "company");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, created);
  });

  it("throws McpError when title is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createGoal.handler({ title: "" }, client),
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
    const result = await createGoal.handler({ title: "Valid Goal" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });
});

describe("paperclip_update_goal", () => {
  it("calls PATCH /api/goals/{id} with only provided fields", async () => {
    const updated = { id: "goal-1", title: "Renamed Goal", status: "completed" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateGoal.handler(
      { goalId: "goal-1", title: "Renamed Goal", status: "completed" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/goals/goal-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.title, "Renamed Goal");
    assert.equal(body.status, "completed");
    assert.ok(!("goalId" in body), "goalId must not be in PATCH body");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, updated);
  });

  it("throws McpError when goalId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateGoal.handler({ title: "New Title" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 422 API error", async () => {
    const { fn } = mockFetch(422, { message: "Invalid status transition" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateGoal.handler({ goalId: "goal-1", status: "invalid" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("422"));
  });
});

// Stage 2 TDD: A5 (.strict() rejects unknown fields)
// Note: Goal and Project status fields use domain-specific values (active, completed, archived)
// that are distinct from the issue StatusSchema. They use z.string() with .strict() applied.
describe("[stage-2] paperclip_create_goal — A5: strict", () => {
  it("A5: rejects unknown extra field (strict) for create_goal", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createGoal.handler({ title: "Test", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_update_goal — A5: strict", () => {
  it("A5: rejects unknown extra field (strict) for update_goal", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateGoal.handler({ goalId: "goal-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2 — paperclip_list_goals
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_goals — truncation + format", () => {
  it("D1: response >25k chars is truncated with hint", async () => {
    const big = largeGoalList(300);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler({ limit: 100, response_format: "json" }, client);
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("D2: small response is not truncated", async () => {
    const small = [goalFixture()];
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [goalFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON array", async () => {
    const goals = [goalFixture()];
    const { fn } = mockFetch(200, goals);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, goals);
  });
});

// ---------------------------------------------------------------------------
// [stage-6] E1/E2/E3 pagination envelope — paperclip_list_goals
// ---------------------------------------------------------------------------
describe("[stage-6] paperclip_list_goals — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = Array.from({ length: 3 }, (_, i) => goalFixture({ id: `goal-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler({ response_format: "json" }, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 3);
    assert.equal(data.count, 3);
    assert.equal(data.limit, 50);
    assert.equal(data.offset, 0);
    assert.equal(data.has_more, false);
    assert.equal(data.next_offset, undefined);
    assert.ok(Array.isArray(data.items));
  });

  it("E2: explicit limit=10, offset=20 reflected in envelope", async () => {
    const items = Array.from({ length: 30 }, (_, i) => goalFixture({ id: `g-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler(
      { response_format: "json", limit: 10, offset: 20 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 30);
    assert.equal(data.count, 10);
    assert.equal(data.limit, 10);
    assert.equal(data.offset, 20);
    assert.equal(data.has_more, false);
    assert.equal(data.next_offset, undefined);
  });

  it("E3: offset past end returns empty items with correct total", async () => {
    const items = [goalFixture()];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 1);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });

  it("E4: has_more=true when more pages remain", async () => {
    const items = Array.from({ length: 60 }, (_, i) => goalFixture({ id: `g-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listGoals.handler(
      { response_format: "json", limit: 10, offset: 0 },
      client
    );
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.has_more, true);
    assert.equal(data.next_offset, 10);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2 — paperclip_get_goal
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_get_goal — truncation + format", () => {
  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, goalFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getGoal.handler({ goalId: "goal-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON object", async () => {
    const goal = goalFixture();
    const { fn } = mockFetch(200, goal);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getGoal.handler({ goalId: "goal-1", response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, goal);
  });
});
