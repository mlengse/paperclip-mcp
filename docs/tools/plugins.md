# Plugins

Tools for listing, installing, activating, and deactivating company plugins.

---

## paperclip_disable_plugin

⚠ Board-only: Disable an active plugin by its key without uninstalling it.

**Inputs**

| Parameter   | Type     | Required | Description                                                                |
| ----------- | -------- | -------- | -------------------------------------------------------------------------- |
| `pluginKey` | `string` | yes      | Plugin key (e.g. 'paperclip.hello-world-example' or '@acme/plugin-linear') |

**Returns**

Updated plugin object with new status confirming the plugin is now disabled.

**Examples**

- Use when: temporarily deactivating a plugin without losing its installation or configuration
- Don't use when: you want to permanently remove the plugin — use the uninstall flow instead; disabling is reversible

**Errors**

- 404: plugin not found → verify pluginKey with paperclip_list_plugins
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`destructive`, `closedWorld`

---

## paperclip_enable_plugin

⚠ Board-only: Enable a previously disabled plugin by its key.

**Inputs**

| Parameter   | Type     | Required | Description                                                                |
| ----------- | -------- | -------- | -------------------------------------------------------------------------- |
| `pluginKey` | `string` | yes      | Plugin key (e.g. 'paperclip.hello-world-example' or '@acme/plugin-linear') |

**Returns**

Updated plugin object with new status confirming the plugin is now enabled.

**Examples**

- Use when: re-activating a plugin that was disabled without uninstalling it; safe to call if already enabled
- Don't use when: the plugin is not installed yet — use paperclip_install_plugin to install it first

**Errors**

- 404: plugin not found → verify pluginKey with paperclip_list_plugins
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`idempotent`, `closedWorld`

---

## paperclip_get_plugin

⚠ Board-only: Get detailed information about a specific plugin by its key.

**Inputs**

| Parameter         | Type                   | Required | Description                                                                |
| ----------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| `pluginKey`       | `string`               | yes      | Plugin key (e.g. 'paperclip.hello-world-example' or '@acme/plugin-linear') |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default) or 'json' (structured)                 |

**Returns**

Plugin object: pluginKey, packageName, displayName, description, status, version, config, health.

**Examples**

- Use when: inspecting a specific plugin's status, version, or configuration before enabling it
- Don't use when: you need to list all plugins — use paperclip_list_plugins instead

**Errors**

- 404: plugin not found → verify pluginKey with paperclip_list_plugins
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_install_plugin

⚠ Board-only: Install a plugin from npm into the Paperclip instance.

**Inputs**

| Parameter     | Type      | Required | Description                                                                          |
| ------------- | --------- | -------- | ------------------------------------------------------------------------------------ |
| `packageName` | `string`  | yes      | npm package name to install (e.g. '@paperclipai/plugin-hello-world-example')         |
| `version`     | `string`  | no       | Specific package version to install (e.g. '1.2.3'); omit for latest                  |
| `isLocalPath` | `boolean` | no       | Set true when packageName is a local filesystem path rather than an npm package name |

**Returns**

Installation result object with pluginKey, packageName, status, and message confirming the install outcome.

**Examples**

- Use when: adding a new plugin capability to the Paperclip instance from the npm registry or a local build
- Don't use when: the plugin is already installed — use paperclip_enable_plugin to re-activate a disabled plugin

**Errors**

- 400: install failed (npm error) → verify packageName is a valid npm package that exists in the registry
- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

_none_

---

## paperclip_list_plugin_examples

⚠ Board-only: List available example plugins that can be installed for reference.

**Inputs**

| Parameter         | Type                   | Required | Description                                                |
| ----------------- | ---------------------- | -------- | ---------------------------------------------------------- |
| `response_format` | `"markdown" \| "json"` | no       | Output format: 'markdown' (default) or 'json' (structured) |

**Returns**

Array of example plugin descriptors: packageName, pluginKey, displayName, description, localPath, tag.

**Examples**

- Use when: discovering reference plugin implementations to understand the plugin API surface
- Don't use when: you need the list of installed plugins — use paperclip_list_plugins instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`readOnly`, `closedWorld`

---

## paperclip_list_plugins

⚠ Board-only: List installed plugins for the Paperclip instance, with optional status filter.

**Inputs**

| Parameter         | Type                                                                                    | Required | Description                                                                |
| ----------------- | --------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `status`          | `"installed" \| "ready" \| "disabled" \| "error" \| "upgrade_pending" \| "uninstalled"` | no       | Filter by plugin status (omit to return all statuses)                      |
| `limit`           | `integer`                                                                               | no       | Max plugins per page (1–100, default 50)                                   |
| `offset`          | `integer`                                                                               | no       | Number of plugins to skip (default 0)                                      |
| `response_format` | `"markdown" \| "json"`                                                                  | no       | Output format: 'markdown' (default, human-readable) or 'json' (structured) |

**Returns**

Pagination envelope { items: Plugin[], total, count, offset, limit, has_more, next_offset }. Each item: pluginKey, packageName, displayName, description, status, version.

**Examples**

- Use when: auditing which plugins are installed or filtering for plugins in error state
- Don't use when: you need the full plugin detail (health, config) — use paperclip_get_plugin instead

**Errors**

- 401: authentication failed → check PAPERCLIP_API_KEY
- 403: permission denied → this tool requires a board (human-user) API key

**Annotations**

`readOnly`, `closedWorld`

---
