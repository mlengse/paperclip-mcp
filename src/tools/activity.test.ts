import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { activityTools } from "./activity.js";

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

const getActivity = activityTools.find((t) => t.name === "paperclip_get_activity")!;
const getCostSummary = activityTools.find((t) => t.name === "paperclip_get_cost_summary")!;
const getCostsByAgent = activityTools.find((t) => t.name === "paperclip_get_costs_by_agent")!;
const getCostsByProject = activityTools.find((t) => t.name === "paperclip_get_costs_by_project")!;
const reportCostEvent = activityTools.find((t) => t.name === "paperclip_report_cost_event")!;

describe("paperclip_get_activity", () => {
  it("calls GET /api/companies/{id}/activity with no filters", async () => {
    const activity = [{ id: "act-1", type: "issue.created" }];
    const { fn, calls } = mockFetch(200, activity);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getActivity.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/activity");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, activity);
  });

  it("appends query params when filters are provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getActivity.handler(
      { agentId: "agent-1", entityType: "issue", entityId: "issue-1" },
      client
    );
    const url = calls[0]!.url;
    assert.ok(url.includes("agentId=agent-1"), `URL missing agentId: ${url}`);
    assert.ok(url.includes("entityType=issue"), `URL missing entityType: ${url}`);
    assert.ok(url.includes("entityId=issue-1"), `URL missing entityId: ${url}`);
  });

  it("returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getActivity.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_get_cost_summary", () => {
  it("calls GET /api/companies/{id}/costs/summary and returns summary", async () => {
    const summary = { total: 1234, currency: "usd" };
    const { fn, calls } = mockFetch(200, summary);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCostSummary.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/costs/summary");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedSummary = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedSummary, summary);
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getCostSummary.handler(null, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCostSummary.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });
});

describe("paperclip_get_costs_by_agent", () => {
  it("calls GET /api/companies/{id}/costs/by-agent and returns breakdown", async () => {
    const breakdown = [{ agentId: "agent-1", total: 500 }];
    const { fn, calls } = mockFetch(200, breakdown);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCostsByAgent.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/costs/by-agent");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedByAgent = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedByAgent, breakdown);
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getCostsByAgent.handler(null, client),
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
    const result = await getCostsByAgent.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_get_costs_by_project", () => {
  it("calls GET /api/companies/{id}/costs/by-project and returns breakdown", async () => {
    const breakdown = [{ projectId: "proj-1", total: 800 }];
    const { fn, calls } = mockFetch(200, breakdown);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCostsByProject.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/costs/by-project");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedByProject = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedByProject, breakdown);
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getCostsByProject.handler(null, client),
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
    const result = await getCostsByProject.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_report_cost_event", () => {
  const validInput = {
    agentId: "agent-1",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputTokens: 1000,
    outputTokens: 500,
    costCents: 12,
    occurredAt: "2026-04-10T02:00:00Z",
  };

  it("calls POST /api/companies/{id}/cost-events with correct body", async () => {
    const event = { id: "evt-1", ...validInput };
    const { fn, calls } = mockFetch(201, event);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await reportCostEvent.handler(validInput, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/cost-events");
    assert.equal(calls[0]!.init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), validInput);
    const parsedEvent = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedEvent, event);
  });

  it("returns isError response on 422 validation error", async () => {
    const { fn } = mockFetch(422, { error: "Validation error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await reportCostEvent.handler(validInput, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("422"));
  });

  it("throws McpError when required fields are missing", async () => {
    const { fn, calls } = mockFetch(201, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => reportCostEvent.handler({ agentId: "agent-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// Stage 2 TDD: occurredAt ISO 8601 format + A5 (.strict() rejects unknown fields)
describe("[stage-2] paperclip_report_cost_event — occurredAt ISO 8601 + A5: strict", () => {
  const validBase = {
    agentId: "agent-1",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputTokens: 1000,
    outputTokens: 200,
    costCents: 5,
  };

  it("A4: rejects invalid ISO 8601 date string for occurredAt", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => reportCostEvent.handler({ ...validBase, occurredAt: "not-a-date" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: accepts valid ISO 8601 datetime for occurredAt", async () => {
    const { fn } = mockFetch(200, { id: "cost-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await reportCostEvent.handler(
      { ...validBase, occurredAt: "2026-04-16T12:00:00.000Z" },
      client
    );
    assert.equal(result.isError, undefined);
  });

  it("A5: rejects unknown extra field (strict) for report_cost_event", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        reportCostEvent.handler(
          { ...validBase, occurredAt: "2026-04-16T12:00:00.000Z", unknownField: "oops" },
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
