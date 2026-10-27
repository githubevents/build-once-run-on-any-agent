# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The CI workflow file is now `.github/workflows/checks.yml`, matching its
  `checks` name. It runs the drift, contract, example, and leak-scan jobs, not
  only the package-drift check its old filename described.

## [0.1.0] - 2026-09-28

First public release. Four skills carry the whole pattern.

This release was extracted from a private codebase and published as a single
commit. Development history from here on is public.

### Added

- `forge-init` — the config boundary. Reads a short seed manifest and discovers
  the rest of a project's configuration, writing `dataforge.manifest.resolved.yaml`
  for every other skill to read.
- `forge-dbx` — the execution primitive. One CLI wrapper shared by every skill,
  with adapters for Databricks and DuckDB.
- `forge-lint` — rules as a skill. Naming grammar, SQL formatting, join
  strategy, and anti-patterns live here instead of being duplicated in each
  generator.
- `forge-builder` — the orchestrator. Seven phases from a GitHub issue to an
  open pull request, composing the three skills above.
- DuckDB execution adapter, so the skill set runs with no managed data platform.
- `examples/support-desk` — a synthetic project that exercises the full
  workflow locally.
- `scripts/package.mjs` — generates the Claude Code, Cursor, and GitHub Copilot
  agent packages from the single `skills/` source.
- `.github/workflows/package-drift.yml` — fails CI when a generated package is
  out of sync with its skill source.
- `scripts/leak_scan.sh` — the single definition of the business-context
  patterns that must never appear in `skills/` or `assets/`, run both by CI and
  before committing. Reports a failure, not a clean scan, if a scan target is
  missing. Uses ripgrep when present and POSIX grep otherwise, because the
  GitHub-hosted runners do not ship ripgrep; the previous inline check treated a
  missing ripgrep as a clean result and so never actually ran in CI.

### Fixed

- `forge-builder` `verify.py content-verify` required every metric name to
  appear inside a non-ALTER `.sql` file. Long-format metric tables store
  `metric_name` as a value rather than a column, so no schema file can name a
  metric and the gate could not be satisfied by any build against such a store.
  The check is now layout-aware: for long-format tables it requires the metric
  in a pipeline file plus a schema file matching that pipeline's entity and
  cadence, and wide tables keep the original direct-hit requirement.
- `forge-builder` Phase 2 Query 4 detected soft deletes only via a `deleted_at`
  timestamp and instructed the agent to skip the check when the column was
  absent. Tables using an `is_deleted` boolean therefore silently skipped
  soft-delete exclusion, inflating every metric. Both conventions are now
  recognized.
- `forge-builder` acquired and refreshed the build lock from the standard write
  protocol but documented releasing it only in the recovery reference, which the
  standard path never loads. Every completed build therefore left a lock behind,
  blocking the next differently-named build for the same tool until it aged out
  after two hours. Release is now part of the Phase 7 checkpoint and its gate
  checklist.
- `examples/support-desk` seeded a fixed date window, which drifted out of range
  as time passed until a pipeline run with the default snapshot date produced no
  rows at all. The window is now anchored to the run date, and a row whose close
  date would fall outside it stays in a non-terminal status instead of claiming a
  terminal state with no `closed_at`.
