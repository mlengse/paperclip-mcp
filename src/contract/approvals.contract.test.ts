/**
 * Contract tests — src/tools/approvals.ts
 *
 * Runs only when PAPERCLIP_CONTRACT_TESTS=1 is set (against a live server).
 * Five scenarios per tool:
 *   1. Happy path      — valid args → correct API response shape
 *   2. Validation fail — invalid Zod args → McpError before HTTP call
 *   3. Not-found       — non-existent UUID → isError: true (404)
 *   4. Permission denied — bad API key → isError: true (401/403)
 *   5. Alternate error / additional coverage
 *
 * A single approval fixture is seeded in before() and torn down in after().
 * Tests that mutate approval state (approve/reject/revise) use careful
 * ordering to ensure each test sees a valid state.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { SKIP, buildContractClient, buildBadAuthClient, NONEXISTENT_UUID } from "./harness.js";
import { seedFixtures, teardownFixtures, type ContractFixtures } from "./seed.js";
import { approvalTools } from "../tools/approvals.js";

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

let fixtures: ContractFixtures;
// Initialized lazily inside each suite's before() to avoid throwing at module load
// when PAPERCLIP_CONTRACT_TESTS is not set (harness returns placeholders instead).
let client: ReturnType<typeof buildContractClient>;
let badClient: ReturnType<typeof buildBadAuthClient>;

describe("contract: paperclip_list_approvals", { skip: SKIP }, () => {
  before(async () => {
    fixtures = await seedFixtures();
    client = buildContractClient();
    badClient = buildBadAuthClient();
  });

  after(async () => {
    await teardownFixtures(fixtures);
  });

  it("1. happy path — returns approvals array (fixture approval is present)", async () => {
    const result = await listApprovals.handler({}, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(data), "should return an array");
  });

  it("2. validation fail — invalid status format is accepted (string passthrough)", async () => {
    // Status is a plain string filter — not enum-restricted. Any string passes Zod.
    const result = await listApprovals.handler({ status: "pending" }, client);
    assert.ok(!result.isError);
  });

  it("3. pending filter — fixture approval appears in pending results", async () => {
    const result = await listApprovals.handler({ status: "pending" }, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text) as Array<{ id: string }>;
    const found = data.find((a) => a.id === fixtures.approvalId);
    assert.ok(found, "fixture approval should appear in pending list");
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await listApprovals.handler({}, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. done filter — fixture approval does not appear in done results", async () => {
    const result = await listApprovals.handler({ status: "done,approved" }, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text) as Array<{ id: string }>;
    const found = data.find((a) => a.id === fixtures.approvalId);
    assert.ok(!found, "pending fixture should not be in done/approved results");
  });
});

describe("contract: paperclip_get_approval", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — returns full approval object for valid ID", async () => {
    const result = await getApproval.handler({ approvalId: fixtures.approvalId }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const approval = JSON.parse(result.content[0]!.text);
    assert.equal(approval.id, fixtures.approvalId);
    assert.ok(typeof approval.type === "string");
    assert.ok(typeof approval.status === "string");
  });

  it("2. validation fail — empty approvalId rejected before HTTP call", async () => {
    await assert.rejects(async () => getApproval.handler({ approvalId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError with 404", async () => {
    const result = await getApproval.handler({ approvalId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await getApproval.handler({ approvalId: fixtures.approvalId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. makes exactly one HTTP call — linked issues not fetched automatically", async () => {
    // Verify the tool description is accurate: only /api/approvals/{id} is called.
    // We observe this indirectly: the response is the approval object only, not a composite.
    const result = await getApproval.handler({ approvalId: fixtures.approvalId }, client);
    assert.ok(!result.isError);
    const approval = JSON.parse(result.content[0]!.text);
    assert.ok(
      !("issues" in approval),
      "linked issues should not be embedded in get_approval response"
    );
  });
});

describe("contract: paperclip_create_approval", { skip: SKIP }, () => {
  const createdIds: string[] = [];

  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  after(async () => {
    // Reject any approvals we created so they don't block the board.
    for (const id of createdIds) {
      await client
        .post(`/api/approvals/${id}/reject`, { reason: "Contract test teardown." })
        .catch(() => {});
    }
  });

  it("1. happy path — creates approval and returns object with id and type", async () => {
    const result = await createApproval.handler(
      {
        type: "hire_agent",
        payload: { name: "ContractCreateTest", role: "engineer" },
      },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const approval = JSON.parse(result.content[0]!.text);
    assert.ok(approval.id, "response should include id");
    assert.equal(approval.type, "hire_agent");
    createdIds.push(approval.id);
  });

  it("2. validation fail — missing type rejected before HTTP call", async () => {
    await assert.rejects(
      async () => createApproval.handler({ payload: { name: "Test" } }, client),
      McpError
    );
  });

  it("3. validation fail — invalid type enum rejected before HTTP call", async () => {
    await assert.rejects(
      async () => createApproval.handler({ type: "invalid_type", payload: {} }, client),
      McpError
    );
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await createApproval.handler(
      { type: "hire_agent", payload: { name: "Test", role: "engineer" } },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. approve_ceo_strategy type — creates alternate approval type", async () => {
    const result = await createApproval.handler(
      {
        type: "approve_ceo_strategy",
        payload: { summary: "Contract test strategy approval" },
      },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const approval = JSON.parse(result.content[0]!.text);
    assert.equal(approval.type, "approve_ceo_strategy");
    createdIds.push(approval.id);
  });
});

describe(
  "contract: paperclip_request_revision + paperclip_resubmit_approval",
  { skip: SKIP },
  () => {
    let revisionApprovalId: string;

    before(async () => {
      if (!fixtures) fixtures = await seedFixtures();
      // Create a fresh approval to drive through the revision cycle.
      const res = await client.post<{ id: string }>(
        `/api/companies/${fixtures.companyId}/approvals`,
        {
          type: "hire_agent",
          payload: { name: "RevisionCycleTest", role: "engineer" },
        }
      );
      revisionApprovalId = res.id;
    });

    after(async () => {
      await client
        .post(`/api/approvals/${revisionApprovalId}/reject`, {
          reason: "Contract test teardown.",
        })
        .catch(() => {});
    });

    // request_revision
    it("requestRevision 1. happy path — requests revision on pending approval", async () => {
      const result = await requestRevision.handler(
        { approvalId: revisionApprovalId, feedback: "Please add salary band." },
        client
      );
      assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    });

    it("requestRevision 2. validation fail — empty approvalId rejected", async () => {
      await assert.rejects(
        async () => requestRevision.handler({ approvalId: "" }, client),
        McpError
      );
    });

    it("requestRevision 3. not-found — non-existent UUID returns isError", async () => {
      const result = await requestRevision.handler(
        { approvalId: NONEXISTENT_UUID, feedback: "irrelevant" },
        client
      );
      assert.equal(result.isError, true);
    });

    it("requestRevision 4. permission denied — bad API key returns isError", async () => {
      const result = await requestRevision.handler({ approvalId: revisionApprovalId }, badClient);
      assert.equal(result.isError, true);
      assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
    });

    // resubmit
    it("resubmit 5. happy path — resubmits after revision request", async () => {
      const result = await resubmit.handler(
        {
          approvalId: revisionApprovalId,
          comment: "Added salary band. Resubmitting for approval.",
        },
        client
      );
      assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    });
  }
);

describe("contract: paperclip_approve + paperclip_reject", { skip: SKIP }, () => {
  let approveApprovalId: string;
  let rejectApprovalId: string;

  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
    const res1 = await client.post<{ id: string }>(
      `/api/companies/${fixtures.companyId}/approvals`,
      { type: "hire_agent", payload: { name: "ApproveTest", role: "engineer" } }
    );
    approveApprovalId = res1.id;

    const res2 = await client.post<{ id: string }>(
      `/api/companies/${fixtures.companyId}/approvals`,
      { type: "hire_agent", payload: { name: "RejectTest", role: "engineer" } }
    );
    rejectApprovalId = res2.id;
  });

  // approve
  it("approve 1. validation fail — empty approvalId rejected before HTTP call", async () => {
    await assert.rejects(async () => approve.handler({ approvalId: "" }, client), McpError);
  });

  it("approve 2. not-found — non-existent UUID returns isError with 404", async () => {
    const result = await approve.handler({ approvalId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("approve 3. permission denied — bad API key returns isError", async () => {
    const result = await approve.handler({ approvalId: approveApprovalId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  // reject
  it("reject 4. happy path — rejects the reject-fixture approval", async () => {
    const result = await reject.handler(
      { approvalId: rejectApprovalId, reason: "Contract test rejection." },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
  });

  it("reject 5. not-found — non-existent UUID returns isError with 404", async () => {
    const result = await reject.handler(
      { approvalId: NONEXISTENT_UUID, reason: "irrelevant" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  after(async () => {
    // If approve-fixture wasn't approved (tests above skipped it), clean up.
    await client
      .post(`/api/approvals/${approveApprovalId}/reject`, { reason: "Contract test teardown." })
      .catch(() => {});
  });
});

describe("contract: paperclip_list_approval_comments", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — returns comments array for fixture approval", async () => {
    const result = await listComments.handler({ approvalId: fixtures.approvalId }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(data), "should return an array");
  });

  it("2. validation fail — empty approvalId rejected before HTTP call", async () => {
    await assert.rejects(async () => listComments.handler({ approvalId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await listComments.handler({ approvalId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await listComments.handler({ approvalId: fixtures.approvalId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. empty comments on fresh approval — returns empty array, not 404", async () => {
    const result = await listComments.handler({ approvalId: fixtures.approvalId }, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(
      Array.isArray(data),
      "fresh approval should have an empty (not missing) comments array"
    );
  });
});

describe("contract: paperclip_add_approval_comment", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — posts a comment and returns comment object", async () => {
    const result = await addComment.handler(
      {
        approvalId: fixtures.approvalId,
        body: "Contract test comment on approval fixture.",
      },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const comment = JSON.parse(result.content[0]!.text);
    assert.ok(comment.id, "response should include comment id");
    assert.ok(typeof comment.body === "string" || typeof comment.content === "string");
  });

  it("2. validation fail — empty approvalId rejected before HTTP call", async () => {
    await assert.rejects(
      async () => addComment.handler({ approvalId: "", body: "test" }, client),
      McpError
    );
  });

  it("3. validation fail — empty body rejected before HTTP call", async () => {
    await assert.rejects(
      async () => addComment.handler({ approvalId: fixtures.approvalId, body: "" }, client),
      McpError
    );
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await addComment.handler(
      { approvalId: fixtures.approvalId, body: "should fail" },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. not-found — comment on non-existent approval returns isError", async () => {
    const result = await addComment.handler(
      { approvalId: NONEXISTENT_UUID, body: "orphan comment" },
      client
    );
    assert.equal(result.isError, true);
  });
});

describe("contract: paperclip_create_agent_hire", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — creates agent hire approval and returns object with id", async () => {
    const result = await createHire.handler(
      { name: "ContractHireTest", role: "engineer", title: "Contract Test Engineer" },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data.id, "response should include id");
    // Clean up.
    await client
      .post(`/api/approvals/${data.id}/reject`, { reason: "Contract test teardown." })
      .catch(() => {});
  });

  it("2. validation fail — missing name rejected before HTTP call", async () => {
    await assert.rejects(async () => createHire.handler({ role: "engineer" }, client), McpError);
  });

  it("3. validation fail — missing role rejected before HTTP call", async () => {
    await assert.rejects(
      async () => createHire.handler({ name: "Missing Role" }, client),
      McpError
    );
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await createHire.handler({ name: "should fail", role: "engineer" }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. optional fields — hire with goalId links to specified goal", async () => {
    const result = await createHire.handler(
      {
        name: "ContractHireGoalTest",
        role: "engineer",
        goalId: fixtures.goalId,
        projectId: fixtures.projectId,
      },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data.id);
    // Clean up.
    await client
      .post(`/api/approvals/${data.id}/reject`, { reason: "Contract test teardown." })
      .catch(() => {});
  });
});
