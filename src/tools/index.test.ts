import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_TOOLS } from "./index.js";

describe("ALL_TOOLS registration", () => {
  it("has no duplicate tool names", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    if (unique.size !== names.length) {
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const name of names) {
        if (seen.has(name)) duplicates.push(name);
        else seen.add(name);
      }
      assert.fail(`Duplicate tool names: ${duplicates.join(", ")}`);
    }
    assert.equal(unique.size, names.length);
  });
});
