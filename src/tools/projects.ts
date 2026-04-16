import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, NoInput } from "./validation.js";

const ProjectIdInput = z
  .object({
    projectId: z.string().min(1).describe("Project UUID"),
  })
  .strict();

const CreateProjectInput = z
  .object({
    name: z.string().min(1).describe("Project name"),
    description: z.string().optional().describe("Project description (markdown)"),
    status: z.string().optional().describe("Initial status (e.g. active)"),
    goalId: z.string().optional().describe("Goal UUID to link the project to"),
    workspace: z
      .object({
        cwd: z.string().optional().describe("Local working directory path"),
        repoUrl: z.string().optional().describe("Remote repository URL"),
      })
      .optional()
      .describe("Optional workspace config to create alongside the project"),
  })
  .strict();

const UpdateProjectInput = z
  .object({
    projectId: z.string().min(1).describe("Project UUID"),
    name: z.string().optional().describe("New name"),
    description: z.string().optional().describe("New description (markdown)"),
    status: z.string().optional().describe("New status (e.g. active, archived)"),
  })
  .strict();

const CreateWorkspaceInput = z
  .object({
    projectId: z.string().min(1).describe("Project UUID"),
    cwd: z.string().optional().describe("Local working directory path"),
    repoUrl: z.string().optional().describe("Remote repository URL"),
  })
  .strict()
  .refine((d) => d.cwd !== undefined || d.repoUrl !== undefined, {
    message: "Must provide at least one of 'cwd' or 'repoUrl'.",
  });

const UpdateWorkspaceInput = z
  .object({
    projectId: z.string().min(1).describe("Project UUID"),
    workspaceId: z.string().min(1).describe("Workspace UUID"),
    cwd: z.string().optional().describe("New local working directory path"),
    repoUrl: z.string().optional().describe("New remote repository URL"),
  })
  .strict();

export const projectTools: ToolDefinition[] = [
  {
    name: "paperclip_list_projects",
    description: "List projects for the current company.",
    inputSchema: toJsonSchema(NoInput),
    annotations: { title: "List company projects", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        validate(NoInput, args);
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
    inputSchema: toJsonSchema(ProjectIdInput),
    annotations: { title: "Get project by ID", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(CreateProjectInput),
    annotations: { title: "Create new project", destructiveHint: false, openWorldHint: false },
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
    inputSchema: toJsonSchema(UpdateProjectInput),
    annotations: { title: "Update project fields", destructiveHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(ProjectIdInput),
    annotations: { title: "List project workspaces", readOnlyHint: true, openWorldHint: false },
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
    inputSchema: toJsonSchema(CreateWorkspaceInput),
    annotations: {
      title: "Create project workspace",
      destructiveHint: false,
      openWorldHint: false,
    },
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
    description: "Update a workspace's cwd or repoUrl. Run ID header is injected automatically.",
    inputSchema: toJsonSchema(UpdateWorkspaceInput),
    annotations: {
      title: "Update workspace settings",
      destructiveHint: true,
      openWorldHint: false,
    },
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
