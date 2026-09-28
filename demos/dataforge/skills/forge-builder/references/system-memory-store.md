# Build Memory Store

Flat JSON file that persists build state across sessions and tools. Any agent in any IDE can resume a build by reading this file.

---

## File Location

```
skills/forge-builder/.build-state/{build_id}.json
```

The `.build-state/` directory is gitignored. Files older than 30 days can be pruned.

---

## build_id Format

Deterministic -- a resuming agent constructs the filename without scanning the directory.

| Intake Mode | Pattern | Example |
| :--- | :--- | :--- |
| Mode A (GitHub Issue) | `{tool_name}--issue-{number}` | `release--issue-1234` |
| Mode B/C | `{tool_name}--{YYYYMMDD-HHmmss}` | `release--20260422-153000` |
| Mode D (Discovery) | `{tool_name}--{YYYYMMDD-HHmmss}` | `incident--20260423-091500` |

`tool_name` is always lowercase snake_case. The issue number comes from the user's request; the repository it belongs to comes from `manifest.project.repository`, or the working directory when that is null.

---

## Schema (v2)

```json
{
  "schema_version":   2,
  "build_id":         "release--issue-1234",
  "tool_name":        "release",
  "folder_name":      "Release",
  "domain":           "service_delivery",
  "issue_number":     "1234",
  "intake_mode":      "github_issue",
  "build_path":       "new_entity",
  "status":           "in_progress",
  "branch":           null,
  "current_phase":    1,
  "completed_phases": [1],
  "metrics": [
    {
      "name": "total_backlog_task_create_count",
      "verb": "create",
      "date_column": null,
      "entity_id": null,
      "filter": null,
      "candidate_filter_columns": [],
      "design_notes": null,
      "status": "hypothesis"
    }
  ],
  "source_table":     null,
  "grains":           {"account": true, "workspace": true, "user": false},
  "join_strategy":    null,
  "artifacts":        [],
  "validation":       [],
  "hypothesis_log":   [],
  "deployment":       {"zone1": "pending", "zone2": "pending", "zone3": "pending"},
  "pr_url":           null,
  "blocking":         null,
  "notes":            null,
  "updated_at":       "2026-04-22T15:30:00Z",
  "git_commit":       "abc1234"
}
```

**Notes:**

- **`schema_version`** must be `2`. The verification script (`verify.py schema-check`) validates required v2 fields, structural type contracts (e.g., `metrics` must be an object array, `grains` must be an object), and enum values for `status` and `build_path`. It does not enforce every nullable field in the schema template. Older build-state files without `schema_version: 2` fail the schema check and must be migrated.
- Set `updated_at` to the current UTC timestamp on every write (ISO 8601, e.g. `2026-04-22T15:30:00Z`).
- The `deployment` object is initialized at Phase 1 with one key per zone from `manifest.platform.deployment_order`, each set to `"pending"`. The schema template above shows this project's zone keys as an example. For a different project, replace the zone keys with those from its manifest.
- The `domain` value comes from `manifest.domains` (the domain whose `tools` list contains the `tool_name`).
- The `grains` object keys come from `manifest.grains` (one boolean per grain definition). **Type contract:** `grains` is always a JSON object (`{}`) with grain names as keys and booleans as values — never an array. Example: `{"account": true, "workspace": true, "user": false}`. An array format is always wrong.
- `build_path` valid values: `"new_entity"`, `"extension"`, `"rename"`, `"removal"`. Use `"extension"` when adding metrics to an entity folder that already exists.
- `git_commit` must be set on every write — run `git rev-parse --short HEAD` to get the value. Never leave it as `null` after Phase 1.
- `notes` is a freeform string for protocol violations, overrides, and edge case context that does not fit structured fields. Initialize as `null`. Append rather than overwrite when updating. Prefix entries with `[PROTOCOL]`, `[OVERRIDE]`, or `[CONTEXT]` tags for parsability on resume.
- `status` valid values: `"intake_started"`, `"in_progress"`, `"blocked"`, `"completed"`. Initialize to `"intake_started"` in the pre-Phase-1 start state write; set to `"in_progress"` at the Phase 1 checkpoint; set to `"blocked"` when a spec challenge or query failure halts the build; set to `"completed"` at the Phase 7 final checkpoint.

### metrics Field Contract

**Type: always an array of objects.** String arrays are rejected by `verify.py schema-check`.

Each metric object has these fields:

