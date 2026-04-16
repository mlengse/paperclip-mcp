#!/usr/bin/env node
/**
 * Docker/Podman-image functional test harness for paperclip-mcp.
 *
 * Spawns the container via `podman run --network=host` using a lightweight
 * JSON-RPC stdio transport, sends MCP tools/call for every tool in the catalog,
 * and produces PASS/FAIL/SKIP reports — matching the semantics of
 * functional-test.mjs but exercising the packaged dist/ build inside the image.
 *
 * Usage:
 *   node scripts/functional-test-docker.mjs
 *   npm run test:functional:docker
 *
 * Environment overrides:
 *   CONTAINER_IMAGE   — default: paperclip-mcp:2.0.0
 *   CONTAINER_RUNTIME — default: podman
 */

import { writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = "http://127.0.0.1:3100";
const API_KEY = "local-board-noauth";
const IMAGE = process.env["CONTAINER_IMAGE"] ?? "paperclip-mcp:2.0.0";
const RUNTIME = process.env["CONTAINER_RUNTIME"] ?? "podman";

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

console.log("\n=== PRE-FLIGHT ===\n");

// 1. Verify container image exists (execFileSync avoids shell injection; args are static)
try {
  execFileSync(RUNTIME, ["image", "inspect", IMAGE], { stdio: "pipe" });
  console.log(`  [OK] Image ${IMAGE} found`);
} catch {
  console.error(`  [FAIL] Image ${IMAGE} not found. Run: npm run docker:build`);
  process.exit(1);
}

// 2. Verify Paperclip server health
try {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { status } = await res.json();
  console.log(`  [OK] Paperclip server healthy: ${status}`);
} catch (err) {
  console.error(`  [FAIL] Paperclip server not reachable at ${API_URL}: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Raw fetch helpers (seed phase — no MCP client needed)
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

const seedLog = [];

function seedOk(name, value) {
  seedLog.push({ name, value, ok: true });
  console.log(`  [SEED] ok  ${name}: ${value}`);
}

function seedFail(name, reason) {
  seedLog.push({ name, value: null, ok: false, reason });
  console.log(`  [SEED] err ${name}: ${reason}`);
}

// Create a fresh company so this harness doesn't conflict with in-process tests
let COMPANY_ID;
try {
  const company = await apiFetch("POST", "/api/companies", {
    name: "Docker Functional Test Company",
  });
  COMPANY_ID = company.id;
  seedOk("companyId", COMPANY_ID);
} catch (err) {
  console.error(`  [FAIL] Could not create test company: ${err.message}`);
  process.exit(1);
}

const ctx = {
  companyId: COMPANY_ID,
  agentId: null,
  projectId: null,
  goalId: null,
  issueId: null,
  issueIdentifier: null,
  labelId: null,
  workspaceId: null,
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

// Step 1: create an agent (fresh company has none)
try {
  const agent = await apiFetch("POST", `/api/companies/${COMPANY_ID}/agents`, {
    name: "Docker Test Agent",
    role: "engineer",
    title: "Test Engineer",
  });
  ctx.agentId = agent.id;
  seedOk("agentId", ctx.agentId);
} catch (err) {
  seedFail("agentId", err.message);
}

// Step 2: create project
try {
  const proj = await apiFetch("POST", `/api/companies/${COMPANY_ID}/projects`, {
    name: "Docker Test Project",
  });
  ctx.projectId = proj.id;
  seedOk("projectId", ctx.projectId);
} catch (err) {
  seedFail("projectId", err.message);
}

// Step 3: create goal
try {
  const goal = await apiFetch("POST", `/api/companies/${COMPANY_ID}/goals`, {
    title: "Docker Test Goal",
  });
  ctx.goalId = goal.id;
  seedOk("goalId", ctx.goalId);
} catch (err) {
  seedFail("goalId", err.message);
}

// Step 4: create issue
try {
  if (!ctx.projectId) throw new Error("no projectId");
  const issue = await apiFetch("POST", `/api/companies/${COMPANY_ID}/issues`, {
    title: "Docker test seed issue",
    status: "todo",
    projectId: ctx.projectId,
    goalId: ctx.goalId ?? undefined,
  });
  ctx.issueId = issue.id;
  ctx.issueIdentifier = issue.identifier;
  seedOk("issueId", `${ctx.issueId} (${ctx.issueIdentifier})`);
} catch (err) {
  seedFail("issueId", err.message);
}

// Step 5: create label
try {
  const label = await apiFetch("POST", `/api/companies/${COMPANY_ID}/labels`, {
    name: "type:docker-test",
    color: "#6366f1",
  });
  ctx.labelId = label.id;
  seedOk("labelId", ctx.labelId);
} catch (err) {
  seedFail("labelId", err.message);
}

// Step 6: create workspace
try {
  if (!ctx.projectId) throw new Error("no projectId");
  const ws = await apiFetch("POST", `/api/projects/${ctx.projectId}/workspaces`, {
    cwd: "/tmp/docker-functional-test-workspace",
  });
  ctx.workspaceId = ws.id;
  seedOk("workspaceId", ctx.workspaceId);
} catch (err) {
  seedFail("workspaceId", err.message);
}

// Step 7: add comment
try {
  if (!ctx.issueId) throw new Error("no issueId");
  const comment = await apiFetch("POST", `/api/issues/${ctx.issueId}/comments`, {
    body: "Docker functional test seed comment",
  });
  ctx.commentId = comment.id;
  seedOk("commentId", ctx.commentId);
} catch (err) {
  seedFail("commentId", err.message);
}

// Step 8: seed a document so get/revisions tests pass
try {
  if (!ctx.issueId) throw new Error("no issueId");
  // Try PUT upsert first, fall back to POST create
  let seeded = false;
  try {
    await apiFetch("PUT", `/api/issues/${ctx.issueId}/documents/${ctx.documentKey}`, {
      title: "Docker Plan",
      body: "# Docker functional test plan\n\nSeeded by docker harness.",
      format: "markdown",
    });
    seeded = true;
  } catch {
    /* fall through to POST */
  }
  if (!seeded) {
    await apiFetch("POST", `/api/issues/${ctx.issueId}/documents`, {
      key: ctx.documentKey,
      title: "Docker Plan",
      body: "# Docker functional test plan\n\nSeeded by docker harness.",
      format: "markdown",
    });
  }
  seedOk("document", `key="${ctx.documentKey}" seeded`);
} catch (err) {
  seedFail("document", err.message);
}

// Step 9: create approval
try {
  const approval = await apiFetch("POST", `/api/companies/${COMPANY_ID}/approvals`, {
    type: "budget_override_required",
    payload: { note: "Docker functional test approval" },
    title: "Docker functional test approval",
  });
  ctx.approvalId = approval.id;
  seedOk("approvalId", ctx.approvalId);
} catch (err) {
  seedFail("approvalId", err.message);
}

// Step 10: create routine
try {
  if (!ctx.agentId) throw new Error("no agentId");
  const routine = await apiFetch("POST", `/api/companies/${COMPANY_ID}/routines`, {
    assigneeAgentId: ctx.agentId,
    title: "docker-test-routine",
    description: "Seeded by docker functional test harness",
  });
  ctx.routineId = routine.id;
  seedOk("routineId", ctx.routineId);
} catch (err) {
  seedFail("routineId", err.message);
}

// Step 11: add routine trigger
try {
  if (!ctx.routineId) throw new Error("no routineId");
  const triggerResp = await apiFetch("POST", `/api/routines/${ctx.routineId}/triggers`, {
    kind: "api",
  });
  const trigger = triggerResp.trigger ?? triggerResp;
  ctx.triggerId = trigger.id;
  seedOk("triggerId", ctx.triggerId);
} catch (err) {
  seedFail("triggerId", err.message);
}

// Step 12: create secret
try {
  const secret = await apiFetch("POST", `/api/companies/${COMPANY_ID}/secrets`, {
    name: `DOCKER_FUNC_TEST_KEY_${Date.now()}`,
    value: "docker-functional-test-secret-value",
    description: "Created by docker functional test harness",
  });
  ctx.secretId = secret.id;
  seedOk("secretId", ctx.secretId);
} catch (err) {
  seedFail("secretId", err.message);
}

// Step 13: try to get a runId
try {
  const runs = await apiFetch("GET", `/api/companies/${COMPANY_ID}/heartbeat-runs`);
  if (runs && runs.length > 0) {
    ctx.runId = runs[0].id;
    seedOk("runId", ctx.runId);
  } else {
    seedFail("runId", "no heartbeat runs; dependent tools will be SKIP");
  }
} catch (err) {
  seedFail("runId", err.message);
}

// Step 14: try to get a traceId
try {
  const traces = await apiFetch("GET", `/api/companies/${COMPANY_ID}/feedback-traces`);
  if (traces && traces.length > 0) {
    ctx.traceId = traces[0].id;
    seedOk("traceId", ctx.traceId);
  } else {
    seedFail("traceId", "no feedback traces; dependent tools will be SKIP");
  }
} catch (err) {
  seedFail("traceId", err.message);
}

// Step 15: try to get a pluginKey
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

// Step 16: try to get agent config revisionId
try {
  if (!ctx.agentId) throw new Error("no agentId");
  const revisions = await apiFetch("GET", `/api/agents/${ctx.agentId}/config-revisions`);
  if (revisions && revisions.length > 0) {
    ctx.revisionId = revisions[0].id;
    seedOk("revisionId", ctx.revisionId);
  } else {
    seedFail("revisionId", "no config revisions; dependent tools will be SKIP");
  }
} catch (err) {
  seedFail("revisionId", err.message);
}

console.log("\n=== SEED COMPLETE ===\n");
console.log("Context:", JSON.stringify(ctx, null, 2));

// ---------------------------------------------------------------------------
// Pre-run cleanup: release stale locks
// ---------------------------------------------------------------------------

if (ctx.issueId) {
  try {
    await apiFetch("POST", `/api/issues/${ctx.issueId}/release`);
    console.log("  [CLEANUP] Released stale lock on seed issue");
  } catch {
    // 409 = already clean
  }
}

// ---------------------------------------------------------------------------
// Import tool list from src — names only, NOT for execution
// (tsx/esm handles TypeScript at runtime)
// ---------------------------------------------------------------------------

// Must set env before importing auth.ts (reads at import time)
process.env["PAPERCLIP_API_KEY"] = API_KEY;
process.env["PAPERCLIP_API_URL"] = API_URL;
process.env["PAPERCLIP_COMPANY_ID"] = COMPANY_ID;
process.env["PAPERCLIP_AGENT_ID"] = ctx.agentId ?? "placeholder";
process.env["PAPERCLIP_RUN_ID"] = "docker-functional-test-run";

const { ALL_TOOLS } = await import("../src/tools/index.ts");

// ---------------------------------------------------------------------------
// MCP stdio transport — lightweight raw JSON-RPC over stdin/stdout
// ---------------------------------------------------------------------------

console.log("\n=== MCP CLIENT INIT ===\n");

const { spawn } = await import("node:child_process");

const containerArgs = [
  "run",
  "-i",
  "--rm",
  "--network=host",
  "-e",
  `PAPERCLIP_API_KEY=${API_KEY}`,
  "-e",
  `PAPERCLIP_API_URL=${API_URL}`,
  "-e",
  `PAPERCLIP_AGENT_ID=${ctx.agentId ?? "00000000-0000-0000-0000-000000000000"}`,
  "-e",
  `PAPERCLIP_COMPANY_ID=${COMPANY_ID}`,
  "-e",
  `PAPERCLIP_RUN_ID=docker-functional-test-run`,
  IMAGE,
];

console.log(`  Runtime : ${RUNTIME}`);
console.log(`  Image   : ${IMAGE}`);
console.log(`  Company : ${COMPANY_ID}`);
console.log(`  Agent   : ${ctx.agentId}`);

const proc = spawn(RUNTIME, containerArgs, {
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrBuf = "";
proc.stderr.on("data", (chunk) => {
  stderrBuf += chunk.toString("utf8");
});

// Newline-delimited JSON-RPC reader
let stdoutBuf = "";
const pendingRequests = new Map();
let nextId = 1;

function dispatchLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.id != null && pendingRequests.has(msg.id)) {
    const { resolve, reject } = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    if (msg.error) {
      reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
    } else {
      resolve(msg.result);
    }
  }
}

proc.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString("utf8");
  const parts = stdoutBuf.split("\n");
  stdoutBuf = parts.pop() ?? "";
  for (const line of parts) {
    dispatchLine(line);
  }
});

proc.stdout.on("end", () => {
  if (stdoutBuf.trim()) dispatchLine(stdoutBuf);
});

proc.on("error", (err) => {
  console.error(`  [ERROR] Container process error: ${err.message}`);
});

function sendRpc(method, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for ${method} (id=${id})`));
      }
    }, timeoutMs);
    pendingRequests.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    proc.stdin.write(msg + "\n");
  });
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  proc.stdin.write(msg + "\n");
}

