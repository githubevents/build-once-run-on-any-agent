# dbt Standards Reference

Comprehensive dbt-specific standards for metric store pipelines.
Applies when `manifest.platform.pipeline_framework` is `dbt`.

---

## Jinja SQL Safety

### Never Use Raw `{{` or `}}` Outside Jinja Blocks

Every `{{` and `}}` in a `.sql` model file is interpreted by the Jinja templater. If you need literal curly braces in output SQL, use the `{% raw %}` block:

```sql
{% raw %}
SELECT '{"key": "value"}' AS json_literal
{% endraw %}
```

### Proper `{% set %}` Usage

Use `{% set %}` to define variables at the top of a model file. Never inline complex expressions in SQL -- extract them to named variables.

```sql
{% set snapshot_date = var("snapshot_date") %}
{% set source_zone = var("source_zone") %}
{% set grain_columns = ["account_id", "workspace_id", "user_id"] %}

WITH entity AS (
    SELECT
        account_id
        , workspace_id
        , user_id
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(created_at) = '{{ snapshot_date }}' THEN entity_id
                ELSE NULL
            END
        ) AS total_entity_create_count
    FROM {{ source('source_name', 'source_table') }}
    WHERE TO_DATE(created_at) = '{{ snapshot_date }}'
    GROUP BY ALL
)

SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{{ source_zone }}' AS SOURCE_ZONE
    , *
FROM entity
```

### Never Use Backslash (`\`) in Jinja

Jinja does not support backslash line continuation. If an expression is too long, break it across lines using parentheses or restructure the logic:

```sql
-- WRONG: backslash continuation
{% set long_list = ["account_id", "workspace_id", \
    "user_id"] %}

-- CORRECT: natural line break within brackets
{% set long_list = [
    "account_id"
    , "workspace_id"
    , "user_id"
] %}
```

### Whitespace Control

Use the `-` modifier on Jinja tags to strip leading/trailing whitespace and produce clean compiled SQL:

```sql
{%- set snapshot_date = var("snapshot_date") -%}

SELECT
    {%- for col in grain_columns %}
    {{ col }}
    {%- if not loop.last %},{% endif %}
    {%- endfor %}
FROM {{ source('source_name', 'source_table') }}
```

### Jinja Comments

Use Jinja comments (`{# ... #}`) instead of SQL comments (`-- ...`) for template-level documentation that should not appear in compiled SQL:

```sql
{# This CTE filters to the snapshot date and computes create counts #}
WITH entity AS (
    ...
)
```

Use SQL comments for documentation that should survive compilation:

```sql
-- INNER JOIN: child always has a parent; grain applied in final FULL OUTER JOIN
INNER JOIN {{ source('source_name', 'child_table') }} child
    ON parent.parent_id = child.parent_id
```

---

## Model Naming Conventions

### Pattern

```
{domain}__{entity}_metrics_snapshot_{cadence}
```

### Components

| Component | Rule | Examples |
| :--- | :--- | :--- |
| `{domain}` | Domain name from manifest, `lowercase_snake_case` | `service_delivery`, `billing` |
| `__` | Double underscore separator between domain and entity | `__` |
| `{entity}` | Entity name, `lowercase_snake_case` | `change_request`, `ticket`, `sla` |
| `_metrics_snapshot_` | Fixed segment | `_metrics_snapshot_` |
| `{cadence}` | Temporal cadence | `daily`, `cumulative` |

### Examples

```
service_delivery__change_request_metrics_snapshot_daily
service_delivery__ticket_metrics_snapshot_cumulative
billing__budget_metrics_snapshot_daily
workforce__equipment_metrics_snapshot_cumulative
```

### Staging Models

Staging models that clean and rename source data use the prefix `stg_`:

```
stg_{source}__{source_table}
```

Examples:

```
stg_ram__change_request
stg_ram__tickets
stg_coredb__companies
```

### Intermediate Models

Intermediate models that combine or transform staging models use the prefix `int_`:

```
int_{domain}__{description}
```

Examples:

```
int_service_delivery__ticket_with_responses
int_billing__change_event_with_line_items
```

---

## schema.yml Patterns

Every model must have a corresponding entry in a `schema.yml` file within the same directory.

### Model Documentation

