# Code Templates -- spark_python

Phase 4 and 5 reference for Daily Python, Cumulative Python, Schema SQL, ALTER script, and Databricks job JSON templates. All project-specific values are resolved from the manifest.

---

## Runner Architecture Overview

Entity files contain **only** the SQL query logic. All orchestration (argument parsing, date looping, grain iteration, Spark session, zone normalization, row-count logging) is handled by shared runners defined in the manifest.

| Component | Manifest Path | Responsibility |
| :--- | :--- | :--- |
| Daily runner | `manifest.runner.daily` | CLI parsing, date range, grain dispatch, SparkSession, zone injection |
| Cumulative runner | `manifest.runner.cumulative` | CLI parsing, single snapshot date, grain dispatch, SparkSession, zone injection |
| Config | `manifest.runner.config` | Grain column lists, catalog name templates |

### Injection Mechanism

Read `manifest.runner.injection_pattern` (default: `sys.modules`). The runner locates the entity module and sets these attributes before calling `run_query()`:

| Attribute | Set By | Available In |
| :--- | :--- | :--- |
| `spark` | Both runners | SparkSession instance |
| `SOURCE_ZONE` | Both runners | Lowercase zone string |
| `SOURCE_ZONE_SUFFIX` | Both runners | Prefixed zone string (e.g., `_{zone_id}`) |
| `SNAPSHOT_DATE` | Cumulative runner only | Single date string for cumulative queries |

These are listed in `manifest.runner.injected_globals`. Entity files declare them as `None` placeholders at module level.

### Grain Dispatch

Grain column lists from `manifest.grains`:

| Grain | Columns (from `manifest.grains.{grain}.columns`) |
| :--- | :--- |
| account | Read from `grains.account.columns` |
| workspace | Read from `grains.workspace.columns` |
| user | Read from `grains.user.columns` |

Iterate whatever keys `manifest.grains` actually declares. The three above are
the example project's grains, not a fixed set.

The runner iterates over requested grains, building the fully-qualified table name from CLI args and passing the corresponding column list as `group_by_columns`.

---

## Daily Python Template

### Complete Entity File

```python
from typing import List

# Import path from manifest.runner.daily
from {manifest_runner_daily_module} import run_daily_job

# Zone context -- set by the daily runner at startup before run_query() is called
SOURCE_ZONE = None
SOURCE_ZONE_SUFFIX = None

def run_query(snapshot_date: str, table_name: str, group_by_columns: List[str]):
    print(f'Running Query for {snapshot_date}...')
    select_columns = ',\n        '.join(group_by_columns)

    sql_query = f"""
    INSERT OVERWRITE {table_name} PARTITION (SNAPSHOT_DATE = DATE '{snapshot_date}') BY NAME
    WITH {entity}_metrics AS (
        SELECT
            {select_columns}
            , COUNT(
                DISTINCT CASE
                    WHEN TO_DATE(created_at) = '{snapshot_date}' THEN {entity_id}
                    ELSE NULL
                END
            ) AS total_{entity}_create_count
            , COUNT(
                DISTINCT CASE
                    WHEN TO_DATE(updated_at) = '{snapshot_date}'
                    AND TO_DATE(updated_at) != TO_DATE(created_at) THEN {entity_id}
                    ELSE NULL
                END
            ) AS total_{entity}_update_count
        FROM
            {source_catalog_pattern}.{schema}.{source_table}
        WHERE
            TO_DATE(created_at) = '{snapshot_date}'
            OR TO_DATE(updated_at) = '{snapshot_date}'
        GROUP BY
            ALL
    )
    SELECT
        CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
        , '{SOURCE_ZONE}' AS SOURCE_ZONE
        , *
    FROM {entity}_metrics
    """

    print(sql_query)
    return spark.sql(sql_query)


#### Task run begins here ####
if __name__ == "__main__":
    run_daily_job(run_query)
```

**Manifest resolution for the import:** The import statement `from {manifest_runner_daily_module} import run_daily_job` resolves to the module path in `manifest.runner.daily`. The catalog pattern `{source_catalog_pattern}` resolves from `manifest.catalogs.sources[].pattern` with `{zone_suffix}` replaced by `{SOURCE_ZONE_SUFFIX}`.

### Entity File Contract

