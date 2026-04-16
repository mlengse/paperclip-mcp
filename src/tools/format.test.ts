import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCharLimit,
  formatJson,
  formatAgentList,
  formatIssueList,
  formatDashboard,
  formatOrgChart,
  paginate,
} from "./format.js";
import { CHARACTER_LIMIT } from "../constants.js";

// ---------------------------------------------------------------------------
// [stage-6] paginate helper
// ---------------------------------------------------------------------------
describe("[stage-6] paginate", () => {
  it("E0a: empty list returns total=0, count=0, has_more=false", () => {
    const result = paginate([], {});
    assert.equal(result.total, 0);
    assert.equal(result.count, 0);
    assert.equal(result.has_more, false);
    assert.equal(result.next_offset, undefined);
    assert.deepEqual(result.items, []);
  });

  it("E0b: single page (items < limit) returns has_more=false", () => {
    const items = [1, 2, 3];
    const result = paginate(items, { limit: 50, offset: 0 });
    assert.equal(result.total, 3);
    assert.equal(result.count, 3);
    assert.equal(result.has_more, false);
    assert.equal(result.next_offset, undefined);
    assert.deepEqual(result.items, [1, 2, 3]);
  });

  it("E0c: multi-page middle returns has_more=true, next_offset correct", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const result = paginate(items, { limit: 10, offset: 0 });
    assert.equal(result.total, 100);
    assert.equal(result.count, 10);
    assert.equal(result.has_more, true);
    assert.equal(result.next_offset, 10);
  });

  it("E0d: end of list (offset + limit > total) returns has_more=false", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const result = paginate(items, { limit: 10, offset: 20 });
    assert.equal(result.total, 25);
    assert.equal(result.count, 5);
    assert.equal(result.has_more, false);
    assert.equal(result.next_offset, undefined);
  });

  it("E0e: offset past end returns count=0, items=[]", () => {
    const items = [1, 2, 3];
    const result = paginate(items, { limit: 10, offset: 100 });
    assert.equal(result.total, 3);
    assert.equal(result.count, 0);
    assert.equal(result.has_more, false);
    assert.deepEqual(result.items, []);
  });

  it("E0f: limit and offset are reflected in the envelope", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const result = paginate(items, { limit: 10, offset: 20 });
    assert.equal(result.limit, 10);
    assert.equal(result.offset, 20);
  });
});

// ---------------------------------------------------------------------------
// applyCharLimit
// ---------------------------------------------------------------------------
describe("applyCharLimit", () => {
  it("returns text unchanged when at or below CHARACTER_LIMIT", () => {
    const text = "x".repeat(CHARACTER_LIMIT);
    const result = applyCharLimit(text, "use filters");
    assert.equal(result, text);
  });

  it("truncates text above CHARACTER_LIMIT and appends hint", () => {
    const text = "x".repeat(CHARACTER_LIMIT + 1000);
    const result = applyCharLimit(text, "use filters to narrow results");
    assert.ok(result.length < CHARACTER_LIMIT);
    assert.ok(result.toLowerCase().includes("truncated"));
    assert.ok(result.includes("use filters to narrow results"));
  });

  it("truncation keeps the hint in the output", () => {
    const hint = "pass offset param";
    const text = "x".repeat(CHARACTER_LIMIT + 5000);
    const result = applyCharLimit(text, hint);
    assert.ok(result.includes(hint));
  });
});

// ---------------------------------------------------------------------------
// formatJson
// ---------------------------------------------------------------------------
describe("formatJson", () => {
  it("returns a pretty-printed JSON string", () => {
    const data = { id: "issue-1", title: "Test" };
    const result = formatJson(data);
    assert.doesNotThrow(() => JSON.parse(result));
    const parsed = JSON.parse(result);
    assert.deepEqual(parsed, data);
    // Pretty-printed: should have newlines
    assert.ok(result.includes("\n"));
  });

  it("handles arrays", () => {
    const data = [{ id: "a" }, { id: "b" }];
    const result = formatJson(data);
    assert.doesNotThrow(() => JSON.parse(result));
    assert.deepEqual(JSON.parse(result), data);
  });
});

