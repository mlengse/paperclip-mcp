import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { projectTools } from "./projects.js";

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

const listProjects = projectTools.find((t) => t.name === "paperclip_list_projects")!;
const getProject = projectTools.find((t) => t.name === "paperclip_get_project")!;
const createProject = projectTools.find((t) => t.name === "paperclip_create_project")!;
const updateProject = projectTools.find((t) => t.name === "paperclip_update_project")!;
const listWorkspaces = projectTools.find((t) => t.name === "paperclip_list_workspaces")!;
const createWorkspace = projectTools.find((t) => t.name === "paperclip_create_workspace")!;
const updateWorkspace = projectTools.find((t) => t.name === "paperclip_update_workspace")!;

describe("paperclip_list_projects", () => {
  it("calls GET /api/companies/{id}/projects and returns project list", async () => {
    const projects = [{ id: "proj-1", name: "MCP Server", status: "active" }];
    const { fn, calls } = mockFetch(200, projects);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listProjects.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/projects");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, projects);
  });

  it("throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listProjects.handler(null, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 500 API error", async () => {
    const { fn } = mockFetch(500, { message: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listProjects.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

describe("paperclip_get_project", () => {
  it("calls GET /api/projects/{id} and returns project data", async () => {
    const project = { id: "proj-1", name: "MCP Server", status: "active" };
    const { fn, calls } = mockFetch(200, project);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getProject.handler(
      { projectId: "proj-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/projects/proj-1");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, project);
  });

  it("throws McpError when projectId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getProject.handler({ projectId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Project not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getProject.handler({ projectId: "missing-proj" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_create_project", () => {
  it("calls POST /api/companies/{id}/projects with required and optional fields", async () => {
    const created = { id: "proj-new", name: "New Project", status: "active" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createProject.handler(
      { name: "New Project", goalId: "goal-1", workspace: { cwd: "/app" } },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/projects");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "New Project");
    assert.equal(body.goalId, "goal-1");
    assert.deepEqual(body.workspace, { cwd: "/app" });
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, created);
  });

  it("throws McpError when name is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createProject.handler({ name: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 400 API error", async () => {
    const { fn } = mockFetch(400, { message: "Bad request" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createProject.handler({ name: "Valid Project" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });
});

describe("paperclip_update_project", () => {
  it("calls PATCH /api/projects/{id} with only provided fields", async () => {
    const updated = { id: "proj-1", name: "Renamed", status: "archived" };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateProject.handler(
      { projectId: "proj-1", name: "Renamed", status: "archived" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/projects/proj-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "Renamed");
    assert.equal(body.status, "archived");
    assert.ok(!("projectId" in body), "projectId must not be in PATCH body");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, updated);
  });

  it("throws McpError when projectId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateProject.handler({ name: "New Name" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Project not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateProject.handler({ projectId: "missing", name: "X" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_list_workspaces", () => {
  it("calls GET /api/projects/{id}/workspaces and returns workspace list", async () => {
    const workspaces = [{ id: "ws-1", cwd: "/app", repoUrl: null }];
    const { fn, calls } = mockFetch(200, workspaces);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listWorkspaces.handler(
      { projectId: "proj-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/projects/proj-1/workspaces");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, workspaces);
  });

  it("throws McpError when projectId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listWorkspaces.handler({ projectId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Project not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listWorkspaces.handler({ projectId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

describe("paperclip_create_workspace", () => {
  it("calls POST /api/projects/{id}/workspaces with optional cwd and repoUrl", async () => {
    const created = { id: "ws-new", cwd: "/app", repoUrl: "https://github.com/org/repo" };
    const { fn, calls } = mockFetch(200, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createWorkspace.handler(
      { projectId: "proj-1", cwd: "/app", repoUrl: "https://github.com/org/repo" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/projects/proj-1/workspaces");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.cwd, "/app");
    assert.equal(body.repoUrl, "https://github.com/org/repo");
    assert.ok(!("projectId" in body), "projectId must not be in POST body");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, created);
  });

  it("throws McpError when projectId is empty string (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createWorkspace.handler({ projectId: "", cwd: "/app" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 400 API error (with valid cwd/repoUrl to reach API)", async () => {
    // Note: after Stage 2, { projectId } with no cwd/repoUrl fails .refine() before reaching API.
    // Use a valid cwd to test the 400 API error path.
    const { fn } = mockFetch(400, { message: "Bad request" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createWorkspace.handler({ projectId: "proj-1", cwd: "/app" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });

  it("throws McpError when neither cwd nor repoUrl is provided (.refine())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createWorkspace.handler({ projectId: "proj-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("paperclip_update_workspace", () => {
  it("calls PATCH /api/projects/{pid}/workspaces/{wid} with provided fields", async () => {
    const updated = { id: "ws-1", cwd: "/new-app", repoUrl: null };
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateWorkspace.handler(
      { projectId: "proj-1", workspaceId: "ws-1", cwd: "/new-app" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/projects/proj-1/workspaces/ws-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.cwd, "/new-app");
    assert.ok(!("projectId" in body), "projectId must not be in PATCH body");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, updated);
  });

  it("throws McpError when workspaceId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateWorkspace.handler({ projectId: "proj-1", cwd: "/app" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("returns isError response on 404 API error", async () => {
    const { fn } = mockFetch(404, { message: "Workspace not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateWorkspace.handler(
      { projectId: "proj-1", workspaceId: "missing-ws", cwd: "/x" },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });
});

// Stage 2 TDD: A5 (.strict() rejects unknown fields) + .refine()
// Note: Project status uses domain-specific values (active, archived) distinct from issue StatusSchema.
describe("[stage-2] paperclip_create_project — A5: strict", () => {
  it("A5: rejects unknown extra field (strict) for create_project", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createProject.handler({ name: "Test", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_update_project — A5: strict", () => {
  it("A5: rejects unknown extra field (strict) for update_project", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateProject.handler({ projectId: "proj-1", unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });
});

describe("[stage-2] paperclip_create_project — A5: nested strict rejection", () => {
  it("A5: rejects unknown key inside workspace (nested strict)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        createProject.handler(
          { name: "Proj", workspace: { cwd: "/tmp", unknownField: "x" } },
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

describe("[stage-2] paperclip_create_workspace — .refine() cwd||repoUrl", () => {
  it("refine: rejects when neither cwd nor repoUrl is provided", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createWorkspace.handler({ projectId: "proj-1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError, `Expected McpError, got: ${String(err)}`);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("refine: accepts when only cwd is provided", async () => {
    const { fn } = mockFetch(200, { id: "ws-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createWorkspace.handler({ projectId: "proj-1", cwd: "/app" }, client);
    assert.equal(result.isError, undefined);
  });

  it("refine: accepts when only repoUrl is provided", async () => {
    const { fn } = mockFetch(200, { id: "ws-1" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createWorkspace.handler(
      { projectId: "proj-1", repoUrl: "https://github.com/org/repo" },
      client
    );
    assert.equal(result.isError, undefined);
  });
});