| Element | Requirement |
| :--- | :--- |
| Import | Import the daily runner from the module path in `manifest.runner.daily` |
| Zone stubs | `SOURCE_ZONE = None` and `SOURCE_ZONE_SUFFIX = None` at module level |
| `run_query` signature | `(snapshot_date: str, table_name: str, group_by_columns: List[str])` |
| `run_query` return | `spark.sql(sql_query)` -- DataFrame with `num_inserted_rows` |
| Entry point | `if __name__ == "__main__": run_daily_job(run_query)` |
| No argparse | Runner owns all CLI argument parsing |
| No SparkSession | Runner injects `spark` as a module attribute |
| No date looping | Runner iterates over the date range internally |
| No grain columns | Runner passes `group_by_columns` from the config file at `manifest.runner.config` |

### Placeholder Substitution Guide

- `{entity}`: lowercase singular entity name (e.g., `release`, `change_request`)
- `{entity_id}`: Primary key column (e.g., `release_log_id`, `id`)
- `{schema}`: Source schema name (e.g., `service_delivery`, `field_productivity`)
- `{source_table}`: Source table name (e.g., `releases`, `change_requests`)
- `{source_catalog_pattern}`: Resolved from `manifest.catalogs.sources[].pattern` with zone suffix

### Metric Block Formatting Rules

- Each metric is a `COUNT(DISTINCT CASE WHEN ... THEN ... ELSE NULL END)` block
- Create metric: `WHEN TO_DATE(created_at) = '{snapshot_date}'`
- Update metric: `WHEN TO_DATE(updated_at) = '{snapshot_date}' AND TO_DATE(updated_at) != TO_DATE(created_at)`
- Close metric: `WHEN TO_DATE(closed_at) = '{snapshot_date}'`
- Vertically align COUNT/DISTINCT/CASE/WHEN/THEN/ELSE NULL/END on separate lines

### Grain Restriction

When a source table lacks a grain column, restrict grains via the `grains` parameter:

```python
#### Task run begins here ####
if __name__ == "__main__":
    run_daily_job(run_query, grains=['workspace', 'account'])
```

Valid grain values: keys from `manifest.grains`. Defaults to all grains when omitted.

Common restrictions:
- Source lacks user attribution column -> `grains=['workspace', 'account']`
- Source lacks both workspace and user columns -> `grains=['account']`

---

## Cumulative Python Template

### Structural Differences from Daily

| Aspect | Daily | Cumulative |
| :--- | :--- | :--- |
| Runner import | From `manifest.runner.daily` | From `manifest.runner.cumulative` |
| Date handling | `snapshot_date` passed as function argument | `SNAPSHOT_DATE` injected as module-level global |
| Zone stubs | `SOURCE_ZONE`, `SOURCE_ZONE_SUFFIX` | `SNAPSHOT_DATE`, `SOURCE_ZONE`, `SOURCE_ZONE_SUFFIX` |
| `run_query` signature | `(snapshot_date, table_name, group_by_columns)` | `(table_name, group_by_columns)` |
| WHERE clause | `TO_DATE(created_at) = '{snapshot_date}'` | `TO_DATE(created_at) <= '{SNAPSHOT_DATE}'` |
| Metrics | Separate create/update counts | Often single `COUNT(DISTINCT id)` |

### Complete Entity File

```python
from typing import List

# Import path from manifest.runner.cumulative
from {manifest_runner_cumulative_module} import run_cumulative_job

# Zone context -- set by the cumulative runner at startup before run_query() is called
SNAPSHOT_DATE = None
SOURCE_ZONE = None
SOURCE_ZONE_SUFFIX = None

def run_query(table_name: str, group_by_columns: List[str]):
    print(f'Running Query for {SNAPSHOT_DATE}...')
    select_columns = ',\n        '.join(group_by_columns)

    sql_query = f"""
    INSERT OVERWRITE {table_name} PARTITION (SNAPSHOT_DATE = DATE '{SNAPSHOT_DATE}') BY NAME
    WITH {entity}_metrics AS (
        SELECT
            {select_columns}
            , COUNT(DISTINCT {entity_id}) AS total_{entity}_create_count
        FROM
            {source_catalog_pattern}.{schema}.{source_table}
        WHERE
            TO_DATE(created_at) <= '{SNAPSHOT_DATE}'
        GROUP BY
            ALL
    )
    SELECT
        CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
        , '{SOURCE_ZONE}' AS SOURCE_ZONE
        , *
    FROM {entity}_metrics
    """

    print(sql_query)
    return spark.sql(sql_query)


#### Task run begins here ####
if __name__ == "__main__":
    run_cumulative_job(run_query)
```

