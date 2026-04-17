/**
 * generate-tool-docs.ts
 *
 * Generates docs/tools/<domain>.md for each tool module and docs/tools/README.md as an index.
 * Run with: npx tsx scripts/generate-tool-docs.ts
 *
 * Output is deterministic (no timestamps, tools sorted by name within domain).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Import each module individually so we can preserve domain grouping without
// relying on naming conventions — the registry (ALL_TOOLS) merges everything.
import { identityTools } from "../src/tools/identity.js";
import { issueTools } from "../src/tools/issues.js";
import { commentTools } from "../src/tools/comments.js";
import { documentTools } from "../src/tools/documents.js";
import { agentTools } from "../src/tools/agents.js";
import { dashboardTools } from "../src/tools/dashboard.js";
import { approvalTools } from "../src/tools/approvals.js";
import { goalTools } from "../src/tools/goals.js";
import { projectTools } from "../src/tools/projects.js";
import { activityTools } from "../src/tools/activity.js";
import { routineTools } from "../src/tools/routines.js";
import { attachmentTools } from "../src/tools/attachments.js";
import { labelTools } from "../src/tools/labels.js";
import { companyTools } from "../src/tools/company.js";
import { companyImportTools } from "../src/tools/company-import.js";
import { pluginTools } from "../src/tools/plugins.js";
import { secretTools } from "../src/tools/secrets.js";
import { runTools } from "../src/tools/runs.js";
import { feedbackTools } from "../src/tools/feedback.js";
import type { ToolDefinition, ToolAnnotations } from "../src/tools/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "docs", "tools");

// ---------------------------------------------------------------------------
// Domain registry — order is stable and matches index.ts import order
// ---------------------------------------------------------------------------
interface Domain {
  slug: string;
  pretty: string;
  intro: string;
  tools: ToolDefinition[];
}

const DOMAINS: Domain[] = [
  {
    slug: "identity",
    pretty: "Identity",
    intro:
      "Tools for resolving the current agent's identity and inbox assignments within the Paperclip control plane.",
    tools: identityTools,
  },
  {
    slug: "issues",
    pretty: "Issues",
    intro:
      "Core issue lifecycle tools: listing, creating, updating, checking out, releasing, and querying heartbeat context for issues.",
    tools: issueTools,
  },
  {
    slug: "comments",
    pretty: "Comments",
    intro: "Tools for listing, adding, and retrieving comments on issues.",
    tools: commentTools,
  },
  {
    slug: "documents",
    pretty: "Documents",
    intro:
      "Tools for managing long-form documents attached to the company workspace, including revisions.",
    tools: documentTools,
  },
  {
    slug: "agents",
    pretty: "Agents & Organization",
    intro:
      "Tools for managing agent configurations, permissions, heartbeats, API keys, skills, and the org chart.",
    tools: agentTools,
  },
  {
    slug: "dashboard",
    pretty: "Dashboard",
    intro: "Tools for retrieving the company-level activity dashboard.",
    tools: dashboardTools,
  },
  {
    slug: "approvals",
    pretty: "Approvals",
    intro:
      "Tools for managing approval workflows including creating, approving, rejecting, and commenting on approval requests.",
    tools: approvalTools,
  },
  {
    slug: "goals",
    pretty: "Goals",
    intro: "Tools for listing, creating, and updating company goals.",
    tools: goalTools,
  },
  {
    slug: "projects",
    pretty: "Projects & Workspaces",
    intro: "Tools for managing projects and execution workspaces that group issues under a goal.",
    tools: projectTools,
  },
  {
    slug: "activity",
    pretty: "Activity & Costs",
    intro:
      "Tools for querying activity logs, cost summaries, per-agent and per-project cost breakdowns, and reporting cost events.",
    tools: activityTools,
  },
  {
    slug: "routines",
    pretty: "Routines",
    intro:
      "Tools for managing automated routines: creating, updating, triggering, and viewing run history.",
    tools: routineTools,
  },
  {
    slug: "attachments",
    pretty: "Attachments",
    intro: "Tools for listing, uploading, downloading, and deleting file attachments.",
    tools: attachmentTools,
  },
  {
    slug: "labels",
    pretty: "Labels",
    intro: "Tools for listing and creating issue labels.",
    tools: labelTools,
  },
  {
    slug: "company",
    pretty: "Companies",
    intro:
      "Tools for managing companies at the board level: creating, updating, archiving, and listing company membership.",
    tools: companyTools,
  },
  {
    slug: "plugins",
    pretty: "Plugins",
    intro: "Tools for listing, installing, activating, and deactivating company plugins.",
    tools: pluginTools,
  },
  {
    slug: "secrets",
    pretty: "Secrets",
    intro:
      "Tools for managing encrypted secrets: listing, creating, updating metadata, and rotating values.",
    tools: secretTools,
  },
  {
    slug: "runs",
    pretty: "Run Observability",
    intro: "Tools for listing and inspecting agent execution runs and event streams.",
    tools: runTools,
  },
  {
    slug: "feedback",
    pretty: "Feedback Traces",
    intro: "Board-only tools for retrieving feedback-trace bundles and per-issue trace summaries.",
    tools: feedbackTools,
  },
  {
    slug: "company-import",
    pretty: "Company Import / Export",
    intro:
      "Tools for exporting a company's state to a bundle and previewing or applying an import bundle.",
    tools: companyImportTools,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split the description produced by composeDescription() into named sections.
 *
 * Descriptions emitted by composeDescription() in src/tools/validation.ts use plain
 * bare-label headings on their own line (`Args:`, `Returns:`, `Examples:`, `Error Handling:`),
 * not Markdown `##` headings. Split on those labels.
 */
