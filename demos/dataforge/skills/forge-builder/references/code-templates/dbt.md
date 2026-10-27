# Code Templates -- dbt

Phase 4 and 5 reference for dbt model, sources.yml, and schema.yml templates. All project-specific values are resolved from the manifest. For full dbt conventions, see [dbt-standards.md](../../../forge-lint/references/dbt-standards.md).

---

## Model File Template (Daily)

```sql
{{ config(
    materialized='{manifest.dbt.materialization_default}',
    incremental_strategy='{manifest.dbt.incremental_strategy}',
    unique_key=['SNAPSHOT_DATE', 'account_id', 'workspace_id', 'user_id'],
    on_schema_change='sync_all_columns',
    tags=['{manifest.dbt.tags.daily}']
) }}

WITH {entity}_metrics AS (
    SELECT
        {{ dbt_utils.star(from=source('{dbt_source}', '{source_table}'), except=['_fivetran_synced']) }}
    FROM {{ source('{dbt_source}', '{source_table}') }}
    {% if is_incremental() %}
    WHERE
        TO_DATE(created_at) = '{{ var("snapshot_date") }}'
        OR TO_DATE(updated_at) = '{{ var("snapshot_date") }}'
    {% endif %}
)

, combined_metrics AS (
    SELECT
        {{ var("snapshot_date") }}::DATE AS SNAPSHOT_DATE
        , account_id
        , workspace_id
        , user_id
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(created_at) = '{{ var("snapshot_date") }}' THEN {entity_id}
                ELSE NULL
            END
        ) AS total_{entity}_create_count
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(updated_at) = '{{ var("snapshot_date") }}'
                AND TO_DATE(updated_at) != TO_DATE(created_at) THEN {entity_id}
                ELSE NULL
            END
        ) AS total_{entity}_update_count
    FROM {entity}_metrics
    GROUP BY ALL
)

SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{{ var("source_zone") }}' AS SOURCE_ZONE
    , *
FROM combined_metrics
```

**Manifest resolution:**
- `materialized` from `manifest.dbt.materialization_default`
- `incremental_strategy` from `manifest.dbt.incremental_strategy`
- `tags` from `manifest.dbt.tags.daily`
- `source()` macro uses `dbt_source` from `manifest.catalogs.sources[].dbt_source`
- `unique_key` grain columns from `manifest.grains.{grain}.columns`

---

## Model File Template (Cumulative)

```sql
{{ config(
    materialized='{manifest.dbt.materialization_default}',
    incremental_strategy='{manifest.dbt.incremental_strategy}',
    unique_key=['SNAPSHOT_DATE', 'account_id', 'workspace_id', 'user_id'],
    on_schema_change='sync_all_columns',
    tags=['{manifest.dbt.tags.cumulative}']
) }}

WITH {entity}_metrics AS (
    SELECT
        {{ var("snapshot_date") }}::DATE AS SNAPSHOT_DATE
        , account_id
        , workspace_id
        , user_id
        , COUNT(DISTINCT {entity_id}) AS total_{entity}_create_count
    FROM {{ source('{dbt_source}', '{source_table}') }}
    WHERE TO_DATE(created_at) <= '{{ var("snapshot_date") }}'
    GROUP BY ALL
)

SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{{ var("source_zone") }}' AS SOURCE_ZONE
    , *
FROM {entity}_metrics
```

---

## sources.yml Template

```yaml
version: 2

sources:
  - name: {dbt_source}
    description: "Source tables from {catalog_description}"
    database: "{source_catalog_resolved}"
    schema: "{source_schema}"
    tables:
      - name: {source_table}
        description: "{Entity} source table"
        columns:
          - name: id
            description: "Primary key"
            tests:
              - not_null
              - unique
          - name: created_at
            description: "Creation timestamp"
          - name: updated_at
            description: "Last update timestamp"
```

**Manifest resolution:**
- `dbt_source` from `manifest.catalogs.sources[].dbt_source`
- `source_catalog_resolved` from `manifest.catalogs.sources[].pattern` with the active zone suffix
- `source_schema` from the discovered source table path (schema component)
- Optional extension point: teams may add `dbt_database` and `dbt_schema` to each source catalog entry; if present, those values can be used directly instead of deriving from pattern/path.

---

## schema.yml Template

```yaml
version: 2

models:
  - name: {domain}__{entity}_metrics_snapshot_{cadence}
    description: "{Entity} {grain}-grain {cadence} metrics"
    config:
      tags: ['{manifest.dbt.tags.{cadence}}']
    columns:
      - name: SNAPSHOT_DATE
        description: "The date for which this snapshot is created"
        tests:
          - not_null
      - name: LOAD_TIMESTAMP
        description: "Timestamp when data is loaded"
      - name: SOURCE_ZONE
        description: "Zone for which activity is represented"
        tests:
          - not_null
          - accepted_values:
              # Values from manifest.platform.zones[].id (uppercased)
              # Example (project-specific): ['zone1', 'zone2', 'zone3']
              values: ['zone1', 'zone2', 'zone3']
      - name: account_id
        description: "Company Id"
        tests:
          - not_null
      - name: workspace_id
        description: "Project Id"
        tests:
          - not_null
      - name: user_id
        description: "User Id who performed the activity"
        tests:
          - not_null
      - name: total_{entity}_create_count
        description: "Total {Entity} creates {grain_suffix}"
      - name: total_{entity}_update_count
        description: "Total {Entity} updates {grain_suffix}"
```

**Manifest resolution:**
- Model naming: `{domain}__{entity}_metrics_snapshot_{cadence}` (double underscore per forge-lint dbt standards)
- `accepted_values` for SOURCE_ZONE from `manifest.platform.zones[].id` (uppercased)
- Grain columns from `manifest.grains.{grain}.columns`
- Grain suffix follows the same pattern as spark_python COMMENT suffixes

---

## Grain Restriction (dbt)

For inactive grains, use a Jinja conditional to skip the grain's model:

```sql
{% if var('active_grains', ['user', 'workspace', 'account']) | selectattr('eq', 'user') %}
-- User grain model content
{% endif %}
```

Or configure per-model tags to control which grains are active:

```yaml
models:
  - name: {domain}__{entity}_user_metrics_snapshot_daily
    config:
      enabled: false  # User grain inactive for this entity
```

---

## dbt Commands for Validation

Zone value from `manifest.platform.zones[].id`. Examples below use project-specific zone `zone1`.

```bash
# Compile to verify SQL
dbt compile --select {domain}__{entity}_metrics_snapshot_{cadence}

# Run the model (zone is project-specific -- from manifest.platform.zones[].id)
dbt run --select {domain}__{entity}_metrics_snapshot_{cadence} --vars '{"snapshot_date": "YYYY-MM-DD", "source_zone": "zone1"}'

# Test the model
dbt test --select {domain}__{entity}_metrics_snapshot_{cadence}

# Full refresh (backfill)
dbt run --full-refresh --select {domain}__{entity}_metrics_snapshot_{cadence} --vars '{"snapshot_date": "YYYY-MM-DD", "source_zone": "zone1"}'
```

---

## Cross-Reference

For full dbt conventions including Jinja safety rules, model naming, materialization patterns, macro conventions, and testing requirements, see [forge-lint dbt-standards.md](../../../forge-lint/references/dbt-standards.md).
