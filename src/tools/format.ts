import { z } from "zod";
import { CHARACTER_LIMIT } from "../constants.js";

// ---------------------------------------------------------------------------
// Response format type + schema
// ---------------------------------------------------------------------------
export type ResponseFormat = "markdown" | "json";

export const ResponseFormatSchema = z.enum(["markdown", "json"]);

// ---------------------------------------------------------------------------
// JSON formatter
// ---------------------------------------------------------------------------
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// Character limit enforcement
// ---------------------------------------------------------------------------

/**
 * Truncates `text` to CHARACTER_LIMIT if it exceeds it, appending a hint
 * line that names the parameter the caller should adjust to see more.
 *
 * Design decision: 200-char buffer for the hint itself, so the total stays
 * comfortably under CHARACTER_LIMIT after appending the hint block.
 */
export function applyCharLimit(text: string | undefined | null, hint: string): string {
  const safe = text ?? "";
  if (safe.length <= CHARACTER_LIMIT) return safe;
  const truncated = safe.slice(0, CHARACTER_LIMIT - 200);
  return `${truncated}\n\n---\n[Truncated: ${hint}]`;
}

// ---------------------------------------------------------------------------
// Timestamp helper — ISO 8601 → "2026-04-15 14:00:00 UTC"
// ---------------------------------------------------------------------------
function humanTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    // Format: "2026-04-15 14:00:00 UTC"
    return d
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, " UTC");
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// formatAgentList — used by paperclip_list_agents
// ---------------------------------------------------------------------------
interface AgentRecord {
  id?: string;
  name?: string;
  urlKey?: string;
  role?: string;
  status?: string;
  title?: string | null;
}