| Field | Type | Set At | Description |
| :--- | :--- | :--- | :--- |
| `name` | string | 1 | Metric column name following `manifest.naming.metric_pattern` |
| `verb` | string | 1 | Action verb (create, update, close, approve, etc.) |
| `date_column` | string\|null | 2 | Driving date column confirmed by `DESCRIBE TABLE` |
| `entity_id` | string\|null | 2 | Entity ID column confirmed by `DESCRIBE TABLE` |
| `filter` | string\|null | 3 | SQL filter expression built from Phase 2 Query 5 enumeration |
| `candidate_filter_columns` | string[] | 1 | String columns likely used in CASE WHEN filters (identified during intake) |
| `design_notes` | string\|null | 3 | Analyst reasoning, coverage gaps, normalization decisions |
| `status` | string | each | Lifecycle: `hypothesis` → `confirmed` (Phase 2) → `designed` (Phase 3) → `implemented` (Phase 5) |

Phase 1 writes each metric with `name`, `verb`, `candidate_filter_columns`, and `status: "hypothesis"`. Nullable fields are populated as Phase 2 and 3 resolve them. The `status` field progression is enforced: a metric with `status: "hypothesis"` cannot appear in Phase 3 SQL; only `confirmed` or later metrics are eligible for design.

### hypothesis_log Field Contract

**Type: array of objects.** Each entry records the resolution of one Phase 1 hypothesis against Phase 2 live query results.

