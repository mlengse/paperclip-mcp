import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { validate, toJsonSchema, handleApiError, composeDescription } from "./validation.js";
import {
  ResponseFormatSchema,
  PaginationLimitSchema,
  PaginationOffsetSchema,
  formatJson,
  formatGenericList,
  applyCharLimit,
  paginate,
} from "./format.js";

const PluginStatusSchema = z
  .enum(["installed", "ready", "disabled", "error", "upgrade_pending", "uninstalled"])
  .describe("Plugin lifecycle status filter");

const ListPluginsInput = z
  .object({
    status: PluginStatusSchema.optional().describe(
      "Filter by plugin status (omit to return all statuses)"
    ),
    limit: PaginationLimitSchema.describe("Max plugins per page (1–100, default 50)"),
    offset: PaginationOffsetSchema.describe("Number of plugins to skip (default 0)"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default, human-readable) or 'json' (structured)"),
  })
  .strict();

const GetPluginInput = z
  .object({
    pluginKey: z
      .string()
      .min(1)
      .describe("Plugin key (e.g. 'paperclip.hello-world-example' or '@acme/plugin-linear')"),
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default) or 'json' (structured)"),
  })
  .strict();

const InstallPluginInput = z
  .object({
    packageName: z
      .string()
      .min(1)
      .describe("npm package name to install (e.g. '@paperclipai/plugin-hello-world-example')"),
    version: z
      .string()
      .optional()
      .describe("Specific package version to install (e.g. '1.2.3'); omit for latest"),
    isLocalPath: z
      .boolean()
      .optional()
      .describe(
        "Set true when packageName is a local filesystem path rather than an npm package name"
      ),
  })
  .strict();

const ListPluginExamplesInput = z
  .object({
    response_format: ResponseFormatSchema.optional()
      .default("markdown")
      .describe("Output format: 'markdown' (default) or 'json' (structured)"),
  })
  .strict();

const PluginKeyInput = z
  .object({
    pluginKey: z
      .string()
      .min(1)
      .describe("Plugin key (e.g. 'paperclip.hello-world-example' or '@acme/plugin-linear')"),
  })
  .strict();

