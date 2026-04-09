import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, handleApiError } from "./validation.js";

const ProjectIdInput = z.object({
  projectId: z.string().min(1).describe("Project UUID"),
});

const CreateProjectInput = z.object({
  name: z.string().min(1).describe("Project name"),
  description: z.string().optional().describe("Project description (markdown)"),
  status: z.string().optional().describe("Initial status (default: active)"),
  goalId: z.string().optional().describe("Goal UUID to link the project to"),
  workspace: z
    .object({
      cwd: z.string().optional().describe("Local working directory path"),
      repoUrl: z.string().optional().describe("Remote repository URL"),
    })
    .optional()
    .describe("Optional workspace config to create alongside the project"),
});

const UpdateProjectInput = z.object({
  projectId: z.string().min(1).describe("Project UUID"),
  name: z.string().optional().describe("New name"),
  description: z.string().optional().describe("New description (markdown)"),
  status: z.string().optional().describe("New status"),
});

const CreateWorkspaceInput = z.object({
  projectId: z.string().min(1).describe("Project UUID"),
  cwd: z.string().optional().describe("Local working directory path"),
  repoUrl: z.string().optional().describe("Remote repository URL"),
});

const UpdateWorkspaceInput = z.object({
  projectId: z.string().min(1).describe("Project UUID"),
  workspaceId: z.string().min(1).describe("Workspace UUID"),
  cwd: z.string().optional().describe("New local working directory path"),
  repoUrl: z.string().optional().describe("New remote repository URL"),
});

export const projectTools: ToolDefinition[] = [
  {
    name: "paperclip_list_projects",
    description: "List projects for the current company.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/projects`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_project",
    description: "Get a single project by ID, including its workspaces.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project UUID" },
      },
      required: ["projectId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { projectId } = validate(ProjectIdInput, args);
        const data = await client.get<unknown>(`/api/projects/${projectId}`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_project",
    description:
      "Create a new project. Optionally include a workspace config. companyId is injected from auth config. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        description: { type: "string", description: "Project description (markdown)" },
        status: { type: "string", description: "Initial status (default: active)" },
        goalId: { type: "string", description: "Goal UUID to link the project to" },
        workspace: {
          type: "object",
          description: "Optional workspace to create alongside the project",
          properties: {
            cwd: { type: "string", description: "Local working directory path" },
            repoUrl: { type: "string", description: "Remote repository URL" },
          },
        },
      },
      required: ["name"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const input = validate(CreateProjectInput, args);
        const body: Record<string, unknown> = { name: input.name };
        if (input.description !== undefined) body.description = input.description;
        if (input.status !== undefined) body.status = input.status;
        if (input.goalId !== undefined) body.goalId = input.goalId;
        if (input.workspace !== undefined) body.workspace = input.workspace;
        const data = await client.post<unknown>(
          `/api/companies/${client.companyId}/projects`,
          body
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_project",
    description:
      "Update a project's name, description, or status. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project UUID" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description (markdown)" },
        status: { type: "string", description: "New status" },
      },
      required: ["projectId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { projectId, ...rest } = validate(UpdateProjectInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/projects/${projectId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_list_workspaces",
    description: "List workspaces for a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project UUID" },
      },
      required: ["projectId"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { projectId } = validate(ProjectIdInput, args);
        const data = await client.get<unknown>(`/api/projects/${projectId}/workspaces`);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_workspace",
    description:
      "Create a new workspace for a project. Provide at least one of cwd or repoUrl. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project UUID" },
        cwd: { type: "string", description: "Local working directory path" },
        repoUrl: { type: "string", description: "Remote repository URL" },
      },
      required: ["projectId"],
    },
    annotations: { destructiveHint: false, openWorldHint: false },
    async handler(args, client) {
      try {
        const { projectId, cwd, repoUrl } = validate(CreateWorkspaceInput, args);
        const body: Record<string, unknown> = {};
        if (cwd !== undefined) body.cwd = cwd;
        if (repoUrl !== undefined) body.repoUrl = repoUrl;
        const data = await client.post<unknown>(`/api/projects/${projectId}/workspaces`, body);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_workspace",
    description:
      "Update a workspace's cwd or repoUrl. Run ID header is injected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project UUID" },
        workspaceId: { type: "string", description: "Workspace UUID" },
        cwd: { type: "string", description: "New local working directory path" },
        repoUrl: { type: "string", description: "New remote repository URL" },
      },
      required: ["projectId", "workspaceId"],
    },
    annotations: { destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { projectId, workspaceId, cwd, repoUrl } = validate(UpdateWorkspaceInput, args);
        const body: Record<string, unknown> = {};
        if (cwd !== undefined) body.cwd = cwd;
        if (repoUrl !== undefined) body.repoUrl = repoUrl;
        const data = await client.patch<unknown>(
          `/api/projects/${projectId}/workspaces/${workspaceId}`,
          body
        );
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