// MCP handshake
try {
  const initResult = await sendRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "functional-test-docker", version: "1.0.0" },
  });
  sendNotification("notifications/initialized", {});
  console.log(
    `  [OK] MCP handshake complete. Server: ${initResult?.serverInfo?.name ?? "unknown"}`
  );
} catch (err) {
  console.error(`  [FAIL] MCP handshake failed: ${err.message}`);
  if (stderrBuf.trim()) {
    console.error("  [STDERR]", stderrBuf.trim().slice(0, 500));
  }
  proc.kill("SIGTERM");
  process.exit(1);
}

// Verify tools/list
try {
  const listResult = await sendRpc("tools/list", {});
  const count = listResult?.tools?.length ?? 0;
  console.log(`  [OK] tools/list returned ${count} tools`);
  if (count < 100) {
    console.log(`  [WARN] Expected >=100 tools but got ${count}`);
  }
} catch (err) {
  console.error(`  [FAIL] tools/list failed: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Helper: call a tool via MCP JSON-RPC
// ---------------------------------------------------------------------------

async function callTool(name, args) {
  return sendRpc("tools/call", { name, arguments: args }, 45000);
}

// ---------------------------------------------------------------------------
// Helper: release issue via direct HTTP (before/after hooks bypass MCP)
// ---------------------------------------------------------------------------

async function httpReleaseIssue(issueId) {
  try {
    await apiFetch("POST", `/api/issues/${issueId}/release`);
  } catch {
    // 409 = already clean
  }
}

// ---------------------------------------------------------------------------
// Test case definitions
// ---------------------------------------------------------------------------

const TEST_CASES = {
  // --- identity ---
  paperclip_get_me: { args: { response_format: "json" } },
  paperclip_get_inbox: {
    args: { response_format: "json" },
    // local_trusted board key cannot access agent-scoped inbox-lite endpoint
    expectError: true,
    expectErrorContains: null,
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
    before: async (c) => {
      await httpReleaseIssue(c.issueId);
    },
    after: async (c) => {
      await httpReleaseIssue(c.issueId);
    },
  },
  paperclip_release_issue: {
    argsFn: (c) => ({ issueId: c.issueId }),
    dependsOn: "issueId",
    before: async (c) => {
      // Checkout first so there is something to release
      try {
        await callTool("paperclip_checkout_issue", {
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
        });
      } catch {
        /* might already be released */
      }
    },
  },
  paperclip_update_issue: {
    argsFn: (c) => ({ issueId: c.issueId, priority: "medium" }),
    dependsOn: "issueId",
  },
  paperclip_create_issue: {
    args: {
      title: "Docker functional test created issue",
      status: "backlog",
    },
  },

  // --- comments ---
  paperclip_list_comments: {
    argsFn: (c) => ({ issueId: c.issueId, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_add_comment: {
    argsFn: (c) => ({ issueId: c.issueId, body: "Docker functional test comment" }),
    dependsOn: "issueId",
  },
  paperclip_get_comment: {
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
    argsFn: (c) => ({
      issueId: c.issueId,
      key: `plan-docker-${Date.now()}`,
      title: "Docker functional test plan (fresh key)",
      body: "# Docker functional test plan\nCreated by docker harness.",
    }),
    dependsOn: "issueId",
  },
  paperclip_get_document_revisions: {
    argsFn: (c) => ({ issueId: c.issueId, key: c.documentKey, response_format: "json" }),
    dependsOn: "issueId",
  },
  paperclip_delete_document: {
    skip: "destructive — covered by upsert + get + revisions tests",
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
      capabilities: "Updated by docker functional test harness",
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
    after: async (c) => {
      try {
        await callTool("paperclip_resume_agent", { agentId: c.agentId });
      } catch {
        /* ignore */
      }
    },
  },
  paperclip_resume_agent: {
    argsFn: (c) => ({ agentId: c.agentId }),
    dependsOn: "agentId",
  },
  paperclip_invoke_heartbeat: {
    argsFn: (c) => ({ agentId: c.agentId }),
    dependsOn: "agentId",
  },
  paperclip_terminate_agent: {
    skip: "would permanently deactivate the test agent needed for all other tests",
  },
  paperclip_create_agent_key: {
    argsFn: (c) => ({
      agentId: c.agentId,
      name: "docker-functional-test-key",
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
    skipIfMissing: "revisionId",
  },
  paperclip_set_agent_instructions_path: {
    argsFn: (c) => ({
      agentId: c.agentId,
      path: "/tmp/AGENTS.md",
      adapterConfigKey: "instructionsFilePath",
    }),
    dependsOn: "agentId",
  },
  paperclip_get_org_chart: { args: { response_format: "json" } },
  paperclip_sync_agent_skills: {
    argsFn: (c) => ({ agentId: c.agentId, desiredSkills: [] }),
    dependsOn: "agentId",
  },
  paperclip_list_company_skills: { args: { response_format: "json" } },
  paperclip_wakeup_agent: {
    argsFn: (c) => ({ agentId: c.agentId, reason: "Docker functional test wake-up" }),
    dependsOn: "agentId",
  },
  paperclip_create_agent: {
    argsFn: (c) => ({
      companyId: c.companyId,
      name: "Docker Functional Test Agent",
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
    args: {
      type: "budget_override_required",
      payload: { note: "Extra approval created by docker functional test harness" },
    },
  },
  paperclip_approve: {
    argsFn: (c) => ({ approvalId: c.approvalId }),
    dependsOn: "approvalId",
  },
  paperclip_reject: {
    skip: "approval already consumed by paperclip_approve; only one terminal action per approval",
  },
  paperclip_request_revision: {
    skip: "approval already consumed by paperclip_approve; only one terminal action per approval",
  },
  paperclip_resubmit_approval: {
    skip: "requires a prior request_revision — skipped to avoid state conflicts",
  },
  paperclip_list_approval_comments: {
    argsFn: (c) => ({ approvalId: c.approvalId, response_format: "json" }),
    dependsOn: "approvalId",
  },
  paperclip_add_approval_comment: {
    argsFn: (c) => ({
      approvalId: c.approvalId,
      body: "Docker functional test approval comment",
    }),
    dependsOn: "approvalId",
  },
  paperclip_create_agent_hire: {
    args: {
      name: "Docker Functional Test Hire Agent",
      role: "engineer",
      title: "Test Hire",
      capabilities: "Test hire created by docker functional test harness",
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
  paperclip_create_goal: { args: { title: "Docker functional test goal" } },
  paperclip_update_goal: {
    argsFn: (c) => ({ goalId: c.goalId, title: "Docker functional test goal (updated)" }),
    dependsOn: "goalId",
  },

  // --- projects ---
  paperclip_list_projects: { args: { response_format: "json" } },
  paperclip_get_project: {
    argsFn: (c) => ({ projectId: c.projectId, response_format: "json" }),
    dependsOn: "projectId",
  },
  paperclip_create_project: { args: { name: "Docker functional test project" } },
  paperclip_update_project: {
    argsFn: (c) => ({
      projectId: c.projectId,
      description: "Updated by docker functional test harness",
    }),
    dependsOn: "projectId",
  },
  paperclip_list_workspaces: {
    argsFn: (c) => ({ projectId: c.projectId, response_format: "json" }),
    dependsOn: "projectId",
  },
  paperclip_create_workspace: {
    argsFn: (c) => ({
      projectId: c.projectId,
      cwd: "/tmp/docker-functional-test-ws-created",
    }),
    dependsOn: "projectId",
  },
  paperclip_update_workspace: {
    argsFn: (c) => ({
      projectId: c.projectId,
      workspaceId: c.workspaceId,
      cwd: "/tmp/docker-functional-test-ws-updated",
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
      title: "docker-test-routine-via-mcp",
    }),
    dependsOn: "agentId",
  },
  paperclip_update_routine: {
    argsFn: (c) => ({
      routineId: c.routineId,
      description: "Updated by docker functional test",
    }),
    dependsOn: "routineId",
  },
  paperclip_add_routine_trigger: {
    argsFn: (c) => ({ routineId: c.routineId, kind: "api" }),
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
    // The container does not have access to the host filesystem (no volume mount).
    // Skipped for Docker image validation; covered by in-process harness.
    skip: "container has no host filesystem access; covered by in-process harness",
  },
  paperclip_download_attachment: {
    argsFn: (c) => ({ attachmentId: c.attachmentId, response_format: "json" }),
    dependsOn: "attachmentId",
    skipIfMissing: "attachmentId",
  },
  paperclip_delete_attachment: {
    argsFn: (c) => ({ attachmentId: c.attachmentId }),
    dependsOn: "attachmentId",
    skipIfMissing: "attachmentId",
  },

  // --- labels ---
  paperclip_list_labels: { args: { response_format: "json" } },
  paperclip_create_label: {
    args: { name: `docker-functional-test-label-${Date.now()}`, color: "#ff6600" },
  },

  // --- company ---
  paperclip_list_companies: { args: { response_format: "json" } },
  paperclip_get_company: {
    argsFn: (c) => ({ companyId: c.companyId, response_format: "json" }),
  },
  paperclip_create_company: {
    args: { name: "Docker Functional Test Company (disposable)" },
  },
  paperclip_update_company: {
    argsFn: (c) => ({
      companyId: c.companyId,
      description: "Updated by docker functional test harness",
    }),
  },
  paperclip_archive_company: {
    skip: "would archive the test company needed for all other tests",
  },

  // --- plugins ---
  paperclip_list_plugins: { args: { response_format: "json" } },
  paperclip_get_plugin: {
    argsFn: (c) => ({ pluginKey: c.pluginKey, response_format: "json" }),
    skipIfMissing: "pluginKey",
  },
  paperclip_install_plugin: {
    args: { packageName: "nonexistent-test-pkg-xyz-docker-functional" },
    expectError: true,
    expectErrorContains: null,
  },
  paperclip_list_plugin_examples: { args: { response_format: "json" } },
  paperclip_enable_plugin: {
    argsFn: (c) => ({ pluginKey: c.pluginKey }),
    skipIfMissing: "pluginKey",
  },
  paperclip_disable_plugin: {
    argsFn: (c) => ({ pluginKey: c.pluginKey }),
    skipIfMissing: "pluginKey",
  },

  // --- secrets ---
  paperclip_list_secrets: {
    argsFn: (c) => ({ companyId: c.companyId, response_format: "json" }),
  },
  paperclip_create_secret: {
    argsFn: (c) => ({
      companyId: c.companyId,
      name: `DOCKER_FUNC_TEST_EXTRA_${Date.now()}`,
      value: "docker-test-secret-value",
    }),
  },
  paperclip_update_secret: {
    argsFn: (c) => ({
      secretId: c.secretId,
      description: "Updated by docker functional test",
    }),
    dependsOn: "secretId",
  },
  paperclip_rotate_secret: {
    argsFn: (c) => ({ secretId: c.secretId, value: "docker-rotated-secret-value" }),
    dependsOn: "secretId",
  },

  // --- runs ---
  paperclip_list_heartbeat_runs: {
    argsFn: (c) => ({ companyId: c.companyId, response_format: "json" }),
  },
  paperclip_list_run_events: {
    argsFn: (c) => ({ runId: c.runId, response_format: "json" }),
    skipIfMissing: "runId",
  },
  paperclip_get_run_log: {
    argsFn: (c) => ({ runId: c.runId, response_format: "json" }),
    skipIfMissing: "runId",
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
    skipIfMissing: "traceId",
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
          "COMPANY.md": "# Docker Test Company\n\nDocker functional test preview.",
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
// MODULE_MAP (mirrors functional-test.mjs for consistent reporting)
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
// Test execution loop
// ---------------------------------------------------------------------------

console.log("\n=== TEST EXECUTION ===\n");

const results = [];

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

  // Check context dependency
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

  // Before hook
  if (testCase.before) {
    try {
      await testCase.before(ctx);
    } catch (err) {
      console.log(`         [before hook failed for ${name}]: ${err.message}`);
    }
  }

  // Execute via MCP
  let outcome;
  try {
    const result = await callTool(name, args);
    const isError = result?.isError === true;

    if (isError && !testCase.expectError) {
      const errText = result?.content?.[0]?.text ?? "(no content)";
      outcome = {
        name,
        result: "FAIL",
        reason: "tool returned isError=true",
        args,
        error: errText,
      };
      console.log(`  [FAIL ] ${name}: ${errText.slice(0, 150)}`);
    } else if (isError && testCase.expectError) {
      const errText = result?.content?.[0]?.text ?? "";
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
      reason: "callTool threw an exception",
      args,
      error: errMsg,
      stack: stack.slice(0, 500),
    };
    console.log(`  [FAIL ] ${name}: threw: ${errMsg.slice(0, 150)}`);
  }

  results.push(outcome);

  // After hook
  if (testCase.after) {
    try {
      await testCase.after(ctx);
    } catch (err) {
      console.log(`         [after hook failed for ${name}]: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

proc.stdin.end();
await new Promise((resolve) => setTimeout(resolve, 500));
if (proc.exitCode === null) {
  proc.kill("SIGTERM");
}

if (stderrBuf.trim()) {
  console.log("\n[Container stderr (last 20 lines)]:");
  const lines = stderrBuf.trim().split("\n");
  for (const l of lines.slice(-20)) {
    console.log(`  ${l}`);
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
// Build reports
// ---------------------------------------------------------------------------

const now = new Date().toISOString().slice(0, 10);
const allMapped = new Set(Object.values(MODULE_MAP).flat());
const unmappedInResults = results.filter((r) => !allMapped.has(r.name));

const jsonReport = {
  generatedAt: new Date().toISOString(),
  apiUrl: API_URL,
  companyId: COMPANY_ID,
  image: IMAGE,
  runtime: RUNTIME,
  summary: { total, pass, fail, skip },
  seed: seedLog,
  ctx,
  results,
};

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

let md = `# Docker Functional Test Report — ${now}\n\n`;
md += `**Image:** \`${IMAGE}\` via \`${RUNTIME}\`\n`;
md += `**API:** Paperclip @ ${API_URL} (local_trusted, --network=host)\n`;
md += `**Company:** \`${COMPANY_ID}\` (fresh per-run)\n`;
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
writeFileSync(
  join(reportDir, ".functional-test-docker-report.json"),
  JSON.stringify(jsonReport, null, 2)
);
writeFileSync(join(reportDir, ".functional-test-docker-report.md"), md);

console.log(`\nReports written:`);
console.log(`  scripts/.functional-test-docker-report.json`);
console.log(`  scripts/.functional-test-docker-report.md`);

if (fail > 0) {
  process.exit(1);
}
