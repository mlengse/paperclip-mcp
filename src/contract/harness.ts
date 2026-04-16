/**
 * Contract test harness.
 *
 * Contract tests run against a live local Paperclip server.
 * They are gated behind the PAPERCLIP_CONTRACT_TESTS=1 environment variable.
 * When that variable is absent, every suite is skipped so `npm run test`
 * is unaffected.
 *
 * Required env vars (same as production):
 *   PAPERCLIP_API_KEY, PAPERCLIP_API_URL, PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID
 *
 * Optional:
 *   PAPERCLIP_RUN_ID
 */

import { PaperclipClient } from "../client.js";

export const CONTRACT_ENABLED = process.env["PAPERCLIP_CONTRACT_TESTS"] === "1";

/** Skip option for node:test describe/it blocks when contract tests are disabled. */
export const SKIP = CONTRACT_ENABLED ? undefined : "set PAPERCLIP_CONTRACT_TESTS=1 to enable";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (!CONTRACT_ENABLED) {
      // Safe to return a placeholder — callers are only invoked when CONTRACT_ENABLED is true.
      return `__missing_${name}__`;
    }
    throw new Error(`Contract tests require ${name} to be set`);
  }
  return value;
}

export function buildContractAuth() {
  return {
    apiKey: requireEnv("PAPERCLIP_API_KEY"),
    apiUrl: requireEnv("PAPERCLIP_API_URL"),
    agentId: requireEnv("PAPERCLIP_AGENT_ID"),
    companyId: requireEnv("PAPERCLIP_COMPANY_ID"),
    runId: process.env["PAPERCLIP_RUN_ID"],
  };
}

export function buildContractClient(): PaperclipClient {
  return new PaperclipClient(buildContractAuth());
}

/**
 * A client backed by a deliberately invalid API key — used to exercise
 * 401/403 permission-error paths against the real server.
 */
export function buildBadAuthClient(): PaperclipClient {
  return new PaperclipClient({
    apiKey: "invalid-bad-key",
    apiUrl: requireEnv("PAPERCLIP_API_URL"),
    agentId: requireEnv("PAPERCLIP_AGENT_ID"),
    companyId: requireEnv("PAPERCLIP_COMPANY_ID"),
  });
}

/** A UUID that will never exist in any real database. */
export const NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