### Entity File Contract

| Element | Requirement |
| :--- | :--- |
| Import | Import the cumulative runner from the module path in `manifest.runner.cumulative` |
| Zone stubs | `SNAPSHOT_DATE = None`, `SOURCE_ZONE = None`, `SOURCE_ZONE_SUFFIX = None` at module level |
| `run_query` signature | `(table_name: str, group_by_columns: List[str])` -- no `snapshot_date` param |
| `run_query` return | `spark.sql(sql_query)` -- DataFrame with `num_inserted_rows` |
| Entry point | `if __name__ == "__main__": run_cumulative_job(run_query)` |
| Date reference | Use `SNAPSHOT_DATE` module global in f-string SQL, not a function parameter |

### Grain Restriction

Same as Daily -- pass `grains=` to the cumulative runner call:

```python
#### Task run begins here ####
if __name__ == "__main__":
    run_cumulative_job(run_query, grains=['workspace', 'account'])
```

---

## Schema SQL Template

### CREATE TABLE (User Grain, Daily)

```sql
-- Description: Creates {Entity} User metrics snapshot table for daily metrics
-- Parameters:
--   $catalog_name: Target catalog (resolved from manifest.catalogs.targets)
--   $schema_name: Target schema (domain from manifest.domains)
--   $table_name: Target table name

CREATE TABLE ${catalog_name}.${schema_name}.${table_name} (
  SNAPSHOT_DATE DATE COMMENT 'The date for which this daily snapshot is created',
  LOAD_TIMESTAMP TIMESTAMP COMMENT 'Timestamp when data is loaded into this table',
  SOURCE_ZONE STRING COMMENT 'Zone for which activity is represented in this table',
  account_id BIGINT COMMENT 'Company Id for which activity is represented in this table',
  workspace_id BIGINT COMMENT 'Project Id for which activity is represented in this table',
  user_id BIGINT COMMENT 'Created By Id who did the activity represented in this table',
  total_{entity}_create_count BIGINT COMMENT 'Total Number of {Entity} Creates by this User on this Snapshot_Date',
  total_{entity}_update_count BIGINT COMMENT 'Total Number of {Entity} Updates by this User on this Snapshot_Date'
)
USING delta
PARTITIONED BY (SNAPSHOT_DATE)
COMMENT 'This table stores Key {Entity} metrics at User grain calculated on daily basis. Each Snapshot_Date represents the activity happened on that specific date.'
TBLPROPERTIES (
  'delta.checkpoint.writeStatsAsJson' = 'false',
  'delta.checkpoint.writeStatsAsStruct' = 'true',
  'delta.enableDeletionVectors' = 'true',
  'delta.feature.deletionVectors' = 'supported',
  'delta.minReaderVersion' = '3',
  'delta.minWriterVersion' = '7',
  'delta.columnMapping.mode' = 'name');
```

System column names (SNAPSHOT_DATE, LOAD_TIMESTAMP, SOURCE_ZONE) come from `manifest.naming.system_columns.uppercase`. Grain columns come from `manifest.grains.{grain}.columns`.

### Grain COMMENT Suffixes

See [phase-4-schema.md](../phase-4-schema.md) COMMENT Suffixes table for the authoritative grain × cadence suffix patterns.

### Grain Column Differences

| Grain | Columns (from `manifest.grains`) |
| :--- | :--- |
| User | `account_id`, `workspace_id`, `user_id` |
| Project | `account_id`, `workspace_id` |
| Company | `account_id` |

### INACTIVE Grain Schema

For grains determined inactive in Phase 2, include the full DDL but add a header comment:

```sql
-- INACTIVE: User grain not supported for {entity} (source table lacks user attribution column)
-- This schema is preserved for future activation if the source adds user attribution.

CREATE TABLE ${catalog_name}.${schema_name}.${table_name} (
  -- ... full DDL identical to active schema ...
)
```

---

## ALTER Script Template

