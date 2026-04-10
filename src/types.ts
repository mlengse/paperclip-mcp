// Shared Paperclip API response types

export interface PaperclipAgent {
  id: string;
  companyId: string;
  name: string;
  role: string;
  title: string | null;
  status: string;
  reportsTo: string | null;
  capabilities: string;
  urlKey: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  chainOfCommand: Array<{
    id: string;
    name: string;
    role: string;
    title: string | null;
  }>;
}

export interface PaperclipIssueCompact {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  goalId: string | null;
  parentId: string | null;
  updatedAt: string;
  activeRun?: {
    id: string;
    status: string;
    agentId: string;
  } | null;
}
