# Proof Agent

> Snapshot of [AndreaGriffiths11/proof-agent](https://github.com/AndreaGriffiths11/proof-agent)
> at [v1.1.2 (`184e237`)](https://github.com/AndreaGriffiths11/proof-agent/commit/184e2373a89c62745d91a4e7cda7d1dd5c324bf7),
> matching the version shown in the Universe 2026 recording. File issues and
> pull requests against the canonical repository. This copy is not updated
> between syncs.

Start with [SKILL.md](SKILL.md) for the independent verifier procedure.
The [narrated demo](../../assets/recordings/proof-agent-narrated.mp4) (3:43)
shows its GitHub Actions integration and a PR's correction history.

This skill reviews diffs. The separate [proof-review](../proof-review/) skill
reproduces bugfix claims under load.

The recorded workflow uses `block-on-fail: false` for advisory findings.
The upstream examples below use `true` and reference `@main`; use `@v1.1.2`
to match this snapshot. Bundled workflows remain examples inside this demo
folder and do not enable verification on this repository.

[![GitHub release](https://img.shields.io/github/v/release/AndreaGriffiths11/proof-agent)](https://github.com/AndreaGriffiths11/proof-agent/releases)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Proof%20Agent-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=github)](https://github.com/marketplace/actions/proof-agent-verify)

**Adversarial verification for AI-generated work.**

The worker and the verifier are always separate agents. Self-verification is not verification.

---

## The Problem

AI agents generate code that breaks in production. They hallucinate package versions. They make security claims that fall apart under scrutiny. And when you ask them to verify their own work? They rationalize the mistakes instead of catching them.

Self-verification doesn't work because the same model that made the error will defend it.

---

## How It Works

Proof Agent enforces separation:

1. **Worker agent** makes changes
2. **Verifier agent** (separate, independent) checks the work
3. Verifier runs commands, checks facts, assigns a verdict

The verifier has no access to the worker's self-assessment. It must verify with evidence.

**Verdicts:**
- **PASS** — All checks passed with evidence
- **FAIL** — Issues found. Report specifics. Retry up to 3 times if auto-fixable.
- **PARTIAL** — Some checks passed, others couldn't be verified

<details>
<summary><strong>What It Checks</strong></summary>

- **Security Vulnerabilities** — SQL injection, hardcoded secrets, authentication bypasses, XSS/CSRF
- **Correctness** — Does the code match the stated purpose? Logical errors?
- **Code Quality** — Bugs, error handling, race conditions, edge cases
- **Static Analysis** — Reviews code changes directly from git diff

**Review method:** Static code review (reads diff output, does NOT execute code or run tests)

**Rule:** Verifier must cite specific files, line numbers, and code snippets in verdict.

</details>

---

## Quick Start

### GitHub Action (Zero Setup)

Add this workflow to your repo:

**`.github/workflows/proof-agent.yml`:**
```yaml
name: Proof Agent

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  copilot-requests: write

jobs:
  verify:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: AndreaGriffiths11/proof-agent@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          base-ref: origin/main
          block-on-fail: true
          post-comment: true
```

That's it. Every PR gets automatic verification.

**Uses the GitHub Copilot SDK.** No GitHub Models token is required. In GitHub Actions, the built-in `GITHUB_TOKEN` needs `copilot-requests: write`, and the organization must allow Copilot CLI usage from Actions.

---

## 🔑 Custom Model Providers (BYOK)

<details>
<summary>Use your own model providers for verification.</summary>

### Anthropic Claude
```yaml
jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      PROOF_AGENT_PROVIDER_BASE_URL: https://api.anthropic.com
      PROOF_AGENT_PROVIDER_TYPE: anthropic
      PROOF_AGENT_PROVIDER_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      PROOF_AGENT_MODEL: claude-sonnet-4-20250514
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: AndreaGriffiths11/proof-agent@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Azure OpenAI
```yaml
jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      PROOF_AGENT_PROVIDER_TYPE: azure
      PROOF_AGENT_PROVIDER_BASE_URL: https://mycompany.openai.azure.com
      PROOF_AGENT_PROVIDER_API_KEY: ${{ secrets.AZURE_OPENAI_KEY }}
      PROOF_AGENT_MODEL: gpt-4-turbo
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: AndreaGriffiths11/proof-agent@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Local Ollama
```yaml
jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      PROOF_AGENT_PROVIDER_BASE_URL: http://localhost:11434/v1
      PROOF_AGENT_MODEL: qwen2.5-coder:3b  # Good balance of size/performance
      # Also works: qwen2.5:0.5b, gemma2:2b, deepseek-coder:6.7b
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: AndreaGriffiths11/proof-agent@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Supported providers:** Anthropic, Azure OpenAI, OpenAI-compatible endpoints (OpenAI, Ollama, vLLM, etc.).

**Cost optimization:** Use a different model for the verifier step with `PROOF_AGENT_VERIFIER_MODEL`.

**⚠️ Prompt Optimization:** Proof Agent works with smaller models when prompts are concise and task-focused. **Minimum 1B parameters** for basic detection, **2B+ parameters recommended** for reliable production use. Very complex instructions may reduce effectiveness regardless of model size.

</details>

---

### OpenClaw Skill (Interactive)

```bash
clawhub install proof-agent
```

Talk to your agent:

> "I added OAuth login. Verify it's safe."

The agent spawns a verifier subagent and runs checks.

---

### Command Line (Manual)

```bash
git clone https://github.com/AndreaGriffiths11/proof-agent.git
cd proof-agent

# Generate verification prompt
bash scripts/verify.sh > verification_prompt.txt

# Send to your LLM
cat verification_prompt.txt | your-llm-cli
```

---

## Configuration

<details>
<summary><strong>Action Inputs</strong></summary>

```yaml
- uses: AndreaGriffiths11/proof-agent@main
  with:
    # GitHub token (use built-in GITHUB_TOKEN)
    github-token: ${{ secrets.GITHUB_TOKEN }}
    
    # Optional token used for Copilot SDK requests
    # Falls back to github-token when omitted
    copilot-token: ${{ secrets.COPILOT_TOKEN }}
    
    # Git ref to compare against
    base-ref: origin/main
    
    # Force verification even when thresholds are not met
    force: false
    
    # Block PR merge if FAIL
    block-on-fail: true
    
    # Post verdict as PR comment
    post-comment: true
    
    # Comment format: collapse (default), summary, or full
    comment-mode: collapse
    
    # Max comment length in characters
    max-comment-length: 2000
```

**Comment modes:**
- `collapse` — First paragraph visible, rest in expandable section
- `summary` — Verdict + key findings only
- `full` — Everything visible (truncates at max-comment-length)

</details>

<details>
<summary><strong>Proof Agent Config (proof-agent.yaml)</strong></summary>

Customize thresholds and patterns:

```yaml
thresholds:
  min_files_changed: 3
  always_verify:
    - "**/*auth*"
    - "**/*secret*"
    - "**/*permission*"
    - "**/Dockerfile"
    - "**/*.env*"
  never_verify:
    - "**/.gitignore"

retry:
  max_attempts: 3
  escalate_on_max: true
```

</details>

<details>
<summary><strong>When Verification Triggers</strong></summary>

**Auto-verify when:**
- ≥3 files changed
- ANY file matches: `*auth*`, `*secret*`, `*permission*`, `Dockerfile`, `*.env*`
- You explicitly force verification with `force: true` or `bash scripts/verify.sh <base-ref> --force`

**Skip for:**
- Formatting-only changes
- `.gitignore` changes

When thresholds are not met, the action exits successfully and reports `SKIP` in its action output/comment.

</details>

---

## Example Workflow

<details>
<summary><strong>Scenario: AI agent writes authentication code</strong></summary>

1. **Worker agent** generates `src/auth.py`, `tests/test_auth.py`, updates `requirements.txt`
2. **Proof Agent** detects: 3+ files changed + `*auth*` pattern → triggers verification
3. **Verifier agent** spawns, receives:
   - Original request
   - Files changed (list)
   - Approach taken (git diff output)
4. **Verifier reviews the code changes:**
   - Scans `src/auth.py` for hardcoded secrets, SQL injection, auth bypasses
   - Checks `tests/test_auth.py` for edge case coverage
   - Reviews `requirements.txt` for suspicious dependencies
5. **Verifier finds:**
   - Hardcoded API key in `src/auth.py:42` (`API_KEY = "sk-1234..."`)
   - SQL query uses string interpolation (injection risk)
   - Missing input validation on username parameter
6. **Verdict:** **FAIL** — Security issues (hardcoded secret + SQL injection + missing validation)
7. **Proof Agent** posts comment, blocks merge
8. **Developer fixes issues** → pushes new commit → **re-verifies** → **PASS**

</details>

---

## Troubleshooting

<details>
<summary><strong>Action fails with Copilot SDK authentication or access errors</strong></summary>

**Check workflow permissions:**
```yaml
permissions:
  contents: read
  pull-requests: write
  copilot-requests: write  # ← Required for Copilot SDK requests
```

**Verify Copilot requests are enabled:**
- The organization must allow Copilot CLI usage from GitHub Actions.
- If your repository or organization requires a dedicated token, pass `copilot-token`.

</details>

<details>
<summary><strong>PR comment not posted (403/404 error)</strong></summary>

**Check workflow permissions:**
```yaml
permissions:
  pull-requests: write  # ← Required for posting comments
  contents: read
  copilot-requests: write
```

For private repos, use `secrets.GITHUB_TOKEN` (already has correct permissions).

</details>

<details>
<summary><strong>SKIP on every PR</strong></summary>

Proof Agent skips if <3 files changed AND no sensitive files detected.

**To force verification:**
- Change 3+ files, OR
- Touch a sensitive file: `*auth*`, `*secret*`, `Dockerfile`, `*.env*`

</details>

---

## Why Adversarial Verification?

<details>
<summary><strong>Single-agent limitations vs. Adversarial separation</strong></summary>

**Single-agent limitations:**
- Same model that made the mistake will rationalize it
- Confirmation bias in self-review
- No incentive to find flaws

**Adversarial separation:**
- Verifier has no stake in worker's success
- Forced to provide evidence
- Different prompts catch different issues

**Real-world analogy:**
- Code review (separate developer)
- Security audit (external team)
- Peer review (different researcher)

</details>

---

## License

MIT — Andrea Griffiths, 2026
