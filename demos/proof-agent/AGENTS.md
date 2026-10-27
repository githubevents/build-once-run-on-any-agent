# AGENTS.md

## Purpose

Adversarial verification for AI-generated work. The worker and verifier are always separate agents — self-verification is not verification.

## Core Principle

**Separation of concerns:** The same model that made the error will defend it. Independent verification catches what self-assessment misses.

## Tech Stack

- **Python 3.9+**
- **GitHub Actions** — Zero-config CI/CD integration
- **GitHub Copilot SDK** — Independent verifier runtime
- **Static analysis** — Reviews git diffs, does NOT execute code

## Architecture

```
Worker Agent (Subagent A)
    ↓ (makes changes)
Files Changed
    ↓
Verifier Agent (Subagent B, independent)
    ↓ (reviews diff)
Verdict: PASS / FAIL / PARTIAL
```

## Verdicts

- **PASS** — All checks passed with evidence (file/line/snippet required)
- **FAIL** — Issues found, specifics documented, retry up to 3× if auto-fixable
- **PARTIAL** — Some checks passed, others couldn't be verified

## What It Checks

- **Security:** SQL injection, hardcoded secrets, auth bypasses, XSS/CSRF
- **Correctness:** Does code match stated purpose? Logical errors?
- **Code Quality:** Bugs, error handling, race conditions, edge cases
- **Static Review:** Reads git diff output ONLY (no code execution, no tests)

## Verification Triggers

**Auto-verify when:**
- Subagent changed **3+ files**
- ANY file matches: `*auth*`, `*secret*`, `*permission*`, `Dockerfile`, `*.env*`
- User explicitly asks for verification

**Skip verification for:**
- Formatting-only changes (whitespace, linting)
- `.gitignore` changes

## Key Constraints

- **Verifier MUST be independent** — Different subagent, separate session
- **No worker self-assessment shared** — Verifier gets: original request, files changed, approach summary
- **Evidence required** — Every verdict MUST cite file/line/snippet
- **Static review only** — No code execution, no tests run
- **Up to 3 retries** — If FAIL and auto-fixable, retry cycle

## Dependencies

- GitHub Actions (`actions/checkout@v4`, `actions/setup-python@v5`)
- GitHub Copilot SDK (requires `copilot-requests: write` permission in Actions)
- Python packages: `github-copilot-sdk`, `pyyaml`, `requests`

## GitHub Action Usage

```yaml
- uses: AndreaGriffiths11/proof-agent@main
  with:
    model: 'gpt-4o'  # or 'claude-3.5-sonnet', 'gemini-1.5-pro'
    max-retries: 3
```

## Files

- `proof_agent/verifier.py` — Core verification logic
- `proof_agent/copilot_sdk.py` — GitHub Copilot SDK verifier
- `entrypoint.sh` — GitHub Action entry point
- `action.yml` — Action metadata
- `SKILL.md` — OpenClaw skill integration guide

## What NOT to Do

- Don't let the worker verify its own work (defeats the purpose)
- Don't skip evidence (file/line/snippet) in verdicts
- Don't execute code during verification (static review only)
- Don't share worker's self-assessment with verifier (contamination)

## Release

- **Latest:** v1.0.8
- **Repo:** https://github.com/AndreaGriffiths11/proof-agent
- **Marketplace:** https://github.com/marketplace/actions/proof-agent-verify