```json
"hypothesis_log": [
  {
    "hypothesis": "source_table: demo_gold_source_a.service_delivery.releases",
    "source": "github_issue",
    "status": "CONFIRMED",
    "evidence": "Query 1 returned 12.4M rows, table exists in zone1",
    "phase": 2
  },
  {
    "hypothesis": "filter value: 'Approved'",
    "source": "github_issue",
    "status": "REVISED",
    "evidence": "Query 5 enumeration shows UPPER/TRIM needed; 34 variant labels identified",
    "phase": 2
  }
]
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `hypothesis` | string | yes | What was assumed (table path, column name, filter value, grain feasibility) |
| `source` | string | yes | Origin: `github_issue`, `natural_language`, `definitions_sql`, `profiler`, `prior_pipeline` |
| `status` | enum | yes | `CONFIRMED`, `REVISED`, or `INVALIDATED` |
| `evidence` | string | yes | Aggregate proof only — e.g. row counts, NULL rates, distinct variant counts, date ranges. Never raw source values, customer identifiers, or free-text source content. |
| `phase` | int | yes | Phase where resolution occurred (usually 2) |

**Enforcement:** After writing the Phase 2 checkpoint, run `python verify.py hypothesis-count {build_id}`. The script asserts: (a) array is non-empty, (b) every entry has a valid `status`, (c) no entry is missing `hypothesis` or `evidence`. This is the machine-readable gate that replaces the freeform "every hypothesis must appear in this log."

---

## Field Reference

| Field | Type | Set At | Notes |
| :--- | :--- | :--- | :--- |
| `schema_version` | int | pre-1 | Always `2`. Validated by `verify.py schema-check`. |
| `build_id` | string | pre-1 | Filename key. Never changes after Phase 1. |
| `tool_name` | string | pre-1 | Lowercase snake_case |
| `folder_name` | string | 1 | PascalCase folder under domain |
| `domain` | string | 1 | Domain from `manifest.domains` (e.g. `service_delivery`) |
| `issue_number` | string\|null | 1 | Null for Mode B/C/D |
| `intake_mode` | string | 1 | `github_issue`, `natural_language`, `definitions_sql`, or `discovery` |
| `build_path` | string | 1 | `new_entity`, `extension`, `rename`, or `removal` |
| `status` | string | pre-1 | `intake_started`, `in_progress`, `blocked`, or `completed` |
| `branch` | string\|null | 7 | Set when branch is created in Phase 7 |
| `current_phase` | int | each | Last phase that completed successfully. `0` in start state. |
| `completed_phases` | int[] | each | Append the phase number after each successful phase. `[]` in start state. |
| `metrics` | object[] | 1 | Always object array. See **metrics Field Contract** above. String arrays are rejected. |
| `source_table` | string\|null | 2 | Primary source table catalog path |
| `grains` | object\|null | 2 | One boolean per grain in `manifest.grains`. Always a JSON object. Never an array. |
| `join_strategy` | string\|null | 3 | Pattern1 through Pattern6 |
| `artifacts` | string[] | 4,5,6 | **Append-only.** Relative paths of all files created or modified. Accumulated across Phases 4, 5, and 6. |
| `validation` | object[] | 6 | Quality gate results. Each entry: `{"phase": N, "gate": "description", "result": "pass" \| "fail_then_fix" \| "fail", "failures": ["detail"]}` |
| `hypothesis_log` | object[] | 2 | Structured hypothesis resolutions. See **hypothesis_log Field Contract** above. |
| `deployment` | object | 1 | Per-zone status: `pending`, `success`, or `failed`. Keys from `manifest.platform.deployment_order`. Initialized at Phase 1. |
| `pr_url` | string\|null | 7 | PR URL |
| `blocking` | string\|null | any | Blocking issue description. Null when clear. Set immediately when a halt condition is triggered. |
| `notes` | string\|null | any | Freeform context. Prefix with `[PROTOCOL]`, `[OVERRIDE]`, or `[CONTEXT]`. Append-only. |
| `updated_at` | ISO 8601 | each | UTC timestamp of last write |
| `git_commit` | string | each | Short SHA of `HEAD` at time of write. Run `git rev-parse --short HEAD`. Never null after Phase 1. |

---

## Write Protocol

At each mandatory checkpoint (including the pre-Phase-1 start state write):

**BLOCKING -- Directory pre-check:** Before any write, verify that `skills/forge-builder/.build-state/` exists. If the directory does not exist, the `.gitkeep` was not checked out or was deleted. STOP and report: "The .build-state directory is missing. Run `git checkout -- skills/forge-builder/.build-state/.gitkeep` to restore it." Do not create the directory manually with mkdir -- the .gitkeep must be the source of truth so the directory is guaranteed for all users.

**Step 0 -- Acquire the lock file** (before any write):

- Check if `.build-state/{tool_name}.lock` exists.
- If it exists: read it. Format: `{"build_id": "...", "updated_at": "..."}`. If `updated_at` is older than 2 hours, delete it and proceed. If the lock is fresh and its `build_id` differs from the current build, STOP: "Another build (`{locked_build_id}`) is active for `{tool_name}`. Complete or abandon that build first."
- If no lock exists (or stale lock was deleted): write the lock file with the current `build_id` and UTC timestamp.

1. Read the existing file with the Read tool if it exists; otherwise start from the schema template above. **CRITICAL: Every write — including the pre-Phase-1 start state — MUST include `schema_version: 2` and `hypothesis_log: []` (or the populated array for Phase 2+). A file written without either field will fail `verify.py schema-check` and block all future resume attempts. There are no exceptions.** Set all nullable fields to null, `artifacts`/`completed_phases` as empty arrays.
2. Update only the fields listed in the checkpoint table row for this phase
3. **`artifacts` is append-only across phases.** When the checkpoint table says "append to `artifacts`": read the existing `artifacts` array, append new file paths from this phase, deduplicate (a file modified in Phase 5 that was created in Phase 4 appears once), write the merged array. **Never replace the `artifacts` array with only the current phase's files.** A Phase 5 write that does not include Phase 4 artifacts is a data loss bug.
4. Set `updated_at` to the current UTC timestamp
5. Set `git_commit` to the short SHA of the current `HEAD` (run `git rev-parse --short HEAD`)
6. Refresh the lock file: overwrite `.build-state/{tool_name}.lock` with the current `build_id` and UTC timestamp to keep it alive
7. Write the file with the Write tool to `skills/forge-builder/.build-state/{build_id}.json`
8. **Post-write verification (mandatory):** Execute `python skills/forge-builder/verify.py checkpoint-written {build_id} {N}` via Shell. If exit code is nonzero, the write failed or is inconsistent. Re-read the file, diagnose, and retry. Also execute `python skills/forge-builder/verify.py schema-check {build_id}` to validate the file against the v2 schema contract.

### Checkpoint Table

| # | After Phase | Fields to Update |
| :--- | :--- | :--- |
| pre-1 | Pre-Phase 1 start state | **`schema_version: 2`** (MANDATORY — omitting this field fails `schema-check` and blocks all resume), `build_id`, `tool_name`, `status: "intake_started"`, `current_phase: 0`, `completed_phases: []`, **`hypothesis_log: []`** (MANDATORY — omitting this field fails `schema-check` because `hypothesis_log` is a required field; omitting or leaving it non-array also fails `hypothesis-count`), `blocking: null`, `deployment` (initialized with per-zone `"pending"` for each zone in `manifest.platform.deployment_order`), `updated_at`, `git_commit`. All other nullable fields set to null. After writing, run `verify.py schema-check {build_id}` — it must pass before Phase 1 begins. |
| 1 | 1 (Intake) | All fields from schema template — first full write. Set `status: "in_progress"`, `current_phase: 1`, `completed_phases: [1]`. `metrics` must be object array format (see metrics Field Contract). |
| 2 | 2 (Discovery) | `source_table`, `grains`, `hypothesis_log` (populated with all Phase 1 hypothesis resolutions), update `metrics[].status` to `"confirmed"` for each confirmed metric, `current_phase`, `completed_phases`, `updated_at`, `git_commit` |
| 3 | 3 (Design) | `join_strategy`, update `metrics[].status` to `"designed"` and populate `filter`/`design_notes`, `current_phase`, `completed_phases`, `updated_at`, `git_commit` |
| 4 | 4 (Schema Architecture) | append to `artifacts` (all schema DDL and ALTER files created in Phase 4), `current_phase`, `completed_phases`, `updated_at`, `git_commit` |
| 5 | 5 (Pipeline Code) | append to `artifacts` (pipeline code and job definition files from Phase 5), update `metrics[].status` to `"implemented"`, `current_phase`, `completed_phases`, `updated_at`, `git_commit`. After writing, run `verify.py content-verify {build_id}` — it must pass before Phase 6 begins. |
| 6 | 6 (Testing) | `validation`, `blocking`, `current_phase`, `completed_phases`, `updated_at`, `git_commit` |
| 7 | 7 (Deployment and Delivery) | `branch`, `deployment` (per-zone status updated from `"pending"` to `"success"` or `"failed"`), `pr_url`, `status: "completed"`, `current_phase`, `completed_phases`, `updated_at`, `git_commit`. **Then release the lock:** delete `.build-state/{tool_name}.lock`. This is the only checkpoint that deletes rather than refreshes it. Skipping this leaves a lock that blocks any differently-named build for the same tool until it ages out after two hours. |

---

## Resume Protocol

1. Read `.build-state/{build_id}.json`
2. **Schema migration:** If `schema_version` is missing or less than `2`, the file is from a prior schema version. Add missing v2 fields (`schema_version: 2`, `hypothesis_log: []`, convert string `metrics` to object format) and write the file before proceeding.
3. **Schema contract check (mandatory):** Execute `python skills/forge-builder/verify.py schema-check {build_id}` via Shell. If exit code is nonzero, the file is structurally invalid — do not proceed. The most common cause is a previous session that omitted `schema_version: 2` or `hypothesis_log: []`. Apply the migration from step 2 and re-run until it passes.
4. **Drift detection:** Compare the stored `git_commit` against the current `HEAD` (`git rev-parse --short HEAD`). If they differ, warn the user: "Codebase has changed since the last checkpoint (`{stored_commit}` -> `{current_commit}`). Source tables or schemas may have been modified. Re-run Phase 2 discovery to verify assumptions?" Offer to continue or re-discover. If the user elects to continue, proceed to step 5.
5. `current_phase` is the last successfully completed phase. Resume from `current_phase + 1`
6. Check `blocking` -- if non-null, resolve the blocking issue before proceeding
7. For non-idempotent phases in `completed_phases`, run the following in order before skipping:
   - `python verify.py artifacts-exist {build_id}` — confirms all artifact files exist on disk
   - `python verify.py content-verify {build_id}` — confirms all implemented metrics exist in the required artifact types for the pipeline framework (spark_python: `.py` + `.sql`; dbt: `.sql` + `.yml`; hybrid: whichever types are present)
   - If either check fails, the claimed-complete phase is unverified. Re-run that phase from its entry point before continuing.

### Idempotency Table

| Phase | Idempotent | Resume Behavior |
| :--- | :--- | :--- |
| 1 (Intake) | Yes | Re-run; overwrite scoping fields |
| 2 (Discovery) | Yes | Re-run; re-queries the data platform, overwrites `source_table` and `grains` |
| 3 (Design) | Yes | Re-run; overwrites `join_strategy` |
| 4 (Schema) | No | Run `artifacts-exist` then `content-verify`. Skip only if both pass — meaning all schema artifacts exist on disk AND every implemented metric column name appears in the required artifact types for the pipeline framework. If either check fails, re-run Phase 4 from its entry point. |
| 5 (Pipeline) | No | Run `artifacts-exist` then `content-verify`. Skip only if both pass — meaning all pipeline artifacts exist on disk AND every implemented metric alias appears in the required artifact types for the pipeline framework. If either check fails, re-run Phase 5 from its entry point. |
| 6 (Testing) | Yes | Re-run; test SQL regeneration is additive |
| 7 (Deployment and Delivery) | No | Check `deployment` per zone; skip successful zones, retry failed. Documentation updates are additive and safe to re-run. |

---

> For rollback procedures, non-revertible changes, phase dependency chains, and concurrent build protection (lock files), see [system-memory-store-recovery.md](system-memory-store-recovery.md).

---

## Cleanup

Files older than 30 days (based on `updated_at`) can be deleted. Completed builds can be archived after the PR is merged. Never commit `.build-state/` to git.
