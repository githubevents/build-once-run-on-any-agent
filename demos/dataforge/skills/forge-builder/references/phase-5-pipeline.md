# Phase 5 Pipeline Code Reference

Loaded at Phase 5 entry. Contains pipeline code generation procedures, file generation order, dry-run validation protocol, job definition wiring, and multi-source integration patterns. All project-specific values are resolved from `../../../assets/dataforge.manifest.resolved.yaml`.

For the actual Python and SQL templates, load the framework-specific code template: [code-templates/spark_python.md](code-templates/spark_python.md) or [code-templates/dbt.md](code-templates/dbt.md) based on `manifest.platform.pipeline_framework`.

---

## Entry Prerequisites

1. Phase 4 schema complete — all DDL files (or schema.yml) written to disk.
2. Memory store checkpoint 4 written with `artifacts` containing schema files and `completed_phases` including `4`.
3. `verify.py phase-entry {build_id} 5` returned exit code 0.

---

## Build Path Routing

| Build Path | Pipeline Work |
| :--- | :--- |
| `new_entity` | Generate Daily + Cumulative pipeline files. Generate job definition task entries. Full dry-run validation. |
| `extension` | Edit existing Daily + Cumulative pipeline files to add new metric blocks. No job definition changes (tasks already exist). Dry-run validation on modified files only. |
| `rename` | Edit existing pipeline files to rename metric aliases. Dry-run validation on modified files. |
| `removal` | Not handled in Phase 5 — see [on-demand-removal.md](on-demand-removal.md). |

---

## File Generation Order

Generate pipeline files in this order to enable incremental validation:

1. **Daily pipeline** — generates the per-day metric aggregation logic
2. **Cumulative pipeline** — generates the up-to-date cumulative logic
3. **Job definitions** (new entity only) — wires the pipelines into the orchestration job

Each file is validated immediately after generation via the dry-run protocol before proceeding to the next file.

---

## Pipeline File Generation (spark_python)

### New Entity

Generate two files from the templates in [code-templates/spark_python.md](code-templates/spark_python.md):

| File | Template | Location |
| :--- | :--- | :--- |
| `{Folder_Name}_Metrics_Snapshot_Daily.py` | Daily Python Template | `{store}/{domain}/{Folder_Name}/{code_dir}/` |
| `{Folder_Name}_Metrics_Snapshot_Cumulative.py` | Cumulative Python Template | `{store}/{domain}/{Folder_Name}/{code_dir}/` |

Substitute all template placeholders using the Phase 3 metric design and Phase 4 schema column order.

### Extension Build

Read the existing pipeline file. Identify the insertion point for new metric blocks — after the last existing metric block inside the same CTE. Maintain the existing code style, indentation, and comment patterns.

**Insertion rules:**
- Each new metric block goes inside the existing entity CTE, after the last `COUNT(DISTINCT CASE ...)` block.
- Metric blocks are separated by a blank line.
- The WHERE clause may need expansion if the new metric uses a date column not already in the predicate (e.g., adding `OR TO_DATE(closed_at) = '{snapshot_date}'`).
- Do not reorganize or reformat existing code. Match the existing style exactly.

### Metric Block Construction

For each metric in the design:

1. Look up the SQL expression from the Phase 3 design spec (stored in memory store `metrics[].filter` and `metrics[].date_column`).
2. Format the COUNT/DISTINCT/CASE/WHEN/THEN/ELSE NULL/END on separate lines per lint Section 3.
3. Use the exact alias from Phase 4 schema column names — do not re-derive.
4. Apply `UPPER(TRIM(...))` normalization to any filter condition that Phase 2 Query 5 identified as having case or whitespace variants.

### Cumulative Differences

See [code-templates/spark_python.md](code-templates/spark_python.md) "Structural Differences from Daily" section for the complete Daily vs. Cumulative comparison (import, zone stubs, `run_query` signature, date reference, date predicate, update metric handling, entry point).

---

## Pipeline File Generation (dbt)

For dbt projects, generate model SQL files from [code-templates/dbt.md](code-templates/dbt.md). Key decisions:

- Config block includes `materialized`, `incremental_strategy`, `unique_key`, `tags` from the manifest.
- `{{ source() }}` macro references are resolved from `manifest.catalogs.sources[].dbt_source`.
- `is_incremental()` guard wraps the WHERE clause for incremental models.
- Extension builds edit the existing model SQL — add new metric blocks into the final SELECT.

---

## Grain Restriction

When Phase 2 identified inactive grains, restrict the pipeline's grain iteration:

```python
if __name__ == "__main__":
    run_daily_job(run_query, grains=['workspace', 'account'])
```

The `grains=` parameter must match the Phase 2 grain feasibility findings stored in the memory store `grains` object. Valid grain names are keys from `manifest.grains`.

