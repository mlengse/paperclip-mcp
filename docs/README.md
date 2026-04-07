# Paperclip MCP — Documentation

Paperclip MCP exposes the [Paperclip](https://paperclip.ing) control plane API as MCP tools for use by Claude Code agents.

## Sections

| Section                                | Description                          |
| -------------------------------------- | ------------------------------------ |
| [Guides](guides/README.md)             | Step-by-step guides — start here     |
| [Reference](reference/README.md)       | MCP tool reference                   |
| [Architecture](architecture/README.md) | Internal design and extension points |

## Quick links

- [Getting started](guides/getting-started.md)
- [Configuration](guides/configuration.md)
- [MCP tools](reference/tools.md)
- [Architecture overview](architecture/overview.md)

## Contributing to the docs

All documentation lives in `docs/` as plain Markdown. To check for broken links locally:

```bash
npm run docs:check
```

See the [contributing section](../README.md#contributing) in the root README for branch strategy.
