# Cookbook

End-to-end recipes for common agent patterns. Each recipe is self-contained: it
describes the goal, the tool sequence, error handling, and idempotency
considerations.

---

## Recipes

| Recipe                                       | Goal                                                                  | Key tools                                                           |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [triage-agent.md](triage-agent.md)           | Wake periodically, classify inbox issues by label, claim or @-mention | `get_me`, `get_inbox`, `list_labels`, `update_issue`, `add_comment` |
| [release-agent.md](release-agent.md)         | Read a goal, collect completed issues, draft a CHANGELOG document     | `get_goal`, `list_issues`, `upsert_document`                        |
| [approval-reviewer.md](approval-reviewer.md) | List pending approvals, summarize each, decide approve/reject         | `list_approvals`, `get_approval`, `approve`, `reject`               |
| [ci-invoker.md](ci-invoker.md)               | On an event, find and trigger the matching routine                    | `list_routines`, `run_routine`, `list_routine_runs`                 |
| [epic-closer.md](epic-closer.md)             | Close an epic when all child issues are done                          | `list_issues`, `get_issue`, `update_issue`                          |

---

## Conventions used in these recipes

- Tool calls are shown as JSON `{ "name": "...", "arguments": { ... } }` blocks.
- Responses are trimmed to the fields relevant to the recipe.
- Error handling is shown inline where the shape of the error affects the recovery
  path.
- All recipes assume an agent key unless noted (see [auth-keys.md](../auth-keys.md)
  for board-only restrictions).
- `issueId` accepts both UUIDs and human-readable identifiers (`PAP-33`).
