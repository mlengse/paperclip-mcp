import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { approvalTools } from "./approvals.js";

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

const listApprovals = approvalTools.find((t) => t.name === "paperclip_list_approvals")!;
const getApproval = approvalTools.find((t) => t.name === "paperclip_get_approval")!;
const createApproval = approvalTools.find((t) => t.name === "paperclip_create_approval")!;
const approve = approvalTools.find((t) => t.name === "paperclip_approve")!;
const reject = approvalTools.find((t) => t.name === "paperclip_reject")!;
const requestRevision = approvalTools.find((t) => t.name === "paperclip_request_revision")!;
const resubmit = approvalTools.find((t) => t.name === "paperclip_resubmit_approval")!;
const listComments = approvalTools.find((t) => t.name === "paperclip_list_approval_comments")!;
const addComment = approvalTools.find((t) => t.name === "paperclip_add_approval_comment")!;
const createHire = approvalTools.find((t) => t.name === "paperclip_create_agent_hire")!;

describe("paperclip_list_approvals", () => {
  it("calls GET /api/companies/{id}/approvals with no filters", async () => {
    const approvals = [{ id: "appr-1", title: "Hire Engineer", status: "pending" }];
    const { fn, calls } = mockFetch(200, approvals);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler({}, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/approvals");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(approvals) }] });
  });

  it("appends status filter when provided", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await listApprovals.handler({ status: "pending,approved" }, client);
    assert.ok(
      calls[0]!.url.includes("status=pending%2Capproved"),
      `URL missing status param: ${calls[0]!.url}`
    );
  });

  it("returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_get_approval", () => {
  it("calls GET /api/approvals/{id} and returns approval data", async () => {
    const approval = { id: "appr-1", title: "Hire Engineer", status: "pending" };
    const { fn, calls } = mockFetch(200, approval);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getApproval.handler({ approvalId: "appr-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(approval) }] });
  });

  it("throws McpError when approvalId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getApproval.handler({ approvalId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Approval not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getApproval.handler({ approvalId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_create_approval", () => {
  it("calls POST /api/companies/{id}/approvals with type and payload", async () => {
    const created = { id: "appr-new", type: "hire_agent", status: "pending" };
    const { fn, calls } = mockFetch(201, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createApproval.handler(
      { type: "hire_agent", payload: { name: "Alice", role: "engineer" } },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/approvals");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.type, "hire_agent");
    assert.deepEqual(body.payload, { name: "Alice", role: "engineer" });
    assert.equal(body.title, undefined);
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(created) }] });
  });

  it("includes requestedByAgentId when provided", async () => {
    const created = { id: "appr-new", type: "budget_override_required", status: "pending" };
    const { fn, calls } = mockFetch(201, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createApproval.handler(
      {
        type: "budget_override_required",
        payload: { amount: 500 },
        requestedByAgentId: "agent-99",
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.requestedByAgentId, "agent-99");
  });

  it("throws McpError when type is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createApproval.handler({ payload: {} }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("throws McpError when type is invalid enum value (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createApproval.handler({ type: "invalid_type", payload: {} }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 422 API error", async () => {
    const { fn } = mockFetch(422, { error: "Validation error", details: [{ path: ["type"], message: "Required" }] });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createApproval.handler(
      { type: "approve_ceo_strategy", payload: { strategy: "grow" } },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("422"));
  });
});

describe("paperclip_approve", () => {
  it("calls POST /api/approvals/{id}/approve and returns result", async () => {
    const updated = { id: "appr-1", status: "approved" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await approve.handler({ approvalId: "appr-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1/approve");
    assert.equal(calls[0]!.init.method, "POST");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
  });

  it("throws McpError when approvalId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => approve.handler({ approvalId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 409 API error (already approved)", async () => {
    const { fn } = mockFetch(409, { message: "Already approved" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await approve.handler({ approvalId: "appr-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("409"));
  });
});

describe("paperclip_reject", () => {
  it("calls POST /api/approvals/{id}/reject with optional reason", async () => {
    const updated = { id: "appr-1", status: "rejected" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await reject.handler({ approvalId: "appr-1", reason: "Not ready" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1/reject");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.reason, "Not ready");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
  });

  it("throws McpError when approvalId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => reject.handler({ approvalId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Approval not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await reject.handler({ approvalId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_request_revision", () => {
  it("calls POST /api/approvals/{id}/request-revision with optional feedback", async () => {
    const updated = { id: "appr-1", status: "revision_requested" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await requestRevision.handler(
      { approvalId: "appr-1", feedback: "Need more tests" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1/request-revision");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.feedback, "Need more tests");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
  });

  it("throws McpError when approvalId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => requestRevision.handler({ approvalId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Approval not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await requestRevision.handler({ approvalId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_resubmit_approval", () => {
  it("calls POST /api/approvals/{id}/resubmit with optional comment", async () => {
    const updated = { id: "appr-1", status: "pending" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await resubmit.handler(
      { approvalId: "appr-1", comment: "Added more tests" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1/resubmit");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.comment, "Added more tests");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
  });

  it("throws McpError when approvalId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => resubmit.handler({ approvalId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Approval not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await resubmit.handler({ approvalId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_list_approval_comments", () => {
  it("calls GET /api/approvals/{id}/comments and returns comments", async () => {
    const comments = [{ id: "cmt-1", body: "Looks good" }];
    const { fn, calls } = mockFetch(200, comments);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler({ approvalId: "appr-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1/comments");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(comments) }] });
  });

  it("throws McpError when approvalId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listComments.handler({ approvalId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Approval not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler({ approvalId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_add_approval_comment", () => {
  it("calls POST /api/approvals/{id}/comments with body", async () => {
    const created = { id: "cmt-new", body: "Approved!" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addComment.handler({ approvalId: "appr-1", body: "Approved!" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1/comments");
    assert.equal(calls[0]!.init.method, "POST");
    const reqBody = JSON.parse(calls[0]!.init.body as string);
    assert.equal(reqBody.body, "Approved!");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(created) }] });
  });

  it("throws McpError when body is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => addComment.handler({ approvalId: "appr-1", body: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Approval not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await addComment.handler({ approvalId: "missing", body: "Hi" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_create_agent_hire", () => {
  it("calls POST /api/companies/{id}/agent-hires with required and optional fields", async () => {
    const created = { id: "hire-1", name: "Alice", role: "engineer", status: "pending" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createHire.handler(
      { name: "Alice", role: "engineer", title: "Senior Engineer", goalId: "goal-1" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/agent-hires");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "Alice");
    assert.equal(body.role, "engineer");
    assert.equal(body.title, "Senior Engineer");
    assert.equal(body.goalId, "goal-1");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(created) }] });
  });

  it("throws McpError when role is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createHire.handler({ name: "Alice", role: "" }, client),
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
    const result = await createHire.handler({ name: "Bob", role: "qa" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });
});
