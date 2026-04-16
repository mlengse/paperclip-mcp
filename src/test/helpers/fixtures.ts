/**
 * Fixture builders for test data.
 *
 * Each builder returns a minimal, valid domain object and accepts a
 * Partial override for test-specific fields. Grow per stage — Stage 8
 * sub-stages will add company, plugin, secret, run, feedback, and
 * import/export fixtures.
 */

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------
export interface IssueLike {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string | null;
  projectId: string | null;
  goalId: string | null;
  parentId: string | null;
  executionRunId: string | null;
  executionLockedAt: string | null;
  checkoutRunId: string | null;
  assigneeAgentId: string | null;
  updatedAt: string;
}

export function issueFixture(overrides: Partial<IssueLike> = {}): IssueLike {
  return {
    id: "issue-1",
    identifier: "PAP-1",
    title: "Fixture issue",
    status: "todo",
    priority: "medium",
    projectId: "project-1",
    goalId: "goal-1",
    parentId: null,
    executionRunId: null,
    executionLockedAt: null,
    checkoutRunId: null,
    assigneeAgentId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------
export interface AgentLike {
  id: string;
  name: string;
  urlKey: string;
  role: string;
  status: string;
  title: string | null;
}

export function agentFixture(overrides: Partial<AgentLike> = {}): AgentLike {
  return {
    id: "agent-1",
    name: "QA Engineer",
    urlKey: "qa-engineer",
    role: "qa",
    status: "active",
    title: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------
export interface ApprovalLike {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
}

export function approvalFixture(overrides: Partial<ApprovalLike> = {}): ApprovalLike {
  return {
    id: "appr-1",
    type: "hire_agent",
    status: "pending",
    payload: { name: "Alice", role: "engineer" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 409 conflict body for checkout flow tests (matches the shape the MCP
// inspects in src/tools/issues.ts — do not change without updating that).
// ---------------------------------------------------------------------------
export function conflictBody(details: {
  issueId?: string;
  checkoutRunId: string | null;
  executionRunId: string | null;
}) {
  return {
    error: "Issue checkout conflict",
    details: { issueId: "issue-1", ...details },
  };
}

// ---------------------------------------------------------------------------
// Large payload — used to exercise Stage 5 CHARACTER_LIMIT truncation.
// Default size (~300 issues × ~300 chars each) produces ~90k JSON, well
// above the 25k limit.
// ---------------------------------------------------------------------------
export function largeIssueList(count = 300): IssueLike[] {
  return Array.from({ length: count }, (_, i) =>
    issueFixture({
      id: `issue-${i + 1}`,
      identifier: `PAP-${i + 1}`,
      title: `Issue ${i + 1} — ${"x".repeat(100)}`,
    })
  );
}
