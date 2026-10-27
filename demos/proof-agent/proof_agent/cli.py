"""Command-line interface for proof-agent tools."""

import os
import sys

from .verifier import (
    VerificationRequest,
    build_verification_prompt,
    parse_verdict,
)


def parse_verdict_cli():
    """Parse verdict from stdin and output verdict type.

    Reads verifier response from stdin, parses it, and prints
    the verdict type (PASS, FAIL, or PARTIAL) to stdout.

    Always exits 0 so that a caller running under ``set -e`` can safely
    capture the verdict in a command substitution — the CLI guarantees a
    usable fallback ("PARTIAL") on any internal error.

    Usage:
        echo "$VERDICT" | proof-agent-parse-verdict
    """
    try:
        response = sys.stdin.read()
        result = parse_verdict(response)
        print(result.verdict.value.upper())
    except Exception as e:
        # Safe fallback: still emit a valid verdict so callers under set -e
        # don't abort on a nonzero exit from the command substitution.
        print("PARTIAL")
        print(f"Error parsing verdict: {e}", file=sys.stderr)
    sys.exit(0)


def build_prompt_cli():
    """Build a verification prompt from environment variables.

    Reads input via environment variables (not argv or inline string
    interpolation) to prevent shell/Python injection from diff contents
    or filenames.

    Environment variables:
        PROOF_FILES    — newline-separated list of changed files
        PROOF_DIFF     — full git diff output
        PROOF_COMMITS  — commit log (one per line)

    Writes the built prompt to stdout.

    Usage:
        PROOF_FILES="$FILES" PROOF_DIFF="$DIFF" PROOF_COMMITS="$COMMITS" \\
            proof-agent-build-prompt
    """
    files_raw = os.environ.get("PROOF_FILES", "")
    diff_text = os.environ.get("PROOF_DIFF", "")
    commits = os.environ.get("PROOF_COMMITS", "")

    files_changed = [line.strip() for line in files_raw.splitlines() if line.strip()]

    request = VerificationRequest(
        original_request=(
            f"Code changes across {len(files_changed)} file(s):\n{commits}"
        ),
        files_changed=files_changed,
        approach=f"Changes made via git commits.\n\nDiff output:\n{diff_text}",
        attempt=1,
        previous_failures=[],
    )

    print(build_verification_prompt(request))
    sys.exit(0)


def main():
    """Main CLI entry point (for future subcommands)."""
    if len(sys.argv) > 1 and sys.argv[1] == "parse-verdict":
        parse_verdict_cli()
    elif len(sys.argv) > 1 and sys.argv[1] == "build-prompt":
        build_prompt_cli()
    else:
        print("Usage: proof-agent {parse-verdict|build-prompt}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
