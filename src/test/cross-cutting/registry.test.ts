/**
 * Cross-cutting registry invariants.
 *
 * These tests enforce rules that must hold for every tool in ALL_TOOLS.
 * They guard against regressions as new tools are added in Stage 8 and
 * serve as the TDD "red" fixtures that Stage 1 turns green.
 *
 * Stage 1 red-before-green tests are marked with [RED→GREEN STAGE 1].
 * All other tests should pass against the current state.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_TOOLS } from "../../tools/index.js";

// Known non-standard annotation that Stage 1 removes. If this ever shows up
// again on a tool, a test will flag it.
const FORBIDDEN_ANNOTATION_KEYS = ["boardOnlyHint"] as const;

// MCP spec annotation keys. We allow these — anything else is a custom
// annotation that MCP clients will silently ignore.
const ALLOWED_ANNOTATION_KEYS = new Set<string>([
  "title",
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
]);

describe("ALL_TOOLS registry — structural invariants", () => {
  it("ALL_TOOLS is not empty (guards against filter-based false positives)", () => {
    assert.ok(
      ALL_TOOLS.length > 0,
      "ALL_TOOLS must be non-empty for filter-based invariants to be meaningful"
    );
  });

  it("has no duplicate tool names", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of names) {
      if (seen.has(name)) duplicates.push(name);
      else seen.add(name);
    }
    assert.deepEqual(duplicates, [], `Duplicate names: ${duplicates.join(", ")}`);
  });

  it("every tool name starts with 'paperclip_'", () => {
    const bad = ALL_TOOLS.filter((t) => !t.name.startsWith("paperclip_"));
    assert.deepEqual(
      bad.map((t) => t.name),
      [],
      "Tool names must start with 'paperclip_'"
    );
  });

  it("every tool name is snake_case (lowercase, digits, underscores only)", () => {
    const bad = ALL_TOOLS.filter((t) => !/^[a-z][a-z0-9_]*$/.test(t.name));
    assert.deepEqual(
      bad.map((t) => t.name),
      [],
      "Tool names must be snake_case"
    );
  });

  it("every tool has a non-empty description", () => {
    const missing = ALL_TOOLS.filter(
      (t) => typeof t.description !== "string" || t.description.trim().length === 0
    );
    assert.deepEqual(
      missing.map((t) => t.name),
      [],
      "Tools missing description"
    );
  });

  it("every tool has an inputSchema object", () => {
    const bad = ALL_TOOLS.filter(
      (t) => typeof t.inputSchema !== "object" || t.inputSchema === null
    );
    assert.deepEqual(
      bad.map((t) => t.name),
      [],
      "Tools missing inputSchema object"
    );
  });

  it("every tool has a handler function", () => {
    const bad = ALL_TOOLS.filter((t) => typeof t.handler !== "function");
    assert.deepEqual(
      bad.map((t) => t.name),
      [],
      "Tools without handler function"
    );
  });

  it("tool count is within expected bounds (≥74, ≤110)", () => {
    // Lower bound guards against accidental deletions.
    // Upper bound guards against a Stage 8 typo duplicating a module.
    assert.ok(ALL_TOOLS.length >= 74, `Expected at least 74 tools, got ${ALL_TOOLS.length}`);
    assert.ok(
      ALL_TOOLS.length <= 110,
      `Expected at most 110 tools, got ${ALL_TOOLS.length} — Stage 8 should land 103 total`
    );
  });
});

describe("ALL_TOOLS registry — JSON Schema shape", () => {
  it("every tool inputSchema has type: 'object'", () => {
    const bad = ALL_TOOLS.filter(
      (t) => (t.inputSchema as Record<string, unknown>)["type"] !== "object"
    );
    assert.deepEqual(
      bad.map((t) => t.name),
      [],
      "Tool inputSchema.type must be 'object'"
    );
  });

  it("every tool inputSchema has a 'properties' object", () => {
    const bad = ALL_TOOLS.filter((t) => {
      const props = (t.inputSchema as Record<string, unknown>)["properties"];
      return typeof props !== "object" || props === null;
    });
    assert.deepEqual(
      bad.map((t) => t.name),
      [],
      "Tool inputSchema must have a 'properties' object (Zod→JSON Schema output)"
    );
  });

  it("no tool inputSchema contains a $schema key", () => {
    // Strict MCP clients may reject or mishandle the $schema declaration.
    // toJsonSchema() in validation.ts strips it before returning.
    const bad = ALL_TOOLS.filter((t) => "$schema" in (t.inputSchema as Record<string, unknown>));
    assert.deepEqual(
      bad.map((t) => t.name),
      [],
      "Tool inputSchema must not contain $schema (stripped by toJsonSchema())"
    );
  });
});

describe("ALL_TOOLS registry — annotations", () => {
  it("annotations.readOnlyHint is boolean when present", () => {
    for (const t of ALL_TOOLS) {
      if (t.annotations?.readOnlyHint !== undefined) {
        assert.equal(
          typeof t.annotations.readOnlyHint,
          "boolean",
          `${t.name}: readOnlyHint must be boolean`
        );
      }
    }
  });

  it("annotations.destructiveHint is boolean when present", () => {
    for (const t of ALL_TOOLS) {
      if (t.annotations?.destructiveHint !== undefined) {
        assert.equal(
          typeof t.annotations.destructiveHint,
          "boolean",
          `${t.name}: destructiveHint must be boolean`
        );
      }
    }
  });

  it("annotations.idempotentHint is boolean when present", () => {
    for (const t of ALL_TOOLS) {
      if (t.annotations?.idempotentHint !== undefined) {
        assert.equal(
          typeof t.annotations.idempotentHint,
          "boolean",
          `${t.name}: idempotentHint must be boolean`
        );
      }
    }
  });

  it("annotations.openWorldHint is boolean when present", () => {
    for (const t of ALL_TOOLS) {
      if (t.annotations?.openWorldHint !== undefined) {
        assert.equal(
          typeof t.annotations.openWorldHint,
          "boolean",
          `${t.name}: openWorldHint must be boolean`
        );
      }
    }
  });

  it("[RED→GREEN STAGE 1] no tool has a forbidden non-spec annotation key", () => {
    // Stage 1 removes `boardOnlyHint` — clients silently ignore custom
    // annotations, so intent should live in the description text instead.
    const violations: string[] = [];
    for (const t of ALL_TOOLS) {
      if (!t.annotations) continue;
      for (const key of FORBIDDEN_ANNOTATION_KEYS) {
        if (key in t.annotations) {
          violations.push(`${t.name}: annotations.${key}`);
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `Non-spec annotations found (must be moved into description):\n${violations.join("\n")}`
    );
  });

  it("no tool uses annotation keys outside the MCP spec set", () => {
    // Guard against future custom annotations creeping in.
    const violations: string[] = [];
    for (const t of ALL_TOOLS) {
      if (!t.annotations) continue;
      for (const key of Object.keys(t.annotations)) {
        if (!ALLOWED_ANNOTATION_KEYS.has(key)) {
          violations.push(`${t.name}: annotations.${key}`);
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `Non-spec annotation keys (spec allows only ${Array.from(ALLOWED_ANNOTATION_KEYS).join(", ")}):\n${violations.join("\n")}`
    );
  });
});

describe("ALL_TOOLS registry — required MCP tool metadata", () => {
  it("[RED→GREEN STAGE 1] every tool has a non-empty title annotation", () => {
    // The MCP TypeScript guide requires every tool to expose a human-readable
    // `title` for UI display. Currently unset across all tools — Stage 1 adds
    // one per tool.
    const missing = ALL_TOOLS.filter(
      (t) => typeof t.annotations?.title !== "string" || t.annotations.title.trim().length === 0
    );
    assert.deepEqual(
      missing.map((t) => t.name),
      [],
      "Tools missing annotations.title"
    );
  });
});

// ---------------------------------------------------------------------------
// Stage 3 — Annotation correctness allow-lists
// ---------------------------------------------------------------------------

describe("ALL_TOOLS registry — annotation correctness", () => {
  // Tools that perform only GETs and MUST be read-only
  const READ_ONLY_TOOLS = [
    "paperclip_get_me",
    "paperclip_get_inbox",
    "paperclip_get_dashboard",
    "paperclip_list_issues",
    "paperclip_get_issue",
    "paperclip_get_heartbeat_context",
    "paperclip_list_comments",
    "paperclip_get_comment",
    "paperclip_list_documents",
    "paperclip_get_document",
    "paperclip_get_document_revisions",
    "paperclip_list_attachments",
    "paperclip_download_attachment",
    "paperclip_list_agents",
    "paperclip_get_agent",
    "paperclip_list_agent_config_revisions",
    "paperclip_get_org_chart",
    "paperclip_list_company_skills",
    "paperclip_list_goals",
    "paperclip_get_goal",
    "paperclip_list_projects",
    "paperclip_get_project",
    "paperclip_list_workspaces",
    "paperclip_get_activity",
    "paperclip_get_cost_summary",
    "paperclip_get_costs_by_agent",
    "paperclip_get_costs_by_project",
    "paperclip_list_approvals",
    "paperclip_get_approval",
    "paperclip_list_approval_comments",
    "paperclip_list_routines",
    "paperclip_get_routine",
    "paperclip_list_routine_runs",
    "paperclip_list_labels",
  ];

  it("read-only tools have readOnlyHint: true", () => {
    const bad: string[] = [];
    for (const name of READ_ONLY_TOOLS) {
      const t = ALL_TOOLS.find((x) => x.name === name);
      assert.ok(t, `Tool ${name} not found in ALL_TOOLS`);
      if (t!.annotations?.readOnlyHint !== true) bad.push(name);
    }
    assert.deepEqual(bad, [], "Tools missing readOnlyHint:true");
  });

  const DESTRUCTIVE_TOOLS = [
    "paperclip_delete_document",
    "paperclip_delete_attachment",
    "paperclip_terminate_agent",
    "paperclip_rollback_agent_config",
    "paperclip_update_agent", // replaces many fields
    "paperclip_update_agent_permissions",
    "paperclip_set_agent_instructions_path", // writes config, alters agent behavior
    "paperclip_sync_agent_skills", // removes skills not in desiredSkills list
    "paperclip_update_issue", // replaces many fields
    "paperclip_update_goal",
    "paperclip_update_project",
    "paperclip_update_workspace",
    "paperclip_update_routine",
    "paperclip_update_routine_trigger",
    "paperclip_delete_routine_trigger",
    "paperclip_approve",
    "paperclip_reject",
  ];

  it("destructive tools have destructiveHint: true", () => {
    const bad: string[] = [];
    for (const name of DESTRUCTIVE_TOOLS) {
      const t = ALL_TOOLS.find((x) => x.name === name);
      assert.ok(t, `Tool ${name} not found`);
      if (t!.annotations?.destructiveHint !== true) bad.push(name);
    }
    assert.deepEqual(bad, [], "Tools missing destructiveHint:true");
  });

  const IDEMPOTENT_TOOLS = [
    // paperclip_release_issue omitted — a double-release may return 409; verify in Stage 8b
    "paperclip_upsert_document",
    "paperclip_pause_agent",
    "paperclip_resume_agent",
    "paperclip_update_issue",
    "paperclip_update_goal",
    "paperclip_update_project",
    "paperclip_update_workspace",
    "paperclip_update_agent",
    "paperclip_update_agent_permissions",
    "paperclip_update_routine",
    "paperclip_update_routine_trigger",
  ];

  it("idempotent tools have idempotentHint: true", () => {
    const bad: string[] = [];
    for (const name of IDEMPOTENT_TOOLS) {
      const t = ALL_TOOLS.find((x) => x.name === name);
      assert.ok(t, `Tool ${name} not found`);
      if (t!.annotations?.idempotentHint !== true) bad.push(name);
    }
    assert.deepEqual(bad, [], "Tools missing idempotentHint:true");
  });

  const BOARD_ONLY_TOOLS = [
    "paperclip_delete_document",
    "paperclip_terminate_agent",
    "paperclip_create_agent_key",
    "paperclip_rollback_agent_config",
    "paperclip_update_agent_permissions",
    "paperclip_set_agent_instructions_path",
    "paperclip_approve",
    "paperclip_reject",
    "paperclip_request_revision",
  ];

  it("board-only tools have '⚠ Board-only:' description prefix", () => {
    const bad: string[] = [];
    for (const name of BOARD_ONLY_TOOLS) {
      const t = ALL_TOOLS.find((x) => x.name === name);
      assert.ok(t, `Tool ${name} not found`);
      if (!t!.description.startsWith("⚠ Board-only:")) bad.push(name);
    }
    assert.deepEqual(bad, [], "Tools missing '⚠ Board-only:' description prefix");
  });
});
