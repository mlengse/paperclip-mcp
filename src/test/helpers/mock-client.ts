/**
 * Shared test utilities for mocking the PaperclipClient.
 *
 * Existing per-tool tests in src/tools/*.test.ts use an inline `mockFetch()`
 * pattern — those stay as they are. New tests (cross-cutting layer and the
 * Stage 8 tool modules) should import these helpers from day one.
 */
import { PaperclipClient } from "../../client.js";

export const TEST_AUTH = {
  apiKey: "test-jwt",
  apiUrl: "http://localhost:3100",
  agentId: "agent-1",
  companyId: "company-1",
} as const;

export interface FetchCall {
  url: string;
  init: RequestInit;
}

/**
 * A mock fetch that returns the same response for every call.
 * Returns { fn, calls } — pass `fn` to the PaperclipClient constructor,
 * inspect `calls` to assert URL / method / body per invocation.
 */
export function makeFetch(status: number, body: unknown) {
  const calls: FetchCall[] = [];
  const nullBody = status === 204 || status === 304;
  const fn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return new Response(nullBody ? null : body !== undefined ? JSON.stringify(body) : null, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

/**
 * A mock fetch for multi-step flows (e.g. checkout → auto-release → retry).
 * Entries are consumed in order; an optional `matcher` picks the first
 * matching entry instead of strict ordering.
 */
export interface SequenceEntry {
  matcher?: (url: string, init: RequestInit) => boolean;
  status: number;
  body: unknown;
}

export function mockSequence(entries: SequenceEntry[]) {
  const calls: FetchCall[] = [];
  const remaining = [...entries];

  const fn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const idx = remaining.findIndex((e) => !e.matcher || e.matcher(url, init));
    if (idx === -1) {
      throw new Error(`mockSequence: no entry matched url=${url} method=${init.method ?? "GET"}`);
    }
    const [entry] = remaining.splice(idx, 1);
    const nullBody = entry!.status === 204 || entry!.status === 304;
    return new Response(nullBody ? null : JSON.stringify(entry!.body), {
      status: entry!.status,
      statusText: entry!.status >= 200 && entry!.status < 300 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  };
  return { fn, calls };
}

/**
 * Convenience: wrap makeFetch and instantiate a PaperclipClient.
 * Prefer this in new tests unless you need to inspect the fetch separately.
 */
export function createMockClient(status: number, body: unknown) {
  const { fn, calls } = makeFetch(status, body);
  const client = new PaperclipClient(TEST_AUTH, fn);
  return { client, calls };
}

export function createSequenceClient(entries: SequenceEntry[]) {
  const { fn, calls } = mockSequence(entries);
  const client = new PaperclipClient(TEST_AUTH, fn);
  return { client, calls };
}