export const pluginTools: ToolDefinition[] = [
  {
    name: "paperclip_list_plugins",
    description: composeDescription({
      boardOnly: true,
      summary: "List installed plugins for the Paperclip instance, with optional status filter.",
      args: [
        "- status: enum (optional) — Filter by lifecycle status: installed | ready | disabled | error | upgrade_pending | uninstalled",
        "- limit: number (optional) — Max results per page (1–100, default 50)",
        "- offset: number (optional) — Number of records to skip (default 0)",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Pagination envelope { items: Plugin[], total, count, offset, limit, has_more, next_offset }. Each item: pluginKey, packageName, displayName, description, status, version.",
      examples: {
        useWhen: "auditing which plugins are installed or filtering for plugins in error state",
        dontUseWhen:
          "you need the full plugin detail (health, config) — use paperclip_get_plugin instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(ListPluginsInput),
    annotations: { title: "List plugins", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { status, response_format: fmt, limit, offset } = validate(ListPluginsInput, args);
        const url = status ? `/api/plugins?status=${encodeURIComponent(status)}` : "/api/plugins";
        const all = await client.get<unknown[]>(url);
        const envelope = paginate(all, { limit, offset });
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(envelope)
            : formatGenericList(envelope.items, "Plugins", envelope);
        const hint =
          "Response too large. Use limit/offset to page, or filter by status to narrow results.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_list_plugins", resource: "plugin" });
      }
    },
  },
  {
    name: "paperclip_get_plugin",
    description: composeDescription({
      boardOnly: true,
      summary: "Get detailed information about a specific plugin by its key.",
      args: [
        "- pluginKey: string — Plugin key (e.g. 'paperclip.hello-world-example' or '@acme/plugin-linear'). URL-encoded automatically.",
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Plugin object: pluginKey, packageName, displayName, description, status, version, config, health.",
      examples: {
        useWhen:
          "inspecting a specific plugin's status, version, or configuration before enabling it",
        dontUseWhen: "you need to list all plugins — use paperclip_list_plugins instead",
      },
      errors: [
        "- 404: plugin not found → verify pluginKey with paperclip_list_plugins",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(GetPluginInput),
    annotations: { title: "Get plugin details", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { pluginKey, response_format: fmt } = validate(GetPluginInput, args);
        const data = await client.get<unknown>(`/api/plugins/${encodeURIComponent(pluginKey)}`);
        const text =
          (fmt ?? "markdown") === "json" ? formatJson(data) : formatGenericList([data], "Plugin");
        const hint = "Plugin response too large; use response_format='json' for structured output.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_get_plugin", resource: "plugin" });
      }
    },
  },
  {
    name: "paperclip_install_plugin",
    description: composeDescription({
      boardOnly: true,
      summary: "Install a plugin from npm into the Paperclip instance.",
      args: [
        "- packageName: string — npm package name (e.g. '@paperclipai/plugin-hello-world-example') or local filesystem path when isLocalPath is true",
        "- version: string (optional) — Specific version to install (e.g. '1.2.3'); omit for latest",
        "- isLocalPath: boolean (optional) — Set true when packageName is a local filesystem path",
      ],
      returns:
        "Installation result object with pluginKey, packageName, status, and message confirming the install outcome.",
      examples: {
        useWhen:
          "adding a new plugin capability to the Paperclip instance from the npm registry or a local build",
        dontUseWhen:
          "the plugin is already installed — use paperclip_enable_plugin to re-activate a disabled plugin",
      },
      errors: [
        "- 400: install failed (npm error) → verify packageName is a valid npm package that exists in the registry",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(InstallPluginInput),
    annotations: { title: "Install plugin", destructiveHint: false, openWorldHint: true },
    async handler(args, client) {
      try {
        const input = validate(InstallPluginInput, args);
        const body: Record<string, unknown> = { packageName: input.packageName };
        if (input.version !== undefined) body["version"] = input.version;
        if (input.isLocalPath !== undefined) body["isLocalPath"] = input.isLocalPath;
        const data = await client.post<unknown>("/api/plugins/install", body);
        const hint = "Plugin install response too large; the operation likely succeeded.";
        return { content: [{ type: "text", text: applyCharLimit(formatJson(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_install_plugin", resource: "plugin" });
      }
    },
  },
  {
    name: "paperclip_list_plugin_examples",
    description: composeDescription({
      boardOnly: true,
      summary: "List available example plugins that can be installed for reference.",
      args: [
        "- response_format: 'markdown' | 'json' (optional) — Output format (default: markdown)",
      ],
      returns:
        "Array of example plugin descriptors: packageName, pluginKey, displayName, description, localPath, tag.",
      examples: {
        useWhen:
          "discovering reference plugin implementations to understand the plugin API surface",
        dontUseWhen: "you need the list of installed plugins — use paperclip_list_plugins instead",
      },
      errors: [
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(ListPluginExamplesInput),
    annotations: { title: "List plugin examples", readOnlyHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { response_format: fmt } = validate(ListPluginExamplesInput, args);
        const data = await client.get<unknown[]>("/api/plugins/examples");
        const text =
          (fmt ?? "markdown") === "json"
            ? formatJson(data)
            : formatGenericList(data, "Plugin Examples");
        const hint = "Response too large. Use response_format='json' for structured output.";
        return { content: [{ type: "text", text: applyCharLimit(text, hint) }] };
      } catch (err) {
        return handleApiError(err, {
          tool: "paperclip_list_plugin_examples",
          resource: "plugin",
        });
      }
    },
  },
  {
    name: "paperclip_enable_plugin",
    description: composeDescription({
      boardOnly: true,
      summary: "Enable a previously disabled plugin by its key.",
      args: [
        "- pluginKey: string — Plugin key (e.g. 'paperclip.hello-world-example'). URL-encoded automatically.",
      ],
      returns: "Updated plugin object with new status confirming the plugin is now enabled.",
      examples: {
        useWhen:
          "re-activating a plugin that was disabled without uninstalling it; safe to call if already enabled",
        dontUseWhen:
          "the plugin is not installed yet — use paperclip_install_plugin to install it first",
      },
      errors: [
        "- 404: plugin not found → verify pluginKey with paperclip_list_plugins",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(PluginKeyInput),
    annotations: {
      title: "Enable plugin",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async handler(args, client) {
      try {
        const { pluginKey } = validate(PluginKeyInput, args);
        const data = await client.post<unknown>(
          `/api/plugins/${encodeURIComponent(pluginKey)}/enable`,
          {}
        );
        const hint = "Plugin enable response too large; the operation likely succeeded.";
        return { content: [{ type: "text", text: applyCharLimit(formatJson(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_enable_plugin", resource: "plugin" });
      }
    },
  },
  {
    name: "paperclip_disable_plugin",
    description: composeDescription({
      boardOnly: true,
      summary: "Disable an active plugin by its key without uninstalling it.",
      args: [
        "- pluginKey: string — Plugin key (e.g. 'paperclip.hello-world-example'). URL-encoded automatically.",
      ],
      returns: "Updated plugin object with new status confirming the plugin is now disabled.",
      examples: {
        useWhen:
          "temporarily deactivating a plugin without losing its installation or configuration",
        dontUseWhen:
          "you want to permanently remove the plugin — use the uninstall flow instead; disabling is reversible",
      },
      errors: [
        "- 404: plugin not found → verify pluginKey with paperclip_list_plugins",
        "- 401: authentication failed → check PAPERCLIP_API_KEY",
        "- 403: permission denied → this tool requires a board (human-user) API key",
      ],
    }),
    inputSchema: toJsonSchema(PluginKeyInput),
    annotations: { title: "Disable plugin", destructiveHint: true, openWorldHint: false },
    async handler(args, client) {
      try {
        const { pluginKey } = validate(PluginKeyInput, args);
        const data = await client.post<unknown>(
          `/api/plugins/${encodeURIComponent(pluginKey)}/disable`,
          {}
        );
        const hint = "Plugin disable response too large; the operation likely succeeded.";
        return { content: [{ type: "text", text: applyCharLimit(formatJson(data), hint) }] };
      } catch (err) {
        return handleApiError(err, { tool: "paperclip_disable_plugin", resource: "plugin" });
      }
    },
  },
];
