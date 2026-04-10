export interface PaperclipAuth {
  apiKey: string;
  apiUrl: string;
  agentId: string;
  companyId: string;
  runId?: string;
}

/**
 * Attempt to extract the `sub` claim from a JWT string.
 * Returns undefined if the string is not a JWT or the payload cannot be decoded.
 */
function jwtSub(token: string): string | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    return typeof payload["sub"] === "string" ? payload["sub"] : undefined;
  } catch {
    return undefined;
  }
}

export function getAuthConfig(): PaperclipAuth {
  const apiKey = process.env["PAPERCLIP_API_KEY"];
  const apiUrl = process.env["PAPERCLIP_API_URL"];
  const envAgentId = process.env["PAPERCLIP_AGENT_ID"];
  const companyId = process.env["PAPERCLIP_COMPANY_ID"];
  const runId = process.env["PAPERCLIP_RUN_ID"];

  if (!apiKey) throw new Error("PAPERCLIP_API_KEY is required");
  if (!apiUrl) throw new Error("PAPERCLIP_API_URL is required");
  if (!companyId) throw new Error("PAPERCLIP_COMPANY_ID is required");

  // When the API key is a JWT, derive agent ID from its `sub` claim. This makes
  // the server self-healing when PAPERCLIP_AGENT_ID is absent or overridden by
  // a stale .mcp.json env block (a common misconfiguration when multiple agents
  // share the same project directory).
  const sub = jwtSub(apiKey);
  let agentId = envAgentId;

  if (sub) {
    if (!agentId) {
      agentId = sub;
    } else if (agentId !== sub) {
      console.error(
        `[paperclip-mcp] PAPERCLIP_AGENT_ID env (${agentId}) does not match JWT sub (${sub}); using JWT sub. Check your .mcp.json env block.`
      );
      agentId = sub;
    }
  }

  if (!agentId) throw new Error("PAPERCLIP_AGENT_ID is required");

  return { apiKey, apiUrl, agentId, companyId, runId };
}
