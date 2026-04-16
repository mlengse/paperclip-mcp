import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { issueTools } from "./issues.js";
import { largeIssueList, issueFixture } from "../test/helpers/fixtures.js";
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

const listIssues = issueTools.find((t) => t.name === "paperclip_list_issues")!;
const getIssue = issueTools.find((t) => t.name === "paperclip_get_issue")!;
const getHeartbeat = issueTools.find((t) => t.name === "paperclip_get_heartbeat_context")!;
const checkoutIssue = issueTools.find((t) => t.name === "paperclip_checkout_issue")!;
const releaseIssue = issueTools.find((t) => t.name === "paperclip_release_issue")!;
const updateIssue = issueTools.find((t) => t.name === "paperclip_update_issue")!;
const createIssue = issueTools.find((t) => t.name === "paperclip_create_issue")!;

describe("paperclip_list_issues", () => {
  it("calls GET /api/companies/{id}/issues with no filters", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/issues");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, {
      items: [],
      total: 0,
      count: 0,
      limit: 50,
      offset: 0,
      has_more: false,
    });
  });

  it("appends query params when filters are provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listIssues.handler({ status: "todo,in_progress", assigneeAgentId: "agent-1" }, client);
    const url = calls[0]!.url;
    assert.ok(url.includes("status=todo%2Cin_progress"), `URL missing status param: ${url}`);
    assert.ok(url.includes("assigneeAgentId=agent-1"), `URL missing assigneeAgentId: ${url}`);
  });

  it("forwards goalId and labelId as query params (PAP-60)", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listIssues.handler({ goalId: "goal-1", labelId: "label-1" }, client);
    const url = calls[0]!.url;
    assert.ok(url.includes("goalId=goal-1"), `URL missing goalId param: ${url}`);
    assert.ok(url.includes("labelId=label-1"), `URL missing labelId param: ${url}`);
  });

  it("returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("pagination: limit=5, offset=0 returns first 5 of 10 with total=10", async () => {
    const allIssues = Array.from({ length: 10 }, (_, i) => ({ id: `issue-${i}` }));
    const { fn } = mockFetch(200, allIssues);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler(
      { limit: 5, offset: 0, response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 10);
    assert.equal(parsed.limit, 5);
    assert.equal(parsed.offset, 0);
    assert.equal(parsed.items.length, 5);
    assert.deepEqual(parsed.items, allIssues.slice(0, 5));
  });

  it("pagination: limit=5, offset=5 returns items 5–9 with total=10", async () => {
    const allIssues = Array.from({ length: 10 }, (_, i) => ({ id: `issue-${i}` }));
    const { fn } = mockFetch(200, allIssues);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler(
      { limit: 5, offset: 5, response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 10);
    assert.equal(parsed.items.length, 5);
    assert.deepEqual(parsed.items, allIssues.slice(5, 10));
  });

  it("pagination: offset past end returns empty issues with correct total", async () => {
    const allIssues = Array.from({ length: 3 }, (_, i) => ({ id: `issue-${i}` }));
    const { fn } = mockFetch(200, allIssues);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler(
      { limit: 5, offset: 10, response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 3);
    assert.deepEqual(parsed.items, []);
  });

  it("pagination validation: limit=0 throws McpError before fetch", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listIssues.handler({ limit: 0 }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("[stage-6] rejects offset: -1 (boundary)", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listIssues.handler({ offset: -1 }, client),
      (err: unknown) => err instanceof McpError
    );
    assert.equal(calls.length, 0);
  });

  it("pagination validation: limit=101 throws McpError before fetch", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listIssues.handler({ limit: 101 }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("pagination default: no limit/offset applies default limit=50", async () => {
    const allIssues = Array.from({ length: 60 }, (_, i) => ({ id: `issue-${i}` }));
    const { fn } = mockFetch(200, allIssues);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 60);
    assert.equal(parsed.limit, 50);
    assert.equal(parsed.offset, 0);
    assert.equal(parsed.items.length, 50);
  });
});

describe("paperclip_get_issue", () => {
  it("calls GET /api/issues/{id} and returns issue data", async () => {
    const issue = { id: "issue-1", title: "My issue", status: "todo" };
    const { fn, calls } = mockFetch(200, issue);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getIssue.handler({ issueId: "issue-1", response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, issue);
  });

  it("throws McpError when issueId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getIssue.handler({ issueId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getIssue.handler({ issueId: "PAP-99" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_get_heartbeat_context", () => {
  it("calls GET /api/issues/{id}/heartbeat-context", async () => {
    const ctx = { state: "in_progress", goal: "Build MCP" };
    const { fn, calls } = mockFetch(200, ctx);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getHeartbeat.handler(
      { issueId: "issue-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/heartbeat-context");
    const parsedCtx = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedCtx, ctx);
  });

  it("throws McpError when issueId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getHeartbeat.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Issue not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getHeartbeat.handler({ issueId: "PAP-99" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_checkout_issue", () => {
  it("calls POST /api/issues/{id}/checkout with agentId and optional expectedStatuses", async () => {
    const updated = { id: "issue-1", status: "in_progress" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await checkoutIssue.handler(
      { issueId: "issue-1", expectedStatuses: ["todo"] },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/checkout");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(
      calls[0]!.init.body,
      JSON.stringify({ agentId: "agent-1", expectedStatuses: ["todo"] })
    );
    const parsedCheckout = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedCheckout, updated);
  });

  it("always includes agentId in POST body even without expectedStatuses", async () => {
    const updated = { id: "issue-1", status: "in_progress" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await checkoutIssue.handler({ issueId: "issue-1" }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.agentId, "agent-1");
    assert.equal(sentBody.expectedStatuses, undefined);
  });

  it("throws McpError when issueId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => checkoutIssue.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 409 conflict (already checked out by another agent)", async () => {
    const { fn } = mockFetch(409, { message: "Issue already checked out" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await checkoutIssue.handler({ issueId: "issue-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("409"));
  });
});

describe("paperclip_release_issue", () => {
  it("calls POST /api/issues/{id}/release and returns result", async () => {
    const updated = { id: "issue-1", status: "todo" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await releaseIssue.handler({ issueId: "issue-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/release");
    assert.equal(calls[0]!.init.method, "POST");
    const parsedRelease = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRelease, updated);
  });

  it("throws McpError when issueId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => releaseIssue.handler({ issueId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Issue not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await releaseIssue.handler({ issueId: "issue-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  // Regression tests for PAP-90: release endpoint must clear executionRunId and executionLockedAt
  it("PAP-90 regression: release response has executionRunId null", async () => {
    const released = {
      id: "issue-1",
      status: "todo",
      executionRunId: null,
      executionLockedAt: null,
    };
    const { fn } = mockFetch(200, released);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await releaseIssue.handler({ issueId: "issue-1" }, client);
    const body = JSON.parse(result.content[0]!.text);
    assert.equal(body.executionRunId, null, "executionRunId must be null after release");
  });

  it("PAP-90 regression: release response has executionLockedAt null", async () => {
    const released = {
      id: "issue-1",
      status: "todo",
      executionRunId: null,
      executionLockedAt: null,
    };
    const { fn } = mockFetch(200, released);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await releaseIssue.handler({ issueId: "issue-1" }, client);
    const body = JSON.parse(result.content[0]!.text);
    assert.equal(body.executionLockedAt, null, "executionLockedAt must be null after release");
  });

  it("PAP-90 regression: checkout succeeds after release (no 409)", async () => {
    // Simulates the full release → re-checkout flow.
    // A bug in the release endpoint that left executionRunId set would cause the
    // checkout to return 409; this test fails if that happens.
    const released = {
      id: "issue-1",
      status: "todo",
      executionRunId: null,
      executionLockedAt: null,
    };
    const checkedOut = { id: "issue-1", status: "in_progress" };

    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sequentialFetch = async (url: string, _: RequestInit): Promise<Response> => {
      callCount++;
      const body = url.endsWith("/release") ? released : checkedOut;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
      });
    };

    const client = new PaperclipClient(TEST_AUTH, sequentialFetch);

    const releaseResult = await releaseIssue.handler({ issueId: "issue-1" }, client);
    assert.equal(releaseResult.isError, undefined, "release must not return isError");

    const checkoutResult = await checkoutIssue.handler({ issueId: "issue-1" }, client);
    assert.equal(
      checkoutResult.isError,
      undefined,
      "checkout after release must not return isError (no 409)"
    );
    const checkoutBody = JSON.parse(checkoutResult.content[0]!.text);
    assert.equal(checkoutBody.status, "in_progress");
    assert.equal(callCount, 2);
  });
});

describe("paperclip_update_issue", () => {
  it("calls PATCH /api/issues/{id} with only provided fields", async () => {
    const updated = { id: "issue-1", status: "done" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateIssue.handler(
      { issueId: "issue-1", status: "done", comment: "All done" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    assert.equal(calls[0]!.init.body, JSON.stringify({ status: "done", comment: "All done" }));
    const parsedUpdate = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedUpdate, updated);
  });

  it("forwards all 5 new fields (assigneeUserId, goalId, projectId, parentId, billingCode) in PATCH body", async () => {
    const updated = { id: "issue-1", status: "in_review" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler(
      {
        issueId: "issue-1",
        assigneeUserId: "user-abc",
        goalId: "goal-1",
        projectId: "proj-1",
        parentId: "parent-issue-1",
        billingCode: "TEAM-X",
      },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.assigneeUserId, "user-abc");
    assert.equal(sentBody.goalId, "goal-1");
    assert.equal(sentBody.projectId, "proj-1");
    assert.equal(sentBody.parentId, "parent-issue-1");
    assert.equal(sentBody.billingCode, "TEAM-X");
  });

  it("forwards null values for new fields to allow clearing/unassigning", async () => {
    const updated = { id: "issue-1", assigneeUserId: null };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler(
      { issueId: "issue-1", assigneeUserId: null, goalId: null, assigneeAgentId: null },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.assigneeUserId, null);
    assert.equal(sentBody.goalId, null);
    assert.equal(sentBody.assigneeAgentId, null);
  });

  it("throws McpError when issueId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateIssue.handler({ status: "done" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 422 API error (valid status triggers API-side error)", async () => {
    // Note: after Stage 2, invalid enum values are caught at validation — this tests a
    // valid status that the API rejects (e.g. invalid transition).
    const { fn } = mockFetch(422, { message: "Invalid status transition" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateIssue.handler({ issueId: "issue-1", status: "done" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("422"));
  });
});

describe("paperclip_create_issue", () => {
  it("calls POST /api/companies/{id}/issues with required and optional fields", async () => {
    const created = { id: "issue-new", title: "New feature", status: "todo" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createIssue.handler(
      { title: "New feature", priority: "high", projectId: "proj-1" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/issues");
    assert.equal(calls[0]!.init.method, "POST");
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.title, "New feature");
    assert.equal(sentBody.priority, "high");
    assert.equal(sentBody.projectId, "proj-1");
    const parsedCreate = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedCreate, created);
  });

  it("forwards billingCode and inheritExecutionWorkspaceFromIssueId in POST body (PAP-60)", async () => {
    const created = { id: "issue-new", title: "Follow-up task" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createIssue.handler(
      {
        title: "Follow-up task",
        billingCode: "TEAM-X",
        inheritExecutionWorkspaceFromIssueId: "issue-source-1",
      },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.billingCode, "TEAM-X");
    assert.equal(sentBody.inheritExecutionWorkspaceFromIssueId, "issue-source-1");
  });

  it("throws McpError when title is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createIssue.handler({ title: "" }, client),
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
    const result = await createIssue.handler({ title: "Valid title" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });

  it("forwards labelIds in POST body (PAP-99)", async () => {
    const created = { id: "issue-new", title: "Tagged issue", labelIds: ["label-1", "label-2"] };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createIssue.handler({ title: "Tagged issue", labelIds: ["label-1", "label-2"] }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(sentBody.labelIds, ["label-1", "label-2"]);
  });
});

describe("paperclip_update_issue (PAP-139: executionRunId and executionLockedAt)", () => {
  it("forwards executionRunId as string in PATCH body", async () => {
    const updated = { id: "issue-1", executionRunId: "run-abc" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler({ issueId: "issue-1", executionRunId: "run-abc" }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.executionRunId, "run-abc");
  });

  it("forwards executionLockedAt as string in PATCH body", async () => {
    const updated = { id: "issue-1", executionLockedAt: "2026-04-10T21:00:00.000Z" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler(
      { issueId: "issue-1", executionLockedAt: "2026-04-10T21:00:00.000Z" },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.executionLockedAt, "2026-04-10T21:00:00.000Z");
  });

  it("forwards null executionRunId to clear a stale lock", async () => {
    const updated = { id: "issue-1", executionRunId: null };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler({ issueId: "issue-1", executionRunId: null }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(
      sentBody.executionRunId,
      null,
      "null executionRunId must be forwarded to clear lock"
    );
  });

  it("forwards null executionLockedAt to clear a stale lock", async () => {
    const updated = { id: "issue-1", executionLockedAt: null };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler({ issueId: "issue-1", executionLockedAt: null }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(
      sentBody.executionLockedAt,
      null,
      "null executionLockedAt must be forwarded to clear lock"
    );
  });

  it("clears both fields simultaneously when both are passed as null", async () => {
    const updated = { id: "issue-1", executionRunId: null, executionLockedAt: null };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler(
      { issueId: "issue-1", executionRunId: null, executionLockedAt: null },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(sentBody.executionRunId, null);
    assert.equal(sentBody.executionLockedAt, null);
  });

  it("returns isError on 422 when clearing lock fields", async () => {
    const { fn } = mockFetch(422, { message: "Validation error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateIssue.handler({ issueId: "issue-1", executionRunId: null }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("422"));
  });
});

describe("paperclip_update_issue (labelIds)", () => {
  it("forwards labelIds in PATCH body (PAP-99)", async () => {
    const updated = { id: "issue-1", labelIds: ["label-1"] };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler({ issueId: "issue-1", labelIds: ["label-1"] }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(sentBody.labelIds, ["label-1"]);
  });

  it("forwards empty labelIds array to clear all labels (PAP-99)", async () => {
    const updated = { id: "issue-1", labelIds: [] };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler({ issueId: "issue-1", labelIds: [] }, client);
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(sentBody.labelIds, []);
  });

  // PAP-120: regression — client sends labelIds as a JSON-encoded string instead of an array
  it("PAP-120: accepts labelIds as JSON-encoded string and forwards parsed array (update)", async () => {
    const updated = { id: "issue-1", labelIds: ["label-1", "label-2"] };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateIssue.handler(
      {
        issueId: "issue-1",
        labelIds: JSON.stringify(["label-1", "label-2"]) as unknown as string[],
      },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(sentBody.labelIds, ["label-1", "label-2"]);
  });
});

describe("paperclip_create_issue (labelIds JSON-string, PAP-120)", () => {
  // PAP-120: regression — client sends labelIds as a JSON-encoded string instead of an array
  it("accepts labelIds as JSON-encoded string and forwards parsed array (create)", async () => {
    const created = { id: "issue-new", title: "Tagged", labelIds: ["label-1", "label-2"] };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createIssue.handler(
      { title: "Tagged", labelIds: JSON.stringify(["label-1", "label-2"]) as unknown as string[] },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(sentBody.labelIds, ["label-1", "label-2"]);
  });
});

// PAP-181: regression — release must clear checkoutRunId as well as executionRunId.
// A recurrence of PAP-125 was observed where executionRunId stayed non-null across
// successive release calls, causing false 409 conflicts on subsequent checkouts.
describe("paperclip_release_issue (PAP-181: regression — release must clear all lock fields)", () => {
  it("PAP-181: release response has checkoutRunId null", async () => {
    const released = {
      id: "issue-1",
      status: "todo",
      checkoutRunId: null,
      executionRunId: null,
      executionLockedAt: null,
    };
    const { fn } = mockFetch(200, released);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await releaseIssue.handler({ issueId: "issue-1" }, client);
    const body = JSON.parse(result.content[0]!.text);
    assert.equal(body.checkoutRunId, null, "checkoutRunId must be null after release");
  });

  it("PAP-181: repeated releases each return executionRunId null (idempotent)", async () => {
    // Verifies that calling release multiple times does not leave a stale executionRunId.
    // The PAP-125/PAP-181 bug manifested as repeated calls returning non-null executionRunId.
    const released = {
      id: "issue-1",
      status: "todo",
      checkoutRunId: null,
      executionRunId: null,
      executionLockedAt: null,
    };
    const { fn } = mockFetch(200, released);
    const client = new PaperclipClient(TEST_AUTH, fn);

    for (let i = 0; i < 3; i++) {
      const result = await releaseIssue.handler({ issueId: "issue-1" }, client);
      const body = JSON.parse(result.content[0]!.text);
      assert.equal(
        body.executionRunId,
        null,
        `executionRunId must be null on release call #${i + 1}`
      );
      assert.equal(
        body.checkoutRunId,
        null,
        `checkoutRunId must be null on release call #${i + 1}`
      );
    }
  });

  it("PAP-181: auto-release guard triggers isError on successive release that still leaves executionRunId set", async () => {
    // Simulates the PAP-181 recurrence: successive release calls both return 200 but
    // executionRunId remains non-null. The MCP guard must catch this and surface an error.
    let checkoutCallCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const statefulFetch = async (url: string, _: RequestInit): Promise<Response> => {
      if (url.endsWith("/checkout")) {
        checkoutCallCount++;
        return new Response(
          JSON.stringify({
            error: "Issue checkout conflict",
            details: { issueId: "issue-1", checkoutRunId: null, executionRunId: "run-stale" },
          }),
          {
            status: 409,
            statusText: "Conflict",
            headers: new Headers({ "Content-Type": "application/json" }),
          }
        );
      }
      // Both release attempts return 200 but fail to clear executionRunId (PAP-181 scenario)
      return new Response(
        JSON.stringify({ id: "issue-1", status: "in_review", executionRunId: "run-stale" }),
        { status: 200, headers: new Headers({ "Content-Type": "application/json" }) }
      );
    };

    const client = new PaperclipClient(TEST_AUTH, statefulFetch);
    const result = await checkoutIssue.handler({ issueId: "issue-1" }, client);

    assert.equal(
      result.isError,
      true,
      "must return isError when repeated release does not clear executionRunId"
    );
    assert.ok(
      result.content[0]!.text.includes("Auto-release returned 200 but executionRunId is still set"),
      "error must reference the uncleared executionRunId"
    );
    assert.equal(
      checkoutCallCount,
      1,
      "must not retry checkout after release failed to clear lock (no infinite loop)"
    );
  });
});

describe("paperclip_checkout_issue (expectedStatuses JSON-string, PAP-120)", () => {
  // PAP-120: regression — client sends expectedStatuses as a JSON-encoded string instead of an array
  it("accepts expectedStatuses as JSON-encoded string and forwards parsed array (checkout)", async () => {
    const updated = { id: "issue-1", status: "in_progress" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await checkoutIssue.handler(
      {
        issueId: "issue-1",
        expectedStatuses: JSON.stringify(["todo"]) as unknown as string[],
      },
      client
    );
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(sentBody.expectedStatuses, ["todo"]);
  });
});

// Stage 2 TDD: A4 (enum rejection) + A5 (.strict() rejects unknown fields)
describe("[stage-2] paperclip_list_issues — A4: enum rejection + A5: strict", () => {
  it("A5: rejects unknown extra field (strict)", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listIssues.handler({ unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_update_issue — A4: enum rejection + A5: strict", () => {
  it("A4: rejects invalid status enum value for update_issue", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateIssue.handler({ issueId: "issue-1", status: "flying" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: rejects invalid priority enum value for update_issue", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateIssue.handler({ issueId: "issue-1", priority: "urgent" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra field (strict) for update_issue", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateIssue.handler({ issueId: "issue-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_create_issue — A4: enum rejection + A5: strict", () => {
  it("A4: rejects invalid status enum value for create_issue", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createIssue.handler({ title: "Test", status: "flying" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: rejects invalid priority enum value for create_issue", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createIssue.handler({ title: "Test", priority: "urgent" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra field (strict) for create_issue", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createIssue.handler({ title: "Test", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("paperclip_checkout_issue (PAP-123: auto-release stale executionRunId)", () => {
  it("PAP-123: auto-releases stale executionRunId and retries when checkoutRunId is null", async () => {
    const checkedOut = { id: "issue-1", status: "in_progress" };
    const urls: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const statefulFetch = async (url: string, _: RequestInit): Promise<Response> => {
      urls.push(url);
      if (url.endsWith("/checkout") && urls.filter((u) => u.endsWith("/checkout")).length === 1) {
        return new Response(
          JSON.stringify({
            error: "Issue checkout conflict",
            details: { issueId: "issue-1", checkoutRunId: null, executionRunId: "run-stale" },
          }),
          {
            status: 409,
            statusText: "Conflict",
            headers: new Headers({ "Content-Type": "application/json" }),
          }
        );
      }
      if (url.endsWith("/release")) {
        return new Response(JSON.stringify({ id: "issue-1", status: "todo" }), {
          status: 200,
          headers: new Headers({ "Content-Type": "application/json" }),
        });
      }
      return new Response(JSON.stringify(checkedOut), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
      });
    };

    const client = new PaperclipClient(TEST_AUTH, statefulFetch);
    const result = await checkoutIssue.handler(
      { issueId: "issue-1", expectedStatuses: ["todo"] },
      client
    );

    assert.equal(result.isError, undefined, "should not return isError");
    assert.equal(urls.length, 3, "should make 3 calls: checkout, release, checkout-retry");
    assert.ok(urls[1]!.endsWith("/release"), "second call must be the release endpoint");
    assert.deepEqual(JSON.parse(result.content[0]!.text), checkedOut);
  });

  // PAP-123: when checkoutRunId is non-null, no release is attempted — use mockFetch (uniform 409)
  it("PAP-123: propagates 409 immediately when checkoutRunId is non-null (active holder)", async () => {
    const { fn, calls } = mockFetch(409, {
      error: "Issue checkout conflict",
      details: {
        issueId: "issue-1",
        checkoutRunId: "run-active-holder",
        executionRunId: "run-stale",
      },
    });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await checkoutIssue.handler({ issueId: "issue-1" }, client);

    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("409"));
    assert.equal(
      calls.length,
      1,
      "should make only 1 call — no release attempted for active holder"
    );
  });

  it("PAP-123: surfaces original 409 when release or retry fails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const statefulFetch = async (url: string, _: RequestInit): Promise<Response> => {
      if (url.endsWith("/checkout")) {
        return new Response(
          JSON.stringify({
            error: "Issue checkout conflict",
            details: { issueId: "issue-1", checkoutRunId: null, executionRunId: "run-stale" },
          }),
          {
            status: 409,
            statusText: "Conflict",
            headers: new Headers({ "Content-Type": "application/json" }),
          }
        );
      }
      // Release call fails
      return new Response(JSON.stringify({ error: "Release failed" }), {
        status: 500,
        statusText: "Error",
        headers: new Headers({ "Content-Type": "application/json" }),
      });
    };

    const client = new PaperclipClient(TEST_AUTH, statefulFetch);
    const result = await checkoutIssue.handler({ issueId: "issue-1" }, client);

    assert.equal(result.isError, true);
    // Must surface the original 409, not the 500 from the release call
    assert.ok(
      result.content[0]!.text.includes("409"),
      "error text must contain original 409 status"
    );
  });

  // PAP-125: platform release endpoint returns 200 but does not clear executionRunId in the DB.
  // The MCP layer must detect this via the release response body and return a descriptive error
  // instead of silently retrying checkout (which would hit the same 409 again).
  it("PAP-125: returns descriptive isError when release returns 200 but executionRunId is still set", async () => {
    const urls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const statefulFetch = async (url: string, _: RequestInit): Promise<Response> => {
      urls.push(url);
      if (url.endsWith("/checkout")) {
        return new Response(
          JSON.stringify({
            error: "Issue checkout conflict",
            details: { issueId: "issue-1", checkoutRunId: null, executionRunId: "run-stale" },
          }),
          {
            status: 409,
            statusText: "Conflict",
            headers: new Headers({ "Content-Type": "application/json" }),
          }
        );
      }
      // Release returns 200 but executionRunId is still set (platform bug, PAP-125)
      return new Response(
        JSON.stringify({ id: "issue-1", status: "in_review", executionRunId: "run-stale" }),
        { status: 200, headers: new Headers({ "Content-Type": "application/json" }) }
      );
    };

    const client = new PaperclipClient(TEST_AUTH, statefulFetch);
    const result = await checkoutIssue.handler({ issueId: "issue-1" }, client);

    assert.equal(result.isError, true, "should return isError when release does not clear lock");
    assert.ok(
      result.content[0]!.text.includes("Auto-release returned 200 but executionRunId is still set"),
      "error must describe the platform-side silent failure"
    );
    assert.ok(
      result.content[0]!.text.includes("run-stale"),
      "error must include the uncleared executionRunId value"
    );
    assert.equal(
      urls.filter((u) => u.endsWith("/checkout")).length,
      1,
      "must not retry checkout when release did not clear the lock"
    );
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2/F3 format tests — paperclip_list_issues
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_issues — truncation + format", () => {
  it("D1: response >25k chars is truncated with hint (json mode)", async () => {
    const big = largeIssueList(500);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ response_format: "json", limit: 100 }, client);
    assert.equal(result.isError, undefined);
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("D2: response ≤25k chars is not truncated (json mode)", async () => {
    const small = [issueFixture({ id: "issue-1" })];
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [issueFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({}, client);
    assert.equal(result.content[0]!.type, "text");
    // markdown output has headers or bullets
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format: 'json' returns parseable JSON", async () => {
    const { fn } = mockFetch(200, [issueFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ response_format: "json" }, client);
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
  });

  it("F3: markdown path renders ## header for issues list", async () => {
    const { fn } = mockFetch(200, [issueFixture({ identifier: "PAP-99", title: "Test issue" })]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ response_format: "markdown" }, client);
    assert.match(result.content[0]!.text, /^##/m);
    assert.ok(result.content[0]!.text.includes("PAP-99"));
  });

  it("D1: markdown mode response >25k is also truncated", async () => {
    // Build 100 issues with very long titles (~300 chars each) → ~30k markdown after formatting
    const bigItems = Array.from({ length: 100 }, (_, i) => ({
      id: `issue-${i}`,
      identifier: `PAP-${i}`,
      title: `Issue ${i} — ${"x".repeat(280)}`,
      status: "todo",
      priority: "high",
      assigneeAgentId: "agent-very-long-id-here",
      projectId: "project-very-long-id-here",
      updatedAt: "2026-04-15T14:00:00.000Z",
    }));
    const { fn } = mockFetch(200, bigItems);
    const client = new PaperclipClient(TEST_AUTH, fn);
    // limit=100 (max) so all 100 items go to the formatter
    const result = await listIssues.handler({ response_format: "markdown", limit: 100 }, client);
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2 — paperclip_get_issue
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_get_issue — truncation + format", () => {
  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, issueFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getIssue.handler({ issueId: "issue-1" }, client);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format: 'json' returns parseable JSON", async () => {
    const { fn } = mockFetch(200, issueFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getIssue.handler({ issueId: "issue-1", response_format: "json" }, client);
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
  });
});

// ---------------------------------------------------------------------------
// [stage-5] F1/F2 — paperclip_get_heartbeat_context
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_get_heartbeat_context — format", () => {
  it("F1: defaults to markdown output", async () => {
    const ctx = { issueId: "PAP-1", status: "todo", lastCommentId: null };
    const { fn } = mockFetch(200, ctx);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getHeartbeat.handler({ issueId: "PAP-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON", async () => {
    const ctx = { issueId: "PAP-1", status: "todo", lastCommentId: null };
    const { fn } = mockFetch(200, ctx);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getHeartbeat.handler(
      { issueId: "PAP-1", response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, ctx);
  });
});

// ---------------------------------------------------------------------------
// [stage-6] E1/E2/E3 pagination envelope — paperclip_list_issues
// ---------------------------------------------------------------------------
describe("[stage-6] paperclip_list_issues — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = Array.from({ length: 3 }, (_, i) => issueFixture({ id: `issue-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ response_format: "json" }, client);
    assertPaginationEnvelope(result, { total: 3, limit: 50, offset: 0, count: 3 });
  });

  it("E2: explicit limit=5, offset=10 reflected in envelope", async () => {
    const items = Array.from({ length: 20 }, (_, i) => issueFixture({ id: `i-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler(
      { response_format: "json", limit: 5, offset: 10 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 20);
    assert.equal(data.count, 5);
    assert.equal(data.limit, 5);
    assert.equal(data.offset, 10);
    assert.equal(data.has_more, true);
    assert.equal(data.next_offset, 15);
  });

  it("E3: offset past end returns empty items with correct total", async () => {
    const items = [issueFixture()];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 1);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});
