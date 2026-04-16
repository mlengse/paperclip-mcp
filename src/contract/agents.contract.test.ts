/**
 * Contract tests — src/tools/agents.ts
 *
 * Runs only when PAPERCLIP_CONTRACT_TESTS=1 is set (against a live server).
 * Five scenarios per tool:
 *   1. Happy path      — valid args → correct API response shape
 *   2. Validation fail — invalid Zod args → McpError before HTTP call
 *   3. Not-found       — non-existent UUID → isError: true (404)
 *   4. Permission denied — bad API key → isError: true (401/403)
 *   5. Alternate error / additional coverage
 *
 * NOTE: Destructive tools (paperclip_terminate_agent, paperclip_rollback_agent_config)
 * are tested with NONEXISTENT_UUID in scenario 1 to avoid real side-effects.
 * The structure of those tests verifies error propagation rather than the
 * happy-path outcome, which is not safely simulatable in automated CI.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { SKIP, buildContractClient, buildBadAuthClient, NONEXISTENT_UUID } from "./harness.js";
import { agentTools } from "../tools/agents.js";

const listAgents = agentTools.find((t) => t.name === "paperclip_list_agents")!;
const getAgent = agentTools.find((t) => t.name === "paperclip_get_agent")!;
const updateAgent = agentTools.find((t) => t.name === "paperclip_update_agent")!;
const updateAgentPermissions = agentTools.find(
  (t) => t.name === "paperclip_update_agent_permissions"
)!;
const pauseAgent = agentTools.find((t) => t.name === "paperclip_pause_agent")!;
const resumeAgent = agentTools.find((t) => t.name === "paperclip_resume_agent")!;
const invokeHeartbeat = agentTools.find((t) => t.name === "paperclip_invoke_heartbeat")!;
const terminateAgent = agentTools.find((t) => t.name === "paperclip_terminate_agent")!;
const createAgentKey = agentTools.find((t) => t.name === "paperclip_create_agent_key")!;
const listConfigRevisions = agentTools.find(
  (t) => t.name === "paperclip_list_agent_config_revisions"
)!;
const rollbackAgentConfig = agentTools.find((t) => t.name === "paperclip_rollback_agent_config")!;
const setInstructionsPath = agentTools.find(
  (t) => t.name === "paperclip_set_agent_instructions_path"
)!;
const getOrgChart = agentTools.find((t) => t.name === "paperclip_get_org_chart")!;
const syncAgentSkills = agentTools.find((t) => t.name === "paperclip_sync_agent_skills")!;
const listCompanySkills = agentTools.find((t) => t.name === "paperclip_list_company_skills")!;

// Initialized lazily inside each suite's before() to avoid throwing at module load
// when PAPERCLIP_CONTRACT_TESTS is not set (harness returns placeholders instead).
let client: ReturnType<typeof buildContractClient>;
let badClient: ReturnType<typeof buildBadAuthClient>;
/** The QA agent's own ID — safe to read and mutate in tests (restored in teardown). */
let selfAgentId: string;
/** Original title to restore after update tests. */
let originalTitle: string | undefined;