// ---------------------------------------------------------------------------
// formatAgentList
// ---------------------------------------------------------------------------
describe("formatAgentList", () => {
  const agents = [
    {
      id: "agent-1",
      name: "Engineer",
      urlKey: "engineer",
      role: "engineer",
      status: "active",
      title: "Software Engineer",
    },
    { id: "agent-2", name: "QA", urlKey: "qa", role: "qa", status: "paused", title: null },
  ];

  it("produces markdown with ## header", () => {
    const result = formatAgentList(agents);
    assert.match(result, /^##/m);
  });

  it("lists each agent with name and ID", () => {
    const result = formatAgentList(agents);
    assert.ok(result.includes("Engineer"));
    assert.ok(result.includes("agent-1"));
    assert.ok(result.includes("QA"));
    assert.ok(result.includes("agent-2"));
  });

  it("shows status for each agent", () => {
    const result = formatAgentList(agents);
    assert.ok(result.includes("active"));
    assert.ok(result.includes("paused"));
  });

  it("handles empty array gracefully", () => {
    const result = formatAgentList([]);
    assert.ok(result.length > 0);
  });
});

// ---------------------------------------------------------------------------
// formatIssueList
// ---------------------------------------------------------------------------
describe("formatIssueList", () => {
  const issues = [
    {
      id: "issue-1",
      identifier: "PAP-1",
      title: "Fix auth bug",
      status: "in_progress",
      priority: "high",
      assigneeAgentId: "agent-1",
      projectId: "proj-1",
      updatedAt: "2026-04-15T14:00:00.000Z",
    },
    {
      id: "issue-2",
      identifier: "PAP-2",
      title: "Add tests",
      status: "todo",
      priority: "medium",
      assigneeAgentId: null,
      projectId: null,
      updatedAt: "2026-04-14T09:00:00.000Z",
    },
  ];

  it("produces markdown with ## header", () => {
    const result = formatIssueList(issues);
    assert.match(result, /^##/m);
  });

  it("renders each issue identifier and title", () => {
    const result = formatIssueList(issues);
    assert.ok(result.includes("PAP-1"));
    assert.ok(result.includes("Fix auth bug"));
    assert.ok(result.includes("PAP-2"));
    assert.ok(result.includes("Add tests"));
  });

  it("renders status and priority", () => {
    const result = formatIssueList(issues);
    assert.ok(result.includes("in_progress"));
    assert.ok(result.includes("high"));
    assert.ok(result.includes("todo"));
  });

  it("shows envelope stats when provided", () => {
    const result = formatIssueList(issues, { total: 127, count: 2, offset: 0 });
    assert.ok(result.includes("127"));
    assert.ok(result.includes("offset 0"));
  });

  it("converts ISO timestamps to human-readable format", () => {
    const result = formatIssueList(issues);
    // ISO string should be replaced by readable format
    assert.ok(!result.includes("T14:00:00.000Z"));
    assert.ok(result.includes("UTC"));
  });

  it("handles empty array gracefully", () => {
    const result = formatIssueList([]);
    assert.ok(result.length > 0);
  });
});

// ---------------------------------------------------------------------------
// formatDashboard
// ---------------------------------------------------------------------------
describe("formatDashboard", () => {
  const dashboard = {
    goals: [{ id: "g-1", title: "Ship v2", status: "active" }],
    projects: [{ id: "p-1", name: "MCP Server", status: "active" }],
    issuesByStatus: { todo: 5, in_progress: 3, done: 12, blocked: 1 },
    agentWorkload: [{ agentName: "Engineer", activeIssues: 2 }],
  };

  it("produces markdown with ## headers for each section", () => {
    const result = formatDashboard(dashboard);
    assert.match(result, /^##/m);
  });

  it("includes goals section", () => {
    const result = formatDashboard(dashboard);
    assert.ok(result.toLowerCase().includes("goal"));
    assert.ok(result.includes("Ship v2"));
  });

  it("includes issues by status section", () => {
    const result = formatDashboard(dashboard);
    assert.ok(result.includes("todo"));
    assert.ok(result.includes("in_progress") || result.includes("in progress"));
  });

  it("includes agent workload section", () => {
    const result = formatDashboard(dashboard);
    assert.ok(result.includes("Engineer"));
  });

  it("handles missing optional fields gracefully", () => {
    const result = formatDashboard({});
    assert.ok(result.length > 0);
  });
});

// ---------------------------------------------------------------------------
// formatOrgChart
// ---------------------------------------------------------------------------
describe("formatOrgChart", () => {
  const orgChart = {
    agents: [
      { id: "agent-1", name: "CEO", role: "ceo", reportsTo: null },
      { id: "agent-2", name: "Engineer", role: "engineer", reportsTo: "agent-1" },
    ],
  };

  it("produces markdown output", () => {
    const result = formatOrgChart(orgChart);
    assert.ok(result.length > 0);
    assert.match(result, /^##/m);
  });

  it("lists agents with roles", () => {
    const result = formatOrgChart(orgChart);
    assert.ok(result.includes("CEO"));
    assert.ok(result.includes("Engineer"));
  });

  it("handles empty org chart gracefully", () => {
    const result = formatOrgChart({});
    assert.ok(result.length > 0);
  });
});