```yaml
version: 2

models:
  - name: service_delivery__change_request_metrics_snapshot_daily
    description: >
      Daily snapshot of change request metrics aggregated to the user grain.
      Partitioned by SNAPSHOT_DATE. One row per (account_id, workspace_id, user_id, SNAPSHOT_DATE).
    config:
      tags: ["daily_snapshot", "service_delivery"]
    columns:
      - name: SNAPSHOT_DATE
        description: "The date for which this daily snapshot is created"
        tests:
          - not_null
      - name: LOAD_TIMESTAMP
        description: "Timestamp when data is loaded into this table"
        tests:
          - not_null
      - name: SOURCE_ZONE
        description: "Zone (zone1, zone2, etc.) for which activity is represented"
        tests:
          - not_null
          - accepted_values:
              # Values from manifest.platform.zones[].id (uppercased)
              # Example (project-specific): ['zone1', 'zone2', 'zone3']
              values: ["zone1", "zone2", "zone3"]
      - name: account_id
        description: "Company identifier"
        tests:
          - not_null
      - name: workspace_id
        description: "Project identifier"
        tests:
          - not_null
      - name: user_id
        description: "User identifier"
        tests:
          - not_null
      - name: total_change_request_create_count
        description: "Total Change Request Creates by this User on this Snapshot_Date"
        tests:
          - not_null
      - name: total_change_request_update_count
        description: "Total Change Request Updates by this User on this Snapshot_Date"
        tests:
          - not_null
```

### Column Description Rules

1. Every column must have a `description`.
2. Descriptions must be grain-contextual (see the naming-grammar reference for suffix patterns).
3. System columns (`SNAPSHOT_DATE`, `LOAD_TIMESTAMP`, `SOURCE_ZONE`) use fixed descriptions.
4. Metric columns describe what is counted in business terms, not SQL logic.

### Tests Per Column

| Column Type | Required Tests | Optional Tests |
| :--- | :--- | :--- |
| System columns | `not_null` | `accepted_values` for `SOURCE_ZONE` |
| Grain columns | `not_null` | `relationships` to dimension tables |
| Metric columns | `not_null` | `dbt_utils.expression_is_true` for `>= 0` |
| Composite key | `dbt_utils.unique_combination_of_columns` on the grain | |

### Composite Key Uniqueness

```yaml
models:
  - name: service_delivery__change_request_metrics_snapshot_daily
    tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns:
            - SNAPSHOT_DATE
            - SOURCE_ZONE
            - account_id
            - workspace_id
            - user_id
```

---

## Source Definitions

### sources.yml

Every external table referenced in models must be defined in a `sources.yml` file.

```yaml
version: 2

sources:
  - name: source_a
    description: "Gold layer source tables for the service desk domain"
    # Database resolved from manifest.catalogs.sources[name=source_a_gold].pattern with zone suffix
    # Example (project-specific): demo_gold_source_a_zone1
    database: "{{ var('source_a_catalog', 'demo_gold_source_a_zone1') }}"
    schema: "service_delivery"
    freshness:
      warn_after:
        count: 24
        period: hour
      error_after:
        count: 48
        period: hour
    loaded_at_field: "_metadata.file_modification_time"
    tables:
      - name: change_request
        description: "Change requests created within a workspace"
        columns:
          - name: change_request_id
            description: "Primary key"
            tests:
              - unique
              - not_null
      - name: tickets
        description: "Request for Information records"
        columns:
          - name: ticket_header_id
            description: "Primary key"
            tests:
              - unique
              - not_null
```

### Freshness Configuration

Every source table must define `freshness` at the source level or override at the table level:

| Threshold | Meaning | Recommended |
| :--- | :--- | :--- |
| `warn_after` | Data older than this triggers a warning in `dbt source freshness` | 24 hours for daily sources |
| `error_after` | Data older than this triggers an error in `dbt source freshness` | 48 hours for daily sources |

### loaded_at_field

Use the most reliable timestamp field from the source. Common options:

```yaml
loaded_at_field: "_metadata.file_modification_time"  # Platform metadata (e.g., Delta Lake on Databricks)
loaded_at_field: "updated_at"                         # Application timestamp
loaded_at_field: "_etl_loaded_at"                     # ETL-provided timestamp
```

---

## Test Expectations

### Grain Columns: not_null

Every grain column must have a `not_null` test. Grain columns define the row identity.

### Composite Keys: unique_combination_of_columns

The combination of `SNAPSHOT_DATE + SOURCE_ZONE + {grain_columns}` must be unique:

```yaml
tests:
  - dbt_utils.unique_combination_of_columns:
      combination_of_columns:
        - SNAPSHOT_DATE
        - SOURCE_ZONE
        - account_id
        - workspace_id
        - user_id
```

### Foreign Keys: relationships

