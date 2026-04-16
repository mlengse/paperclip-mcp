/**
 * Contract tests — src/tools/issues.ts
 *
 * Runs only when PAPERCLIP_CONTRACT_TESTS=1 is set (against a live server).
 * Five scenarios per tool:
 *   1. Happy path      — valid args → correct API response shape
 *   2. Validation fail — invalid Zod args → McpError before HTTP call
 *   3. Not-found       — non-existent UUID → isError: true (404)
 *   4. Permission denied — bad API key → isError: true (401/403)
 *   5. Bad-payload / alternate error — server rejects semantically invalid input
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { SKIP, buildContractClient, buildBadAuthClient, NONEXISTENT_UUID } from "./harness.js";
import { seedFixtures, teardownFixtures, type ContractFixtures } from "./seed.js";
import { issueTools } from "../tools/issues.js";

const listIssues = issueTools.find((t) => t.name === "paperclip_list_issues")!;
const getIssue = issueTools.find((t) => t.name === "paperclip_get_issue")!;
const getHeartbeat = issueTools.find((t) => t.name === "paperclip_get_heartbeat_context")!;
const checkoutIssue = issueTools.find((t) => t.name === "paperclip_checkout_issue")!;
const releaseIssue = issueTools.find((t) => t.name === "paperclip_release_issue")!;
const updateIssue = issueTools.find((t) => t.name === "paperclip_update_issue")!;
const createIssue = issueTools.find((t) => t.name === "paperclip_create_issue")!;

let fixtures: ContractFixtures;
// Initialized lazily inside each suite's before() to avoid throwing at module load
// when PAPERCLIP_CONTRACT_TESTS is not set (harness returns placeholders instead).
let client: ReturnType<typeof buildContractClient>;
let badClient: ReturnType<typeof buildBadAuthClient>;

describe("contract: paperclip_list_issues", { skip: SKIP }, () => {
  before(async () => {
    fixtures = await seedFixtures();
    client = buildContractClient();
    badClient = buildBadAuthClient();
  });

  after(async () => {
    await teardownFixtures(fixtures);
  });

  it("1. happy path — returns issues array with pagination envelope", async () => {
    const result = await listIssues.handler({ limit: 5, offset: 0 }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(data.issues), "issues should be an array");
    assert.ok(typeof data.total === "number", "total should be a number");
    assert.equal(data.limit, 5);
    assert.equal(data.offset, 0);
  });

  it("2. validation fail — limit out of range rejected before HTTP call", async () => {
    await assert.rejects(async () => listIssues.handler({ limit: 9999 }, client), McpError);
  });

  it("3. not-found equivalent — filter by non-existent projectId returns empty", async () => {
    const result = await listIssues.handler({ projectId: NONEXISTENT_UUID, limit: 1 }, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(data.issues));
    assert.equal(data.total, 0);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await listIssues.handler({}, badClient);
    assert.equal(result.isError, true);
    assert.ok(
      result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"),
      `Expected auth error, got: ${result.content[0]?.text}`
    );
  });

  it("5. bad filter value — offset below 0 rejected by Zod", async () => {
    await assert.rejects(async () => listIssues.handler({ offset: -1 }, client), McpError);
  });
});

describe("contract: paperclip_get_issue", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — returns full issue object for valid ID", async () => {
    const result = await getIssue.handler({ issueId: fixtures.issueId }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const issue = JSON.parse(result.content[0]!.text);
    assert.equal(issue.id, fixtures.issueId);
    assert.ok(typeof issue.title === "string");
    assert.ok(typeof issue.status === "string");
  });

  it("2. validation fail — empty issueId rejected before HTTP call", async () => {
    await assert.rejects(async () => getIssue.handler({ issueId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError with 404", async () => {
    const result = await getIssue.handler({ issueId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await getIssue.handler({ issueId: fixtures.issueId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. identifier lookup — supports PAP-style identifier strings", async () => {
    // Get the identifier from the fixture issue first.
    const res = await getIssue.handler({ issueId: fixtures.issueId }, client);
    const issue = JSON.parse(res.content[0]!.text);
    const identifier = issue.identifier as string;
    assert.ok(identifier, "issue should have an identifier");

    // Now look up by identifier string.
    const result = await getIssue.handler({ issueId: identifier }, client);
    assert.ok(!result.isError);
    const found = JSON.parse(result.content[0]!.text);
    assert.equal(found.id, fixtures.issueId);
  });
});

describe("contract: paperclip_get_heartbeat_context", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — returns compact heartbeat context for valid issue", async () => {
    const result = await getHeartbeat.handler({ issueId: fixtures.issueId }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const ctx = JSON.parse(result.content[0]!.text);
    assert.ok(ctx.issue, "context should include issue");
    assert.ok(ctx.commentCursor !== undefined, "context should include commentCursor");
  });

  it("2. validation fail — empty issueId rejected before HTTP call", async () => {
    await assert.rejects(async () => getHeartbeat.handler({ issueId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError with 404", async () => {
    const result = await getHeartbeat.handler({ issueId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await getHeartbeat.handler({ issueId: fixtures.issueId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. context includes goal and project when linked", async () => {
    const result = await getHeartbeat.handler({ issueId: fixtures.issueId }, client);
    assert.ok(!result.isError);
    const ctx = JSON.parse(result.content[0]!.text);
    assert.ok(ctx.goal, "context should include goal when issue is linked to one");
    assert.ok(ctx.project, "context should include project when issue is linked to one");
  });
});

describe("contract: paperclip_checkout_issue", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — checks out fixture issue and transitions status to in_progress", async () => {
    const result = await checkoutIssue.handler(
      { issueId: fixtures.issueId2, expectedStatuses: ["todo"] },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.status, "in_progress");
  });

  it("2. validation fail — missing issueId rejected before HTTP call", async () => {
    await assert.rejects(async () => checkoutIssue.handler({}, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await checkoutIssue.handler({ issueId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await checkoutIssue.handler({ issueId: fixtures.issueId2 }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. status mismatch — expectedStatuses rejection returns isError", async () => {
    // issueId2 is now in_progress from test 1; checking out with expectedStatuses: ['backlog'] should fail.
    const result = await checkoutIssue.handler(
      { issueId: fixtures.issueId2, expectedStatuses: ["backlog"] },
      client
    );
    assert.equal(result.isError, true);
  });

  after(async () => {
    // Release issueId2 so teardown can cancel it cleanly.
    await releaseIssue.handler({ issueId: fixtures.issueId2 }, client).catch(() => {});
  });
});

describe("contract: paperclip_release_issue", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
    // Ensure issueId2 is checked out so we have something to release.
    await checkoutIssue.handler({ issueId: fixtures.issueId2 }, client).catch(() => {});
  });

  it("1. happy path — releases a checked-out issue", async () => {
    const result = await releaseIssue.handler({ issueId: fixtures.issueId2 }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data.id, "response should include issue id");
  });

  it("2. validation fail — empty issueId rejected before HTTP call", async () => {
    await assert.rejects(async () => releaseIssue.handler({ issueId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await releaseIssue.handler({ issueId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await releaseIssue.handler({ issueId: fixtures.issueId2 }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. idempotent release — releasing an already-released issue does not error", async () => {
    // issueId2 was already released in test 1. Releasing again should be safe.
    const result = await releaseIssue.handler({ issueId: fixtures.issueId2 }, client);
    // Either success or a graceful API error — must not throw.
    assert.ok(result.content.length > 0);
  });
});

describe("contract: paperclip_update_issue", { skip: SKIP }, () => {
  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  it("1. happy path — updates issue title and returns updated object", async () => {
    const newTitle = "CONTRACT-TEST-ISSUE-1-updated";
    const result = await updateIssue.handler(
      { issueId: fixtures.issueId, title: newTitle },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.title, newTitle);
  });

  it("2. validation fail — missing issueId rejected before HTTP call", async () => {
    await assert.rejects(
      async () => updateIssue.handler({ title: "no id here" }, client),
      McpError
    );
  });

  it("3. not-found — update on non-existent UUID returns isError", async () => {
    const result = await updateIssue.handler({ issueId: NONEXISTENT_UUID, title: "ghost" }, client);
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await updateIssue.handler(
      { issueId: fixtures.issueId, title: "should fail" },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. adds comment alongside status update", async () => {
    const result = await updateIssue.handler(
      {
        issueId: fixtures.issueId,
        status: "backlog",
        comment: "Contract test comment — status reset to backlog.",
      },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.status, "backlog");
  });
});

describe("contract: paperclip_create_issue", { skip: SKIP }, () => {
  const createdIds: string[] = [];

  before(async () => {
    if (!fixtures) fixtures = await seedFixtures();
  });

  after(async () => {
    // Cancel all issues created during this suite.
    const c = buildContractClient();
    for (const id of createdIds) {
      await c.patch(`/api/issues/${id}`, { status: "cancelled" }).catch(() => {});
    }
  });

  it("1. happy path — creates issue and returns object with id", async () => {
    const result = await createIssue.handler(
      {
        title: "CONTRACT-CREATE-TEST",
        status: "backlog",
        priority: "low",
        projectId: fixtures.projectId,
        goalId: fixtures.goalId,
      },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data.id, "response should include id");
    assert.equal(data.title, "CONTRACT-CREATE-TEST");
    createdIds.push(data.id);
  });

  it("2. validation fail — missing title rejected before HTTP call", async () => {
    await assert.rejects(async () => createIssue.handler({ status: "todo" }, client), McpError);
  });

  it("3. not-found equivalent — invalid projectId returns isError", async () => {
    const result = await createIssue.handler(
      { title: "bad-project-test", projectId: NONEXISTENT_UUID },
      client
    );
    // Server may return 400 or 404 for an unknown project — either is an error.
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await createIssue.handler({ title: "should fail" }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. subtask creation — parentId links issue as child", async () => {
    const result = await createIssue.handler(
      {
        title: "CONTRACT-SUBTASK-TEST",
        status: "backlog",
        priority: "low",
        parentId: fixtures.issueId,
        goalId: fixtures.goalId,
        projectId: fixtures.projectId,
      },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.parentId, fixtures.issueId);
    createdIds.push(data.id);
  });
});
