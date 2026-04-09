import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { agentTools } from "./agents.js";

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
    const result = await listAgents.handler({}, client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/agents");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(agents) }] });
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
    const result = await getAgent.handler({ agentId: "agent-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(agent) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(updated) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(agent) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(agent) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(run) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(resp) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(key) }] });
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
    const result = await listConfigRevisions.handler({ agentId: "agent-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/agents/agent-1/config-revisions");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(revisions) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(resp) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(resp) }] });
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
    const result = await getOrgChart.handler({}, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/org");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(org) }] });
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
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(resp) }] });
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
});

describe("paperclip_list_company_skills", () => {
  it("calls GET /api/companies/{id}/skills and returns skill list", async () => {
    const skills = [{ id: "skill-1", name: "paperclip" }, { id: "skill-2", name: "commit-commands" }];
    const { fn, calls } = mockFetch(200, skills);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanySkills.handler({}, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/skills");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual(result, { content: [{ type: "text", text: JSON.stringify(skills) }] });
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
      () => listCompanySkills.handler("not-an-object" as unknown as Record<string, unknown>, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});
