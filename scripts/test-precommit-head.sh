#!/usr/bin/env bash
# Regression test for PAP-107: verify that a git commit lands on the
# expected feature branch after the husky/lint-staged pre-commit hook runs.
#
# The bug: when a feature branch and its base (develop) pointed to the same
# commit SHA, lint-staged's stash backup/restore cycle drifted HEAD to the
# base branch, causing the commit to land on develop instead of the feature
# branch.  Fix: --no-stash flag + HEAD guard in .husky/pre-commit.
#
# Usage:
#   bash scripts/test-precommit-head.sh
#
# Requires: git, npm (node_modules installed), user.name + user.email configured.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
BRANCH="test/precommit-head-$$"
WORKTREE="$REPO_ROOT/.git/precommit-test-$$"

cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
  git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true
}
trap cleanup EXIT

# Resolve a base SHA: prefer origin/develop so the test works both locally
# and in CI (where develop may not be checked out as a local branch).
BASE_SHA="$(git -C "$REPO_ROOT" rev-parse origin/develop 2>/dev/null \
  || git -C "$REPO_ROOT" rev-parse develop 2>/dev/null \
  || git -C "$REPO_ROOT" rev-parse HEAD)"

# Create a feature branch pointing to the same SHA as the base.
# This replicates the exact PAP-107 condition (git checkout -b immediately
# after git checkout develop gives both branches the same SHA).
git -C "$REPO_ROOT" branch "$BRANCH" "$BASE_SHA"
git -C "$REPO_ROOT" worktree add "$WORKTREE" "$BRANCH"

# Stage a benign markdown change — matches the *.{js,json,md} lint-staged
# glob so the hook actually runs prettier on it.
cd "$WORKTREE"
printf '\n<!-- precommit-head regression test -->\n' >> README.md
git add README.md

# Run the full commit flow: fires .husky/pre-commit → lint-staged.
git commit -m "test: pre-commit HEAD stability regression (PAP-107)"

# Assert HEAD stayed on the feature branch.
ACTUAL="$(git rev-parse --abbrev-ref HEAD)"
if [ "$ACTUAL" = "$BRANCH" ]; then
  printf 'PASS: HEAD is "%s" as expected.\n' "$ACTUAL"
  exit 0
else
  printf 'FAIL: expected HEAD="%s", got "%s".\n' "$BRANCH" "$ACTUAL"
  exit 1
fi
