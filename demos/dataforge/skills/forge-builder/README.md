# Forge Builder

forge-builder is the orchestrator: the metric pipeline builder at the center of dataforge's engineering track.
Give it a GitHub issue, a plain description of what you want ("build metrics for releases"), or a table to explore, and it works through seven phases, discovery, design, schema, pipeline code, tests, deployment, and delivery, producing every file a new or extended metric needs.

## Getting it

forge-builder ships as part of dataforge. Install the whole skill set at once:

```bash
git clone https://github.com/OWNER/dataforge.git
cd dataforge && node scripts/package.mjs
```

See the [repository README](../../README.md) for how to point Claude Code, Cursor, or GitHub Copilot at the generated packages.

## Where it fits

Before doing anything, forge-builder reads the resolved manifest that [`forge-init`](../forge-init/) produces, so it never hardcodes a catalog, domain, or naming rule.
It composes the other three skills as it works: [`forge-lint`](../forge-lint/) on every file it touches, and [`forge-dbx`](../forge-dbx/) to authenticate, run discovery queries, profile source tables, and deploy.
If `forge-lint` or `forge-dbx` is missing, it will not proceed past the first phase.

## What to expect

A build is meant to span three sessions rather than one sitting: discovery and design (phases 1-3), engineering (phases 4-5), and testing and deployment (phases 6-7).
Phase 3 ends with a design you have to approve before pipeline code gets written, unless you explicitly ask for an autonomous run ("build this autonomously").
Even in autonomous mode, phase 7's schema sign-off still requires you to review the SQL before it runs against a workspace, that gate is never skipped.
Because the work spans sessions, forge-builder checkpoints after every phase, so you can pause and pick a build back up later by asking to resume it, or by naming the issue again.

## Output

Build progress is tracked in `skills/forge-builder/.build-state/{build_id}.json`, one file per build, holding the phase checkpoints and artifact list that let a later session verify what was actually written rather than trusting a status claim.
The pipeline itself, schema DDL, and Python or dbt code land in the metric store directories the manifest points at.
Deployment ends with a pull request opened via `gh pr create`; pushing to git and running schema jobs both require your explicit approval first.

## Related skills

[`forge-init`](../forge-init/) supplies the resolved manifest forge-builder reads on entry.
[`forge-lint`](../forge-lint/) is the standards checklist applied to every file edit.
[`forge-dbx`](../forge-dbx/) handles authentication, discovery queries, table profiling, and job execution.
