/**
 * Cross-cutting error format tests.
 *
 * Asserts that handleApiError() returns a well-formed { isError: true, content: [...] }
 * result for each HTTP status code path, and that the status code is present in the
 * error text so LLMs can reason about the failure.
 *
 * Stage 2 scope: document current behavior. Stage 7 will refine to LLM-actionable messages
 * with per-status recovery hints (01-mcp-skill.md §Error Handling).
 *
 * The non-PaperclipApiError re-throw path is documented but not changed here — Stage 7 owns it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleApiError } from "../../tools/validation.js";
import { PaperclipApiError } from "../../errors.js";

function makeError(status: number, statusText: string, body: unknown): PaperclipApiError {
  return new PaperclipApiError(status, statusText, body);
}

describe("handleApiError — PaperclipApiError status code matrix", () => {
  const cases: Array<[number, string]> = [
    [400, "Bad Request"],
    [401, "Unauthorized"],
    [403, "Forbidden"],
    [404, "Not Found"],
    [409, "Conflict"],
    [422, "Unprocessable Entity"],
    [429, "Too Many Requests"],
    [500, "Internal Server Error"],
    [503, "Service Unavailable"],
  ];

  for (const [status, statusText] of cases) {
    it(`returns { isError: true } with status ${status} in error text`, () => {
      const err = makeError(status, statusText, { message: "some error" });
      const result = handleApiError(err);
      assert.equal(result.isError, true, `isError must be true for ${status}`);
      assert.equal(result.content.length, 1, "must have exactly one content item");
      assert.equal(result.content[0]!.type, "text", "content item must be type=text");
      assert.ok(
        result.content[0]!.text.includes(String(status)),
        `error text must include status code ${status}; got: ${result.content[0]!.text}`
      );
    });
  }

  it("result content text includes body information", () => {
    const body = { message: "specific error detail" };
    const err = makeError(422, "Unprocessable Entity", body);
    const result = handleApiError(err);
    assert.ok(
      result.content[0]!.text.includes("specific error detail"),
      `error text must include body detail; got: ${result.content[0]!.text}`
    );
  });
});

describe("handleApiError — non-PaperclipApiError re-throws (documented, Stage 7 owns refinement)", () => {
  it("re-throws non-PaperclipApiError errors (current behavior, Stage 7 will wrap these)", () => {
    const genericError = new Error("network failure");
    assert.throws(
      () => handleApiError(genericError),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).message, "network failure");
        return true;
      }
    );
  });

  it("re-throws non-Error values unchanged", () => {
    const weirdThing = "some string error";
    assert.throws(
      () => handleApiError(weirdThing),
      (err: unknown) => {
        assert.equal(err, weirdThing);
        return true;
      }
    );
  });
});
