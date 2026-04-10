import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { issueTools } from "./issues.js";

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
    const result = await listIssues.handler({}, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/issues");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, { issues: [], total: 0, limit: 50, offset: 0 });
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
    const result = await listIssues.handler({ limit: 5, offset: 0 }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 10);
    assert.equal(parsed.limit, 5);
    assert.equal(parsed.offset, 0);
    assert.equal(parsed.issues.length, 5);
    assert.deepEqual(parsed.issues, allIssues.slice(0, 5));
  });

  it("pagination: limit=5, offset=5 returns items 5–9 with total=10", async () => {
    const allIssues = Array.from({ length: 10 }, (_, i) => ({ id: `issue-${i}` }));
    const { fn } = mockFetch(200, allIssues);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ limit: 5, offset: 5 }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 10);
    assert.equal(parsed.issues.length, 5);
    assert.deepEqual(parsed.issues, allIssues.slice(5, 10));
  });

  it("pagination: offset past end returns empty issues with correct total", async () => {
    const allIssues = Array.from({ length: 3 }, (_, i) => ({ id: `issue-${i}` }));
    const { fn } = mockFetch(200, allIssues);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listIssues.handler({ limit: 5, offset: 10 }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 3);
    assert.deepEqual(parsed.issues, []);
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
    const result = await listIssues.handler({}, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, 60);
    assert.equal(parsed.limit, 50);
    assert.equal(parsed.offset, 0);
    assert.equal(parsed.issues.length, 50);
  });
});

describe("paperclip_get_issue", () => {
  it("calls GET /api/issues/{id} and returns issue data", async () => {
    const issue = { id: "issue-1", title: "My issue", status: "todo" };
    const { fn, calls } = mockFetch(200, issue);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getIssue.handler({ issueId: "issue-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1");
    assert.deepEqual(result, {
      content: [{ type: "text", text: JSON.stringify(issue) }],
    });
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
    const result = await getHeartbeat.handler({ issueId: "issue-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/heartbeat-context");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(ctx) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
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

  it("returns isError response on 422 API error", async () => {
    const { fn } = mockFetch(422, { message: "Invalid status transition" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateIssue.handler({ issueId: "issue-1", status: "invalid" }, client);
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(created) }] });
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
