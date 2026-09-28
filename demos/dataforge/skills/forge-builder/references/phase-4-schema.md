# Phase 4 Schema Architecture Reference

Loaded at Phase 4 entry. Contains schema DDL generation procedures, file naming conventions, entity folder structure, ALTER script strategy, and grain-specific patterns. All project-specific values are resolved from `../../../assets/dataforge.manifest.resolved.yaml`.

For the actual DDL templates and SQL syntax, load the framework-specific code template: [code-templates/spark_python.md](code-templates/spark_python.md) or [code-templates/dbt.md](code-templates/dbt.md) based on `manifest.platform.pipeline_framework`.

---

## Entry Prerequisites

1. Phase 3 metric design approved (User Gate passed or autonomous mode invoked).
2. Memory store checkpoint 3 written with `join_strategy`, `metrics[].status = "designed"`, and `completed_phases` including `3`.
3. `verify.py phase-entry {build_id} 4` returned exit code 0.

---

## Build Path Routing

The `build_path` from Phase 1 determines the scope of schema work:

| Build Path | Schema Work |
| :--- | :--- |
| `new_entity` | Create new entity folder. Generate all schema DDL files (active grains x 2 cadences + inactive grains). No ALTER scripts. |
| `extension` | No new folder. Generate ALTER scripts for each new metric column x active grain x cadence. Update `ALTER_LOG.md`. |
| `rename` | Generate ALTER RENAME scripts for each affected column x grain x cadence. Update `ALTER_LOG.md`. |
| `removal` | Not handled in Phase 4 — see [on-demand-removal.md](on-demand-removal.md). |

---

## New Entity Folder Structure

When `build_path` is `new_entity`, create the entity folder following `manifest.entity_structure`:

```
{manifest.project.store_name}/{domain}/{Folder_Name}/
├── {manifest.entity_structure.code_dir}/
│   ├── {Folder_Name}_Metrics_Snapshot_Daily.py
│   └── {Folder_Name}_Metrics_Snapshot_Cumulative.py
└── {manifest.entity_structure.schema_dir}/
    ├── {Folder_Name}_User_Metrics_Snapshot_Daily.sql
    ├── {Folder_Name}_User_Metrics_Snapshot_Cumulative.sql
    ├── {Folder_Name}_Workspace_Metrics_Snapshot_Daily.sql
    ├── {Folder_Name}_Workspace_Metrics_Snapshot_Cumulative.sql
    ├── {Folder_Name}_Account_Metrics_Snapshot_Daily.sql
    ├── {Folder_Name}_Account_Metrics_Snapshot_Cumulative.sql
    └── {manifest.entity_structure.alter_dir}/
```

### Folder Name Derivation

1. Check `manifest.folder_name_overrides.{tool_name}` — use the override if present.
2. Otherwise: `tool_name.replace('_', ' ').title().replace(' ', '_')`.

### Domain Directory

Look up the entity's domain from `manifest.domains.{domain}.tools` (resolved in Phase 2). The domain name becomes the parent directory under `manifest.project.store_name`.

---

## Schema File Generation (spark_python)

### File Count Formula

```
schema_files = (active_grains + inactive_grains) × 2 cadences
```

Where:
- **Active grains**: Grains with `null_pct < 50` from Phase 2 Query 3 (or explicitly confirmed SUSPECT grains).
- **Inactive grains**: Grains with `null_pct = 100` from Phase 2 Query 3.
- **Cadences**: Daily and Cumulative.

All grains get schema files — inactive grains include the INACTIVE header comment but retain the full DDL structure.

### File Naming Convention

Pattern from `manifest.entity_structure.schema_pattern`:

```
{Folder_Name}_{Grain}_Metrics_Snapshot_{Cadence}.sql
```

Example: `Releases_User_Metrics_Snapshot_Daily.sql`

### Column Order

Schema DDL column order must match the planned pipeline SELECT output order:

1. `SNAPSHOT_DATE` (system column, UPPERCASE)
2. `LOAD_TIMESTAMP` (system column, UPPERCASE)
3. `SOURCE_ZONE` (system column, UPPERCASE)
4. Grain columns in order from `manifest.grains.{grain}.columns` (lowercase_snake_case)
5. Metric columns in logical order: creates first, then updates, then specialized verbs (lowercase_snake_case)