Grain columns that reference dimension tables should have a `relationships` test:

```yaml
columns:
  - name: account_id
    tests:
      - not_null
      - relationships:
          to: ref('dim_company')
          field: account_id
  - name: workspace_id
    tests:
      - not_null
      - relationships:
          to: ref('dim_project')
          field: workspace_id
```

### Metric Columns: Non-Negative

Metric count columns should never be negative. Use a custom test or expression check:

```yaml
columns:
  - name: total_change_request_create_count
    tests:
      - not_null
      - dbt_utils.expression_is_true:
          expression: ">= 0"
```

### Data Tests (Custom SQL)

For complex validation that cannot be expressed as schema tests, create data tests in the `tests/` directory:

```sql
-- tests/assert_no_duplicate_grain_rows.sql
SELECT
    SNAPSHOT_DATE
    , SOURCE_ZONE
    , account_id
    , workspace_id
    , user_id
    , COUNT(*) AS row_count
FROM {{ ref('service_delivery__change_request_metrics_snapshot_daily') }}
GROUP BY ALL
HAVING COUNT(*) > 1
```

A passing data test returns zero rows.

---

## Materialization Patterns

### Incremental with Merge (Default for Metric Snapshots)

```sql
{{ config(
    materialized='incremental'
    , incremental_strategy='merge'
    , unique_key=['SNAPSHOT_DATE', 'SOURCE_ZONE', 'account_id', 'workspace_id', 'user_id']
    , partition_by=['SNAPSHOT_DATE']
    , on_schema_change='append_new_columns'
) }}
```

Use when:
- The model is a daily or cumulative metric snapshot
- Rows are upserted based on the grain + SNAPSHOT_DATE composite key
- Idempotent reruns should update existing rows, not create duplicates

### Incremental with Insert Overwrite (Partition Replacement)

```sql
{{ config(
    materialized='incremental'
    , incremental_strategy='insert_overwrite'
    , partition_by=['SNAPSHOT_DATE']
    , on_schema_change='append_new_columns'
) }}
```

Use when:
- The entire partition is rebuilt on each run
- No need to merge individual rows
- Equivalent to the spark_python `INSERT OVERWRITE ... PARTITION` pattern

### Table (Full Refresh)

```sql
{{ config(
    materialized='table'
) }}
```

Use when:
- The model is small enough to rebuild completely each run
- The model is a reference/dimension table
- Historical partitioning is not needed

### View (Staging)

```sql
{{ config(
    materialized='view'
) }}
```

Use when:
- The model is a lightweight transformation on top of a source table
- The model is used for staging (renaming columns, type casting, filtering)
- Compute-on-read is acceptable

### Ephemeral (CTE Injection)

```sql
{{ config(
    materialized='ephemeral'
) }}
```

Use when:
- The model is a reusable CTE that should be inlined into downstream models
- No physical table or view is needed
- The model is used only for code organization

---

## on_schema_change Configuration

### Options

| Setting | Behavior | When to Use |
| :--- | :--- | :--- |
| `append_new_columns` | New columns are added to the target table. Existing columns are not modified or removed. | Default for metric snapshots. Safe for additive schema changes. |
| `sync_all_columns` | Target schema is synchronized to match the model. Columns added, types changed, columns removed. | Use with caution. Only for full-refresh models or when intentional schema migrations are needed. |
| `ignore` | Schema changes are ignored. New columns in the model are silently dropped. | Use only for views or when schema management is handled externally. |
| `fail` | The run fails if a schema change is detected. | Use when schema changes must go through a formal migration process. |

### Recommendation

```yaml
on_schema_change: 'append_new_columns'
```

This is the safest default for metric pipelines. New metrics can be added without disrupting existing columns or data.

---

## Macro Conventions

### Reusable Metric Calculations

Create macros for commonly repeated SQL patterns:

```sql
-- macros/metrics/count_distinct_on_date.sql
{% macro count_distinct_on_date(id_column, date_column, snapshot_date, alias) %}
    COUNT(
        DISTINCT CASE
            WHEN TO_DATE({{ date_column }}) = '{{ snapshot_date }}' THEN {{ id_column }}
            ELSE NULL
        END
    ) AS {{ alias }}
{% endmacro %}
```

Usage in a model:

