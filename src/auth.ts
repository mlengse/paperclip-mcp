export interface PaperclipAuth {
  apiKey: string;
  apiUrl: string;
  agentId: string;
  companyId: string;
  runId?: string;
}

export function getAuthConfig(): PaperclipAuth {
  const apiKey = process.env["PAPERCLIP_API_KEY"];
  const apiUrl = process.env["PAPERCLIP_API_URL"];
  const agentId = process.env["PAPERCLIP_AGENT_ID"];
  const companyId = process.env["PAPERCLIP_COMPANY_ID"];
  const runId = process.env["PAPERCLIP_RUN_ID"];

  if (!apiKey) throw new Error("PAPERCLIP_API_KEY is required");
  if (!apiUrl) throw new Error("PAPERCLIP_API_URL is required");
  if (!agentId) throw new Error("PAPERCLIP_AGENT_ID is required");
  if (!companyId) throw new Error("PAPERCLIP_COMPANY_ID is required");

  return { apiKey, apiUrl, agentId, companyId, runId };
}
