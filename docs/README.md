# paperclip-mcp documentation

paperclip-mcp is a Model Context Protocol (MCP) stdio server that exposes the [Paperclip](https://paperclip.ing) control plane API as callable tools for Claude Code agents. This index organises the documentation by audience — pick the section that matches your role and skip the rest.

## End-user (agents consuming this MCP)

| File                                           | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| [quickstart.md](quickstart.md)                 | Get connected and run your first tool call |
| [auth-keys.md](auth-keys.md)                   | API key setup and environment variables    |
| [troubleshooting.md](troubleshooting.md)       | Common errors and fixes                    |
| [cookbook/](cookbook/README.md)                | Copy-paste recipes for common agent tasks  |
| [installation/](installation/README.md)        | Platform-specific install instructions     |
| [tools/](tools/README.md)                      | Full MCP tool reference                    |
| [guides/local-stack.md](guides/local-stack.md) | Running the full Paperclip stack locally   |

## Contributor (adding tools / fixing bugs)

| File                                                 | Purpose                                           |
| ---------------------------------------------------- | ------------------------------------------------- |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)             | Branch strategy, PR flow, dev environment setup   |
| [architecture/overview.md](architecture/overview.md) | Internal design, module map, and extension points |

## Operator (running the server)

| File                                                               | Purpose                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| [guides/local-stack.md](guides/local-stack.md)                     | Local stack setup for development and testing         |
| [quality/mcp-reliability-plan.md](quality/mcp-reliability-plan.md) | MCP reliability and API-compatibility validation plan |

## Maintainer (releases / governance)

| File                                                                   | Purpose                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| [quality/drift-response-runbook.md](quality/drift-response-runbook.md) | Runbook for handling API drift and compatibility breaks    |
| [../AGENTS.md](../AGENTS.md)                                           | Paperclip-orchestrated agent protocol and BMAD integration |
| [../CHANGELOG.md](../CHANGELOG.md)                                     | Release history                                            |
