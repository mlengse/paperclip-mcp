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

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------
export interface GoalLike {
  id: string;
  title: string;
  status: string;
  description: string | null;
}

export function goalFixture(overrides: Partial<GoalLike> = {}): GoalLike {
  return {
    id: "goal-1",
    title: "Fixture goal",
    status: "active",
    description: null,
    ...overrides,
  };
}

export function largeGoalList(count = 300): GoalLike[] {
  return Array.from({ length: count }, (_, i) =>
    goalFixture({
      id: `goal-${i + 1}`,
      title: `Goal ${i + 1} — ${"x".repeat(100)}`,
    })
  );
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
export interface ProjectLike {
  id: string;
  name: string;
  status: string;
  goalId: string | null;
}

export function projectFixture(overrides: Partial<ProjectLike> = {}): ProjectLike {
  return {
    id: "proj-1",
    name: "Fixture project",
    status: "active",
    goalId: null,
    ...overrides,
  };
}

export function largeProjectList(count = 300): ProjectLike[] {
  return Array.from({ length: count }, (_, i) =>
    projectFixture({
      id: `proj-${i + 1}`,
      name: `Project ${i + 1} — ${"x".repeat(100)}`,
    })
  );
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------
export interface LabelLike {
  id: string;
  name: string;
  color: string | null;
}

export function labelFixture(overrides: Partial<LabelLike> = {}): LabelLike {
  return {
    id: "label-1",
    name: "bug",
    color: "#ff0000",
    ...overrides,
  };
}

export function largeLabelList(count = 500): LabelLike[] {
  return Array.from({ length: count }, (_, i) =>
    labelFixture({
      id: `label-${i + 1}`,
      name: `label-${i + 1}-${"x".repeat(60)}`,
    })
  );
}

// ---------------------------------------------------------------------------
// Comment
// ---------------------------------------------------------------------------
export interface CommentLike {
  id: string;
  body: string;
  authorId: string;
  authorType: string;
  createdAt: string;
}

export function commentFixture(overrides: Partial<CommentLike> = {}): CommentLike {
  return {
    id: "comment-1",
    body: "Fixture comment",
    authorId: "agent-1",
    authorType: "agent",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function largeCommentList(count = 300): CommentLike[] {
  return Array.from({ length: count }, (_, i) =>
    commentFixture({
      id: `comment-${i + 1}`,
      body: `Comment ${i + 1} — ${"x".repeat(100)}`,
    })
  );
}

// ---------------------------------------------------------------------------
// Large approval list
// ---------------------------------------------------------------------------
export function largeApprovalList(count = 300): ApprovalLike[] {
  return Array.from({ length: count }, (_, i) =>
    approvalFixture({
      id: `appr-${i + 1}`,
      payload: { name: `Agent ${i + 1}`, description: "x".repeat(100) },
    })
  );
}
