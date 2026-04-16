#!/usr/bin/env node
/**
 * Docker smoke test for paperclip-mcp container image.
 *
 * Spawns the container via podman (or docker), sends an MCP initialize
 * handshake followed by tools/list, and verifies the response contains a
 * non-empty tools array.
 *
 * Usage:
 *   node scripts/smoke-docker.mjs [image-tag]
 *
 * Defaults:
 *   image-tag  → paperclip-mcp:latest
 *   runtime    → podman (override with CONTAINER_RUNTIME=docker)
 */

import { spawn } from "node:child_process";

const IMAGE = process.argv[2] ?? "paperclip-mcp:latest";
const RUNTIME = process.env["CONTAINER_RUNTIME"] ?? "podman";

const COMPANY_ID = "53caad5d-05d6-469d-b6eb-8961a71b615e";

const ENV = {
  PAPERCLIP_API_KEY: "local-board-noauth",
  PAPERCLIP_API_URL: "http://127.0.0.1:3100",
  PAPERCLIP_AGENT_ID: "00000000-0000-0000-0000-000000000000",
  PAPERCLIP_COMPANY_ID: COMPANY_ID,
};

// Build -e flags for the container command
const envFlags = Object.entries(ENV).flatMap(([k, v]) => ["-e", `${k}=${v}`]);

const args = ["run", "-i", "--rm", "--network=host", ...envFlags, IMAGE];

console.log(`[smoke] runtime : ${RUNTIME}`);
console.log(`[smoke] image   : ${IMAGE}`);
console.log(`[smoke] command : ${RUNTIME} ${args.join(" ")}`);
console.log();

// MCP message sequence:
//   1. initialize request
//   2. notifications/initialized notification
//   3. tools/list request
const MESSAGES = [
  JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "1.0" },
    },
  }),
  JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  }),
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
];

const proc = spawn(RUNTIME, args, {
  stdio: ["pipe", "pipe", "pipe"],
});

// Collect stdout lines — buffer partial chunks until newline arrives
const lines = [];
let stdoutBuf = "";
let stderrBuf = "";

proc.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString("utf8");
  // MCP messages are newline-delimited; only parse complete lines
  const parts = stdoutBuf.split("\n");
  // Last element may be incomplete — keep it in the buffer
  stdoutBuf = parts.pop() ?? "";
  for (const line of parts) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
});

proc.stdout.on("end", () => {
  // Flush any remaining buffered content
  if (stdoutBuf.trim()) lines.push(stdoutBuf.trim());
});

proc.stderr.on("data", (chunk) => {
  stderrBuf += chunk.toString("utf8");
});

// Send all messages then close stdin
for (const msg of MESSAGES) {
  proc.stdin.write(msg + "\n");
}

// Give the server time to process, then close
setTimeout(() => {
  proc.stdin.end();
}, 1500);

// Timeout watchdog
const watchdog = setTimeout(() => {
  console.error("[smoke] TIMEOUT — container did not respond within 5s");
  proc.kill("SIGTERM");
  process.exit(1);
}, 5000);

proc.on("close", (code) => {
  clearTimeout(watchdog);

  if (stderrBuf.trim()) {
    console.log("[smoke] stderr from container:");
    for (const line of stderrBuf.trim().split("\n")) {
      console.log(`        ${line}`);
    }
    console.log();
  }

  // Find the tools/list response (id: 1)
  let toolsResponse = null;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === 1 && parsed.result?.tools) {
        toolsResponse = parsed;
        break;
      }
    } catch {
      // not JSON — skip
    }
  }

  if (!toolsResponse) {
    console.error("[smoke] FAIL — no tools/list response found in output");
    console.error("[smoke] Raw lines received:");
    for (const l of lines) console.error(`        ${l.slice(0, 200)}`);
    process.exit(1);
  }

  const tools = toolsResponse.result.tools;
  const count = tools.length;

  console.log(`[smoke] PASS — tools/list returned ${count} tools`);
  console.log(`[smoke] First 5 tool names:`);
  for (const t of tools.slice(0, 5)) {
    console.log(`        - ${t.name}`);
  }

  // Hard minimum: we know there are 100+ tools in v2
  if (count < 100) {
    console.error(`[smoke] FAIL — expected >=100 tools but got ${count}`);
    process.exit(1);
  }

  console.log();
  console.log(`[smoke] Image ${IMAGE} passed smoke test. Tool count: ${count}`);
  process.exit(0);
});
