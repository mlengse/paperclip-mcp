/**
 * Contract test fixture seed.
 *
 * Creates deterministic test entities in the running Paperclip server and
 * returns their IDs. Designed to be called once in a `before()` hook so all
 * contract test suites share the same fixture set within a single test run.
 *
 * Entities created:
 *   - One issue used as the primary fixture (title: "CONTRACT-TEST-ISSUE")
 *   - One approval used as the primary approval fixture
 *
 * Required env vars (in addition to those in harness.ts):
 *   PAPERCLIP_CONTRACT_PROJECT_ID — UUID of the project to attach fixture issues to
 *   PAPERCLIP_CONTRACT_GOAL_ID    — UUID of the goal to attach fixture issues to
 *
 * These are only read when PAPERCLIP_CONTRACT_TESTS=1 is set; missing values
 * produce a clear error at test startup rather than a cryptic API 404.
 */

import { buildContractAuth } from "./harness.js";
import { PaperclipClient } from "../client.js";

export interface ContractFixtures {
  /** The primary test issue ID */
  issueId: string;
  /** A second issue for operations that need a distinct target */
  issueId2: string;
  /** A live agent ID (read-only in tests — never deleted) */
  agentId: string;
  /** The approval fixture ID */
  approvalId: string;
  /** The company ID taken from auth config */
  companyId: string;
  /** The project ID in use */
  projectId: string;
  /** The goal ID in use */
  goalId: string;
}

const FIXTURE_TITLE_1 = "CONTRACT-TEST-ISSUE-1";
const FIXTURE_TITLE_2 = "CONTRACT-TEST-ISSUE-2";

function requireContractEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Contract tests require ${name} to be set`);
  return value;
}

export async function seedFixtures(): Promise<ContractFixtures> {
  const auth = buildContractAuth();
  const client = new PaperclipClient(auth);

  const projectId = requireContractEnv("PAPERCLIP_CONTRACT_PROJECT_ID");
  const goalId = requireContractEnv("PAPERCLIP_CONTRACT_GOAL_ID");
  const agentId = auth.agentId; // QA agent — always present

  // Create the primary fixture issue.
  const issue1 = await client.post<{ id: string }>(`/api/companies/${auth.companyId}/issues`, {
    title: FIXTURE_TITLE_1,
    description: "Fixture issue created by the contract test seed script. Safe to delete.",
    status: "backlog",
    priority: "low",
    projectId,
    goalId,
  });

  // Create a second fixture issue for checkout / update tests.
  const issue2 = await client.post<{ id: string }>(`/api/companies/${auth.companyId}/issues`, {
    title: FIXTURE_TITLE_2,
    description: "Fixture issue #2 created by the contract test seed script. Safe to delete.",
    status: "todo",
    priority: "low",
    projectId,
    goalId,
  });

  // Create a fixture approval (hire_agent type; minimal payload).
  const approval = await client.post<{ id: string }>(`/api/companies/${auth.companyId}/approvals`, {
    type: "hire_agent",
    payload: {
      name: "ContractTestAgent",
      role: "engineer",
      title: "Contract Test Hire",
    },
  });

  return {
    issueId: issue1.id,
    issueId2: issue2.id,
    agentId,
    approvalId: approval.id,
    companyId: auth.companyId,
    projectId,
    goalId,
  };
}

export async function teardownFixtures(fixtures: ContractFixtures): Promise<void> {
  const auth = buildContractAuth();
  const client = new PaperclipClient(auth);

  // Cancel both fixture issues so they don't pollute the board.
  await client.patch(`/api/issues/${fixtures.issueId}`, { status: "cancelled" }).catch(() => {});
  await client.patch(`/api/issues/${fixtures.issueId2}`, { status: "cancelled" }).catch(() => {});

  // Reject the fixture approval so it's closed out.
  await client
    .post(`/api/approvals/${fixtures.approvalId}/reject`, {
      reason: "Contract test teardown — fixture cleanup.",
    })
    .catch(() => {});
}
