#!/usr/bin/env bash
# Guard against hand-written inputSchema literals in tool modules.
# The v2.0 refactor replaced all manual JSON Schema objects with toJsonSchema(ZodSchema).
# Any new `inputSchema: {` literal is a regression — use toJsonSchema() instead.
#
# Usage: ./scripts/check-no-raw-inputschema.sh
# Exit 0 = clean. Exit 1 = violations found.

set -euo pipefail

PATTERN='inputSchema:[[:space:]]*{'
TARGET='src/tools/*.ts'

# Use grep -rn for portability; exclude test files and index.ts (interface definition)
MATCHES=$(grep -rn --include='*.ts' -E "$PATTERN" src/tools/ \
  | grep -v 'src/tools/index\.ts' \
  | grep -v '\.test\.ts' \
  || true)

if [ -n "$MATCHES" ]; then
  echo "ERROR: Hand-written inputSchema literal detected in tool module(s)."
  echo "Use toJsonSchema(YourZodSchema) instead of writing JSON Schema by hand."
  echo ""
  echo "Violations:"
  echo "$MATCHES"
  exit 1
fi

echo "OK: no hand-written inputSchema literals found in src/tools/*.ts"
exit 0
