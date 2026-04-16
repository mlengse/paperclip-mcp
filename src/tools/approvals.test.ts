import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { approvalTools } from "./approvals.js";
import { approvalFixture, largeApprovalList } from "../test/helpers/fixtures.js";

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
    const result = await listApprovals.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/approvals");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, approvals);
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
    const result = await getApproval.handler(
      { approvalId: "appr-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, approval);
  });

  it("makes exactly one HTTP call (linked issues are not fetched)", async () => {
    const approval = { id: "appr-1", status: "pending" };
    const { fn, calls } = mockFetch(200, approval);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await getApproval.handler({ approvalId: "appr-1" }, client);
    assert.equal(calls.length, 1, "expected exactly one API call — no linked-issues endpoint");
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
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, created);
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
    const { fn } = mockFetch(422, {
      error: "Validation error",
      details: [{ path: ["type"], message: "Required" }],
    });
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
    const parsed0 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed0, updated);
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
    const parsed1 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed1, updated);
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
    const parsed2 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed2, updated);
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
    const parsed3 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed3, updated);
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
    const result = await listComments.handler(
      { approvalId: "appr-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/approvals/appr-1/comments");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, comments);
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
    const parsedApprComment = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedApprComment, created);
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
    const parsedHire = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedHire, created);
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

// Stage 2 TDD: A4 (enum rejection) + A5 (.strict() rejects unknown fields)
describe("[stage-2] paperclip_create_approval — A4: ApprovalTypeSchema + A5: strict", () => {
  it("A4: rejects invalid approval type enum value", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createApproval.handler({ type: "invalid_type", payload: { foo: "bar" } }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: accepts valid approval type hire_agent", async () => {
    const created = { id: "appr-1", type: "hire_agent" };
    const { fn } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createApproval.handler(
      { type: "hire_agent", payload: { name: "Alice" } },
      client
    );
    assert.equal(result.isError, undefined);
  });

  it("A5: rejects unknown extra field (strict) for create_approval", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        createApproval.handler({ type: "hire_agent", payload: {}, unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2 — paperclip_list_approvals
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_approvals — truncation + format", () => {
  it("D1: response >25k chars is truncated with hint", async () => {
    const big = largeApprovalList(300);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler({ response_format: "json" }, client);
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("D2: small response is not truncated", async () => {
    const small = [approvalFixture()];
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [approvalFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON array", async () => {
    const approvals = [approvalFixture()];
    const { fn } = mockFetch(200, approvals);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, approvals);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] F1/F2 — paperclip_get_approval
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_get_approval — format", () => {
  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, approvalFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getApproval.handler({ approvalId: "appr-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON object", async () => {
    const approval = approvalFixture();
    const { fn } = mockFetch(200, approval);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getApproval.handler(
      { approvalId: "appr-1", response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, approval);
  });
});

// ---------------------------------------------------------------------------
// [stage-6] E1/E2/E3 pagination envelope — list_approvals / list_approval_comments
// ---------------------------------------------------------------------------
describe("[stage-6] paperclip_list_approvals — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = Array.from({ length: 3 }, (_, i) => approvalFixture({ id: `appr-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler({ response_format: "json" }, client);
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
    const items = Array.from({ length: 4 }, (_, i) => approvalFixture({ id: `a-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler(
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
    const items = [approvalFixture()];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listApprovals.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});

describe("[stage-6] paperclip_list_approval_comments — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [{ id: "cmt-1", body: "Looks good", authorId: "user-1" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler(
      { approvalId: "appr-1", response_format: "json" },
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
    const items = [{ id: "cmt-1", body: "Looks good" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listComments.handler(
      { approvalId: "appr-1", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});
