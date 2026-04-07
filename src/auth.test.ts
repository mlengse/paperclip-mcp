import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getAuthConfig } from "./auth.js";

const REQUIRED_VARS = [
  "PAPERCLIP_API_KEY",
  "PAPERCLIP_API_URL",
  "PAPERCLIP_AGENT_ID",
  "PAPERCLIP_COMPANY_ID",
] as const;

describe("getAuthConfig", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const v of [...REQUIRED_VARS, "PAPERCLIP_RUN_ID"]) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function setAllRequired() {
    process.env["PAPERCLIP_API_KEY"] = "test-key";
    process.env["PAPERCLIP_API_URL"] = "http://localhost:3100";
    process.env["PAPERCLIP_AGENT_ID"] = "agent-id";
    process.env["PAPERCLIP_COMPANY_ID"] = "company-id";
  }

  it("returns config when all required vars are set", () => {
    setAllRequired();
    const config = getAuthConfig();
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.apiUrl, "http://localhost:3100");
    assert.equal(config.agentId, "agent-id");
    assert.equal(config.companyId, "company-id");
    assert.equal(config.runId, undefined);
  });

  it("includes runId when PAPERCLIP_RUN_ID is set", () => {
    setAllRequired();
    process.env["PAPERCLIP_RUN_ID"] = "run-123";
    const config = getAuthConfig();
    assert.equal(config.runId, "run-123");
  });

  for (const missing of REQUIRED_VARS) {
    it(`throws when ${missing} is missing`, () => {
      setAllRequired();
      delete process.env[missing];
      assert.throws(() => getAuthConfig(), new RegExp(missing));
    });
  }
});