```sql
SELECT
    account_id
    , workspace_id
    , user_id
    , {{ count_distinct_on_date('entity_id', 'created_at', var('snapshot_date'), 'total_entity_create_count') }}
    , {{ count_distinct_on_date('entity_id', 'updated_at', var('snapshot_date'), 'total_entity_update_count') }}
FROM {{ source('source_name', 'source_table') }}
WHERE
    TO_DATE(created_at) = '{{ var("snapshot_date") }}'
    OR TO_DATE(updated_at) = '{{ var("snapshot_date") }}'
GROUP BY ALL
```

### Update Count Macro (Excludes Same-Day Creates)

```sql
-- macros/metrics/count_distinct_update_on_date.sql
{% macro count_distinct_update_on_date(id_column, updated_column, created_column, snapshot_date, alias) %}
    COUNT(
        DISTINCT CASE
            WHEN TO_DATE({{ updated_column }}) = '{{ snapshot_date }}'
            AND TO_DATE({{ updated_column }}) != TO_DATE({{ created_column }}) THEN {{ id_column }}
            ELSE NULL
        END
    ) AS {{ alias }}
{% endmacro %}
```

### COALESCE Grain Macro

```sql
-- macros/joins/coalesce_grain_columns.sql
{% macro coalesce_grain_columns(grain_columns, aliases) %}
    {%- for col in grain_columns %}
    COALESCE(
        {%- for alias in aliases %}{{ alias }}.{{ col }}{% if not loop.last %}, {% endif %}{%- endfor %}
    ) AS {{ col }}
    {%- if not loop.last %},{% endif %}
    {%- endfor %}
{% endmacro %}
```

Usage:

```sql
{{ coalesce_grain_columns(
    grain_columns=["account_id", "workspace_id", "user_id"],
    aliases=["a", "b", "c"]
) }}
```

### Full Outer Join Condition Macro

```sql
-- macros/joins/full_outer_join_on.sql
{% macro full_outer_join_on(grain_columns, left_alias, right_alias) %}
    ON {% for col in grain_columns %}{{ left_alias }}.{{ col }} = {{ right_alias }}.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
{% endmacro %}
```

### Macro File Organization

```
macros/
  metrics/
    count_distinct_on_date.sql
    count_distinct_update_on_date.sql
    pivot_metric_by_type.sql
  joins/
    coalesce_grain_columns.sql
    full_outer_join_on.sql
    chained_full_outer_join_on.sql
  schema/
    generate_schema_name.sql
    generate_alias_name.sql
  tests/
    test_metric_name_convention.sql
    test_no_duplicate_grain_rows.sql
```

---

## dbt Project Structure

Aligned with the dataforge manifest `domains` taxonomy:

```
models/
  staging/
    stg_ram/
      stg_ram__change_request.sql
      stg_ram__tickets.sql
      stg_ram__ticket_responses.sql
      stg_ram__sources.yml
      stg_ram__schema.yml
    stg_coredb/
      stg_coredb__companies.sql
      stg_coredb__projects.sql
      stg_coredb__sources.yml
      stg_coredb__schema.yml
  intermediate/
    int_service_delivery/
      int_service_delivery__ticket_with_responses.sql
      int_service_delivery__schema.yml
  marts/
    service_delivery/
      service_delivery__change_request_metrics_snapshot_daily.sql
      service_delivery__change_request_metrics_snapshot_cumulative.sql
      service_delivery__ticket_metrics_snapshot_daily.sql
      service_delivery__ticket_metrics_snapshot_cumulative.sql
      service_delivery__schema.yml
    billing/
      billing__budget_metrics_snapshot_daily.sql
      billing__budget_metrics_snapshot_cumulative.sql
      billing__schema.yml
    workforce/
      workforce__equipment_metrics_snapshot_daily.sql
      workforce__schema.yml
    all_combined/
      all_combined__metrics_snapshot_daily.sql
      all_combined__schema.yml
    adoption/
      adoption__user_project_metrics_snapshot_daily_long.sql
      adoption__user_project_metrics_snapshot_monthly_long.sql
      adoption__schema.yml
macros/
  metrics/
  joins/
  schema/
  tests/
seeds/
tests/
  assert_no_duplicate_grain_rows.sql
  assert_metric_columns_non_negative.sql
```

### Directory-to-Domain Mapping

The `models/marts/` subdirectories map 1:1 to manifest `domains`:

```yaml
domains:
  service_delivery:
    tools: [change_request, sla, ...]
  billing:
    tools: [budget, change_event, ...]
```

Maps to:

```
models/marts/service_delivery/   -> service_delivery domain
models/marts/billing/          -> billing domain
```

### Tags

Use tags to group models by cadence for selective execution:

```sql
{{ config(
    tags=["daily_snapshot", "service_delivery"]
) }}
```

