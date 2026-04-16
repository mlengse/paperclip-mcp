/**
 * Stage 3 — Server version sync test.
 *
 * Verifies that src/version.ts reads its version from package.json rather than
 * hard-coding a literal string. SERVER_VERSION is exported from version.ts
 * (a side-effect-free module) and re-exported from src/index.ts so the server
 * uses the same value without this test needing to import the full entry point
 * (which starts the stdio transport on load).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SERVER_VERSION } from "../../version.js";

const require = createRequire(import.meta.url);
// Resolve from repo root (three dirs up: src/test/cross-cutting → repo root)
const pkg = require("../../../package.json") as { version: string };

describe("server version sync", () => {
  it("SERVER_VERSION exported from version.ts matches package.json version", () => {
    assert.equal(
      SERVER_VERSION,
      pkg.version,
      `SERVER_VERSION (${SERVER_VERSION}) must equal package.json version (${pkg.version})`
    );
  });

  it("package.json version is 1.0.0 (Stage 9 will bump to 2.0.0)", () => {
    assert.equal(pkg.version, "1.0.0", "package.json must stay at 1.0.0 until Stage 9");
  });
});
