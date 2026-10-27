# proof-review

> This folder is a snapshot of [AndreaGriffiths11/proof-review](https://github.com/AndreaGriffiths11/proof-review)
> at [`8faa762`](https://github.com/AndreaGriffiths11/proof-review/commit/8faa76231b3c8288f4ffa8384f64c532c1c09442), for the
> GitHub Universe 2026 session. File issues and open pull requests against the
> canonical repository. This copy is not updated between syncs.

To use this snapshot, point your coding agent at [SKILL.md](SKILL.md) and provide
the bug report and PR you want reviewed. Resolve the skill's `scripts/` and
`references/` paths relative to this folder. The harness requires Node.js 18+
and an HTTP service running in a local or isolated test environment.

Adversarial verification skill for bugfix PRs. Reproduces the reported symptom under production-shaped load, enumerates every root cause, and measures whether the PR closes each one. Output is a verdict-first report where every finding carries a number.

The unit of review is the symptom, not the diff.

## Install as a Copilot CLI skill

```bash
git clone https://github.com/AndreaGriffiths11/proof-review.git ~/code/proof-review
ln -s ~/code/proof-review ~/.copilot/m-skills/proof-review
```

Update later with `git -C ~/code/proof-review pull`.

## Contents

- `SKILL.md` — the workflow the agent follows
- `references/report-template.md` — the verdict-first report shape
- `scripts/loadharness.mjs` — zero-dependency Node 18+ load driver

## Use

In Copilot CLI, ask the agent to "proof-review this PR" or "verify the fix under load" and point it at the PR.

The harness is also usable standalone:

```bash
node scripts/loadharness.mjs run \
  --url http://localhost:3000/your-endpoint \
  --concurrency 4,8 --requests 200 --timeout 12000 \
  --json before.json

node scripts/loadharness.mjs compare before.json after.json
```

## Scope

Currently shaped for HTTP services with connection pools. CLIs, libraries, build tools, and data pipelines are out of scope until the workflow grows branches for them.

## License

MIT
