import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import { ResponseFormatSchema, formatJson, formatGenericList, applyCharLimit } from "./format.js";

const ListProjectsInput = z
  .object({
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const ProjectIdInput = z
  .object({
    projectId: z.string().min(1).describe("Project UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
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
      .strict()
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

const ListWorkspacesInput = z
  .object({
    projectId: z.string().min(1).describe("Project UUID"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
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
    description: composeDescription({
      summary: "List all projects for the current company.",
      args: [
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns: "Array of project objects: id, name, status, goalId, createdAt.",
      examples: {
        useWhen: "finding the projectId to link when creating a new issue",
        dontUseWhen:
          "you need a project's workspaces — use paperclip_get_project or paperclip_list_workspaces",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → verify PAPERCLIP_COMPANY_ID is correct",
      ],
    }),
    inputSchema: toJsonSchema(ListProjectsInput),
    annotations: { title: "List company projects", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt } = validate(ListProjectsInput, args);
        const data = await client.get<unknown>(`/api/companies/${client.companyId}/projects`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList(data, "Projects");
        const hint = "Response too large. Try filtering by status or goal.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_get_project",
    description: composeDescription({
      summary: "Get a single project by UUID, including its associated workspaces.",
      args: [
        '- projectId: string — Project UUID (example: "prj_abc123")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns: "Project object: id, name, description, status, goalId, workspaces[], createdAt.",
      examples: {
        useWhen: "reading project details or checking workspace cwd before checking out a branch",
        dontUseWhen:
          "you need a list of projects — use paperclip_list_projects to discover IDs first",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: project not found → verify ID with paperclip_list_projects",
      ],
    }),
    inputSchema: toJsonSchema(ProjectIdInput),
    annotations: { title: "Get project by ID", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { projectId, response_format: fmt } = validate(ProjectIdInput, args);
        const data = await client.get<unknown>(`/api/projects/${projectId}`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList([data], "Project");
        const hint =
          "Entity response too large. This project may have oversized description or metadata fields.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_project",
    description: composeDescription({
      summary: "Create a new project. Optionally include a workspace config.",
      args: [
        "- name: string — Project name (required)",
        "- description: string (optional) — Project description (markdown)",
        '- status: string (optional) — Initial status (example: "active")',
        "- goalId: string (optional) — Goal UUID to link the project",
        '- workspace.cwd: string (optional) — Local working directory (example: "/home/user/repo")',
        '- workspace.repoUrl: string (optional) — Remote repository URL (example: "https://github.com/org/repo")',
      ],
      returns:
        "Returns the created project object with all fields including assigned UUID and workspace if provided.",
      examples: {
        useWhen:
          "setting up a new feature project linked to a goal, with a workspace for agent execution",
        dontUseWhen:
          "you need to add a workspace to an existing project — use paperclip_create_workspace instead",
      },
      errors: [
        "- 400: validation failure → ensure name is non-empty",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: goalId not found → verify with paperclip_list_goals",
      ],
    }),
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
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_project",
    description: composeDescription({
      summary: "Update a project's name, description, or status.",
      args: [
        '- projectId: string — Project UUID (example: "prj_abc123")',
        "- name: string (optional) — New name",
        "- description: string (optional) — New description (markdown)",
        '- status: string (optional) — New status (example: "archived")',
      ],
      returns: "Returns the updated project object with all fields.",
      examples: {
        useWhen: "archiving a completed project or renaming it after a scope change",
        dontUseWhen:
          "you need to update workspace settings — use paperclip_update_workspace instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: project not found → verify ID with paperclip_list_projects",
      ],
    }),
    inputSchema: toJsonSchema(UpdateProjectInput),
    annotations: {
      title: "Update project fields",
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { projectId, ...rest } = validate(UpdateProjectInput, args);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await client.patch<unknown>(`/api/projects/${projectId}`, body);
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_list_workspaces",
    description: composeDescription({
      summary: "List all workspaces for a project.",
      args: [
        '- projectId: string — Project UUID (example: "prj_abc123")',
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns: "Array of workspace objects: id, cwd, repoUrl, projectId, createdAt.",
      examples: {
        useWhen: "finding the workspace cwd or repoUrl before an agent starts executing in it",
        dontUseWhen:
          "you need the project record — use paperclip_get_project which includes workspaces",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: project not found → verify ID with paperclip_list_projects",
      ],
    }),
    inputSchema: toJsonSchema(ListWorkspacesInput),
    annotations: { title: "List project workspaces", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { projectId, response_format: fmt } = validate(ListWorkspacesInput, args);
        const data = await client.get<unknown>(`/api/projects/${projectId}/workspaces`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList(data, "Workspaces");
        const hint =
          "Response too large; this project has an unusually large number of workspaces.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_create_workspace",
    description: composeDescription({
      summary: "Create a new workspace for a project. At least one of cwd or repoUrl is required.",
      args: [
        '- projectId: string — Project UUID (example: "prj_abc123")',
        '- cwd: string (optional) — Local working directory path (example: "/home/user/repo")',
        '- repoUrl: string (optional) — Remote repository URL (example: "https://github.com/org/repo")',
      ],
      returns: "Returns the created workspace object: id, cwd, repoUrl, projectId, createdAt.",
      examples: {
        useWhen:
          "adding a second workspace (e.g. a different branch or clone) to an existing project",
        dontUseWhen:
          "you are creating a project — use paperclip_create_project with the workspace field instead",
      },
      errors: [
        "- 400: validation failure → must provide at least one of cwd or repoUrl",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: project not found → verify ID with paperclip_list_projects",
      ],
    }),
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
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
  {
    name: "paperclip_update_workspace",
    description: composeDescription({
      summary: "Update a workspace's cwd or repoUrl.",
      args: [
        '- projectId: string — Project UUID (example: "prj_abc123")',
        '- workspaceId: string — Workspace UUID (example: "wsp_abc123")',
        "- cwd: string (optional) — New local working directory path",
        "- repoUrl: string (optional) — New remote repository URL",
      ],
      returns: "Returns the updated workspace object: id, cwd, repoUrl, projectId, updatedAt.",
      examples: {
        useWhen: "updating the workspace path after the repo was moved to a new location",
        dontUseWhen: "you need to create a new workspace — use paperclip_create_workspace instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 404: project or workspace not found → verify IDs with paperclip_list_workspaces",
      ],
    }),
    inputSchema: toJsonSchema(UpdateWorkspaceInput),
    annotations: {
      title: "Update workspace settings",
      destructiveHint: true,
      idempotentHint: true,
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
        const hint = "Server response too large; the operation likely succeeded.";
        return {
          content: [{ type: "text", text: applyCharLimit(JSON.stringify(data), hint) }],
        };
      } catch (err) {
        return handleApiError(err);
      }
    },
  },
];
