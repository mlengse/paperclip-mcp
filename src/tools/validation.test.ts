/**
 * Unit tests for composeDescription helper (Stage 4).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeDescription } from "./validation.js";

describe("composeDescription", () => {
  it("minimal — summary only returns just the summary", () => {
    const result = composeDescription({ summary: "Do the thing." });
    assert.equal(result, "Do the thing.");
  });

  it("boardOnly: true prefixes summary with '⚠ Board-only: '", () => {
    const result = composeDescription({ summary: "Delete everything.", boardOnly: true });
    assert.ok(
      result.startsWith("⚠ Board-only: Delete everything."),
      `Expected board-only prefix, got: ${result}`
    );
  });

  it("boardOnly: false (or absent) does not add prefix", () => {
    const result = composeDescription({ summary: "Read something.", boardOnly: false });
    assert.ok(!result.includes("⚠ Board-only:"), "Should not have board-only prefix");
    assert.equal(result, "Read something.");
  });

  it("all sections populated returns formatted block in fixed order", () => {
    const result = composeDescription({
      summary: "Fetch a widget by ID.",
      args: ['- widgetId: string — Widget UUID (example: "wgt_abc123")'],
      returns: "- id: string\n- name: string\n- status: string",
      examples: {
        useWhen: "you need a single widget's details",
        dontUseWhen: "you need multiple widgets — use paperclip_list_widgets instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: widget not found → verify ID with paperclip_list_widgets",
      ],
    });

    // Check section presence and order
    const returnsIdx = result.indexOf("Returns:");
    const examplesIdx = result.indexOf("Examples:");
    const errorsIdx = result.indexOf("Error Handling:");
    const argsIdx = result.indexOf("Args:");

    assert.ok(argsIdx > 0, "Should have Args: section");
    assert.ok(returnsIdx > argsIdx, "Returns: should come after Args:");
    assert.ok(examplesIdx > returnsIdx, "Examples: should come after Returns:");
    assert.ok(errorsIdx > examplesIdx, "Error Handling: should come after Examples:");

    assert.ok(result.includes("Use when: you need a single widget's details"));
    assert.ok(
      result.includes(
        "Don't use when: you need multiple widgets — use paperclip_list_widgets instead"
      )
    );
    assert.ok(result.includes("- 404: widget not found → verify ID with paperclip_list_widgets"));
  });

  it("empty args array — Args section is skipped", () => {
    const result = composeDescription({
      summary: "No args tool.",
      args: [],
      returns: "- status: string",
      examples: { useWhen: "always" },
      errors: ["- 401: check API key"],
    });
    assert.ok(!result.includes("Args:"), "Empty args array should not render Args: section");
  });

  it("missing returns — Returns section is skipped", () => {
    const result = composeDescription({
      summary: "Minimal tool.",
      examples: { useWhen: "testing" },
      errors: ["- 401: check API key"],
    });
    assert.ok(!result.includes("Returns:"), "Missing returns should not render Returns: section");
  });

  it("missing examples — Examples section is skipped", () => {
    const result = composeDescription({
      summary: "Minimal tool.",
      returns: "- ok: boolean",
      errors: ["- 401: check API key"],
    });
    assert.ok(
      !result.includes("Examples:"),
      "Missing examples should not render Examples: section"
    );
    assert.ok(!result.includes("Use when:"), "Missing examples should not render Use when:");
  });

  it("empty errors array — Error Handling section is skipped", () => {
    const result = composeDescription({
      summary: "Infallible tool.",
      errors: [],
      examples: { useWhen: "always" },
    });
    assert.ok(
      !result.includes("Error Handling:"),
      "Empty errors array should not render Error Handling: section"
    );
  });

  it("dontUseWhen is optional — omitting it still renders Use when:", () => {
    const result = composeDescription({
      summary: "Simple tool.",
      examples: { useWhen: "you need data" },
    });
    assert.ok(result.includes("Use when: you need data"));
    assert.ok(!result.includes("Don't use when:"));
  });

  it("sections are separated by double newlines", () => {
    const result = composeDescription({
      summary: "Test.",
      returns: "- x: string",
      examples: { useWhen: "testing" },
      errors: ["- 401: auth"],
    });
    // Between Returns: section and Examples: section
    assert.ok(result.includes("\n\nExamples:"), "Sections must be separated by blank lines");
    assert.ok(result.includes("\n\nError Handling:"), "Sections must be separated by blank lines");
  });
});