This order is authoritative for all downstream phases. Phase 5 pipeline code must produce columns in this exact order.

### COMMENT Suffixes

Each metric column COMMENT includes a grain-and-cadence suffix:

| Grain | Daily | Cumulative |
| :--- | :--- | :--- |
| User | `by this User on this Snapshot_Date` | `by this User up to this Snapshot_Date` |
| Project | `in this Project on this Snapshot_Date` | `in this Project up to this Snapshot_Date` |
| Company | `in this Company on this Snapshot_Date` | `in this Company up to this Snapshot_Date` |

COMMENT text format: `'Total Number of {Entity} {Verb}s {grain_suffix}'`

### Table-Level COMMENT

| Cadence | Pattern |
| :--- | :--- |
| Daily | `'This table stores Key {Entity} metrics at {Grain} grain calculated on daily basis. Each Snapshot_Date represents the activity happened on that specific date.'` |
| Cumulative | `'This table stores Key {Entity} metrics at {Grain} grain calculated on cumulative basis. Each Snapshot_Date represents the cumulative activity up to that date.'` |

### Inactive Grain Schema

For grains marked INACTIVE in Phase 2, prefix the DDL with:

```sql
-- INACTIVE: {Grain} grain not supported for {entity} (source table lacks {reason})
-- This schema is preserved for future activation if the source adds {missing_column}.
```

The full DDL beneath the header is identical to the active grain version. This allows future activation without regenerating the file.

---

## Schema File Generation (dbt)

For dbt projects, Phase 4 generates `schema.yml` entries instead of DDL files. See [code-templates/dbt.md](code-templates/dbt.md) for the template. Key decisions:

- `materialized` from `manifest.dbt.materialization_default`
- `unique_key` includes all grain columns plus `SNAPSHOT_DATE`
- `accepted_values` for `SOURCE_ZONE` derived from `manifest.platform.zones[].id`
- Inactive grains use `enabled: false` in the model config

---

## ALTER Script Strategy (Extension Builds)

When `build_path` is `extension`, new metric columns are added via ALTER scripts.

### ALTER Script Generation

One ALTER script per: new metric column × active grain × cadence.

If a single ALTER file can contain multiple `ADD COLUMN` statements for the same table, group them. The grouping strategy depends on the platform:

| Platform | Grouping |
| :--- | :--- |
| spark_python (Databricks) | One ALTER file per table, multiple `ADD COLUMN` statements chained with `;` |
| dbt | Not applicable — schema.yml is edited directly |

### ALTER File Naming

```
{manifest.entity_structure.alter_dir}/{Folder_Name}_{Grain}_Metrics_Snapshot_{Cadence}_ALTER_{YYYYMMDD}.sql
```

The date suffix uses the current date (UTC). If multiple ALTER files target the same table on the same day, append a sequence number: `_ALTER_{YYYYMMDD}_2.sql`.

### ALTER_LOG.md

Every ALTER script must be recorded in `ALTER_LOG.md` in the entity's schema directory. If the file does not exist, create it with the header:

```markdown
# ALTER Log

| Date | File | Description |
| :--- | :--- | :--- |
```

Append one row per ALTER script:

```markdown
| YYYY-MM-DD | {filename} | Add {metric_name} to {Grain} {Cadence} |
```

---

## Cross-Phase Column Contract

The column names and order established in Phase 4 are the single source of truth for all subsequent phases:

| Phase | Must Match Phase 4 Column Names/Order |
| :--- | :--- |
| Phase 5 | Pipeline `run_query()` SELECT aliases and column order |
| Phase 6 | Test SQL expected column names |

If any downstream phase discovers a mismatch with the Phase 4 schema, the schema is authoritative. Fix the downstream code, not the schema — unless the schema itself violates `manifest.naming.metric_pattern`.

---

## Verification

Run the [gate-engineering.md](gate-engineering.md) Phase 4 checklist before writing the memory store checkpoint.

Key verification items:
1. Column order matches planned pipeline SELECT order.
2. All metric columns follow `manifest.naming.column_case`.
3. System columns are UPPERCASE per `manifest.naming.system_columns.uppercase`.
4. Every column has a COMMENT with correct grain suffix.
5. ALTER scripts have `-- [MODIFIED YYYY-MM-DD]` tags.
6. Correct number of schema files generated.
7. Inactive grains have INACTIVE header.
