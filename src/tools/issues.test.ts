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
    assert.deepEqual(result, { content: [{ type: "text", text: "[]" }] });
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
  it("calls POST /api/issues/{id}/checkout with optional expectedStatuses", async () => {
    const updated = { id: "issue-1", status: "in_progress" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await checkoutIssue.handler(
      { issueId: "issue-1", expectedStatuses: ["todo"] },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/issues/issue-1/checkout");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(calls[0]!.init.body, JSON.stringify({ expectedStatuses: ["todo"] }));
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
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
});