export function formatAgentList(agents: unknown): string {
  const list = Array.isArray(agents) ? (agents as AgentRecord[]) : [];
  const header = `## Agents (${list.length})`;
  if (list.length === 0) return `${header}\n\n_No agents found._`;
  const lines = list.map((a) => {
    const name = a.name ?? "Unknown";
    const id = a.id ? ` (${a.id})` : "";
    const role = a.role ? ` · ${a.role}` : "";
    const status = a.status ? ` · ${a.status}` : "";
    const title = a.title ? ` — ${a.title}` : "";
    return `- **${name}**${id}${role}${status}${title}`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// formatIssueList — used by paperclip_list_issues
// ---------------------------------------------------------------------------
interface IssueRecord {
  id?: string;
  identifier?: string;
  title?: string;
  status?: string;
  priority?: string | null;
  assigneeAgentId?: string | null;
  projectId?: string | null;
  updatedAt?: string;
}

interface IssueEnvelope {
  total?: number;
  limit?: number;
  offset?: number;
}

export function formatIssueList(issues: unknown, envelope?: IssueEnvelope): string {
  const list = Array.isArray(issues) ? (issues as IssueRecord[]) : [];
  let header = `## Issues`;
  if (envelope) {
    const { total, limit, offset } = envelope;
    const parts: string[] = [];
    if (total !== undefined) parts.push(`total: ${total}`);
    if (limit !== undefined) parts.push(`showing ${list.length} of ${limit ?? list.length}`);
    if (offset !== undefined) parts.push(`at offset ${offset}`);
    if (parts.length > 0) header += ` (${parts.join(", ")})`;
  } else {
    header += ` (${list.length})`;
  }
  if (list.length === 0) return `${header}\n\n_No issues found._`;
  const lines = list.map((issue) => {
    const id = issue.identifier ?? issue.id ?? "?";
    const title = issue.title ?? "Untitled";
    const status = issue.status ?? "unknown";
    const priority = issue.priority ?? null;
    const meta: string[] = [];
    if (priority) meta.push(priority);
    if (issue.assigneeAgentId) meta.push(`Assigned: @${issue.assigneeAgentId}`);
    if (issue.projectId) meta.push(`Project: ${issue.projectId}`);
    if (issue.updatedAt) meta.push(`Updated: ${humanTimestamp(issue.updatedAt)}`);
    const metaLine = meta.length > 0 ? `\n  ${meta.join(" · ")}` : "";
    const statusPriority = priority ? `${status}, ${priority}` : status;
    return `- **${id}** (${statusPriority}) — ${title}${metaLine}`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// formatDashboard — used by paperclip_get_dashboard
// ---------------------------------------------------------------------------
interface DashboardRecord {
  goals?: Array<{ id?: string; title?: string; status?: string }>;
  projects?: Array<{ id?: string; name?: string; status?: string }>;
  issuesByStatus?: Record<string, number>;
  agentWorkload?: Array<{ agentName?: string; activeIssues?: number }>;
}

export function formatDashboard(data: unknown): string {
  const d = (data ?? {}) as DashboardRecord;
  const sections: string[] = [];

  // Goals section — be defensive: goals may be a number (legacy fixtures) or array
  const rawGoals = d.goals;
  const goals = Array.isArray(rawGoals) ? rawGoals : [];
  sections.push(`## Goals (${goals.length})`);
  if (goals.length === 0) {
    sections.push("_No goals._");
  } else {
    sections.push(
      goals.map((g) => `- **${g.title ?? "Untitled"}** (${g.status ?? "unknown"})`).join("\n")
    );
  }

  // Projects section — be defensive
  const rawProjects = d.projects;
  const projects = Array.isArray(rawProjects) ? rawProjects : [];
  sections.push(`## Projects (${projects.length})`);
  if (projects.length === 0) {
    sections.push("_No projects._");
  } else {
    sections.push(
      projects.map((p) => `- **${p.name ?? "Untitled"}** (${p.status ?? "unknown"})`).join("\n")
    );
  }

  // Issues by status — be defensive; issuesByStatus may be a number or missing
  const rawByStatus = d.issuesByStatus;
  const byStatus =
    rawByStatus && typeof rawByStatus === "object" && !Array.isArray(rawByStatus)
      ? rawByStatus
      : {};
  const statusKeys = Object.keys(byStatus);
  sections.push(`## Issues by Status`);
  if (statusKeys.length === 0) {
    sections.push("_No issues._");
  } else {
    sections.push(statusKeys.map((k) => `- **${k}**: ${byStatus[k]}`).join("\n"));
  }

  // Agent workload — be defensive
  const rawWorkload = d.agentWorkload;
  const workload = Array.isArray(rawWorkload) ? rawWorkload : [];
  sections.push(`## Agent Workload`);
  if (workload.length === 0) {
    sections.push("_No workload data._");
  } else {
    sections.push(
      workload
        .map((w) => `- **${w.agentName ?? "Unknown"}**: ${w.activeIssues ?? 0} active issue(s)`)
        .join("\n")
    );
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// formatOrgChart — used by paperclip_get_org_chart
// ---------------------------------------------------------------------------
interface OrgChartRecord {
  agents?: Array<{ id?: string; name?: string; role?: string; reportsTo?: string | null }>;
}

export function formatOrgChart(data: unknown): string {
  const d = (data ?? {}) as OrgChartRecord;
  const agents = d.agents ?? [];
  const header = `## Org Chart (${agents.length} agent${agents.length !== 1 ? "s" : ""})`;
  if (agents.length === 0) return `${header}\n\n_No agents in org chart._`;
  const lines = agents.map((a) => {
    const name = a.name ?? "Unknown";
    const id = a.id ? ` (${a.id})` : "";
    const role = a.role ? ` · ${a.role}` : "";
    const reports = a.reportsTo ? ` → reports to ${a.reportsTo}` : "";
    return `- **${name}**${id}${role}${reports}`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// formatSingleIssue — used by paperclip_get_issue
// ---------------------------------------------------------------------------
export function formatSingleIssue(data: unknown): string {
  const issue = (data ?? {}) as IssueRecord & Record<string, unknown>;
  const id =
    (issue["identifier"] as string | undefined) ?? (issue["id"] as string | undefined) ?? "?";
  const title = (issue["title"] as string | undefined) ?? "Untitled";
  const status = (issue["status"] as string | undefined) ?? "unknown";
  const priority = (issue["priority"] as string | null | undefined) ?? null;
  const description = (issue["description"] as string | undefined) ?? null;

  const lines: string[] = [`## Issue ${id} — ${title}`];
  lines.push(`**Status:** ${status}${priority ? ` · **Priority:** ${priority}` : ""}`);

  const assigneeAgent = issue["assigneeAgentId"] as string | null | undefined;
  const assigneeUser = issue["assigneeUserId"] as string | null | undefined;
  if (assigneeAgent) lines.push(`**Assigned to:** @${assigneeAgent}`);
  else if (assigneeUser) lines.push(`**Assigned to (user):** ${assigneeUser}`);

  const projectId = issue["projectId"] as string | null | undefined;
  const goalId = issue["goalId"] as string | null | undefined;
  if (projectId) lines.push(`**Project:** ${projectId}`);
  if (goalId) lines.push(`**Goal:** ${goalId}`);

  const updatedAt = issue["updatedAt"] as string | undefined;
  const createdAt = issue["createdAt"] as string | undefined;
  if (updatedAt) lines.push(`**Updated:** ${humanTimestamp(updatedAt)}`);
  if (createdAt) lines.push(`**Created:** ${humanTimestamp(createdAt)}`);

  if (description) {
    lines.push(`\n### Description\n${description}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Generic list fallback — for tools without a dedicated formatter
// ---------------------------------------------------------------------------
export function formatGenericList(data: unknown, label = "Items"): string {
  const list = Array.isArray(data) ? data : [];
  const header = `## ${label} (${list.length})`;
  if (list.length === 0) return `${header}\n\n_None found._`;
  const lines = list.map((item: unknown) => {
    if (typeof item === "object" && item !== null) {
      const r = item as Record<string, unknown>;
      const id = (r["id"] as string | undefined) ?? (r["identifier"] as string | undefined) ?? "";
      const name =
        (r["name"] as string | undefined) ??
        (r["title"] as string | undefined) ??
        (r["key"] as string | undefined) ??
        JSON.stringify(item);
      return id ? `- **${name}** (${id})` : `- **${name}**`;
    }
    return `- ${String(item)}`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}
