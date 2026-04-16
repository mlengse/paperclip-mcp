/**
 * Stage 8h — Company import/export module tests (TDD red-first)
 *
 * Covers tools:
 *   paperclip_export_company
 *   paperclip_preview_company_import
 *   paperclip_apply_company_import
 *
 * Per-tool: A1-A5, B1-B2, C1-C3.
 * Schema special cases:
 *   - include object (all-false allowed per API, no .refine needed)
 *   - source union: inline vs github branches
 *   - agents: literal "all" or string array
 *   - collisionStrategy enum rejection on invalid values
 * D1: truncation tests on all 3 tools.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { companyImportTools } from "./company-import.js";

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function exportFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    rootPath: "test-company",
    manifest: {
      schemaVersion: 5,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { companyId: "company-1", companyName: "Test Co" },
      includes: { company: true, agents: false, projects: false, issues: false, skills: false },
    },
    files: {
      "COMPANY.md": "# Test Company",
      ".paperclip.yaml": 'schema: "paperclip/v1"',
    },
    paperclipExtensionPath: ".paperclip.yaml",
    warnings: [],
    ...overrides,
  };
}

function previewFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    source: { rootPath: "test-company", files: { "COMPANY.md": "# Test" } },
    target: { companyId: "company-1" },
    agents: [],
    projects: [],
    issues: [],
    skills: [],
    warnings: [],
    adapterOverrides: {},
    ...overrides,
  };
}

function applyFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    insertedAgents: 0,
    insertedProjects: 0,
    insertedIssues: 0,
    insertedSkills: 0,
    warnings: [],
    ...overrides,
  };
}

function largeExportFixture(): Record<string, unknown> {
  const bigFile = "x".repeat(30_000);
  return exportFixture({ files: { "COMPANY.md": bigFile, "big.md": bigFile } });
}

const includeAll = {
  company: true,
  agents: true,
  projects: false,
  issues: false,
  skills: false,
};

const inlineSource = {
  type: "inline" as const,
  rootPath: "test-company",
  files: { "COMPANY.md": "# Test" },
};

const githubSource = {
  type: "github" as const,
  url: "https://github.com/org/repo",
};

const defaultTarget = {
  mode: "existing_company" as const,
  companyId: "company-1",
};

// ---------------------------------------------------------------------------
// Tool handles
// ---------------------------------------------------------------------------
const exportCompany = companyImportTools.find((t) => t.name === "paperclip_export_company")!;
const previewImport = companyImportTools.find(
  (t) => t.name === "paperclip_preview_company_import"
)!;
const applyImport = companyImportTools.find((t) => t.name === "paperclip_apply_company_import")!;

// ===========================================================================
// paperclip_export_company
// ===========================================================================
describe("paperclip_export_company", () => {
  it("A1: calls POST /api/companies/{id}/export with include body", async () => {
    const exported = exportFixture();
    const { fn, calls } = mockFetch(200, exported);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await exportCompany.handler(
      { companyId: "company-1", include: includeAll },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/export");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body.include, includeAll);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.rootPath, "test-company");
  });

  it("A2: sends optional fields (skills, projects, issues arrays) when provided", async () => {
    const { fn, calls } = mockFetch(200, exportFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await exportCompany.handler(
      {
        companyId: "c1",
        include: includeAll,
        skills: ["skill-1"],
        projects: ["proj-1"],
        issues: ["iss-1"],
        projectIssues: ["proj-2"],
        expandReferencedSkills: true,
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.deepEqual(body.skills, ["skill-1"]);
    assert.deepEqual(body.projects, ["proj-1"]);
    assert.deepEqual(body.issues, ["iss-1"]);
    assert.deepEqual(body.projectIssues, ["proj-2"]);
    assert.equal(body.expandReferencedSkills, true);
  });

  it("A3: accepts all-false include (API does not enforce a minimum-true constraint)", async () => {
    const { fn } = mockFetch(200, exportFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await exportCompany.handler(
      {
        companyId: "c1",
        include: { company: false, agents: false, projects: false, issues: false, skills: false },
      },
      client
    );
    assert.ok(!result.isError);
  });

  it("A4: rejects empty companyId (min 1 validation)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => exportCompany.handler({ companyId: "", include: includeAll }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects extra fields on include (.strict())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        exportCompany.handler(
          { companyId: "c1", include: { ...includeAll, unknownField: true } },
          client
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: throws McpError when companyId is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => exportCompany.handler({ include: includeAll }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B2: throws McpError when include is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => exportCompany.handler({ companyId: "c1" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C1: returns isError on 401", async () => {
    const { fn } = mockFetch(401, { error: "Unauthorized" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await exportCompany.handler({ companyId: "c1", include: includeAll }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("C2: returns isError on 403 (board-only)", async () => {
    const { fn } = mockFetch(403, { error: "Board access required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await exportCompany.handler({ companyId: "c1", include: includeAll }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C3: returns isError on 500", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await exportCompany.handler({ companyId: "c1", include: includeAll }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("D1: large export response is truncated with hint", async () => {
    const { fn } = mockFetch(200, largeExportFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await exportCompany.handler({ companyId: "c1", include: includeAll }, client);
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });
});

// ===========================================================================
// paperclip_preview_company_import
// ===========================================================================
describe("paperclip_preview_company_import", () => {
  it("A1: calls POST /api/companies/{id}/imports/preview with inline source and target", async () => {
    const preview = previewFixture();
    const { fn, calls } = mockFetch(200, preview);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await previewImport.handler(
      {
        companyId: "company-1",
        source: inlineSource,
        include: includeAll,
        target: defaultTarget,
      },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/imports/preview");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.source.type, "inline");
    assert.deepEqual(body.include, includeAll);
    assert.deepEqual(body.target, defaultTarget);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok("agents" in parsed);
  });

  it("A2: accepts github source type", async () => {
    const { fn, calls } = mockFetch(200, previewFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await previewImport.handler(
      {
        companyId: "c1",
        source: githubSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.source.type, "github");
    assert.equal(body.source.url, "https://github.com/org/repo");
  });

  it("A3: accepts agents as literal 'all' and as string array", async () => {
    const { fn: fn1, calls: calls1 } = mockFetch(200, previewFixture());
    const client1 = new PaperclipClient(TEST_AUTH, fn1);
    await previewImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
        agents: "all",
      },
      client1
    );
    const body1 = JSON.parse(calls1[0]!.init.body as string);
    assert.equal(body1.agents, "all");

    const { fn: fn2, calls: calls2 } = mockFetch(200, previewFixture());
    const client2 = new PaperclipClient(TEST_AUTH, fn2);
    await previewImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
        agents: ["agent-1"],
      },
      client2
    );
    const body2 = JSON.parse(calls2[0]!.init.body as string);
    assert.deepEqual(body2.agents, ["agent-1"]);
  });

  it("A4: rejects invalid collisionStrategy value", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        previewImport.handler(
          {
            companyId: "c1",
            source: inlineSource,
            include: includeAll,
            target: { mode: "existing_company", companyId: "c1" },
            collisionStrategy: "destroy",
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

  it("A5: rejects missing target (required field)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        previewImport.handler(
          {
            companyId: "c1",
            source: inlineSource,
            include: includeAll,
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

  it("A5b: rejects target.companyId mismatch with top-level companyId (.refine())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        previewImport.handler(
          {
            companyId: "c1",
            source: inlineSource,
            include: includeAll,
            target: { mode: "existing_company", companyId: "different-company" },
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

  it("A5c: rejects extra field on inline source (.strict())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        previewImport.handler(
          {
            companyId: "c1",
            source: { ...inlineSource, unknownField: "x" },
            include: includeAll,
            target: { mode: "existing_company", companyId: "c1" },
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

  it("A5d: rejects source without discriminator type", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        previewImport.handler(
          {
            companyId: "c1",
            source: { rootPath: "test", files: {} },
            include: includeAll,
            target: { mode: "existing_company", companyId: "c1" },
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

  it("B1: throws McpError when companyId is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => previewImport.handler({ source: inlineSource, include: includeAll }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B2: throws McpError when source is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => previewImport.handler({ companyId: "c1", include: includeAll }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C1: returns isError on 400", async () => {
    const { fn } = mockFetch(400, { message: "Invalid import bundle" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await previewImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });

  it("C2: returns isError on 403", async () => {
    const { fn } = mockFetch(403, { error: "Board access required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await previewImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C3: returns isError on 500", async () => {
    const { fn } = mockFetch(500, { error: "Server error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await previewImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("D1: large preview response is truncated with hint", async () => {
    const bigPayload = previewFixture({
      agents: Array.from({ length: 50 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i} — ${"x".repeat(800)}`,
      })),
    });
    const { fn } = mockFetch(200, bigPayload);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await previewImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });
});

// ===========================================================================
// paperclip_apply_company_import
// ===========================================================================
describe("paperclip_apply_company_import", () => {
  it("A1: calls POST /api/companies/{id}/imports/apply with inline source and target", async () => {
    const applied = applyFixture();
    const { fn, calls } = mockFetch(200, applied);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await applyImport.handler(
      {
        companyId: "company-1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "company-1" },
      },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/imports/apply");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.source.type, "inline");
    assert.deepEqual(body.target, { mode: "existing_company", companyId: "company-1" });
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok("insertedAgents" in parsed);
  });

  it("A2: accepts github source and forwards adapterOverrides", async () => {
    const { fn, calls } = mockFetch(200, applyFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await applyImport.handler(
      {
        companyId: "c1",
        source: githubSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
        adapterOverrides: { key: "value" },
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.source.type, "github");
    assert.deepEqual(body.adapterOverrides, { key: "value" });
  });

  it("A3: forwards collisionStrategy and selectedFiles when provided", async () => {
    const { fn, calls } = mockFetch(200, applyFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    await applyImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
        collisionStrategy: "replace",
        selectedFiles: ["COMPANY.md"],
      },
      client
    );
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.collisionStrategy, "replace");
    assert.deepEqual(body.selectedFiles, ["COMPANY.md"]);
  });

  it("A4: rejects invalid collisionStrategy value", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        applyImport.handler(
          {
            companyId: "c1",
            source: inlineSource,
            include: includeAll,
            target: { mode: "existing_company", companyId: "c1" },
            collisionStrategy: "overwrite",
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

  it("A5: rejects missing target (required field)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        applyImport.handler(
          {
            companyId: "c1",
            source: inlineSource,
            include: includeAll,
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

  it("A5b: rejects target.companyId mismatch (.refine())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        applyImport.handler(
          {
            companyId: "c1",
            source: inlineSource,
            include: includeAll,
            target: { mode: "existing_company", companyId: "different-company" },
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

  it("A5c: rejects extra field on top-level schema (.strict())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () =>
        applyImport.handler(
          {
            companyId: "c1",
            source: inlineSource,
            include: includeAll,
            target: { mode: "existing_company", companyId: "c1" },
            unknownField: "x",
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

  it("B1: throws McpError when companyId is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => applyImport.handler({ source: inlineSource, include: includeAll }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B2: throws McpError when source is missing", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => applyImport.handler({ companyId: "c1", include: includeAll }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C1: returns isError on 400", async () => {
    const { fn } = mockFetch(400, { message: "Invalid import bundle" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await applyImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });

  it("C2: returns isError on 403", async () => {
    const { fn } = mockFetch(403, { error: "Board access required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await applyImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C3: returns isError on 500", async () => {
    const { fn } = mockFetch(500, { error: "Server error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await applyImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("D1: large apply response is truncated with hint", async () => {
    const bigPayload = applyFixture({
      warnings: Array.from({ length: 200 }, (_, i) => `Warning ${i}: ${"x".repeat(200)}`),
    });
    const { fn } = mockFetch(200, bigPayload);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await applyImport.handler(
      {
        companyId: "c1",
        source: inlineSource,
        include: includeAll,
        target: { mode: "existing_company", companyId: "c1" },
      },
      client
    );
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });
});
