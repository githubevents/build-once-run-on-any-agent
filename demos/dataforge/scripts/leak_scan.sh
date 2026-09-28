#!/usr/bin/env bash
#
# Fails if any business-specific value from the source monorepo survives in the
# skills or the seed manifest. This is the check that lets the skills be
# published at all, so anything short of a clean scan of every target — a
# missing directory, a missing ripgrep — is a failure rather than a pass.
#
# Add a pattern here and both CI and the pre-commit command in AGENTS.md pick
# it up; there is deliberately no second copy of this list.

set -uo pipefail

# Grouped for readability; joined with | below. Only compound or prefixed tokens
# belong here — a bare English word like "project" or "drawing" would either
# match prose everywhere or not at all, which is how the grain keys and the
# domain nouns slipped through the original review.
PATTERNS=(
  # Zone and environment identifiers from the source monorepo
  'us0[12]|uk01'
  # Catalog and store names from the source monorepo
  'prod_gold|prod_silver|central_[a-z]+_store'
  # Placeholder employer names that must never reach a release
  'acme|your-company'
  # Source-domain nouns: the sanitization replaced these once and they must not
  # return through a copied example
  'pay_application|transmittal|drawing_attachment|total_drawing'
  'sla_viewpoint|markup_element|model_revision|observation_item'
  'erp_integration|total_roadmap|total_photo|total_inspection|total_estimate'
)

PATTERN=$(IFS='|'; echo "${PATTERNS[*]}")
TARGETS=(skills assets)

cd "$(dirname "$0")/.."

fail() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error::$1"
  else
    echo "leak-scan: $1" >&2
  fi
  exit 1
}

for target in "${TARGETS[@]}"; do
  [ -d "$target" ] || fail "scan target '$target' does not exist, so this scan cannot vouch for the tree"
done

# ripgrep when it is available, POSIX grep otherwise. The GitHub-hosted runners
# do not ship ripgrep, and requiring contributors to install it would be a
# barrier for a one-line check, so the fallback is what CI actually runs.
#
# The two must scan the same set of files to give the same answer. ripgrep skips
# anything gitignored; grep does not, so .build-state — forge-builder's scratch
# directory, gitignored and full of whatever domain the last run touched — has
# to be excluded by hand. Nothing there is published.
if command -v rg >/dev/null 2>&1; then
  scanner="ripgrep"
  rg -i "$PATTERN" "${TARGETS[@]}"
  status=$?
elif command -v grep >/dev/null 2>&1; then
  scanner="grep"
  grep -rEi --exclude-dir=.build-state "$PATTERN" "${TARGETS[@]}"
  status=$?
else
  fail "neither ripgrep nor grep found on PATH"
fi

case "$status" in
  0) fail "business-specific values found in ${TARGETS[*]}" ;;
  1) echo "leak-scan: clean — no business-specific values in ${TARGETS[*]} (via $scanner)" ;;
  *) fail "$scanner exited with status $status; refusing to report a clean scan" ;;
esac
