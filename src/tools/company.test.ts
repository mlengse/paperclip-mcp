/**
 * Stage 8b — Company module tests (TDD red-first)
 *
 * Covers tools: paperclip_list_companies, paperclip_get_company,
 * paperclip_create_company, paperclip_update_company, paperclip_archive_company.
 *
 * Per-tool: A1-A5, B1-B2, C1-C3.
 * List tools additionally: E1-E3, D1, F1-F2.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { PaperclipClient } from "../client.js";
import { companyTools } from "./company.js";
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

function companyFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "company-1",
    name: "Test Company",
    description: null,
    status: "active",
    issuePrefix: "TES",
    issueCounter: 0,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: true,
    feedbackDataSharingEnabled: false,
    brandColor: null,
    logoAssetId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function largeCompanyList(count = 200): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) =>
    companyFixture({ id: `company-${i + 1}`, name: `Company ${i + 1} — ${"x".repeat(300)}` })
  );
}

const listCompanies = companyTools.find((t) => t.name === "paperclip_list_companies")!;
const getCompany = companyTools.find((t) => t.name === "paperclip_get_company")!;
const createCompany = companyTools.find((t) => t.name === "paperclip_create_company")!;
const updateCompany = companyTools.find((t) => t.name === "paperclip_update_company")!;
const archiveCompany = companyTools.find((t) => t.name === "paperclip_archive_company")!;

// ---------------------------------------------------------------------------
// paperclip_list_companies
// ---------------------------------------------------------------------------
describe("paperclip_list_companies", () => {
  it("A1: calls GET /api/companies and returns company list", async () => {
    const companies = [companyFixture()];
    const { fn, calls } = mockFetch(200, companies);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({ response_format: "json" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, companies);
  });

  it("A2: accepts empty args (all optional)", async () => {
    const { fn } = mockFetch(200, [companyFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({}, client);
    assert.ok(!result.isError);
  });

  it("A3: accepts limit and offset", async () => {
    const { fn } = mockFetch(200, [companyFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler(
      { limit: 10, offset: 5, response_format: "json" },
      client
    );
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(typeof data.total, "number");
  });

  it("A4: rejects limit > 100 (enum/range validation)", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listCompanies.handler({ limit: 999 }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra fields (.strict())", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listCompanies.handler({ unknownField: "oops" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: throws McpError when args is not an object (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, []);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => listCompanies.handler(null, client),
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
    const result = await listCompanies.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("401"));
  });

  it("C2: returns isError on 403", async () => {
    const { fn } = mockFetch(403, { error: "Board access required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C3: returns isError on 500", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({}, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });

  it("D1: response >25k chars is truncated with hint", async () => {
    const big = largeCompanyList(200);
    const { fn } = mockFetch(200, big);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({ limit: 100, response_format: "json" }, client);
    assert.ok(result.content[0]!.text.length <= 25_000);
    assert.ok(result.content[0]!.text.toLowerCase().includes("truncated"));
  });

  it("E1: default limit=50, offset=0 in pagination envelope", async () => {
    const items = Array.from({ length: 3 }, (_, i) => companyFixture({ id: `c-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({ response_format: "json" }, client);
    assertPaginationEnvelope(result, { total: 3, limit: 50, offset: 0, count: 3 });
  });

  it("E2: explicit limit=2, offset=1", async () => {
    const items = Array.from({ length: 4 }, (_, i) => companyFixture({ id: `c-${i}` }));
    const { fn } = mockFetch(200, items);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler(
      { response_format: "json", limit: 2, offset: 1 },
      client
    );
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.total, 4);
    assert.equal(data.count, 2);
    assert.equal(data.has_more, true);
    assert.equal(data.next_offset, 3);
  });

  it("E3: offset past end returns empty items", async () => {
    const { fn } = mockFetch(200, [companyFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler(
      { response_format: "json", limit: 10, offset: 100 },
      client
    );
    const data = JSON.parse(result.content[0]!.text);
    assert.equal(data.count, 0);
    assert.deepEqual(data.items, []);
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, [companyFixture()]);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({}, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n- /m);
  });

  it("F2: response_format 'json' returns parseable JSON envelope", async () => {
    const companies = [companyFixture()];
    const { fn } = mockFetch(200, companies);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await listCompanies.handler({ response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed.items, companies);
  });
});

// ---------------------------------------------------------------------------
// paperclip_get_company
// ---------------------------------------------------------------------------
describe("paperclip_get_company", () => {
  it("A1: calls GET /api/companies/{id} and returns company data", async () => {
    const company = companyFixture();
    const { fn, calls } = mockFetch(200, company);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCompany.handler(
      { companyId: "company-1", response_format: "json" },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1");
    assert.equal(calls[0]!.init.method, "GET");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, company);
  });

  it("A4: rejects empty companyId (min 1 validation)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getCompany.handler({ companyId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra field (.strict())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getCompany.handler({ companyId: "c1", unknownField: "x" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: throws McpError when companyId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => getCompany.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C1: returns isError on 404", async () => {
    const { fn } = mockFetch(404, { error: "Company not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCompany.handler({ companyId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("C2: returns isError on 403", async () => {
    const { fn } = mockFetch(403, { error: "Board access required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCompany.handler({ companyId: "c1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("F1: defaults to markdown output", async () => {
    const { fn } = mockFetch(200, companyFixture());
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCompany.handler({ companyId: "c1" }, client);
    assert.ok(!result.isError);
    assert.match(result.content[0]!.text, /^##|\n\*\*|Company/m);
  });

  it("F2: response_format 'json' returns parseable JSON object", async () => {
    const company = companyFixture();
    const { fn } = mockFetch(200, company);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await getCompany.handler({ companyId: "c1", response_format: "json" }, client);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, company);
  });
});

// ---------------------------------------------------------------------------
// paperclip_create_company
// ---------------------------------------------------------------------------
describe("paperclip_create_company", () => {
  it("A1: calls POST /api/companies with name and optional fields", async () => {
    const created = companyFixture({ id: "new-co", name: "New Co" });
    const { fn, calls } = mockFetch(201, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createCompany.handler(
      { name: "New Co", description: "A company", budgetMonthlyCents: 500 },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "New Co");
    assert.equal(body.description, "A company");
    assert.equal(body.budgetMonthlyCents, 500);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, created);
  });

  it("A2: creates company with name only (description and budget optional)", async () => {
    const created = companyFixture({ name: "Minimal Co" });
    const { fn, calls } = mockFetch(201, created);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createCompany.handler({ name: "Minimal Co" }, client);
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "Minimal Co");
    assert.ok(!("description" in body) || body.description === undefined);
    assert.ok(!result.isError);
  });

  it("A4: rejects empty name (min 1 validation)", async () => {
    const { fn, calls } = mockFetch(201, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createCompany.handler({ name: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra field (.strict())", async () => {
    const { fn, calls } = mockFetch(201, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createCompany.handler({ name: "Co", unknownField: "x" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: throws McpError when name is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(201, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => createCompany.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C1: returns isError on 400 API error", async () => {
    const { fn } = mockFetch(400, { error: "Bad request" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createCompany.handler({ name: "Co" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("400"));
  });

  it("C2: returns isError on 403 API error", async () => {
    const { fn } = mockFetch(403, { error: "Board access required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createCompany.handler({ name: "Co" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C3: returns isError on 500 API error", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await createCompany.handler({ name: "Co" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

// ---------------------------------------------------------------------------
// paperclip_update_company
// ---------------------------------------------------------------------------
describe("paperclip_update_company", () => {
  it("A1: calls PATCH /api/companies/{id} with provided fields only", async () => {
    const updated = companyFixture({ name: "Renamed Co", budgetMonthlyCents: 5000 });
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateCompany.handler(
      { companyId: "company-1", name: "Renamed Co", budgetMonthlyCents: 5000 },
      client
    );
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1");
    assert.equal(calls[0]!.init.method, "PATCH");
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.name, "Renamed Co");
    assert.equal(body.budgetMonthlyCents, 5000);
    assert.ok(!("companyId" in body), "companyId must not be in PATCH body");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, updated);
  });

  it("A2: sends only the fields that are explicitly provided", async () => {
    const updated = companyFixture({ description: "New desc" });
    const { fn, calls } = mockFetch(200, updated);
    const client = new PaperclipClient(TEST_AUTH, fn);
    await updateCompany.handler({ companyId: "c1", description: "New desc" }, client);
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.description, "New desc");
    assert.ok(!("name" in body));
    assert.ok(!("budgetMonthlyCents" in body));
  });

  it("A4: rejects negative budgetMonthlyCents", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateCompany.handler({ companyId: "c1", budgetMonthlyCents: -1 }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra field (.strict())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateCompany.handler({ companyId: "c1", unknownField: "x" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: throws McpError when companyId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => updateCompany.handler({ name: "New Name" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C1: returns isError on 403 API error", async () => {
    const { fn } = mockFetch(403, {
      error: "Only CEO agents or board users may update company settings",
    });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateCompany.handler({ companyId: "c1", name: "X" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C2: returns isError on 404 API error", async () => {
    const { fn } = mockFetch(404, { error: "Company not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateCompany.handler({ companyId: "missing", name: "X" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("C3: returns isError on 500 API error", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await updateCompany.handler({ companyId: "c1", name: "X" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});

// ---------------------------------------------------------------------------
// paperclip_archive_company
// ---------------------------------------------------------------------------
describe("paperclip_archive_company", () => {
  it("A1: calls POST /api/companies/{id}/archive", async () => {
    const archived = companyFixture({ status: "archived" });
    const { fn, calls } = mockFetch(200, archived);
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await archiveCompany.handler({ companyId: "company-1" }, client);
    assert.equal(calls[0]!.url, "http://localhost:3100/api/companies/company-1/archive");
    assert.equal(calls[0]!.init.method, "POST");
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.status, "archived");
  });

  it("A4: rejects empty companyId (min 1 validation)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => archiveCompany.handler({ companyId: "" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("A5: rejects unknown extra field (.strict())", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => archiveCompany.handler({ companyId: "c1", unknownField: "x" }, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("B1: throws McpError when companyId is missing (validation failure, fetch not called)", async () => {
    const { fn, calls } = mockFetch(200, {});
    const client = new PaperclipClient(TEST_AUTH, fn);
    await assert.rejects(
      () => archiveCompany.handler({}, client),
      (err: unknown) => {
        assert.ok(err instanceof McpError);
        return true;
      }
    );
    assert.equal(calls.length, 0);
  });

  it("C1: returns isError on 403 (board-only endpoint)", async () => {
    const { fn } = mockFetch(403, { error: "Board access required" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await archiveCompany.handler({ companyId: "c1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("403"));
  });

  it("C2: returns isError on 404 (company not found)", async () => {
    const { fn } = mockFetch(404, { error: "Company not found" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await archiveCompany.handler({ companyId: "missing" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("C3: returns isError on 500 API error", async () => {
    const { fn } = mockFetch(500, { error: "Internal Server Error" });
    const client = new PaperclipClient(TEST_AUTH, fn);
    const result = await archiveCompany.handler({ companyId: "c1" }, client);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("500"));
  });
});
