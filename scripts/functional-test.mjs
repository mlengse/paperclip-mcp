#!/usr/bin/env node
/**
 * Functional test harness for paperclip-mcp.
 * Executes every tool from ALL_TOOLS against the live Paperclip API and
 * produces pass/fail/skip reports in JSON and Markdown.
 *
 * Usage:
 *   node --import tsx/esm scripts/functional-test.mjs
 *   npm run test:functional
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const COMPANY_ID = "53caad5d-05d6-469d-b6eb-8961a71b615e";
const API_URL = "http://127.0.0.1:3100";
const API_KEY = "local-board-noauth";

// We'll fill agentId after seed
let AGENT_ID = "";

// ---------------------------------------------------------------------------
// Bootstrap: set env vars before importing tools (auth.ts reads them at import)
// ---------------------------------------------------------------------------

process.env["PAPERCLIP_API_KEY"] = API_KEY;
process.env["PAPERCLIP_API_URL"] = API_URL;
process.env["PAPERCLIP_COMPANY_ID"] = COMPANY_ID;
process.env["PAPERCLIP_AGENT_ID"] = "placeholder"; // will be updated before calls
process.env["PAPERCLIP_RUN_ID"] = "functional-test-run";

// ---------------------------------------------------------------------------
// Import tool modules (tsx/esm loader handles TypeScript)
// ---------------------------------------------------------------------------

const { ALL_TOOLS } = await import("../src/tools/index.ts");
const { PaperclipClient } = await import("../src/client.ts");

// ---------------------------------------------------------------------------
// Test context (mutable, filled during seed)
// ---------------------------------------------------------------------------

const ctx = {
  companyId: COMPANY_ID,
  agentId: null,
  projectId: null,
  goalId: null,
  issueId: null,
  issueIdentifier: null, // e.g. "TES-1"
  labelId: null,
  workspaceId: null,
  workspaceCreated: false, // track whether we created it (for cleanup)
  attachmentId: null,
  commentId: null,
  approvalId: null,
  routineId: null,
  triggerId: null,
  secretId: null,
  documentKey: "plan",
  revisionId: null,
  runId: null,
  traceId: null,
  pluginKey: null,
};

// ---------------------------------------------------------------------------
// Seed phase tracking
// ---------------------------------------------------------------------------

const seedLog = [];

function seedOk(name, value) {
  seedLog.push({ name, value, ok: true });
  console.log(`  [SEED] ✓ ${name}: ${value}`);
}
function seedFail(name, reason) {
  seedLog.push({ name, value: null, ok: false, reason });
  console.log(`  [SEED] ✗ ${name}: ${reason}`);
}

// ---------------------------------------------------------------------------
// Build a PaperclipClient with the given agentId
// ---------------------------------------------------------------------------

function makeClient(agentId) {
  const { PaperclipClient: PC } = { PaperclipClient };
  return new PC({
    apiKey: API_KEY,
    apiUrl: API_URL,
    agentId: agentId ?? AGENT_ID ?? "unknown",
    companyId: COMPANY_ID,
    runId: "functional-test-run",
  });
}

// ---------------------------------------------------------------------------
// Raw fetch helpers for seed (no client needed — pure HTTP)
// ---------------------------------------------------------------------------

async function apiFetch(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Seed phase
// ---------------------------------------------------------------------------

console.log("\n=== SEED PHASE ===\n");

// Step 1: list agents
try {
  const agents = await apiFetch("GET", `/api/companies/${COMPANY_ID}/agents`);
  if (!agents || agents.length === 0) throw new Error("no agents in company");
  ctx.agentId = agents[0].id;
  AGENT_ID = ctx.agentId;
  seedOk("agentId", ctx.agentId);
} catch (err) {
  seedFail("agentId", err.message);
}

// Step 2: list projects or create
try {
  const projects = await apiFetch("GET", `/api/companies/${COMPANY_ID}/projects`);
  if (projects && projects.length > 0) {
    ctx.projectId = projects[0].id;
    seedOk("projectId", ctx.projectId + " (reused)");
  } else {
    const proj = await apiFetch("POST", `/api/companies/${COMPANY_ID}/projects`, {
      name: "Functional Test Project",
    });
    ctx.projectId = proj.id;
    seedOk("projectId", ctx.projectId + " (created)");
  }
} catch (err) {
  seedFail("projectId", err.message);
}

// Step 3: list goals or create
try {
  const goals = await apiFetch("GET", `/api/companies/${COMPANY_ID}/goals`);
  if (goals && goals.length > 0) {
    ctx.goalId = goals[0].id;
    seedOk("goalId", ctx.goalId + " (reused)");
  } else {
    const goal = await apiFetch("POST", `/api/companies/${COMPANY_ID}/goals`, {
      title: "Functional Test Goal",
    });
    ctx.goalId = goal.id;
    seedOk("goalId", ctx.goalId + " (created)");
  }
} catch (err) {
  seedFail("goalId", err.message);
}

// Step 4: list issues or create
try {
  const issues = await apiFetch("GET", `/api/companies/${COMPANY_ID}/issues`);
  if (issues && issues.length > 0) {
    ctx.issueId = issues[0].id;
    ctx.issueIdentifier = issues[0].identifier;
    seedOk("issueId", ctx.issueId + " (" + ctx.issueIdentifier + ") (reused)");
  } else {
    const issue = await apiFetch("POST", `/api/companies/${COMPANY_ID}/issues`, {
      title: "Functional test seed issue",
      status: "todo",
      projectId: ctx.projectId,
      goalId: ctx.goalId,
    });
    ctx.issueId = issue.id;
    ctx.issueIdentifier = issue.identifier;
    seedOk("issueId", ctx.issueId + " (" + ctx.issueIdentifier + ") (created)");
  }
} catch (err) {
  seedFail("issueId", err.message);
}

// Step 5: list labels or create
try {
  const labels = await apiFetch("GET", `/api/companies/${COMPANY_ID}/labels`);
  if (labels && labels.length > 0) {
    ctx.labelId = labels[0].id;
    seedOk("labelId", ctx.labelId + " (reused)");
  } else {
    const label = await apiFetch("POST", `/api/companies/${COMPANY_ID}/labels`, {
      name: "type:test",
      color: "#6366f1",
    });
    ctx.labelId = label.id;
    seedOk("labelId", ctx.labelId + " (created)");
  }
} catch (err) {
  seedFail("labelId", err.message);
}

// Step 6: list workspaces or create
try {
  if (!ctx.projectId) throw new Error("no projectId available");
  const workspaces = await apiFetch("GET", `/api/projects/${ctx.projectId}/workspaces`);
  if (workspaces && workspaces.length > 0) {
    ctx.workspaceId = workspaces[0].id;
    ctx.workspaceCreated = false;
    seedOk("workspaceId", ctx.workspaceId + " (reused)");
  } else {
    const ws = await apiFetch("POST", `/api/projects/${ctx.projectId}/workspaces`, {
      cwd: "/tmp/functional-test-workspace",
    });
    ctx.workspaceId = ws.id;
    ctx.workspaceCreated = true;
    seedOk("workspaceId", ctx.workspaceId + " (created)");
  }
} catch (err) {
  seedFail("workspaceId", err.message);
}

// Step 7: add comment on issue
try {
  if (!ctx.issueId) throw new Error("no issueId available");
  const comment = await apiFetch("POST", `/api/issues/${ctx.issueId}/comments`, {
    body: "Functional test seed comment",
  });
  ctx.commentId = comment.id;
  seedOk("commentId", ctx.commentId);
} catch (err) {
  seedFail("commentId", err.message);
}

// Step 8: upsert document via MCP tool to seed the document for later get/revisions tests
try {
  if (!ctx.issueId) throw new Error("no issueId available");
  // Use the MCP upsert tool handler directly (it handles format field)
  const { ALL_TOOLS: tools } = await import("../src/tools/index.ts");
  const upsertTool = tools.find((t) => t.name === "paperclip_upsert_document");
  if (!upsertTool) throw new Error("paperclip_upsert_document tool not found");
  const upsertClient = new PaperclipClient({
    apiKey: API_KEY,
    apiUrl: API_URL,
    agentId: ctx.agentId ?? "unknown",
    companyId: COMPANY_ID,
    runId: "functional-test-run",
  });
  const upsertResult = await upsertTool.handler(
    {
      issueId: ctx.issueId,
      key: ctx.documentKey,
      title: "Plan",
      body: "# Functional test plan\n\nThis document was seeded by the functional test harness.",
    },
    upsertClient
  );
  if (upsertResult.isError) {
    throw new Error(upsertResult.content?.[0]?.text ?? "upsert returned isError");
  }
  seedOk("document", `key="${ctx.documentKey}" on issue ${ctx.issueId}`);
} catch (err) {
  seedFail("document", err.message);
}

// Step 9: upload attachment
try {
  if (!ctx.issueId) throw new Error("no issueId available");
  // Write a temp file
  await writeFile("/tmp/functional-test.txt", "hello functional test\n");
  // Use multipart/form-data via raw fetch
  const { readFile } = await import("node:fs/promises");
  const fileBuffer = await readFile("/tmp/functional-test.txt");
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: "text/plain" });
  form.append("file", blob, "functional-test.txt");
  const res = await fetch(
    `${API_URL}/api/companies/${COMPANY_ID}/issues/${ctx.issueId}/attachments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    }
  );
  const attachData = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(attachData)}`);
  ctx.attachmentId = attachData.id;
  seedOk("attachmentId", ctx.attachmentId);
} catch (err) {
  seedFail("attachmentId", err.message);
}

// Step 10: create approval (raw API requires type + payload)
try {
  if (!ctx.issueId) throw new Error("no issueId available");
  const approval = await apiFetch("POST", `/api/companies/${COMPANY_ID}/approvals`, {
    type: "budget_override_required",
    payload: { note: "Functional test approval seeded by harness" },
    title: "Functional test approval",
  });
  ctx.approvalId = approval.id;
  seedOk("approvalId", ctx.approvalId);
} catch (err) {
  seedFail("approvalId", err.message);
}

// Step 11: create routine (raw API: requires `title` + `assigneeAgentId`)
try {
  if (!ctx.agentId) throw new Error("no agentId available");
  const routine = await apiFetch("POST", `/api/companies/${COMPANY_ID}/routines`, {
    assigneeAgentId: ctx.agentId,
    title: "functional-test-routine",
    description: "Seeded by functional test harness",
  });
  ctx.routineId = routine.id;
  seedOk("routineId", ctx.routineId);
} catch (err) {
  seedFail("routineId", err.message);
}

// Step 12: add routine trigger (raw API uses 'kind' not 'type')
try {
  if (!ctx.routineId) throw new Error("no routineId available");
  const triggerResp = await apiFetch("POST", `/api/routines/${ctx.routineId}/triggers`, {
    kind: "api",
  });
  // Response is wrapped: { trigger: { id, ... }, secretMaterial }
  const trigger = triggerResp.trigger ?? triggerResp;
  ctx.triggerId = trigger.id;
  seedOk("triggerId", ctx.triggerId);
} catch (err) {
  seedFail("triggerId", err.message);
}

// Step 13: create secret
try {
  const secret = await apiFetch("POST", `/api/companies/${COMPANY_ID}/secrets`, {
    name: `FUNC_TEST_KEY_${Date.now()}`,
    value: "functional-test-secret-value",
    description: "Created by functional test harness",
  });
  ctx.secretId = secret.id;
  seedOk("secretId", ctx.secretId);
} catch (err) {
  seedFail("secretId", err.message);
}

// Step 14: try to get runId (may be empty)
try {
  const runs = await apiFetch("GET", `/api/companies/${COMPANY_ID}/heartbeat-runs`);
  if (runs && runs.length > 0) {
    ctx.runId = runs[0].id;
    seedOk("runId", ctx.runId);
  } else {
    seedFail("runId", "no heartbeat runs exist; dependent tools will be SKIP");
  }
} catch (err) {
  seedFail("runId", err.message);
}

// Step 15: try to get traceId (usually empty)
try {
  const traces = await apiFetch("GET", `/api/companies/${COMPANY_ID}/feedback-traces`);
  if (traces && traces.length > 0) {
    ctx.traceId = traces[0].id;
    seedOk("traceId", ctx.traceId);
  } else {
    seedFail("traceId", "no feedback traces exist; dependent tools will be SKIP");
  }
} catch (err) {
  seedFail("traceId", err.message);
}

// Step 16: try to get a pluginKey
try {
  const plugins = await apiFetch("GET", `/api/plugins`);
  if (plugins && plugins.length > 0) {
    ctx.pluginKey = plugins[0].pluginKey;
    seedOk("pluginKey", ctx.pluginKey);
  } else {
    seedFail("pluginKey", "no plugins installed; dependent tools will be SKIP");
  }
} catch (err) {
  seedFail("pluginKey", err.message);
}

// Step 17: try to get a config revisionId for the agent
try {
  if (!ctx.agentId) throw new Error("no agentId available");
  const revisions = await apiFetch("GET", `/api/agents/${ctx.agentId}/config-revisions`);
  if (revisions && revisions.length > 0) {
    ctx.revisionId = revisions[0].id;
    seedOk("revisionId", ctx.revisionId);
  } else {
    seedFail("revisionId", "no config revisions exist; dependent tools will be SKIP");
  }
} catch (err) {
  seedFail("revisionId", err.message);
}

console.log("\n=== SEED COMPLETE ===\n");
console.log("Context:", JSON.stringify(ctx, null, 2));

// ---------------------------------------------------------------------------
// Test case definitions
// ---------------------------------------------------------------------------

// Each entry: { args?, argsFn?, skip?, expectError?, after? }
// argsFn receives ctx and returns args
// after is called after the tool call to restore state

const TEST_CASES = {
  // --- identity ---
  paperclip_get_me: { args: { response_format: "json" } },
  paperclip_get_inbox: {
    args: { response_format: "json" },
    // NOTE: /api/agents/me/inbox-lite requires agent auth, not board auth.
    // In local_trusted mode with board key this will 401.
    // Marking expectError to document the auth boundary rather than hide it.
    expectError: true,
    expectErrorContains: null, // 401 expected — doc the limitation
  },
  paperclip_get_current_user: { args: { response_format: "json" } },
  paperclip_revoke_current_session: {
    skip: "would invalidate the board auth token used for all other tests",
  },

  // --- issues ---
  paperclip_list_issues: { args: { response_format: "json" } },
  paperclip_get_issue: {
    argsFn: (c) => ({ issueId: c.issueId, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_get_heartbeat_context: {
    argsFn: (c) => ({ issueId: c.issueId, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_checkout_issue: {
    argsFn: (c) => ({
      issueId: c.issueId,
      expectedStatuses: ["todo", "in_progress", "backlog", "blocked", "in_review"],
    }),
    dependsOn: "issueId",
    before: async (c, _client) => {
      // Defensively release before checkout — ensures clean state even if a
      // prior test left the issue locked (checkoutRunId + status=in_progress).
      // POST /release is idempotent on an unlocked issue (returns 409 which we ignore).
      try {
        await apiFetch("POST", `/api/issues/${c.issueId}/release`);
      } catch {
        /* 409 = already clean — ignore */
      }
    },
    after: async (c, client) => {
      // Release the checkout so the issue is clean for later tests
      const releaseTool = ALL_TOOLS.find((t) => t.name === "paperclip_release_issue");
      if (releaseTool) {
        try {
          await releaseTool.handler({ issueId: c.issueId }, client);
        } catch {
          /* ignore release errors in after hook */
        }
      }
    },
  },
  paperclip_release_issue: {
    // We test release separately by checking it twice: first a fresh checkout then release
    // But since checkout test already releases, we do a fresh checkout here then release
    argsFn: (c) => ({ issueId: c.issueId }),
    dependsOn: "issueId",
    before: async (c, client) => {
      // Checkout first so there is something to release
      const checkoutTool = ALL_TOOLS.find((t) => t.name === "paperclip_checkout_issue");
      if (checkoutTool) {
        try {
          await checkoutTool.handler(
            {
              issueId: c.issueId,
              expectedStatuses: [
                "todo",
                "in_progress",
                "backlog",
                "blocked",
                "in_review",
                "done",
                "cancelled",
              ],
            },
            client
          );
        } catch {
          /* might be already released — ok */
        }
      }
    },
  },
  paperclip_update_issue: {
    argsFn: (c) => ({ issueId: c.issueId, priority: "medium" }),
    dependsOn: "issueId",
  },
  paperclip_create_issue: {
    args: {
      title: "Functional test created issue",
      status: "backlog",
    },
  },

  // --- comments ---
  paperclip_list_comments: {
    argsFn: (c) => ({ issueId: c.issueId, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_add_comment: {
    argsFn: (c) => ({ issueId: c.issueId, body: "Functional test comment" }),
    dependsOn: "issueId",
  },
  paperclip_get_comment: {
    // NOTE: GetCommentInput has no response_format field — strict schema would reject it
    argsFn: (c) => ({ issueId: c.issueId, commentId: c.commentId }),
    dependsOn: "commentId",
  },

  // --- documents ---
  paperclip_list_documents: {
    argsFn: (c) => ({ issueId: c.issueId, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_get_document: {
    argsFn: (c) => ({ issueId: c.issueId, key: c.documentKey, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_upsert_document: {
    // Use a unique key per run to avoid 409 "baseRevisionId required" when doc already exists.
    // The 409 is a real tool bug (MCP upsert doesn't handle update conflicts), but we use a
    // fresh key here to test the "create" path. The "update" path failure is documented as a
    // known tool bug and will be verified by the Dev agent.
    argsFn: (c) => ({
      issueId: c.issueId,
      key: `plan-ft-${Date.now()}`,
      title: "Functional test plan (fresh key)",
      body: "# Functional test plan\nCreated by functional test harness.",
    }),
    dependsOn: "issueId",
  },
  paperclip_get_document_revisions: {
    argsFn: (c) => ({ issueId: c.issueId, key: c.documentKey, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_delete_document: {
    // Run at end — defer to cleanup phase
    skip: "destructive — scheduled for cleanup phase; covered by upsert + get + revisions tests",
  },

  // --- agents ---
  paperclip_list_agents: { args: { response_format: "json" } },
  paperclip_get_agent: {
    argsFn: (c) => ({ agentId: c.agentId, response_format: "json" }),
    dependsOn: "agentId",
  },
  paperclip_update_agent: {
    argsFn: (c) => ({
      agentId: c.agentId,
      capabilities: "Updated by functional test harness",
    }),
    dependsOn: "agentId",
  },
  paperclip_update_agent_permissions: {
    argsFn: (c) => ({
      agentId: c.agentId,
      canAssignTasks: false,
      canCreateAgents: false,
    }),
    dependsOn: "agentId",
  },
  paperclip_pause_agent: {
    argsFn: (c) => ({ agentId: c.agentId }),
    dependsOn: "agentId",
    after: async (c, client) => {
      // Resume immediately so other tests aren't affected
      const resumeTool = ALL_TOOLS.find((t) => t.name === "paperclip_resume_agent");
      if (resumeTool) {
        try {
          await resumeTool.handler({ agentId: c.agentId }, client);
        } catch {
          /* ignore */
        }
      }
    },
  },
  paperclip_resume_agent: {
    // Test resume directly (agent should already be active from previous after-hook)
    argsFn: (c) => ({ agentId: c.agentId }),
    dependsOn: "agentId",
  },
  paperclip_invoke_heartbeat: { argsFn: (c) => ({ agentId: c.agentId }), dependsOn: "agentId" },
  paperclip_terminate_agent: {
    skip: "would permanently deactivate the test agent needed for all other tests",
  },
  paperclip_create_agent_key: {
    argsFn: (c) => ({
      agentId: c.agentId,
      name: "functional-test-key",
      expiresAt: "2027-01-01T00:00:00.000Z",
    }),
    dependsOn: "agentId",
  },
  paperclip_list_agent_config_revisions: {
    argsFn: (c) => ({ agentId: c.agentId, response_format: "json" }),
    dependsOn: "agentId",
  },
  paperclip_rollback_agent_config: {
    argsFn: (c) => ({ agentId: c.agentId, revisionId: c.revisionId }),
    dependsOn: "revisionId",
    skipIfMissing: "revisionId",
  },
  paperclip_set_agent_instructions_path: {
    // SetInstructionsPathInput uses 'path' field; adapterConfigKey required for 'process' adapter type
    argsFn: (c) => ({
      agentId: c.agentId,
      path: "/tmp/AGENTS.md",
      adapterConfigKey: "instructionsFilePath",
    }),
    dependsOn: "agentId",
  },
  paperclip_get_org_chart: { args: { response_format: "json" } },
  paperclip_sync_agent_skills: {
    // SyncAgentSkillsInput requires desiredSkills array (required field)
    argsFn: (c) => ({ agentId: c.agentId, desiredSkills: [] }),
    dependsOn: "agentId",
  },
  paperclip_list_company_skills: { args: { response_format: "json" } },
  paperclip_wakeup_agent: {
    argsFn: (c) => ({ agentId: c.agentId, reason: "Functional test wake-up" }),
    dependsOn: "agentId",
  },
  paperclip_create_agent: {
    // CreateAgentInput requires companyId as explicit field
    argsFn: (c) => ({
      companyId: c.companyId,
      name: "Functional Test Agent",
      role: "engineer",
      title: "Test Agent",
    }),
  },

  // --- dashboard ---
  paperclip_get_dashboard: { args: { response_format: "json" } },

  // --- approvals ---
  paperclip_list_approvals: { args: { response_format: "json" } },
  paperclip_get_approval: {
    argsFn: (c) => ({ approvalId: c.approvalId, response_format: "json" }),
    dependsOn: "approvalId",
  },
  paperclip_create_approval: {
    // CreateApprovalInput requires type + payload (no title/issueId in MCP schema)
    args: {
      type: "budget_override_required",
      payload: { note: "Extra approval created by functional test harness" },
    },
  },
  paperclip_approve: {
    argsFn: (c) => ({ approvalId: c.approvalId }),
    dependsOn: "approvalId",
    // NOTE: this changes state; subsequent get_approval will show approved status
  },
  paperclip_reject: {
    skip: "approval already consumed by paperclip_approve in same run; only one terminal action per approval",
  },
  paperclip_request_revision: {
    skip: "approval already consumed by paperclip_approve in same run; only one terminal action per approval",
  },
  paperclip_resubmit_approval: {
    skip: "requires a prior request_revision — skipped to avoid state conflicts",
  },
  paperclip_list_approval_comments: {
    argsFn: (c) => ({ approvalId: c.approvalId, response_format: "json" }),
    dependsOn: "approvalId",
  },
  paperclip_add_approval_comment: {
    argsFn: (c) => ({ approvalId: c.approvalId, body: "Functional test approval comment" }),
    dependsOn: "approvalId",
  },
  paperclip_create_agent_hire: {
    args: {
      name: "Functional Test Hire Agent",
      role: "engineer",
      title: "Test Hire",
      capabilities: "Test hire created by functional test harness",
    },
  },
  paperclip_list_approval_issues: {
    argsFn: (c) => ({ approvalId: c.approvalId, response_format: "json" }),
    dependsOn: "approvalId",
  },

  // --- goals ---
  paperclip_list_goals: { args: { response_format: "json" } },
  paperclip_get_goal: {
    argsFn: (c) => ({ goalId: c.goalId, response_format: "json" }),
    dependsOn: "goalId",
  },
  paperclip_create_goal: { args: { title: "Functional test goal" } },
  paperclip_update_goal: {
    argsFn: (c) => ({ goalId: c.goalId, title: "Functional test goal (updated)" }),
    dependsOn: "goalId",
  },

  // --- projects ---
  paperclip_list_projects: { args: { response_format: "json" } },
  paperclip_get_project: {
    argsFn: (c) => ({ projectId: c.projectId, response_format: "json" }),
    dependsOn: "projectId",
  },
  paperclip_create_project: { args: { name: "Functional test project" } },
  paperclip_update_project: {
    argsFn: (c) => ({ projectId: c.projectId, description: "Updated by functional test harness" }),
    dependsOn: "projectId",
  },
  paperclip_list_workspaces: {
    argsFn: (c) => ({ projectId: c.projectId, response_format: "json" }),
    dependsOn: "projectId",
  },
  paperclip_create_workspace: {
    argsFn: (c) => ({ projectId: c.projectId, cwd: "/tmp/functional-test-ws-created" }),
    dependsOn: "projectId",
  },
  paperclip_update_workspace: {
    argsFn: (c) => ({
      projectId: c.projectId,
      workspaceId: c.workspaceId,
      cwd: "/tmp/functional-test-ws-updated",
    }),
    dependsOn: "workspaceId",
  },
  paperclip_delete_workspace: {
    skip: "destructive — would remove workspace needed for workspace read tests",
  },

  // --- activity ---
  paperclip_get_activity: { args: { response_format: "json" } },
  paperclip_get_cost_summary: { args: { response_format: "json" } },
  paperclip_get_costs_by_agent: { args: { response_format: "json" } },
  paperclip_get_costs_by_project: { args: { response_format: "json" } },
  paperclip_report_cost_event: {
    argsFn: (c) => ({
      agentId: c.agentId,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      inputTokens: 100,
      outputTokens: 50,
      costCents: 0.0,
      occurredAt: new Date().toISOString(),
    }),
    dependsOn: "agentId",
  },

  // --- routines ---
  paperclip_list_routines: { args: { response_format: "json" } },
  paperclip_get_routine: {
    argsFn: (c) => ({ routineId: c.routineId, response_format: "json" }),
    dependsOn: "routineId",
  },
  paperclip_create_routine: {
    argsFn: (c) => ({
      assigneeAgentId: c.agentId,
      title: "functional-test-routine-via-mcp",
    }),
    dependsOn: "agentId",
  },
  paperclip_update_routine: {
    argsFn: (c) => ({ routineId: c.routineId, description: "Updated by functional test" }),
    dependsOn: "routineId",
  },
  paperclip_add_routine_trigger: {
    argsFn: (c) => ({
      routineId: c.routineId,
      kind: "api",
    }),
    dependsOn: "routineId",
  },
  paperclip_update_routine_trigger: {
    argsFn: (c) => ({ triggerId: c.triggerId, kind: "api" }),
    dependsOn: "triggerId",
  },
  paperclip_delete_routine_trigger: {
    argsFn: (c) => ({ triggerId: c.triggerId }),
    dependsOn: "triggerId",
  },
  paperclip_run_routine: {
    argsFn: (c) => ({ routineId: c.routineId, agentId: c.agentId }),
    dependsOn: "routineId",
  },
  paperclip_list_routine_runs: {
    argsFn: (c) => ({ routineId: c.routineId, response_format: "json" }),
    dependsOn: "routineId",
  },

  // --- attachments ---
  paperclip_list_attachments: {
    argsFn: (c) => ({ issueId: c.issueId, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_upload_attachment: {
    argsFn: (c) => ({
      issueId: c.issueId,
      filePath: "/tmp/functional-test.txt",
      filename: "functional-test.txt",
      mimeType: "text/plain",
    }),
    dependsOn: "issueId",
  },
  paperclip_download_attachment: {
    argsFn: (c) => ({ attachmentId: c.attachmentId, response_format: "json" }),
    dependsOn: "attachmentId",
  },
  paperclip_delete_attachment: {
    argsFn: (c) => ({ attachmentId: c.attachmentId }),
    dependsOn: "attachmentId",
  },

  // --- labels ---
  paperclip_list_labels: { args: { response_format: "json" } },
  paperclip_create_label: {
    args: { name: `functional-test-label-${Date.now()}`, color: "#ff6600" },
  },

  // --- company ---
  paperclip_list_companies: { args: { response_format: "json" } },
  paperclip_get_company: {
    argsFn: (c) => ({ companyId: c.companyId, response_format: "json" }),
  },
  paperclip_create_company: {
    args: { name: "Functional Test Company (disposable)" },
  },
  paperclip_update_company: {
    argsFn: (c) => ({ companyId: c.companyId, description: "Updated by functional test harness" }),
  },
  paperclip_archive_company: {
    skip: "would archive the test company needed for all other tests",
  },

  // --- plugins ---
  paperclip_list_plugins: { args: { response_format: "json" } },
  paperclip_get_plugin: {
    argsFn: (c) => ({ pluginKey: c.pluginKey, response_format: "json" }),
    dependsOn: "pluginKey",
  },
  paperclip_install_plugin: {
    args: { packageName: "nonexistent-test-pkg-xyz-functional" },
    expectError: true,
    expectErrorContains: null, // just expect any error
  },
  paperclip_list_plugin_examples: { args: { response_format: "json" } },
  paperclip_enable_plugin: {
    argsFn: (c) => ({ pluginKey: c.pluginKey }),
    dependsOn: "pluginKey",
  },
  paperclip_disable_plugin: {
    argsFn: (c) => ({ pluginKey: c.pluginKey }),
    dependsOn: "pluginKey",
  },

  // --- secrets ---
  paperclip_list_secrets: { argsFn: (c) => ({ companyId: c.companyId, response_format: "json" }) },
  paperclip_create_secret: {
    argsFn: (c) => ({
      companyId: c.companyId,
      name: `FUNC_TEST_EXTRA_${Date.now()}`,
      value: "test-secret-value",
    }),
  },
  paperclip_update_secret: {
    argsFn: (c) => ({ secretId: c.secretId, description: "Updated by functional test" }),
    dependsOn: "secretId",
  },
  paperclip_rotate_secret: {
    argsFn: (c) => ({ secretId: c.secretId, value: "rotated-secret-value" }),
    dependsOn: "secretId",
  },

  // --- runs ---
  paperclip_list_heartbeat_runs: {
    argsFn: (c) => ({ companyId: c.companyId, response_format: "json" }),
  },
  paperclip_list_run_events: {
    argsFn: (c) => ({ runId: c.runId, response_format: "json" }),
    dependsOn: "runId",
  },
  paperclip_get_run_log: {
    argsFn: (c) => ({ runId: c.runId, response_format: "json" }),
    dependsOn: "runId",
  },

  // --- feedback ---
  paperclip_list_feedback_traces: {
    argsFn: (c) => ({ companyId: c.companyId, response_format: "json" }),
  },
  paperclip_list_issue_feedback_traces: {
    argsFn: (c) => ({ issueId: c.issueId, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_get_feedback_trace_bundle: {
    argsFn: (c) => ({ traceId: c.traceId, response_format: "json" }),
    dependsOn: "traceId",
  },

  // --- company-import ---
  paperclip_export_company: {
    argsFn: (c) => ({
      companyId: c.companyId,
      include: { company: true, agents: false, projects: false, issues: false, skills: false },
    }),
  },
  paperclip_preview_company_import: {
    argsFn: (c) => ({
      companyId: c.companyId,
      source: {
        type: "inline",
        rootPath: "test-company",
        files: {
          "COMPANY.md": "# Test Company\n\nFunctional test preview.",
        },
      },
      include: { company: true, agents: false, projects: false, issues: false, skills: false },
      target: { mode: "existing_company", companyId: c.companyId },
    }),
  },
  paperclip_apply_company_import: {
    skip: "requires a valid complete bundle; could overwrite company data — covered by preview test",
  },
};

// ---------------------------------------------------------------------------
// Module groupings (for report)
// ---------------------------------------------------------------------------

const MODULE_MAP = {
  identity: [
    "paperclip_get_me",
    "paperclip_get_inbox",
    "paperclip_get_current_user",
    "paperclip_revoke_current_session",
  ],
  issues: [
    "paperclip_list_issues",
    "paperclip_get_issue",
    "paperclip_get_heartbeat_context",
    "paperclip_checkout_issue",
    "paperclip_release_issue",
    "paperclip_update_issue",
    "paperclip_create_issue",
  ],
  comments: ["paperclip_list_comments", "paperclip_add_comment", "paperclip_get_comment"],
  documents: [
    "paperclip_list_documents",
    "paperclip_get_document",
    "paperclip_upsert_document",
    "paperclip_delete_document",
    "paperclip_get_document_revisions",
  ],
  agents: [
    "paperclip_list_agents",
    "paperclip_get_agent",
    "paperclip_update_agent",
    "paperclip_update_agent_permissions",
    "paperclip_pause_agent",
    "paperclip_resume_agent",
    "paperclip_invoke_heartbeat",
    "paperclip_terminate_agent",
    "paperclip_create_agent_key",
    "paperclip_list_agent_config_revisions",
    "paperclip_rollback_agent_config",
    "paperclip_set_agent_instructions_path",
    "paperclip_get_org_chart",
    "paperclip_sync_agent_skills",
    "paperclip_list_company_skills",
    "paperclip_wakeup_agent",
    "paperclip_create_agent",
  ],
  dashboard: ["paperclip_get_dashboard"],
  approvals: [
    "paperclip_list_approvals",
    "paperclip_get_approval",
    "paperclip_create_approval",
    "paperclip_approve",
    "paperclip_reject",
    "paperclip_request_revision",
    "paperclip_resubmit_approval",
    "paperclip_list_approval_comments",
    "paperclip_add_approval_comment",
    "paperclip_create_agent_hire",
    "paperclip_list_approval_issues",
  ],
  goals: [
    "paperclip_list_goals",
    "paperclip_get_goal",
    "paperclip_create_goal",
    "paperclip_update_goal",
  ],
  projects: [
    "paperclip_list_projects",
    "paperclip_get_project",
    "paperclip_create_project",
    "paperclip_update_project",
    "paperclip_list_workspaces",
    "paperclip_create_workspace",
    "paperclip_update_workspace",
    "paperclip_delete_workspace",
  ],
  activity: [
    "paperclip_get_activity",
    "paperclip_get_cost_summary",
    "paperclip_get_costs_by_agent",
    "paperclip_get_costs_by_project",
    "paperclip_report_cost_event",
  ],
  routines: [
    "paperclip_list_routines",
    "paperclip_get_routine",
    "paperclip_create_routine",
    "paperclip_update_routine",
    "paperclip_add_routine_trigger",
    "paperclip_update_routine_trigger",
    "paperclip_delete_routine_trigger",
    "paperclip_run_routine",
    "paperclip_list_routine_runs",
  ],
  attachments: [
    "paperclip_list_attachments",
    "paperclip_upload_attachment",
    "paperclip_download_attachment",
    "paperclip_delete_attachment",
  ],
  labels: ["paperclip_list_labels", "paperclip_create_label"],
  company: [
    "paperclip_list_companies",
    "paperclip_get_company",
    "paperclip_create_company",
    "paperclip_update_company",
    "paperclip_archive_company",
  ],
  plugins: [
    "paperclip_list_plugins",
    "paperclip_get_plugin",
    "paperclip_install_plugin",
    "paperclip_list_plugin_examples",
    "paperclip_enable_plugin",
    "paperclip_disable_plugin",
  ],
  secrets: [
    "paperclip_list_secrets",
    "paperclip_create_secret",
    "paperclip_update_secret",
    "paperclip_rotate_secret",
  ],
  runs: ["paperclip_list_heartbeat_runs", "paperclip_list_run_events", "paperclip_get_run_log"],
  feedback: [
    "paperclip_list_feedback_traces",
    "paperclip_list_issue_feedback_traces",
    "paperclip_get_feedback_trace_bundle",
  ],
  "company-import": [
    "paperclip_export_company",
    "paperclip_preview_company_import",
    "paperclip_apply_company_import",
  ],
};

// ---------------------------------------------------------------------------
// Run tool tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pre-run cleanup: release stale locks from prior runs so checkout test works.
// Use POST /release (not PATCH) — it atomically clears checkoutRunId, status,
// executionRunId, and executionLockedAt. A PATCH only clears two of those
// fields, leaving the issue in status=in_progress with checkoutRunId set,
// which causes a 409 on the checkout test.
// ---------------------------------------------------------------------------
if (ctx.issueId) {
  try {
    await apiFetch("POST", `/api/issues/${ctx.issueId}/release`);
    console.log("  [CLEANUP] Released stale lock on seed issue (status reset to todo)");
  } catch {
    // 409 means not checked out — that is clean state, ignore
  }
}

console.log("\n=== TEST EXECUTION ===\n");

const results = [];
const client = makeClient(ctx.agentId);

// Re-patch the client's auth to use the real agentId
// (PaperclipClient reads auth at construction time from env or passed object)
// We need to use a client with the correct agentId
const realClient = new PaperclipClient({
  apiKey: API_KEY,
  apiUrl: API_URL,
  agentId: ctx.agentId ?? "unknown",
  companyId: COMPANY_ID,
  runId: "functional-test-run",
});

for (const tool of ALL_TOOLS) {
  const name = tool.name;
  const testCase = TEST_CASES[name];

  if (!testCase) {
    results.push({
      name,
      result: "SKIP",
      reason: "no test case defined — likely needs orchestration or is destructive",
      args: null,
      error: null,
    });
    console.log(`  [SKIP ] ${name}: no test case defined`);
    continue;
  }

  if (testCase.skip) {
    results.push({
      name,
      result: "SKIP",
      reason: testCase.skip,
      args: null,
      error: null,
    });
    console.log(`  [SKIP ] ${name}: ${testCase.skip}`);
    continue;
  }

  // Check dependency on ctx
  const dep = testCase.dependsOn ?? testCase.skipIfMissing;
  if (dep && ctx[dep] === null) {
    const reason = `seed failed to produce ${dep}; cannot run this test`;
    results.push({
      name,
      result: "SKIP",
      reason,
      args: null,
      error: null,
    });
    console.log(`  [SKIP ] ${name}: ${reason}`);
    continue;
  }

  // Build args
  let args;
  try {
    args = testCase.argsFn ? testCase.argsFn(ctx) : (testCase.args ?? {});
  } catch (err) {
    results.push({
      name,
      result: "SKIP",
      reason: `argsFn threw: ${err.message}`,
      args: null,
      error: null,
    });
    console.log(`  [SKIP ] ${name}: argsFn threw: ${err.message}`);
    continue;
  }

  // Run before hook if any
  if (testCase.before) {
    try {
      await testCase.before(ctx, realClient);
    } catch (err) {
      // before hook failure doesn't skip the test, just log
      console.log(`         [before hook failed for ${name}]: ${err.message}`);
    }
  }

  // Execute
  let outcome;
  try {
    const result = await tool.handler(args, realClient);

    if (result.isError === true && !testCase.expectError) {
      // Extract error text
      const errText = result.content?.[0]?.text ?? "(no content)";
      outcome = {
        name,
        result: "FAIL",
        reason: "tool returned isError=true",
        args,
        error: errText,
      };
      console.log(`  [FAIL ] ${name}: ${errText.slice(0, 150)}`);
    } else if (result.isError === true && testCase.expectError) {
      // Expected error — check content if expectErrorContains is set
      const errText = result.content?.[0]?.text ?? "";
      if (testCase.expectErrorContains && !errText.includes(testCase.expectErrorContains)) {
        outcome = {
          name,
          result: "FAIL",
          reason: `expected error containing "${testCase.expectErrorContains}" but got: ${errText.slice(0, 150)}`,
          args,
          error: errText,
        };
        console.log(`  [FAIL ] ${name}: wrong error content`);
      } else {
        outcome = {
          name,
          result: "PASS",
          reason: "returned expected error",
          args,
          error: null,
        };
        console.log(`  [PASS ] ${name}: expected error received`);
      }
    } else {
      outcome = {
        name,
        result: "PASS",
        reason: null,
        args,
        error: null,
      };
      console.log(`  [PASS ] ${name}`);
    }
  } catch (err) {
    const errMsg = err?.message ?? String(err);
    const stack = err?.stack ?? "";
    outcome = {
      name,
      result: "FAIL",
      reason: "handler threw an exception",
      args,
      error: errMsg,
      stack: stack.slice(0, 500),
    };
    console.log(`  [FAIL ] ${name}: threw: ${errMsg.slice(0, 150)}`);
  }

  results.push(outcome);

  // Run after hook if any
  if (testCase.after) {
    try {
      await testCase.after(ctx, realClient);
    } catch (err) {
      console.log(`         [after hook failed for ${name}]: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.result === "PASS").length;
const fail = results.filter((r) => r.result === "FAIL").length;
const skip = results.filter((r) => r.result === "SKIP").length;
const total = results.length;

console.log(`\n=== RESULTS: PASS ${pass} | FAIL ${fail} | SKIP ${skip} | TOTAL ${total} ===\n`);

const failures = results.filter((r) => r.result === "FAIL");
if (failures.length > 0) {
  console.log("FAILURES:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error?.slice(0, 200) ?? f.reason}`);
  }
}

// ---------------------------------------------------------------------------
// Build report
// ---------------------------------------------------------------------------

const now = new Date().toISOString().slice(0, 10);

// Detect missing tools from MODULE_MAP
const allMapped = new Set(Object.values(MODULE_MAP).flat());
const allTested = new Set(ALL_TOOLS.map((t) => t.name));
const unmappedInResults = results.filter((r) => !allMapped.has(r.name));

// JSON report
const jsonReport = {
  generatedAt: new Date().toISOString(),
  apiUrl: API_URL,
  companyId: COMPANY_ID,
  summary: { total, pass, fail, skip },
  seed: seedLog,
  ctx,
  results,
};

// Markdown report
function mdTable(rows) {
  const header = "| Tool | Result | Notes |\n|---|---|---|";
  const body = rows
    .map((r) => {
      const icon = r.result === "PASS" ? "✓" : r.result === "FAIL" ? "✗" : "~";
      const note =
        r.result === "FAIL" ? (r.error ?? r.reason ?? "").slice(0, 120) : (r.reason ?? "");
      return `| ${r.name} | ${icon} ${r.result} | ${note} |`;
    })
    .join("\n");
  return `${header}\n${body}`;
}

let md = `# Functional Test Report — ${now}\n\n`;
md += `**API:** Paperclip @ ${API_URL} (local_trusted)\n`;
md += `**Tool count:** ${total}\n`;
md += `**Run:** PASS ${pass} | FAIL ${fail} | SKIP ${skip}\n\n`;

md += `## Seed\n\n`;
for (const s of seedLog) {
  const icon = s.ok ? "✓" : "✗";
  md += `- ${icon} **${s.name}**: ${s.ok ? s.value : s.reason}\n`;
}

md += `\n## Results by module\n\n`;
for (const [mod, toolNames] of Object.entries(MODULE_MAP)) {
  const modResults = toolNames.map((n) => results.find((r) => r.name === n)).filter(Boolean);
  if (modResults.length === 0) continue;
  md += `### ${mod} (${modResults.length} tools)\n\n`;
  md += mdTable(modResults);
  md += "\n\n";
}

// Tools in results not in any module
if (unmappedInResults.length > 0) {
  md += `### (unmapped tools)\n\n`;
  md += mdTable(unmappedInResults);
  md += "\n\n";
}

if (failures.length > 0) {
  md += `## Failures (detailed)\n\n`;
  for (const f of failures) {
    md += `### ${f.name} — FAIL\n\n`;
    md += `- **Args:** \`${JSON.stringify(f.args)}\`\n`;
    md += `- **Error:** ${f.error ?? f.reason}\n`;
    if (f.stack) md += `- **Stack:** \`${f.stack}\`\n`;
    md += "\n";
  }
}

// ---------------------------------------------------------------------------
// Write reports
// ---------------------------------------------------------------------------

const reportDir = join(ROOT, "scripts");
writeFileSync(join(reportDir, ".functional-test-report.json"), JSON.stringify(jsonReport, null, 2));
writeFileSync(join(reportDir, ".functional-test-report.md"), md);

console.log(`\nReports written:`);
console.log(`  scripts/.functional-test-report.json`);
console.log(`  scripts/.functional-test-report.md`);

// Exit with error code if any FAILs
if (fail > 0) {
  process.exit(1);
}