```sql
-- [MODIFIED YYYY-MM-DD]
-- Description: Adds {metric_name} column to {entity} {grain} metrics snapshot {cadence} table
ALTER TABLE ${catalog_name}.${schema_name}.${table_name}
ADD COLUMN total_{entity}_{verb}_count BIGINT COMMENT 'Total Number of {Entity} {Verb}s {grain_suffix}';
```

Grain suffix for COMMENT: see [phase-4-schema.md](../phase-4-schema.md) COMMENT Suffixes table.

---

## Job Definition Task Template

### Daily Task

```json
{
    "task_key": "{Folder_Name}_Metrics_Snapshot_Daily",
    "run_if": "ALL_SUCCESS",
    "spark_python_task": {
        "python_file": "{manifest.project.store_name}/{domain}/{Folder_Name}/{manifest.entity_structure.code_dir}/{Folder_Name}_Metrics_Snapshot_Daily.py",
        "source": "GIT",
        "parameters": [
            "--START_DATE", "{{job.parameters.START_DATE}}",
            "--END_DATE", "{{job.parameters.END_DATE}}",
            "--SOURCE_ZONE", "{{job.parameters.SOURCE_ZONE}}",
            "--TARGET_CATALOG_NAME", "{{job.parameters.TARGET_CATALOG_NAME}}",
            "--TARGET_SCHEMA_NAME", "{{job.parameters.TARGET_SCHEMA_NAME}}",
            "--TARGET_USER_TABLE_NAME", "{Folder_Name}_User_Metrics_Snapshot_Daily",
            "--TARGET_PROJECT_TABLE_NAME", "{Folder_Name}_Workspace_Metrics_Snapshot_Daily",
            "--TARGET_COMPANY_TABLE_NAME", "{Folder_Name}_Account_Metrics_Snapshot_Daily"
        ]
    },
    "job_cluster_key": "{match_existing_cluster_key_in_job_file}"
}
```

### Cumulative Task

```json
{
    "task_key": "{Folder_Name}_Metrics_Snapshot_Cumulative",
    "run_if": "ALL_SUCCESS",
    "spark_python_task": {
        "python_file": "{manifest.project.store_name}/{domain}/{Folder_Name}/{manifest.entity_structure.code_dir}/{Folder_Name}_Metrics_Snapshot_Cumulative.py",
        "source": "GIT",
        "parameters": [
            "--SNAPSHOT_DATE", "{{job.parameters.SNAPSHOT_DATE}}",
            "--SOURCE_ZONE", "{{job.parameters.SOURCE_ZONE}}",
            "--TARGET_CATALOG_NAME", "{{job.parameters.TARGET_CATALOG_NAME}}",
            "--TARGET_SCHEMA_NAME", "{{job.parameters.TARGET_SCHEMA_NAME}}",
            "--TARGET_USER_TABLE_NAME", "{Folder_Name}_User_Metrics_Snapshot_Cumulative",
            "--TARGET_PROJECT_TABLE_NAME", "{Folder_Name}_Workspace_Metrics_Snapshot_Cumulative",
            "--TARGET_COMPANY_TABLE_NAME", "{Folder_Name}_Account_Metrics_Snapshot_Cumulative"
        ]
    },
    "job_cluster_key": "{match_existing_cluster_key_in_job_file}"
}
```

### Placement Rules

- Daily: Look up the file path from `manifest.orchestration.domain_jobs.{domain}.daily`, add under `"tasks"`
- Cumulative: Look up from `manifest.orchestration.domain_jobs.{domain}.cumulative`, add under `"tasks"`
- `job_cluster_key` must match the existing tasks in the same file -- read the file and copy the pattern
- `task_key` must be unique within the file
- Table name params use `{Folder_Name}_{Grain}_Metrics_Snapshot_{Cadence}` format
- The `Folder_Name` comes from `manifest.folder_name_overrides` if the tool has a non-standard folder name, otherwise derive via `tool_name.replace('_', ' ').title().replace(' ', '_')`

---

## Phase 5 Validation and Multi-Source

For the dry-run validation protocol (4 mandatory checks: syntax, template substitution, column alignment, runner contract), see [phase-5-pipeline.md](../phase-5-pipeline.md) Dry-Run Validation Protocol.

For multi-source integration patterns (Pattern 2+), see [phase-5-pipeline.md](../phase-5-pipeline.md) Multi-Source Integration.
