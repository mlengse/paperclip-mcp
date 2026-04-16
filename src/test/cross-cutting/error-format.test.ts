/**
 * Cross-cutting error format tests.
 *
 * Asserts that handleApiError() returns a well-formed { isError: true, content: [...] }
 * result for each HTTP status code path, and that the status code is present in the
 * error text so LLMs can reason about the failure.
 *
 * Stage 2 scope: document current behavior.
 * Stage 7: refactored to LLM-actionable messages with per-status recovery hints
 * (01-mcp-skill.md §Error Handling). Non-PaperclipApiError errors are now wrapped
 * (not re-thrown) and also return { isError: true }.
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

describe("handleApiError — stage-7 actionable messages", () => {
  it("[stage-7] 404 error includes recovery hint naming paperclip_list_* sibling", () => {
    const err = new PaperclipApiError(404, "Not Found", { message: "issue not found" });
    const result = handleApiError(err, { tool: "paperclip_get_issue", resource: "issue" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /paperclip_list_issues|paperclip_get_issue/i);
  });

  it("[stage-7] 403 mentions board-only possibility", () => {
    const err = new PaperclipApiError(403, "Forbidden", {});
    const result = handleApiError(err, { tool: "paperclip_terminate_agent" });
    assert.match(result.content[0]!.text.toLowerCase(), /board|human/);
  });

  it("[stage-7] 429 suggests waiting", () => {
    const err = new PaperclipApiError(429, "Too Many", {});
    const result = handleApiError(err, { tool: "paperclip_list_issues" });
    assert.match(result.content[0]!.text.toLowerCase(), /wait|rate/);
  });

  it("[stage-7] 400 includes tool name and recovery hint", () => {
    const err = new PaperclipApiError(400, "Bad Request", { message: "title is required" });
    const result = handleApiError(err, { tool: "paperclip_create_issue", resource: "issue" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /paperclip_create_issue/);
    assert.match(result.content[0]!.text, /title is required/);
  });

  it("[stage-7] 401 mentions PAPERCLIP_API_KEY", () => {
    const err = new PaperclipApiError(401, "Unauthorized", {});
    const result = handleApiError(err, { tool: "paperclip_list_agents" });
    assert.match(result.content[0]!.text, /PAPERCLIP_API_KEY/);
  });

  it("[stage-7] 422 includes validation failure text and tool name", () => {
    const err = new PaperclipApiError(422, "Unprocessable Entity", {
      message: "status is invalid",
    });
    const result = handleApiError(err, { tool: "paperclip_update_issue" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /paperclip_update_issue/);
    assert.match(result.content[0]!.text, /status is invalid/);
  });

  it("[stage-7] 409 generic includes do-not-retry hint", () => {
    const err = new PaperclipApiError(409, "Conflict", { message: "label already exists" });
    const result = handleApiError(err, { tool: "paperclip_create_label", resource: "label" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /conflict|retry/);
  });

  it("[stage-7] 5xx includes transient / retry hint", () => {
    const err = new PaperclipApiError(502, "Bad Gateway", {});
    const result = handleApiError(err, { tool: "paperclip_list_issues" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /502/);
    assert.match(result.content[0]!.text.toLowerCase(), /transient|retry/);
  });

  it("[stage-7] AbortError → timeout message", () => {
    const err = new DOMException("Aborted", "AbortError");
    const result = handleApiError(err, { tool: "paperclip_list_issues" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /timeout/);
  });

  it("[stage-7] network TypeError → network-error message", () => {
    const err = new TypeError("fetch failed");
    const result = handleApiError(err, { tool: "paperclip_list_issues" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /network|reach/);
  });

  it("[stage-7] custom hint from context is appended to the message", () => {
    const err = new PaperclipApiError(500, "Internal", {});
    const result = handleApiError(err, {
      tool: "paperclip_list_comments",
      hint: "known bug; use offset",
    });
    assert.match(result.content[0]!.text, /offset/);
  });

  it("[stage-7] unknown error produces isError response (no re-throw)", () => {
    const genericError = new Error("something unexpected");
    const result = handleApiError(genericError, { tool: "paperclip_list_issues" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /unexpected|something unexpected/);
  });

  it("[stage-7] non-Error value produces isError response (no re-throw)", () => {
    const result = handleApiError("some string error", { tool: "paperclip_list_issues" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /unexpected/);
  });
});

describe("handleApiError — no-context backward-compat (ctx omitted)", () => {
  it("returns { isError: true } with generic message when ctx omitted", () => {
    const err = new PaperclipApiError(404, "Not Found", {});
    const result = handleApiError(err);
    assert.equal(result.isError, true);
    assert.ok(result.content[0]!.text.includes("404"));
  });

  it("wraps non-PaperclipApiError when ctx omitted (no longer re-throws)", () => {
    const genericError = new Error("network failure");
    const result = handleApiError(genericError);
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text.toLowerCase(), /unexpected|network failure/);
  });
});