Run only daily snapshots:

```bash
dbt run --select tag:daily_snapshot
```

Run a specific domain:

```bash
dbt run --select tag:service_delivery
```

---

## Quality Gates

### Gate 1: dbt compile

Every model must compile without errors before code review:

```bash
dbt compile --select {model_name}
```

Verify the compiled SQL in `target/compiled/` matches expected output. Check for:
- Correct source references resolved
- Variables interpolated correctly
- No orphaned Jinja tags or syntax errors
- SQL structure matches the intended join pattern

### Gate 2: dbt test

All schema tests and data tests must pass:

```bash
dbt test --select {model_name}
```

### Gate 3: Column Coverage in schema.yml

Every column in the model must have a corresponding entry in `schema.yml` with:
- A description
- At least one test

Check coverage:

```bash
dbt docs generate
# Inspect catalog.json for undocumented columns
```

### Gate 4: Source Freshness

Source freshness must be validated before pipeline runs:

```bash
dbt source freshness --select source:{source_name}
```

### Gate 5: Naming Convention Compliance

All model names, column names, and metric aliases must pass the naming grammar regex:

```bash
# Use a custom dbt test or a CI script that:
# 1. Parses schema.yml for all column names
# 2. Validates each metric column against naming.metric_regex from manifest
# 3. Validates model names against the {domain}__{entity}_metrics_snapshot_{cadence} pattern
```

### Gate 6: Incremental Model Idempotency

Incremental models must produce identical results when run twice on the same snapshot_date:

```bash
dbt run --select {model_name} --vars '{"snapshot_date": "2026-04-23"}'
dbt run --select {model_name} --vars '{"snapshot_date": "2026-04-23"}'
# Row counts and values must be identical after both runs
```

### Gate 7: Full Refresh Compatibility

Incremental models must also work with `--full-refresh`:

```bash
dbt run --select {model_name} --full-refresh --vars '{"snapshot_date": "2026-04-23"}'
```

---

## Common Pitfalls

### Pitfall 1: Unquoted Jinja Variables in SQL Strings

```sql
-- WRONG: Jinja variable without quotes in a string context
WHERE TO_DATE(created_at) = {{ var("snapshot_date") }}

-- CORRECT: Jinja variable wrapped in SQL string quotes
WHERE TO_DATE(created_at) = '{{ var("snapshot_date") }}'
```

### Pitfall 2: Using `is incremental()` Incorrectly

The `is_incremental()` function returns `True` only when the model already has data and is not being run with `--full-refresh`:

```sql
{{ config(materialized='incremental', incremental_strategy='insert_overwrite', partition_by=['SNAPSHOT_DATE']) }}

SELECT ...
FROM {{ source('source_name', 'source_table') }}
WHERE
    TO_DATE(created_at) = '{{ var("snapshot_date") }}'
    OR TO_DATE(updated_at) = '{{ var("snapshot_date") }}'
{% if is_incremental() %}
    -- Additional filter for incremental runs (e.g., only process recent data)
{% endif %}
```

Do not use `is_incremental()` to define the core business logic. The query should produce correct results on both full refresh and incremental runs.

### Pitfall 3: Missing `GROUP BY ALL` Compatibility

`GROUP BY ALL` is supported on Databricks (Spark SQL) but may not be supported on all platforms. For maximum portability:

```sql
-- Databricks-specific (works with dbt-databricks adapter)
GROUP BY ALL

-- Portable alternative
GROUP BY
    account_id
    , workspace_id
    , user_id
```

If the manifest specifies `platform.engine: databricks`, `GROUP BY ALL` is acceptable.

### Pitfall 4: Hardcoded Catalog Names

Never hardcode catalog names in model files. Use `source()` or `ref()` which resolve through `sources.yml` and `profiles.yml`:

```sql
-- WRONG (hardcoded catalog -- project-specific value that should come from manifest.catalogs.sources)
FROM demo_gold_source_a_zone1.service_delivery.change_request

-- CORRECT
FROM {{ source('source_a', 'change_request') }}
```

### Pitfall 5: Missing var() Defaults

Always provide defaults for variables used in models:

```sql
-- In dbt_project.yml
vars:
  snapshot_date: "{{ run_started_at.strftime('%Y-%m-%d') }}"
  source_zone: "zone1"  # Default zone from manifest.platform.zones[0].id
```

Or in the model with a default:

```sql
{% set snapshot_date = var("snapshot_date", run_started_at.strftime('%Y-%m-%d')) %}
```