| Phase 2 Finding | `grains=` Parameter |
| :--- | :--- |
| All grains ACTIVE | Omit parameter (defaults to all grains) |
| User grain INACTIVE | `grains=['workspace', 'account']` |
| User + Workspace INACTIVE | `grains=['account']` |

Apply the same restriction to both Daily and Cumulative entry points.

---

## Job Definition Wiring (New Entity Only)

For new entities, add task entries to the domain's orchestration job file.

### Job File Lookup

1. Daily job file: `manifest.orchestration.domain_jobs.{domain}.daily`
2. Cumulative job file: `manifest.orchestration.domain_jobs.{domain}.cumulative`

### Task Entry Construction

See [code-templates/spark_python.md](code-templates/spark_python.md) for the full JSON templates. Key rules:

- `task_key` must be unique within the file — read existing tasks and verify no collision.
- `job_cluster_key` must match the existing tasks in the same file — copy the value from any sibling task.
- `python_file` path uses `{manifest.project.store_name}/{domain}/{Folder_Name}/{code_dir}/{filename}`.
- Table name parameters follow `{Folder_Name}_{Grain}_Metrics_Snapshot_{Cadence}` format.
- The `Folder_Name` comes from `manifest.folder_name_overrides` if present, otherwise derive from `tool_name`.

### Extension Builds

Extension builds do not modify job definitions. The existing task already runs the pipeline file — adding metric blocks to the pipeline file is sufficient.

---

## Dry-Run Validation Protocol

After generating each pipeline file, validate it before proceeding to the next file. All checks are mandatory.

### Check 1 — Syntax

Read the generated file back. Verify:

- All f-string expressions are balanced (no unclosed `{` or `}`)
- No backslash characters inside f-string expressions
- No `/* */` block comments inside f-string SQL
- No `#` comments inside f-string SQL
- No `;` inside any SQL comment

### Check 2 — Template Substitution

Mentally trace a single date execution:

- `SOURCE_ZONE_SUFFIX` resolves to the expected zone pattern (e.g., `_zone1`)
- `{snapshot_date}` (Daily) or `{SNAPSHOT_DATE}` (Cumulative) appears correctly in all date predicates
- Every `{catalog}.{schema}.{table}` reference resolves to a real path from `manifest.catalogs`
- The f-string SQL would compile without `NameError` when zone stubs are injected by the runner

### Check 3 — Column Alignment

Compare the SELECT column list in `run_query()` against the Phase 4 Schema DDL column order. They must match exactly:

1. System columns first: `LOAD_TIMESTAMP`, `SOURCE_ZONE` (from the outer SELECT)
2. Grain columns from the CTE (via `group_by_columns` / `select_columns`)
3. Metric columns in the same order as the DDL

The `INSERT OVERWRITE ... BY NAME` clause tolerates mismatches silently — only a visual comparison catches ordering errors.

### Check 4 — Runner Contract

Verify the entity file does NOT contain any forbidden patterns from the Entity File Contract in [code-templates/spark_python.md](code-templates/spark_python.md) (argparse, SparkSession, load_data, zone literals, sys.exit).

If any check fails, fix the issue immediately. Do not defer to Phase 6.

---

## Multi-Source Integration

When Phase 3 selected a join strategy of Pattern 2 or higher, the pipeline must handle multiple source tables.

### Existing Entity (Extension with New Source)

Add a second CTE for the new source table. Join it to the existing CTE using the Phase 3 join strategy. Do not merge the new source into the existing CTE's FROM clause.

### New Entity (Multiple Sources)

Structure the pipeline with one CTE per source table, then a final `combined_metrics` CTE that joins them:

```
CTE 1: {source_a}_metrics  →  metrics from source table A
CTE 2: {source_b}_metrics  →  metrics from source table B
CTE 3: combined_metrics    →  FULL OUTER JOIN or LEFT JOIN on grain columns
Outer SELECT              →  LOAD_TIMESTAMP, SOURCE_ZONE, * FROM combined_metrics
```

CTE naming follows `manifest.naming.cte_case`. See forge-lint Section 5 for the exact SQL structure of each join pattern (Pattern 1 through Pattern 6).

---

## Verification

Run the [gate-engineering.md](gate-engineering.md) Phase 5 checklist before writing the memory store checkpoint.

Key verification items:
1. Runner import present from `manifest.runner`.
2. Zone stubs declared at module level.
3. `run_query` signature matches runner contract.
4. Entry point calls the runner with appropriate `grains=` restriction.
5. Every catalog reference includes the zone suffix variable.
6. No forbidden legacy patterns in entity file.
7. F-string safety rules enforced.
8. Metric blocks formatted per lint Section 3.
9. Column alignment verified against Phase 4 schema.
