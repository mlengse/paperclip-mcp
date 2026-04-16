/**
 * Stage 3 — Server version sync test.
 *
 * Verifies that src/index.ts reads its version from package.json rather than
 * hard-coding a literal string. We export SERVER_VERSION from index.ts and
 * assert it matches the version in package.json at runtime.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Resolve from repo root (three dirs up: src/test/cross-cutting → repo root)
const pkg = require("../../../package.json") as { version: string };

describe("server version sync", () => {
  it("SERVER_VERSION exported from index matches package.json version", async () => {
    const { SERVER_VERSION } = await import("../../index.js");
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
