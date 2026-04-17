# paperclip-mcp Skills

User-invocable Claude Code workflows that chain paperclip MCP tools into opinionated, repeatable sequences. These are **public skills** shipped with the MCP server for end-users to install — distinct from `.claude/skills/`, which contains internal repo-development skills for maintainers only.

## Installation

Copy the skills you want into your local Claude Code skills directory:

```bash
cp -r skills/paperclip-* ~/.claude/skills/
```

Or, if your Claude Code installation supports a plugin manager, install the whole pack:

```bash
# when plugin manager support is available
claude skills install ./skills/
```

Restart Claude Code after copying so the skill index refreshes.

## Skill Catalog

| Skill                       | When to use                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `paperclip-triage-inbox`    | An agent wakes up and needs to evaluate assigned issues, prioritize, label, and decide whether to claim or escalate |
| `paperclip-close-epic`      | All child issues of an epic are done and the epic needs to be closed with a summary                                 |
| `paperclip-audit-approvals` | An approver agent wakes to clear pending approvals and needs a structured review workflow                           |
| `paperclip-release-flow`    | Packaging a release — write CHANGELOG draft, tag the goal, notify stakeholders                                      |

## Notes

- Each skill calls only real tool names from the paperclip-mcp server. No invented tool names.
- Skills are versioned alongside the MCP server. If you pin a specific MCP version, use the matching skills from that tag.
- For maintainer-only pre-release workflows, see `.claude/skills/release-docs-update/` (not distributed).
