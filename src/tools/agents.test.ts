import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { agentTools } from "./agents.js";
import { agentFixture } from "../test/helpers/fixtures.js";
import { assertPaginationEnvelope } from "../test/helpers/assert-result.js";

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

describe("paperclip_list_agents", () => {
  it("calls GET /api/companies/{id}/agents and returns agent list", async () => {
    const agents = [
      { id: "agent-1", name: "Engineer", role: "engineer", status: "idle" },
      { id: "agent-2", name: "QA", role: "qa", status: "running" },
    ];
    const { fn, calls } = mockFetch(200, agents);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({ response_format: "json" }, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/agents");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, agents);
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listAgents.handler(null, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });
});

describe("paperclip_get_agent", () => {
  it("calls GET /api/agents/{id} and returns agent data", async () => {
    const agent = { id: "agent-1", name: "Engineer", role: "engineer", status: "idle" };
    const { fn, calls } = mockFetch(200, agent);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getAgent.handler({ agentId: "agent-1", response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1?companyId=company-1");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, agent);
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getAgent.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getAgent.handler({ agentId: "missing-agent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("returns isError on 404 for non-UUID-format agentId (malformed string)", async () => {
    const { fn, calls } = mockFetch(404, { error: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getAgent.handler({ agentId: "not-a-valid-uuid" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
    assert.ok(
      calls[0]!.url.includes("companyId=company-1"),
      "companyId must be passed to avoid server 422 fallback"
    );
  });

  it("returns isError on 404 for UUID-format agentId that does not exist", async () => {
    const { fn, calls } = mockFetch(404, { error: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getAgent.handler(
      { agentId: "00000000-0000-0000-0000-000000000000" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
    assert.ok(
      calls[0]!.url.includes("companyId=company-1"),
      "companyId must be passed to avoid server 422 fallback"
    );
  });
});

describe("paperclip_update_agent", () => {
  it("calls PATCH /api/agents/{id} with only provided fields", async () => {
    const updated = { id: "agent-1", name: "Senior Engineer", status: "active" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgent.handler(
      { agentId: "agent-1", name: "Senior Engineer", status: "active" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "Senior Engineer");
    assert.equal(body.status, "active");
    assert.ok(!("agentId" in body), "agentId must not be in PATCH body");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, updated);
  });

  it("throws McpError when agentId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateAgent.handler({ name: "New Name" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgent.handler({ agentId: "missing-agent", name: "X" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_pause_agent", () => {
  it("calls POST /api/agents/{id}/pause and returns result", async () => {
    const agent = { id: "agent-1", status: "paused" };
    const { fn, calls } = mockFetch(200, agent);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await pauseAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/pause");
    assert.equal(calls[0]!.init.method, "POST");
    const parsedPause = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedPause, agent);
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => pauseAgent.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await pauseAgent.handler({ agentId: "missing-agent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_resume_agent", () => {
  it("calls POST /api/agents/{id}/resume and returns result", async () => {
    const agent = { id: "agent-1", status: "active" };
    const { fn, calls } = mockFetch(200, agent);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await resumeAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/resume");
    assert.equal(calls[0]!.init.method, "POST");
    const parsedResume = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedResume, agent);
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => resumeAgent.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 409 API error (agent already active)", async () => {
    const { fn } = mockFetch(409, { message: "Agent already active" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await resumeAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("409"));
  });
});

describe("paperclip_invoke_heartbeat", () => {
  it("calls POST /api/agents/{id}/heartbeat/invoke and returns result", async () => {
    const run = { id: "run-1", status: "running" };
    const { fn, calls } = mockFetch(200, run);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await invokeHeartbeat.handler({ agentId: "agent-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/heartbeat/invoke");
    assert.equal(calls[0]!.init.method, "POST");
    const parsedRun = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRun, run);
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => invokeHeartbeat.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await invokeHeartbeat.handler({ agentId: "missing-agent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_terminate_agent", () => {
  it("calls POST /api/agents/{id}/terminate and returns result", async () => {
    const resp = { id: "agent-1", status: "terminated" };
    const { fn, calls } = mockFetch(200, resp);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await terminateAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/terminate");
    assert.equal(calls[0]!.init.method, "POST");
    const parsedTerminate = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedTerminate, resp);
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => terminateAgent.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await terminateAgent.handler({ agentId: "missing-agent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_create_agent_key", () => {
  it("calls POST /api/agents/{id}/keys and returns key", async () => {
    const key = { id: "key-1", value: "secret-token" };
    const { fn, calls } = mockFetch(200, key);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createAgentKey.handler(
      { agentId: "agent-1", name: "ci-key", expiresAt: "2027-01-01T00:00:00Z" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/keys");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "ci-key");
    assert.equal(body.expiresAt, "2027-01-01T00:00:00Z");
    assert.ok(!("agentId" in body), "agentId must not be in POST body");
    const parsedKey = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedKey, key);
  });

  it("sends empty body when only agentId is provided", async () => {
    const { fn, calls } = mockFetch(200, { id: "key-2", value: "tok" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await createAgentKey.handler({ agentId: "agent-1" }, client);
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body, {});
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createAgentKey.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createAgentKey.handler({ agentId: "missing-agent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_list_agent_config_revisions", () => {
  it("calls GET /api/agents/{id}/config-revisions and returns revisions", async () => {
    const revisions = [{ id: "rev-1", createdAt: "2026-01-01T00:00:00Z" }];
    const { fn, calls } = mockFetch(200, revisions);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listConfigRevisions.handler(
      { agentId: "agent-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/config-revisions");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedRevisions = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRevisions.items, revisions);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listConfigRevisions.handler({ agentId: "missing-agent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listConfigRevisions.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("paperclip_rollback_agent_config", () => {
  it("calls POST /api/agents/{id}/config-revisions/{revId}/rollback and returns result", async () => {
    const resp = { id: "agent-1", configRevisionId: "rev-1" };
    const { fn, calls } = mockFetch(200, resp);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rollbackAgentConfig.handler(
      { agentId: "agent-1", revisionId: "rev-1" },
      client
    );
    assert.equal(
      calls[0]!.url,
      "http://localhost:3100/api/agents/agent-1/config-revisions/rev-1/rollback"
    );
    assert.equal(calls[0]!.init.method, "POST");
    const parsedRollback = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedRollback, resp);
  });

  it("throws McpError when revisionId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => rollbackAgentConfig.handler({ agentId: "agent-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 409 API error (revision conflict)", async () => {
    const { fn } = mockFetch(409, { message: "Revision conflict" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await rollbackAgentConfig.handler(
      { agentId: "agent-1", revisionId: "rev-stale" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("409"));
  });
});

describe("paperclip_set_agent_instructions_path", () => {
  it("calls PATCH /api/agents/{id}/instructions-path with path", async () => {
    const resp = { agentId: "agent-1", path: "agents/engineer/AGENTS.md" };
    const { fn, calls } = mockFetch(200, resp);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await setInstructionsPath.handler(
      { agentId: "agent-1", path: "agents/engineer/AGENTS.md" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/instructions-path");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.path, "agents/engineer/AGENTS.md");
    const parsedInstructions = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedInstructions, resp);
  });

  it("sends null path to clear instructions", async () => {
    const { fn, calls } = mockFetch(200, { agentId: "agent-1", path: null });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await setInstructionsPath.handler({ agentId: "agent-1", path: null }, client);
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.path, null);
  });

  it("includes adapterConfigKey when provided", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await setInstructionsPath.handler(
      { agentId: "agent-1", path: "/abs/AGENTS.md", adapterConfigKey: "customKey" },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.adapterConfigKey, "customKey");
  });

  it("throws McpError when agentId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => setInstructionsPath.handler({ agentId: "", path: "AGENTS.md" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await setInstructionsPath.handler(
      { agentId: "missing-agent", path: "AGENTS.md" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_get_org_chart", () => {
  it("calls GET /api/companies/{id}/org and returns org chart", async () => {
    const org = { id: "company-1", agents: [] };
    const { fn, calls } = mockFetch(200, org);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getOrgChart.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/org");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, org);
  });

  it("returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getOrgChart.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getOrgChart.handler("not-an-object" as unknown as Record<string, unknown>, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("paperclip_sync_agent_skills", () => {
  it("calls POST /api/agents/{id}/skills/sync with desiredSkills and returns result", async () => {
    const resp = { agentId: "agent-1", skills: ["paperclip", "commit-commands"] };
    const { fn, calls } = mockFetch(200, resp);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await syncAgentSkills.handler(
      { agentId: "agent-1", desiredSkills: ["paperclip", "commit-commands"] },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/skills/sync");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body.desiredSkills, ["paperclip", "commit-commands"]);
    const parsedSync = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedSync, resp);
  });

  it("throws McpError when desiredSkills is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => syncAgentSkills.handler({ agentId: "agent-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await syncAgentSkills.handler(
      { agentId: "missing-agent", desiredSkills: [] },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("accepts desiredSkills as a JSON-encoded string (PAP-120 regression)", async () => {
    const resp = { agentId: "agent-1", skills: ["skill-1", "skill-2"] };
    const { fn, calls } = mockFetch(200, resp);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await syncAgentSkills.handler(
      { agentId: "agent-1", desiredSkills: JSON.stringify(["skill-1", "skill-2"]) },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body.desiredSkills, ["skill-1", "skill-2"]);
    const parsedSyncStr = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedSyncStr, resp);
  });
});

describe("paperclip_list_company_skills", () => {
  it("calls GET /api/companies/{id}/skills and returns skill list", async () => {
    const skills = [
      { id: "skill-1", name: "paperclip" },
      { id: "skill-2", name: "commit-commands" },
    ];
    const { fn, calls } = mockFetch(200, skills);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanySkills.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/skills");
    assert.equal(calls[0]!.init.method, "GET");
    const parsedSkills = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedSkills.items, skills);
  });

  it("returns isError response on 403 API error", async () => {
    const { fn } = mockFetch(403, { message: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanySkills.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        listCompanySkills.handler("not-an-object" as unknown as Record<string, unknown>, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("paperclip_update_agent_permissions", () => {
  it("calls PATCH /api/agents/{id}/permissions with both fields set to true", async () => {
    const resp = { id: "agent-1", permissions: { canAssignTasks: true, canCreateAgents: true } };
    const { fn, calls } = mockFetch(200, resp);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgentPermissions.handler(
      { agentId: "agent-1", canAssignTasks: true, canCreateAgents: true },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/permissions");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.canAssignTasks, true);
    assert.equal(body.canCreateAgents, true);
    assert.ok(!("agentId" in body), "agentId must not be in PATCH body");
    const parsedPerms = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedPerms, resp);
  });

  it("calls PATCH with canCreateAgents set to false (revoke CEO-only permission)", async () => {
    const resp = { id: "agent-1", permissions: { canAssignTasks: true, canCreateAgents: false } };
    const { fn, calls } = mockFetch(200, resp);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgentPermissions.handler(
      { agentId: "agent-1", canAssignTasks: true, canCreateAgents: false },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.canAssignTasks, true);
    assert.equal(body.canCreateAgents, false);
    const parsedPerms2 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedPerms2, resp);
  });

  it("throws McpError when canAssignTasks is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        updateAgentPermissions.handler(
          { agentId: "agent-1", canCreateAgents: false } as unknown as Record<string, unknown>,
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("throws McpError when canCreateAgents is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        updateAgentPermissions.handler(
          { agentId: "agent-1", canAssignTasks: true } as unknown as Record<string, unknown>,
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 422 API error", async () => {
    const { fn } = mockFetch(422, { message: "Unprocessable Entity" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgentPermissions.handler(
      { agentId: "agent-1", canAssignTasks: true, canCreateAgents: true },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("422"));
  });
});

describe("paperclip_update_agent (extended fields)", () => {
  it("sends runtimeConfig.heartbeat.enabled in PATCH body", async () => {
    const updated = { id: "agent-1", runtimeConfig: { heartbeat: { enabled: false } } };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgent.handler(
      { agentId: "agent-1", runtimeConfig: { heartbeat: { enabled: false } } },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body.runtimeConfig, { heartbeat: { enabled: false } });
    assert.ok(!("agentId" in body), "agentId must not be in PATCH body");
    const parsedExtended1 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedExtended1, updated);
  });

  it("sends adapterConfig.model in PATCH body", async () => {
    const updated = { id: "agent-1", adapterConfig: { model: "claude-opus-4-6" } };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgent.handler(
      { agentId: "agent-1", adapterConfig: { model: "claude-opus-4-6" } },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body.adapterConfig, { model: "claude-opus-4-6" });
    const parsedExtended2 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedExtended2, updated);
  });

  it("sends adapterConfig.paperclipSkillSync.desiredSkills in PATCH body", async () => {
    const updated = {
      id: "agent-1",
      adapterConfig: { paperclipSkillSync: { desiredSkills: ["paperclip", "commit-commands"] } },
    };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateAgent.handler(
      {
        agentId: "agent-1",
        adapterConfig: { paperclipSkillSync: { desiredSkills: ["paperclip", "commit-commands"] } },
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body.adapterConfig.paperclipSkillSync.desiredSkills, [
      "paperclip",
      "commit-commands",
    ]);
    const parsedExtended3 = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsedExtended3, updated);
  });
});

// Stage 2 TDD: A4 (ISO 8601 format) + A5 (.strict() rejects unknown fields)
describe("[stage-2] paperclip_create_agent_key — expiresAt ISO 8601 + A5: strict", () => {
  it("A4: rejects invalid ISO 8601 date string for expiresAt", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createAgentKey.handler({ agentId: "agent-1", expiresAt: "not-a-date" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: accepts valid ISO 8601 datetime string for expiresAt", async () => {
    const created = { id: "key-1" };
    const { fn } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createAgentKey.handler(
      { agentId: "agent-1", expiresAt: "2027-01-01T00:00:00.000Z" },
      client
    );
    assert.equal(result.isError, undefined);
  });

  it("A5: rejects unknown extra field (strict) for create_agent_key", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createAgentKey.handler({ agentId: "agent-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_sync_agent_skills — A5: strict", () => {
  it("A5: rejects unknown extra field (strict) for sync_agent_skills", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        syncAgentSkills.handler(
          { agentId: "agent-1", desiredSkills: ["paperclip"], unknownField: "oops" },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_update_agent — A5: nested strict rejection", () => {
  it("A5: rejects unknown key inside runtimeConfig.heartbeat (nested strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        updateAgent.handler(
          { agentId: "agent-1", runtimeConfig: { heartbeat: { enabled: true, typoKey: false } } },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown key inside adapterConfig (nested strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        updateAgent.handler(
          { agentId: "agent-1", adapterConfig: { model: "claude-sonnet-4-6", unknownKey: "x" } },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] D1/D2 truncation + F1/F2/F3 — paperclip_list_agents
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_agents — truncation + format", () => {
  function largeAgentList(count: number) {
    return Array.from({ length: count }, (_, i) =>
      agentFixture({
        id: `agent-${i + 1}`,
        name: `Agent ${i + 1} ${"x".repeat(300)}`,
        urlKey: `agent-${i + 1}`,
      })
    );
  }

  it("D1: response >25k chars is truncated with hint (json mode)", async () => {
    const big = largeAgentList(300);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({ limit: 100, response_format: "json" }, client);
    assert.equal(result.isError, undefined);
    assert.ok(result.content[0]!.text.length < 26_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("D2: response ≤25k chars is not truncated (json mode)", async () => {
    const small = [agentFixture()];
    const { fn } = mockFetch(200, small);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({ response_format: "json" }, client);
    assert.ok(!result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [agentFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({}, client);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format: 'json' returns parseable JSON", async () => {
    const { fn } = mockFetch(200, [agentFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({ response_format: "json" }, client);
    assert.doesNotThrow(() => JSON.parse(result.content[0]!.text));
  });

  it("F3: markdown path renders ## header for agent list", async () => {
    const { fn } = mockFetch(200, [agentFixture({ name: "Test Agent" })]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({ response_format: "markdown" }, client);
    assert.match(result.content[0]!.text, /^##/m);
    assert.ok(result.content[0]!.text.includes("Test Agent"));
  });
});

// ---------------------------------------------------------------------------
// [stage-5] F1/F2 — paperclip_list_agent_config_revisions
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_agent_config_revisions — format", () => {
  it("F1: defaults to markdown output", async () => {
    const revisions = [{ id: "rev-1", summary: "initial config" }];
    const { fn } = mockFetch(200, revisions);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listConfigRevisions.handler({ agentId: "agent-1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON array", async () => {
    const revisions = [{ id: "rev-1", summary: "initial config" }];
    const { fn } = mockFetch(200, revisions);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listConfigRevisions.handler(
      { agentId: "agent-1", response_format: "json" },
      client
    );
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, revisions);
  });
});

// ---------------------------------------------------------------------------
// [stage-5] F1/F2 — paperclip_list_company_skills
// ---------------------------------------------------------------------------
describe("[stage-5] paperclip_list_company_skills — format", () => {
  it("F1: defaults to markdown output", async () => {
    const skills = [{ id: "skill-1", name: "paperclip" }];
    const { fn } = mockFetch(200, skills);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanySkills.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON array", async () => {
    const skills = [{ id: "skill-1", name: "paperclip" }];
    const { fn } = mockFetch(200, skills);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanySkills.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, skills);
  });
});

// ---------------------------------------------------------------------------
// [stage-6] E1/E2/E3 pagination envelope — list_agents / list_agent_config_revisions / list_company_skills
// ---------------------------------------------------------------------------
describe("[stage-6] paperclip_list_agents — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = Array.from({ length: 3 }, (_, i) => agentFixture({ id: `agent-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler({ response_format: "json" }, client);
    assertPaginationEnvelope(result, { total: 3, limit: 50, offset: 0, count: 3 });
  });

  it("E2: explicit limit=2, offset=1 in envelope", async () => {
    const items = Array.from({ length: 5 }, (_, i) => agentFixture({ id: `a-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler(
      { response_format: "json", limit: 2, offset: 1 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 5);
    assert.equal(data.count, 2);
    assert.equal(data.limit, 2);
    assert.equal(data.offset, 1);
    assert.equal(data.has_more, true);
    assert.equal(data.next_offset, 3);
  });

  it("E3: offset past end returns empty items with correct total", async () => {
    const items = [agentFixture()];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listAgents.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 1);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});

describe("[stage-6] paperclip_list_agent_config_revisions — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [{ revisionId: "rev-1", changedAt: "2026-01-01T00:00:00.000Z" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listConfigRevisions.handler(
      { agentId: "agent-1", response_format: "json" },
      client
    );
    assertPaginationEnvelope(result, { total: 1, limit: 50, offset: 0, count: 1 });
  });

  it("E3: offset past end returns empty items", async () => {
    const items = [{ revisionId: "rev-1" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listConfigRevisions.handler(
      { agentId: "agent-1", response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});

describe("[stage-6] paperclip_list_company_skills — pagination envelope", () => {
  it("E1: default limit=50, offset=0 in envelope", async () => {
    const items = [{ id: "skill-1", name: "paperclip-mcp" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanySkills.handler({ response_format: "json" }, client);
    assertPaginationEnvelope(result, { total: 1, limit: 50, offset: 0, count: 1 });
  });

  it("E3: offset past end returns empty items", async () => {
    const items = [{ id: "skill-1", name: "paperclip-mcp" }];
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanySkills.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });
});

// ---------------------------------------------------------------------------
// [stage-7] C4/C5: AbortError + network error handling — per module
// ---------------------------------------------------------------------------
describe("[stage-7] paperclip_list_agents — C4/C5 timeout + network errors", () => {
  it("C4: AbortError → isError with timeout text", async () => {
    const fn = async () => {
      throw new DOMException("Aborted", "AbortError");
    };
    const client = new PaperclipClient(TEST_AUTH, fn as unknown as typeof fetch);
    const result = await listAgents.handler({ response_format: "json" }, client);
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /timeout/);
  });

  it("C5: network TypeError → isError with network text", async () => {
    const fn = async () => {
      throw new TypeError("fetch failed");
    };
    const client = new PaperclipClient(TEST_AUTH, fn as unknown as typeof fetch);
    const result = await listAgents.handler({ response_format: "json" }, client);
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /network|reach/);
  });
});

// ---------------------------------------------------------------------------
// [stage-8a] paperclip_wakeup_agent
// ---------------------------------------------------------------------------
describe("[stage-8a] paperclip_wakeup_agent — schema (A1–A5)", () => {
  const wakeupAgent = agentTools.find((t) => t.name === "paperclip_wakeup_agent")!;

  it("A1: rejects missing agentId (validation failure, fetch not called)", async () => {
    assert.ok(wakeupAgent, "tool must exist");
    const { fn, calls } = mockFetch(200, { id: "run-1", status: "running" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => wakeupAgent.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A2: rejects empty agentId (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, { id: "run-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => wakeupAgent.handler({ agentId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: rejects invalid source enum value (fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, { id: "run-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => wakeupAgent.handler({ agentId: "agent-1", source: "invalid_source" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4b: rejects invalid triggerDetail enum value (fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, { id: "run-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => wakeupAgent.handler({ agentId: "agent-1", triggerDetail: "bad_value" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra field (.strict())", async () => {
    const { fn, calls } = mockFetch(200, { id: "run-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => wakeupAgent.handler({ agentId: "agent-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-8a] paperclip_wakeup_agent — happy path (B1–B2)", () => {
  const wakeupAgent = agentTools.find((t) => t.name === "paperclip_wakeup_agent")!;

  it("B1: calls POST /api/agents/{id}/wakeup with required field only", async () => {
    const runObj = {
      id: "run-1",
      agentId: "agent-1",
      companyId: "company-1",
      status: "running",
      invocationSource: "on_demand",
      triggerDetail: "manual",
      startedAt: "2026-04-16T00:00:00.000Z",
      createdAt: "2026-04-16T00:00:00.000Z",
    };
    const { fn, calls } = mockFetch(200, runObj);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await wakeupAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/wakeup");
    assert.equal(calls[0]!.init.method, "POST");
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.id, "run-1");
  });

  it("B2: sends optional fields in request body when provided", async () => {
    const { fn, calls } = mockFetch(200, { id: "run-2", status: "running" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    await wakeupAgent.handler(
      {
        agentId: "agent-1",
        source: "on_demand",
        triggerDetail: "manual",
        reason: "Testing wakeup",
        payload: { key: "value" },
        idempotencyKey: "idem-key-123",
        forceFreshSession: true,
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.source, "on_demand");
    assert.equal(body.triggerDetail, "manual");
    assert.equal(body.reason, "Testing wakeup");
    assert.deepEqual(body.payload, { key: "value" });
    assert.equal(body.idempotencyKey, "idem-key-123");
    assert.equal(body.forceFreshSession, true);
  });

  it("B2b: returns { status: 'skipped' } when agent already running", async () => {
    const { fn } = mockFetch(200, { status: "skipped" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await wakeupAgent.handler({ agentId: "agent-1" }, client);
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "skipped");
  });
});

// ---------------------------------------------------------------------------
// [stage-8c] paperclip_create_agent — schema validation (A1–A5)
// ---------------------------------------------------------------------------
describe("[stage-8c] paperclip_create_agent — schema validation (A1–A5)", () => {
  const createAgent = agentTools.find((t) => t.name === "paperclip_create_agent")!;

  it("A1: rejects missing name (validation failure, fetch not called)", async () => {
    assert.ok(createAgent, "tool must exist");
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createAgent.handler({ companyId: "company-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A2: rejects empty name string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createAgent.handler({ companyId: "company-1", name: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A4: rejects invalid role enum value (fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        createAgent.handler({ companyId: "company-1", name: "TestAgent", role: "janitor" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown top-level field (.strict())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        createAgent.handler(
          { companyId: "company-1", name: "TestAgent", unknownField: "oops" },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5-nested: rejects unknown field inside permissions object (nested strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        createAgent.handler(
          {
            companyId: "company-1",
            name: "TestAgent",
            permissions: { canCreateAgents: false, extraField: true },
          },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// [stage-8c] paperclip_create_agent — happy path (B1–B2)
// ---------------------------------------------------------------------------
describe("[stage-8c] paperclip_create_agent — happy path (B1–B2)", () => {
  const createAgent = agentTools.find((t) => t.name === "paperclip_create_agent")!;

  it("B1: calls POST correct URL + method + body", async () => {
    const created = {
      id: "agent-new",
      companyId: "company-1",
      name: "TestAgent",
      role: "engineer",
      status: "idle",
    };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createAgent.handler(
      { companyId: "company-1", name: "TestAgent", role: "engineer" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/agents");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "TestAgent");
    assert.equal(body.role, "engineer");
    assert.ok(!("companyId" in body), "companyId must not be in POST body");
    assert.ok(!result.isError);
  });

  it("B2: happy path response parsed and returned", async () => {
    const created = {
      id: "agent-new",
      companyId: "company-1",
      name: "NewAgent",
      role: "general",
      title: null,
      icon: null,
      status: "idle",
      reportsTo: null,
      capabilities: null,
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: { heartbeat: { enabled: false } },
      budgetMonthlyCents: 0,
      permissions: { canCreateAgents: false },
      metadata: null,
      createdAt: "2026-04-16T08:46:10.600Z",
      updatedAt: "2026-04-16T08:46:10.600Z",
    };
    const { fn } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createAgent.handler({ companyId: "company-1", name: "NewAgent" }, client);
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.id, "agent-new");
    assert.equal(parsed.name, "NewAgent");
  });
});

// ---------------------------------------------------------------------------
// [stage-8c] paperclip_create_agent — error paths (C1–C2)
// ---------------------------------------------------------------------------
describe("[stage-8c] paperclip_create_agent — error paths (C1–C2)", () => {
  const createAgent = agentTools.find((t) => t.name === "paperclip_create_agent")!;

  it("C1: returns isError on 400 (bad request)", async () => {
    const { fn } = mockFetch(400, { error: "name is required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createAgent.handler(
      { companyId: "company-1", name: "X", role: "general" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });

  it("C2: returns isError on 403 (agent key — board-only operation)", async () => {
    const { fn } = mockFetch(403, { error: "Forbidden" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createAgent.handler(
      { companyId: "company-1", name: "X", role: "general" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });
});

describe("[stage-8a] paperclip_wakeup_agent — error paths (C1–C3)", () => {
  const wakeupAgent = agentTools.find((t) => t.name === "paperclip_wakeup_agent")!;

  it("C1: returns isError on 404 (agent not found)", async () => {
    const { fn } = mockFetch(404, { error: "Agent not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await wakeupAgent.handler({ agentId: "missing-agent" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("C2: returns isError on 401 (unauthorized)", async () => {
    const { fn } = mockFetch(401, { error: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await wakeupAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("C3: returns isError on 500 (server error)", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await wakeupAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});
