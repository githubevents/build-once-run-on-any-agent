#!/usr/bin/env bash
# verify.sh — Auto-extract context for proof-agent verification
# Usage: ./verify.sh [base-ref] [--force]
# Default base-ref: HEAD~1 (last commit)
# --force: bypass file-count threshold and always verify
#
# Outputs a filled verification prompt to stdout.

set -euo pipefail

FORCE=false
BASE="HEAD~1"

# Parse arguments: [base-ref] [--force]
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    *)       BASE="$arg" ;;
  esac
done

# Also honour the INPUT_FORCE env var set by action.yml
if [ "${INPUT_FORCE:-false}" = "true" ]; then
  FORCE=true
fi

# Get changed files
FILES=$(git diff --name-only "$BASE" HEAD 2>/dev/null || git diff --name-only --cached 2>/dev/null || echo "(no git changes detected)")

# Count
if [ -z "$FILES" ]; then
  FILE_COUNT=0
else
  FILE_COUNT=$(printf '%s\n' "$FILES" | grep -c '.')
fi

# Get diff output (full unified diff with context)
DIFF=$(git diff "$BASE" HEAD 2>/dev/null || echo "(no diff available)")

# Get commit messages since base
COMMITS=$(git log --oneline "$BASE"..HEAD 2>/dev/null || echo "(no commits)")

# Determine if verification is needed using the Python package (single source of truth)
# Pipe files over stdin to avoid shell injection from filenames.
if [ "$FORCE" = true ]; then
  SHOULD_VERIFY="true"
else
  SHOULD_VERIFY=$(printf '%s\n' "$FILES" | python3 -c "
import sys
from proof_agent.verifier import should_verify

files = [line.strip() for line in sys.stdin if line.strip()]
print('true' if should_verify(files) else 'false')
")
fi

if [ "$SHOULD_VERIFY" = false ]; then
  echo "SKIP: Only $FILE_COUNT file(s) changed, no sensitive files detected."
  echo "Use --force (CLI) or force: true (action) to verify anyway."
  exit 0
fi

# Build the prompt via the CLI, passing data through environment variables so
# arbitrary diff contents (including triple quotes, backslashes, ${...}, etc.)
# cannot break the Python parser or inject code.
PROOF_FILES="$FILES" \
PROOF_DIFF="$DIFF" \
PROOF_COMMITS="$COMMITS" \
  proof-agent-build-prompt