function parseSections(description: string): {
  summary: string;
  args: string;
  returns: string;
  examples: string;
  errors: string;
} {
  const sectionRegex = /\n(Args|Returns|Examples?|Error Handling):\s*\n/gi;
  const parts = description.split(sectionRegex);

  // parts[0] is always the summary; subsequent pairs are [heading, content]
  const result = {
    summary: parts[0].trim(),
    args: "",
    returns: "",
    examples: "",
    errors: "",
  };

  for (let i = 1; i < parts.length; i += 2) {
    const heading = (parts[i] ?? "").toLowerCase();
    const content = (parts[i + 1] ?? "").trim();
    if (heading.startsWith("arg")) result.args = content;
    else if (heading.startsWith("return")) result.returns = content;
    else if (heading.startsWith("example")) result.examples = content;
    else if (heading.startsWith("error")) result.errors = content;
  }

  return result;
}

interface PropEntry {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

/** Render a JSON-schema node as a short type string.
 *
 * Handles: primitives, array-of-type, enum, anyOf/oneOf unions (incl. Zod nullable
 * which emits `anyOf: [schema, {type: "null"}]`), nested arrays.
 */
function renderType(def: Record<string, unknown>): string {
  // anyOf / oneOf union (covers Zod .nullable() -> anyOf: [T, {type:"null"}])
  const union = (def["anyOf"] ?? def["oneOf"]) as Record<string, unknown>[] | undefined;
  if (Array.isArray(union) && union.length > 0) {
    return union.map(renderType).join(" | ");
  }
  // const / literal
  if (def["const"] !== undefined) {
    return JSON.stringify(def["const"]);
  }
  // enum
  if (Array.isArray(def["enum"])) {
    return (def["enum"] as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
  }
  // type array (e.g. ["string", "null"])
  if (Array.isArray(def["type"])) {
    return (def["type"] as string[]).join(" | ");
  }
  // plain type with optional array items
  if (def["type"]) {
    const t = def["type"] as string;
    if (t === "array" && def["items"]) {
      const items = def["items"] as Record<string, unknown>;
      return `${renderType(items)}[]`;
    }
    return t;
  }
  return "unknown";
}

/** Escape a cell value for a GitHub-flavored Markdown table.
 * Pipes inside code spans still split columns, so they must be HTML-escaped. */
function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function extractProps(inputSchema: Record<string, unknown>): PropEntry[] {
  const properties = (inputSchema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
  const required = (inputSchema["required"] ?? []) as string[];
  const requiredSet = new Set(required);

  return Object.entries(properties).map(([name, def]) => {
    // A field is user-required only if it's in `required` AND has no default.
    // Zod `.default(x)` produces a JSON-schema field that may still appear in `required`
    // but callers can always omit it — treat as optional for user-facing docs.
    const hasDefault = Object.prototype.hasOwnProperty.call(def, "default");
    const required = requiredSet.has(name) && !hasDefault;

    return {
      name,
      type: renderType(def),
      required,
      description: (def["description"] as string | undefined) ?? "",
    };
  });
}

function formatAnnotations(annotations: ToolAnnotations | undefined): string {
  if (!annotations) return "_none_";
  const flags: string[] = [];
  if (annotations.readOnlyHint) flags.push("`readOnly`");
  if (annotations.idempotentHint) flags.push("`idempotent`");
  if (annotations.destructiveHint) flags.push("`destructive`");
  if (annotations.boardOnlyHint) flags.push("`boardOnly`");
  if (annotations.openWorldHint === false) flags.push("`closedWorld`");
  return flags.length ? flags.join(", ") : "_none_";
}

function renderTool(tool: ToolDefinition): string {
  const sections = parseSections(tool.description);
  const props = extractProps(tool.inputSchema);

  const lines: string[] = [];

  lines.push(`## ${tool.name}`);
  lines.push("");
  lines.push(sections.summary);
  lines.push("");

  // Inputs table
  lines.push("**Inputs**");
  lines.push("");
  if (props.length === 0) {
    lines.push("_No inputs._");
  } else {
    lines.push("| Parameter | Type | Required | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const p of props) {
      const req = p.required ? "yes" : "no";
      // Pipes must be escaped inside cells — even inside backticks — or GFM
      // will read them as column separators and corrupt the table.
      const type = escapeTableCell(p.type);
      const desc = escapeTableCell(p.description);
      lines.push(`| \`${p.name}\` | \`${type}\` | ${req} | ${desc} |`);
    }
  }
  lines.push("");

  // Returns section (only if present)
  if (sections.returns) {
    lines.push("**Returns**");
    lines.push("");
    lines.push(sections.returns);
    lines.push("");
  }

  // Examples section (only if present)
  if (sections.examples) {
    lines.push("**Examples**");
    lines.push("");
    lines.push(sections.examples);
    lines.push("");
  }

  // Errors section (only if present)
  if (sections.errors) {
    lines.push("**Errors**");
    lines.push("");
    lines.push(sections.errors);
    lines.push("");
  }

  // Annotations
  lines.push("**Annotations**");
  lines.push("");
  lines.push(formatAnnotations(tool.annotations));
  lines.push("");

  return lines.join("\n");
}

function renderDomain(domain: Domain): string {
  const sorted = [...domain.tools].sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  lines.push(`# ${domain.pretty}`);
  lines.push("");
  lines.push(domain.intro);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const tool of sorted) {
    lines.push(renderTool(tool));
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function renderReadme(domains: Domain[], totalTools: number): string {
  const lines: string[] = [];
  lines.push("# Tool Reference");
  lines.push("");
  lines.push(
    "Auto-generated index of all Paperclip MCP tools, grouped by domain. " +
      "Do not edit by hand — regenerate with `npx tsx scripts/generate-tool-docs.ts`."
  );
  lines.push("");
  lines.push("| Domain | Tools | Reference |");
  lines.push("| --- | --- | --- |");

  for (const domain of domains) {
    const sorted = [...domain.tools].sort((a, b) => a.name.localeCompare(b.name));
    lines.push(
      `| ${domain.pretty} | ${sorted.length} | [docs/tools/${domain.slug}.md](${domain.slug}.md) |`
    );
  }

  lines.push("");
  lines.push(`**Total: ${totalTools} tools**`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // Validate no tool appears in multiple domains (would inflate total)
  const seenNames = new Set<string>();
  const duplicates: string[] = [];
  for (const domain of DOMAINS) {
    for (const tool of domain.tools) {
      if (seenNames.has(tool.name)) duplicates.push(tool.name);
      else seenNames.add(tool.name);
    }
  }
  if (duplicates.length) {
    console.error(`ERROR: duplicate tool names across domains: ${duplicates.join(", ")}`);
    process.exit(1);
  }

  const totalTools = DOMAINS.reduce((sum, d) => sum + d.tools.length, 0);

  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Write per-domain files
  for (const domain of DOMAINS) {
    const content = renderDomain(domain);
    const outPath = path.join(OUT_DIR, `${domain.slug}.md`);
    fs.writeFileSync(outPath, content, "utf8");
    console.log(`  wrote ${path.relative(REPO_ROOT, outPath)} (${domain.tools.length} tools)`);
  }

  // Write README index
  const readmeContent = renderReadme(DOMAINS, totalTools);
  const readmePath = path.join(OUT_DIR, "README.md");
  fs.writeFileSync(readmePath, readmeContent, "utf8");
  console.log(`  wrote ${path.relative(REPO_ROOT, readmePath)}`);

  console.log(`\nDone. ${totalTools} tools across ${DOMAINS.length} domains.`);
}

main();
