import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TOOLS_DIR = "src/tools";
const PATTERN = /inputSchema\s*:\s*\{/;
const EXCLUDE = new Set(["index.ts"]);

const violations = [];
for (const entry of readdirSync(TOOLS_DIR)) {
  if (entry.endsWith(".test.ts")) continue;
  if (EXCLUDE.has(entry)) continue;
  const full = join(TOOLS_DIR, entry);
  if (!statSync(full).isFile()) continue;
  const content = readFileSync(full, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (PATTERN.test(lines[i])) {
      violations.push(`${full}:${i + 1}: ${lines[i].trim()}`);
    }
  }
}

if (violations.length) {
  console.error("Hand-written inputSchema literal found:");
  for (const v of violations) console.error("  " + v);
  console.error("\nUse toJsonSchema(ZodSchema) instead; see docs/guides/mcp-tool-conventions.md.");
  process.exit(1);
}
console.log("OK: no hand-written inputSchema literals found in src/tools/*.ts");
