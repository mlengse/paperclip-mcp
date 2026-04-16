/**
 * Assertion helpers for ToolResult shapes.
 *
 * These reduce boilerplate in tests and make intent explicit — tests
 * using these helpers are also safer against the "test passes if handler
 * returns empty content" false-positive class.
 */
import assert from "node:assert/strict";
import type { ToolResult } from "../../tools/index.js";

/**
 * Assert the result is a successful ToolResult: isError absent/falsy
 * AND content array is non-empty.
 */
export function assertSuccess(result: ToolResult, message?: string): void {
  assert.notEqual(
    result.isError,
    true,
    message ?? `Expected success but got isError: ${result.content[0]?.text}`
  );
  assert.ok(result.content.length > 0, "Expected non-empty content array");
}

/**
 * Assert the result is an error ToolResult: isError === true AND
 * content array is non-empty AND text includes expectedStatus (if given).
 */
export function assertError(result: ToolResult, expectedStatus?: number): void {
  assert.equal(result.isError, true, "Expected isError: true");
  assert.ok(result.content.length > 0, "Expected non-empty error content");
  const text = result.content[0]!.text;
  assert.ok(text.length > 0, "Expected non-empty error text");
  if (expectedStatus !== undefined) {
    assert.ok(
      text.includes(String(expectedStatus)),
      `Expected error text to contain status ${expectedStatus}; got: ${text}`
    );
  }
}

/**
 * Assert the result is successful AND its text is under the CHARACTER_LIMIT
 * AND contains a truncation hint. Use for Stage 5 truncation tests.
 */
export function assertTruncated(result: ToolResult): void {
  assertSuccess(result);
  const text = result.content[0]!.text;
  assert.ok(
    text.toLowerCase().includes("truncated") || text.includes("…"),
    `Expected truncation hint in text; got tail: …${text.slice(-200)}`
  );
}

/**
 * Assert the result body is a pagination envelope with the expected
 * total / limit / offset values. Use for Stage 6 list_* tests.
 */
export function assertPaginationEnvelope(
  result: ToolResult,
  expected: { total?: number; limit: number; offset: number }
): void {
  assertSuccess(result);
  const data = JSON.parse(result.content[0]!.text);
  assert.equal(typeof data.total, "number", "envelope missing 'total' number");
  assert.equal(typeof data.limit, "number", "envelope missing 'limit' number");
  assert.equal(typeof data.offset, "number", "envelope missing 'offset' number");
  assert.equal(typeof data.has_more, "boolean", "envelope missing 'has_more' boolean");
  assert.equal(data.limit, expected.limit, "limit mismatch");
  assert.equal(data.offset, expected.offset, "offset mismatch");
  if (expected.total !== undefined) {
    assert.equal(data.total, expected.total, "total mismatch");
  }
}