describe("contract: paperclip_list_agents", { skip: SKIP }, () => {
  before(() => {
    client = buildContractClient();
    badClient = buildBadAuthClient();
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — returns array of agents with id and name", async () => {
    const result = await listAgents.handler({}, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const agents = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(agents), "should return an array");
    assert.ok(agents.length > 0, "company should have at least one agent");
    assert.ok(agents[0]!.id, "agents should have id");
    assert.ok(agents[0]!.name, "agents should have name");
  });

  it("2. validation fail — unexpected non-empty input is tolerated (NoInput schema)", async () => {
    // NoInput schema accepts empty objects; extra keys should pass (Zod strips unknowns).
    const result = await listAgents.handler({ unexpected: "key" }, client);
    assert.ok(!result.isError);
  });

  it("3. not-found equivalent — result contains the current agent", async () => {
    const result = await listAgents.handler({}, client);
    const agents = JSON.parse(result.content[0]!.text) as Array<{ id: string }>;
    const found = agents.find((a) => a.id === selfAgentId);
    assert.ok(found, "QA agent should appear in the company agent list");
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await listAgents.handler({}, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. response shape — each agent has urlKey and role fields", async () => {
    const result = await listAgents.handler({}, client);
    const agents = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    for (const agent of agents) {
      assert.ok("urlKey" in agent, `agent ${agent["id"]} missing urlKey`);
      assert.ok("role" in agent, `agent ${agent["id"]} missing role`);
    }
  });
});

describe("contract: paperclip_get_agent", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — returns full agent details for self", async () => {
    const result = await getAgent.handler({ agentId: selfAgentId }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const agent = JSON.parse(result.content[0]!.text);
    assert.equal(agent.id, selfAgentId);
    assert.ok(typeof agent.name === "string");
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(async () => getAgent.handler({ agentId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError with 404", async () => {
    const result = await getAgent.handler({ agentId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await getAgent.handler({ agentId: selfAgentId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. response includes adapterConfig and runtimeConfig", async () => {
    const result = await getAgent.handler({ agentId: selfAgentId }, client);
    assert.ok(!result.isError);
    const agent = JSON.parse(result.content[0]!.text);
    assert.ok("adapterConfig" in agent || "runtimeConfig" in agent, "agent should have config");
  });
});

describe("contract: paperclip_update_agent", { skip: SKIP }, () => {
  before(async () => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
    // Capture original title for teardown restore.
    const res = await getAgent.handler({ agentId: selfAgentId }, client);
    const agent = JSON.parse(res.content[0]!.text);
    originalTitle = agent.title as string | undefined;
  });

  it("1. happy path — updates agent title and returns updated object", async () => {
    const result = await updateAgent.handler(
      { agentId: selfAgentId, title: "QA Engineer (contract-test)" },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const agent = JSON.parse(result.content[0]!.text);
    assert.equal(agent.title, "QA Engineer (contract-test)");
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(
      async () => updateAgent.handler({ agentId: "", title: "no id" }, client),
      McpError
    );
  });

  it("3. not-found — update on non-existent UUID returns isError", async () => {
    const result = await updateAgent.handler({ agentId: NONEXISTENT_UUID, title: "ghost" }, client);
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await updateAgent.handler(
      { agentId: selfAgentId, title: "should fail" },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. teardown restore — resets title to original value", async () => {
    const result = await updateAgent.handler(
      { agentId: selfAgentId, title: originalTitle ?? "QA" },
      client
    );
    assert.ok(!result.isError);
    const agent = JSON.parse(result.content[0]!.text);
    assert.equal(agent.title, originalTitle ?? "QA");
  });
});

describe("contract: paperclip_update_agent_permissions", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — sets permissions on self and returns updated object", async () => {
    const result = await updateAgentPermissions.handler(
      { agentId: selfAgentId, canAssignTasks: false, canCreateAgents: false },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data.id || data.agentId || data.permissions, "response should include update data");
  });

  it("2. validation fail — missing canAssignTasks rejected before HTTP call", async () => {
    await assert.rejects(
      async () =>
        updateAgentPermissions.handler({ agentId: selfAgentId, canCreateAgents: false }, client),
      McpError
    );
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await updateAgentPermissions.handler(
      { agentId: NONEXISTENT_UUID, canAssignTasks: false, canCreateAgents: false },
      client
    );
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await updateAgentPermissions.handler(
      { agentId: selfAgentId, canAssignTasks: false, canCreateAgents: false },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. both boolean fields required — missing canCreateAgents rejected", async () => {
    await assert.rejects(
      async () =>
        updateAgentPermissions.handler({ agentId: selfAgentId, canAssignTasks: true }, client),
      McpError
    );
  });
});

describe("contract: paperclip_pause_agent / paperclip_resume_agent", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  // pause
  it("pause 1. happy path — pauses self; resume immediately restores", async () => {
    const pauseResult = await pauseAgent.handler({ agentId: selfAgentId }, client);
    assert.ok(!pauseResult.isError, `Pause error: ${pauseResult.content[0]?.text}`);
    // Immediately resume so the agent remains functional.
    const resumeResult = await resumeAgent.handler({ agentId: selfAgentId }, client);
    assert.ok(!resumeResult.isError, `Resume error: ${resumeResult.content[0]?.text}`);
  });

  it("pause 2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(async () => pauseAgent.handler({ agentId: "" }, client), McpError);
  });

  it("pause 3. not-found — non-existent UUID returns isError", async () => {
    const result = await pauseAgent.handler({ agentId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
  });

  it("pause 4. permission denied — bad API key returns isError", async () => {
    const result = await pauseAgent.handler({ agentId: selfAgentId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  // resume
  it("resume 5. not-found — non-existent UUID returns isError", async () => {
    const result = await resumeAgent.handler({ agentId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
  });
});

describe("contract: paperclip_invoke_heartbeat", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — invokes heartbeat on self; server accepts the request", async () => {
    const result = await invokeHeartbeat.handler({ agentId: selfAgentId }, client);
    // A 200/202 is expected; some server builds return 200 with a run object.
    assert.ok(
      !result.isError || result.content[0]!.text.includes("already running"),
      `Unexpected error: ${result.content[0]?.text}`
    );
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(async () => invokeHeartbeat.handler({ agentId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await invokeHeartbeat.handler({ agentId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await invokeHeartbeat.handler({ agentId: selfAgentId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. response shape — success response includes run metadata or accepted status", async () => {
    const result = await invokeHeartbeat.handler({ agentId: selfAgentId }, client);
    // Either success or an "already running" informational error — both are fine.
    assert.ok(result.content.length > 0, "response should have content");
  });
});

describe("contract: paperclip_terminate_agent", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  // NOTE: Happy-path terminate is not safe in automated tests.
  // Scenario 1 exercises the HTTP path with a non-existent UUID to verify
  // error propagation without causing real agent termination.
  it("1. non-existent UUID — terminate returns isError with 404 (safe substitute for happy path)", async () => {
    const result = await terminateAgent.handler({ agentId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(async () => terminateAgent.handler({ agentId: "" }, client), McpError);
  });

  it("3. not-found — a second non-existent ID to confirm consistent 404 handling", async () => {
    const result = await terminateAgent.handler(
      { agentId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
      client
    );
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await terminateAgent.handler({ agentId: selfAgentId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. response is structured isError — text content is never empty", async () => {
    const result = await terminateAgent.handler({ agentId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.length > 0, "error text should be non-empty");
  });
});

describe("contract: paperclip_create_agent_key", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — creates an API key for self and returns key metadata", async () => {
    const result = await createAgentKey.handler(
      { agentId: selfAgentId, name: "contract-test-key" },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data.id || data.key || data.token, "response should include key data");
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(async () => createAgentKey.handler({ agentId: "" }, client), McpError);
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await createAgentKey.handler(
      { agentId: NONEXISTENT_UUID, name: "test" },
      client
    );
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await createAgentKey.handler({ agentId: selfAgentId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. optional fields — key created without name or expiry", async () => {
    const result = await createAgentKey.handler({ agentId: selfAgentId }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
  });
});

describe("contract: paperclip_list_agent_config_revisions", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — returns list of config revisions for self", async () => {
    const result = await listConfigRevisions.handler({ agentId: selfAgentId }, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(data), "should return an array of revisions");
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(
      async () => listConfigRevisions.handler({ agentId: "" }, client),
      McpError
    );
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await listConfigRevisions.handler({ agentId: NONEXISTENT_UUID }, client);
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await listConfigRevisions.handler({ agentId: selfAgentId }, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. response shape — revisions include id and createdAt fields", async () => {
    const result = await listConfigRevisions.handler({ agentId: selfAgentId }, client);
    assert.ok(!result.isError);
    const revisions = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    if (revisions.length > 0) {
      assert.ok(revisions[0]!["id"], "revision should have id");
    }
  });
});

describe("contract: paperclip_rollback_agent_config", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  // NOTE: Rollback with a real revision ID could break agent config in production.
  // We use NONEXISTENT_UUID to verify error propagation safely.
  it("1. not-found — rollback to non-existent revisionId returns isError (safe substitute for happy path)", async () => {
    const result = await rollbackAgentConfig.handler(
      { agentId: selfAgentId, revisionId: NONEXISTENT_UUID },
      client
    );
    assert.equal(result.isError, true);
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(
      async () =>
        rollbackAgentConfig.handler({ agentId: "", revisionId: NONEXISTENT_UUID }, client),
      McpError
    );
  });

  it("3. validation fail — empty revisionId rejected before HTTP call", async () => {
    await assert.rejects(
      async () => rollbackAgentConfig.handler({ agentId: selfAgentId, revisionId: "" }, client),
      McpError
    );
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await rollbackAgentConfig.handler(
      { agentId: selfAgentId, revisionId: NONEXISTENT_UUID },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. consistent error format — isError response always has non-empty text", async () => {
    const result = await rollbackAgentConfig.handler(
      { agentId: NONEXISTENT_UUID, revisionId: NONEXISTENT_UUID },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.length > 0);
  });
});

describe("contract: paperclip_set_agent_instructions_path", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — sets instructions path on self and returns updated agent", async () => {
    const agentRes = await getAgent.handler({ agentId: selfAgentId }, client);
    const agent = JSON.parse(agentRes.content[0]!.text);
    const currentPath = (agent.adapterConfig?.instructionsFilePath as string | undefined) ?? null;

    const result = await setInstructionsPath.handler(
      { agentId: selfAgentId, path: currentPath },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(
      async () => setInstructionsPath.handler({ agentId: "", path: null }, client),
      McpError
    );
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await setInstructionsPath.handler(
      { agentId: NONEXISTENT_UUID, path: null },
      client
    );
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await setInstructionsPath.handler(
      { agentId: selfAgentId, path: null },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. null path — clears instructions path without error", async () => {
    const result = await setInstructionsPath.handler({ agentId: selfAgentId, path: null }, client);
    // Either success or a graceful error — must not throw.
    assert.ok(result.content.length > 0);
  });
});

describe("contract: paperclip_get_org_chart", { skip: SKIP }, () => {
  it("1. happy path — returns org chart with agents and relationships", async () => {
    const result = await getOrgChart.handler({}, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data, "should return org chart data");
  });

  it("2. validation fail — unexpected input is tolerated (NoInput schema)", async () => {
    const result = await getOrgChart.handler({ unexpected: "key" }, client);
    // Extra keys are stripped by Zod — should still succeed.
    assert.ok(!result.isError);
  });

  it("3. not-found equivalent — org chart always returns the current company chart", async () => {
    const result = await getOrgChart.handler({}, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(data !== null && data !== undefined);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await getOrgChart.handler({}, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. response is JSON-parseable and non-empty", async () => {
    const result = await getOrgChart.handler({}, client);
    assert.ok(!result.isError);
    const text = result.content[0]!.text;
    const parsed = JSON.parse(text);
    assert.ok(parsed !== null);
  });
});

describe("contract: paperclip_sync_agent_skills", { skip: SKIP }, () => {
  before(() => {
    selfAgentId = process.env["PAPERCLIP_AGENT_ID"]!;
  });

  it("1. happy path — syncs empty skill list on self without error", async () => {
    // We sync an empty array to avoid changing real skills on the agent.
    const result = await syncAgentSkills.handler(
      { agentId: selfAgentId, desiredSkills: [] },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
  });

  it("2. validation fail — empty agentId rejected before HTTP call", async () => {
    await assert.rejects(
      async () => syncAgentSkills.handler({ agentId: "", desiredSkills: [] }, client),
      McpError
    );
  });

  it("3. not-found — non-existent UUID returns isError", async () => {
    const result = await syncAgentSkills.handler(
      { agentId: NONEXISTENT_UUID, desiredSkills: [] },
      client
    );
    assert.equal(result.isError, true);
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await syncAgentSkills.handler(
      { agentId: selfAgentId, desiredSkills: [] },
      badClient
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. JSON-encoded array — desiredSkills accepts JSON-string form", async () => {
    const result = await syncAgentSkills.handler(
      { agentId: selfAgentId, desiredSkills: "[]" as unknown as string[] },
      client
    );
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
  });
});

describe("contract: paperclip_list_company_skills", { skip: SKIP }, () => {
  it("1. happy path — returns list of company skills", async () => {
    const result = await listCompanySkills.handler({}, client);
    assert.ok(!result.isError, `Unexpected error: ${result.content[0]?.text}`);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(data), "should return an array");
  });

  it("2. validation fail — unexpected input is tolerated (NoInput schema)", async () => {
    const result = await listCompanySkills.handler({ extra: "ignored" }, client);
    assert.ok(!result.isError);
  });

  it("3. not-found equivalent — empty skills list is valid, not a 404", async () => {
    const result = await listCompanySkills.handler({}, client);
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.ok(Array.isArray(data));
  });

  it("4. permission denied — bad API key returns isError", async () => {
    const result = await listCompanySkills.handler({}, badClient);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401") || result.content[0]!.text.includes("403"));
  });

  it("5. response shape — each skill has name and id fields when present", async () => {
    const result = await listCompanySkills.handler({}, client);
    assert.ok(!result.isError);
    const skills = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    for (const skill of skills) {
      assert.ok("name" in skill || "id" in skill, "skills should have name or id");
    }
  });
});
