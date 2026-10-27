# Join Patterns Reference

Complete SQL templates for every join strategy used in metric pipelines.
Each pattern includes the f-string (spark_python) and dbt (Jinja SQL) variants.

Placeholders used throughout:
- `{grain_columns}` -- list of grain column names (e.g., `['account_id', 'workspace_id', 'user_id']`)
- `{source_catalog}` -- fully qualified source catalog, resolved from `manifest.catalogs.sources[].pattern` with zone suffix (e.g., `demo_gold_source_a_zone1`)
- `{entity}` -- the pipeline entity name (e.g., `change_request`, `ticket`)
- `{snapshot_date}` -- the partition date being processed
- `{table_name}` -- the fully qualified target table

---

## Decision Tree

```
How many source tables/CTEs produce metrics?
|
+-- 1 table ............... Pattern 1: Single CTE
|
+-- 2 tables .............. Pattern 2: 2-CTE FULL OUTER JOIN
|
+-- 3+ tables
|   |
|   +-- All share same grain? .... Pattern 3: Chained FULL OUTER JOIN
|   |
|   +-- Sparse grain overlap? .... Pattern 4: UNION + LEFT JOIN
|
+-- Parent-child within CTE? ..... Pattern 5: INNER JOIN
|
+-- Type breakdowns in single source?
|   |
|   +-- Many types (10+)? ........ Use UNION ALL + NAMED_STRUCT
|   |
|   +-- Few types (3-5)? ......... Pattern 6: GROUPING SETS + Pivot
|
+-- All-entity aggregation? ...... Pattern 7: base_dimensions + LEFT JOIN
```

---

## Pattern 1: Single CTE

**When:** One source table, no joins needed.

### spark_python (f-string)

```python
select_columns = ',\n        '.join(grain_columns)
sql_query = f"""
INSERT OVERWRITE {table_name} PARTITION (SNAPSHOT_DATE = DATE '{snapshot_date}') BY NAME
WITH {entity} AS (
    SELECT
        {select_columns}
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(created_at) = '{snapshot_date}' THEN {entity}_id
                ELSE NULL
            END
        ) AS total_{entity}_create_count
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(updated_at) = '{snapshot_date}'
                AND TO_DATE(updated_at) != TO_DATE(created_at) THEN {entity}_id
                ELSE NULL
            END
        ) AS total_{entity}_update_count
    FROM {source_catalog}.{source_schema}.{source_table}
    WHERE
        (
        TO_DATE(created_at) = '{snapshot_date}'
        OR TO_DATE(updated_at) = '{snapshot_date}'
        )
    GROUP BY ALL
)
SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{SOURCE_ZONE}' AS SOURCE_ZONE
    , *
FROM {entity}
"""
```

### dbt Variant

```sql
-- models/{domain}/{entity}/{entity}__metrics_snapshot_daily.sql
{{{{ config(
    materialized='incremental'
    , incremental_strategy='insert_overwrite'
    , partition_by=['SNAPSHOT_DATE']
) }}}}

WITH {entity} AS (
    SELECT
        {%- for col in grain_columns %}
        {{ col }}
        {%- if not loop.last %},{% endif %}
        {%- endfor %}
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(created_at) = '{{ var("snapshot_date") }}' THEN {{ entity }}_id
                ELSE NULL
            END
        ) AS total_{{ entity }}_create_count
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(updated_at) = '{{ var("snapshot_date") }}'
                AND TO_DATE(updated_at) != TO_DATE(created_at) THEN {{ entity }}_id
                ELSE NULL
            END
        ) AS total_{{ entity }}_update_count
    FROM {{ source('{source_name}', '{source_table}') }}
    WHERE
        TO_DATE(created_at) = '{{ var("snapshot_date") }}'
        OR TO_DATE(updated_at) = '{{ var("snapshot_date") }}'
    GROUP BY ALL
)
SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{{ var("source_zone") }}' AS SOURCE_ZONE
    , *
FROM {{ entity }}
```

Using `{{ ref() }}` when the source is a dbt model rather than a raw table:

```sql
FROM {{ ref('{upstream_model_name}') }}
```

---

## Pattern 2: 2-CTE FULL OUTER JOIN

**When:** Two source tables that may not share all grain combinations.

### spark_python (f-string)

```python
select_columns = ',\n        '.join(grain_columns)
sql_query = f"""
INSERT OVERWRITE {table_name} PARTITION (SNAPSHOT_DATE = DATE '{snapshot_date}') BY NAME
WITH entity_a_metrics AS (
    SELECT
        {select_columns}
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(a.created_at) = '{snapshot_date}' THEN a.entity_a_id
                ELSE NULL
            END
        ) AS total_entity_a_create_count
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(a.updated_at) = '{snapshot_date}'
                AND TO_DATE(a.updated_at) != TO_DATE(a.created_at) THEN a.entity_a_id
                ELSE NULL
            END
        ) AS total_entity_a_update_count
    FROM {source_catalog}.{source_schema}.source_table_a a
    WHERE
        TO_DATE(a.created_at) = '{snapshot_date}'
        OR TO_DATE(a.updated_at) = '{snapshot_date}'
    GROUP BY ALL
),
entity_b_metrics AS (
    SELECT
        {select_columns}
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(b.created_at) = '{snapshot_date}' THEN b.entity_b_id
                ELSE NULL
            END
        ) AS total_entity_b_create_count
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(b.updated_at) = '{snapshot_date}'
                AND TO_DATE(b.updated_at) != TO_DATE(b.created_at) THEN b.entity_b_id
                ELSE NULL
            END
        ) AS total_entity_b_update_count
    FROM {source_catalog}.{source_schema}.source_table_b b
    WHERE
        TO_DATE(b.created_at) = '{snapshot_date}'
        OR TO_DATE(b.updated_at) = '{snapshot_date}'
    GROUP BY ALL
),
combined_metrics AS (
    SELECT
        {', '.join([f"COALESCE(a.{{col}}, b.{{col}}) AS {{col}}" for col in grain_columns])}
        , COALESCE(a.total_entity_a_create_count, 0) AS total_entity_a_create_count
        , COALESCE(a.total_entity_a_update_count, 0) AS total_entity_a_update_count
        , COALESCE(b.total_entity_b_create_count, 0) AS total_entity_b_create_count
        , COALESCE(b.total_entity_b_update_count, 0) AS total_entity_b_update_count
    FROM entity_a_metrics a
    FULL OUTER JOIN entity_b_metrics b
        ON {' AND '.join([f"a.{{col}} = b.{{col}}" for col in grain_columns])}
)
SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{SOURCE_ZONE}' AS SOURCE_ZONE
    , *
FROM combined_metrics
"""
```

**Key f-string constructs:**

```python
# COALESCE grain columns across two CTEs
{', '.join([f"COALESCE(a.{col}, b.{col}) AS {col}" for col in grain_columns])}

# JOIN condition generation
{' AND '.join([f"a.{col} = b.{col}" for col in grain_columns])}
```

### dbt Variant

```sql
{{{{ config(
    materialized='incremental'
    , incremental_strategy='insert_overwrite'
    , partition_by=['SNAPSHOT_DATE']
) }}}}

WITH entity_a_metrics AS (
    SELECT
        {%- for col in grain_columns %}
        {{ col }},
        {%- endfor %}
        COUNT(
            DISTINCT CASE
                WHEN TO_DATE(a.created_at) = '{{ var("snapshot_date") }}' THEN a.entity_a_id
                ELSE NULL
            END
        ) AS total_entity_a_create_count
    FROM {{ source('{source_name}', 'source_table_a') }} a
    WHERE
        TO_DATE(a.created_at) = '{{ var("snapshot_date") }}'
        OR TO_DATE(a.updated_at) = '{{ var("snapshot_date") }}'
    GROUP BY ALL
),

entity_b_metrics AS (
    SELECT
        {%- for col in grain_columns %}
        {{ col }},
        {%- endfor %}
        COUNT(
            DISTINCT CASE
                WHEN TO_DATE(b.created_at) = '{{ var("snapshot_date") }}' THEN b.entity_b_id
                ELSE NULL
            END
        ) AS total_entity_b_create_count
    FROM {{ source('{source_name}', 'source_table_b') }} b
    WHERE
        TO_DATE(b.created_at) = '{{ var("snapshot_date") }}'
        OR TO_DATE(b.updated_at) = '{{ var("snapshot_date") }}'
    GROUP BY ALL
),

combined_metrics AS (
    SELECT
        {%- for col in grain_columns %}
        COALESCE(a.{{ col }}, b.{{ col }}) AS {{ col }},
        {%- endfor %}
        COALESCE(a.total_entity_a_create_count, 0) AS total_entity_a_create_count
        , COALESCE(b.total_entity_b_create_count, 0) AS total_entity_b_create_count
    FROM entity_a_metrics a
    FULL OUTER JOIN entity_b_metrics b
        ON {% for col in grain_columns %}a.{{ col }} = b.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
)

SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{{ var("source_zone") }}' AS SOURCE_ZONE
    , *
FROM combined_metrics
```

---

## Pattern 3: 3+ CTE Chained FULL OUTER JOIN

**When:** Three or more source tables that all share the same grain.

### spark_python (f-string)

```python
select_columns = ',\n        '.join(grain_columns)
sql_query = f"""
...
combined_metrics AS (
    SELECT
        {', '.join([f"COALESCE(a.{{col}}, b.{{col}}, c.{{col}}) AS {{col}}" for col in grain_columns])}
        , COALESCE(a.total_entity_a_create_count, 0) AS total_entity_a_create_count
        , COALESCE(b.total_entity_b_create_count, 0) AS total_entity_b_create_count
        , COALESCE(c.total_entity_c_create_count, 0) AS total_entity_c_create_count
    FROM entity_a a
    FULL OUTER JOIN entity_b b
        ON {' AND '.join([f"a.{{col}} = b.{{col}}" for col in grain_columns])}
    FULL OUTER JOIN entity_c c
        ON {' AND '.join([f"COALESCE(a.{{col}}, b.{{col}}) = c.{{col}}" for col in grain_columns])}
)
...
"""
```

**Critical:** The second+ FULL OUTER JOIN ON clause must use `COALESCE(a.{col}, b.{col}) = c.{col}` to capture rows that only exist in `b`. Each subsequent join adds another layer to the COALESCE chain:

```python
# 4th CTE join condition
COALESCE(a.{col}, b.{col}, c.{col}) = d.{col}
```

### dbt Variant

```sql
combined_metrics AS (
    SELECT
        {%- for col in grain_columns %}
        COALESCE(a.{{ col }}, b.{{ col }}, c.{{ col }}) AS {{ col }},
        {%- endfor %}
        COALESCE(a.total_entity_a_create_count, 0) AS total_entity_a_create_count
        , COALESCE(b.total_entity_b_create_count, 0) AS total_entity_b_create_count
        , COALESCE(c.total_entity_c_create_count, 0) AS total_entity_c_create_count
    FROM entity_a a
    FULL OUTER JOIN entity_b b
        ON {% for col in grain_columns %}a.{{ col }} = b.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
    FULL OUTER JOIN entity_c c
        ON {% for col in grain_columns %}COALESCE(a.{{ col }}, b.{{ col }}) = c.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
)
```

---

## Pattern 4: UNION + LEFT JOIN

**When:** Four or more sparse CTEs where few grain combinations overlap. Builds a complete dimension set first, then LEFT JOINs each CTE.

### spark_python (f-string)

```python
select_columns = ",\n        ".join(grain_columns)
join_conditions = ' AND '.join([f"base.{{col}} = {{alias}}.{{col}}" for col in grain_columns])

sql_query = f"""
...
all_dimensions AS (
    SELECT {select_columns} FROM entity_a_metrics
    UNION
    SELECT {select_columns} FROM entity_b_metrics
    UNION
    SELECT {select_columns} FROM entity_c_metrics
    UNION
    SELECT {select_columns} FROM entity_d_metrics
)
SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{SOURCE_ZONE}' AS SOURCE_ZONE
    , {', '.join([f"base.{{col}}" for col in grain_columns])}
    , COALESCE(a.total_entity_a_create_count, 0) AS total_entity_a_create_count
    , COALESCE(b.total_entity_b_create_count, 0) AS total_entity_b_create_count
    , COALESCE(c.total_entity_c_create_count, 0) AS total_entity_c_create_count
    , COALESCE(d.total_entity_d_create_count, 0) AS total_entity_d_create_count
FROM all_dimensions base
LEFT JOIN entity_a_metrics a
    ON {join_conditions.format(alias='a')}
LEFT JOIN entity_b_metrics b
    ON {join_conditions.format(alias='b')}
LEFT JOIN entity_c_metrics c
    ON {join_conditions.format(alias='c')}
LEFT JOIN entity_d_metrics d
    ON {join_conditions.format(alias='d')}
...
"""
```

**Key:** Uses `UNION` (not `UNION ALL`) for `all_dimensions` to deduplicate grain rows. Uses `.format(alias=...)` on a pre-built join template for dynamic alias injection.

### dbt Variant

```sql
all_dimensions AS (
    {%- for cte_name in cte_names %}
    SELECT
        {%- for col in grain_columns %}
        {{ col }}{% if not loop.last %},{% endif %}
        {%- endfor %}
    FROM {{ cte_name }}
    {% if not loop.last %}UNION{% endif %}
    {%- endfor %}
)

SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{{ var("source_zone") }}' AS SOURCE_ZONE
    {%- for col in grain_columns %}
    , base.{{ col }}
    {%- endfor %}
    , COALESCE(a.total_entity_a_create_count, 0) AS total_entity_a_create_count
    , COALESCE(b.total_entity_b_create_count, 0) AS total_entity_b_create_count
FROM all_dimensions base
LEFT JOIN entity_a_metrics a
    ON {% for col in grain_columns %}base.{{ col }} = a.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
LEFT JOIN entity_b_metrics b
    ON {% for col in grain_columns %}base.{{ col }} = b.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
```

---

## Pattern 5: INNER JOIN (Parent-Child Within a CTE)

**When:** A child table must be joined to its parent within a single CTE. The grain is applied in the final FULL OUTER JOIN, not in the INNER JOIN.

### spark_python (f-string)

```python
select_columns = ',\n        '.join(grain_columns)
join_conditions = ' AND '.join(f'parent.{c} = child.{c}' for c in grain_columns)

sql_query = f"""
...
child_entity_metrics AS (
    SELECT
        {', '.join([f"parent.{{col}}" for col in grain_columns])}
        , COUNT(DISTINCT child.child_entity_id) AS total_child_entity_create_count
    FROM {source_catalog}.{source_schema}.parent_table parent
    INNER JOIN {source_catalog}.{source_schema}.child_table child
        ON parent.parent_entity_id = child.parent_entity_id
    WHERE TO_DATE(child.created_at) = '{snapshot_date}'
        AND child.some_filter_column IS NOT NULL
    GROUP BY ALL
),
combined_metrics AS (
    SELECT
        {', '.join([f"COALESCE(a.{{col}}, b.{{col}}) AS {{col}}" for col in grain_columns])}
        , COALESCE(a.total_parent_entity_create_count, 0) AS total_parent_entity_create_count
        , COALESCE(b.total_child_entity_create_count, 0) AS total_child_entity_create_count
    FROM parent_entity_metrics a
    FULL OUTER JOIN child_entity_metrics b
        ON {' AND '.join([f"a.{{col}} = b.{{col}}" for col in grain_columns])}
)
...
"""
```

**Rule:** INNER JOIN is only used within a CTE for parent-child relationships where every child always has a parent. The final merge CTE always uses FULL OUTER JOIN.

### dbt Variant

```sql
child_entity_metrics AS (
    SELECT
        {%- for col in grain_columns %}
        parent.{{ col }},
        {%- endfor %}
        COUNT(DISTINCT child.child_entity_id) AS total_child_entity_create_count
    FROM {{ source('{source_name}', 'parent_table') }} parent
    INNER JOIN {{ source('{source_name}', 'child_table') }} child
        ON parent.parent_entity_id = child.parent_entity_id
    WHERE TO_DATE(child.created_at) = '{{ var("snapshot_date") }}'
        AND child.some_filter_column IS NOT NULL
    GROUP BY ALL
),

combined_metrics AS (
    SELECT
        {%- for col in grain_columns %}
        COALESCE(a.{{ col }}, b.{{ col }}) AS {{ col }},
        {%- endfor %}
        COALESCE(a.total_parent_entity_create_count, 0) AS total_parent_entity_create_count
        , COALESCE(b.total_child_entity_create_count, 0) AS total_child_entity_create_count
    FROM parent_entity_metrics a
    FULL OUTER JOIN child_entity_metrics b
        ON {% for col in grain_columns %}a.{{ col }} = b.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
)
```

---

## Pattern 6: GROUPING SETS + Pivot

**When:** Type breakdowns from a single source table. Avoids creating separate CTEs per type.

### spark_python (f-string)

```python
sql_query = f"""
...
entity_by_type AS (
    SELECT
        {select_columns}
        , category_column AS entity_category
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(created_at) = '{snapshot_date}' THEN entity_id
                ELSE NULL
            END
        ) AS total_create_count
    FROM {source_catalog}.{source_schema}.{source_table}
    WHERE
        TO_DATE(created_at) = '{snapshot_date}'
        OR TO_DATE(updated_at) = '{snapshot_date}'
    GROUP BY ALL
),
entity_pivoted AS (
    SELECT
        {select_columns}
        , MAX(CASE WHEN entity_category = 'TypeA' THEN total_create_count END) AS total_type_a_entity_create_count
        , MAX(CASE WHEN entity_category = 'TypeB' THEN total_create_count END) AS total_type_b_entity_create_count
        , MAX(CASE WHEN entity_category = 'TypeC' THEN total_create_count END) AS total_type_c_entity_create_count
    FROM entity_by_type
    GROUP BY {select_columns}
)
...
"""
```

### dbt Variant

```sql
entity_by_type AS (
    SELECT
        {%- for col in grain_columns %}
        {{ col }},
        {%- endfor %}
        category_column AS entity_category
        , COUNT(
            DISTINCT CASE
                WHEN TO_DATE(created_at) = '{{ var("snapshot_date") }}' THEN entity_id
                ELSE NULL
            END
        ) AS total_create_count
    FROM {{ source('{source_name}', '{source_table}') }}
    WHERE
        TO_DATE(created_at) = '{{ var("snapshot_date") }}'
        OR TO_DATE(updated_at) = '{{ var("snapshot_date") }}'
    GROUP BY ALL
),

entity_pivoted AS (
    SELECT
        {%- for col in grain_columns %}
        {{ col }},
        {%- endfor %}
        MAX(CASE WHEN entity_category = 'TypeA' THEN total_create_count END) AS total_type_a_entity_create_count
        , MAX(CASE WHEN entity_category = 'TypeB' THEN total_create_count END) AS total_type_b_entity_create_count
        , MAX(CASE WHEN entity_category = 'TypeC' THEN total_create_count END) AS total_type_c_entity_create_count
    FROM entity_by_type
    GROUP BY {% for col in grain_columns %}{{ col }}{% if not loop.last %}, {% endif %}{% endfor %}
)
```

For dbt, a macro can standardize the pivot:

```sql
{% macro pivot_metric_by_type(types, metric_prefix, entity_name, count_col='total_create_count') %}
    {%- for type_val in types %}
    , MAX(CASE WHEN entity_category = '{{ type_val }}' THEN {{ count_col }} END)
        AS total_{{ type_val | lower | replace(' ', '_') }}_{{ entity_name }}_create_count
    {%- endfor %}
{% endmacro %}
```

---

## Pattern 7: base_dimensions + LEFT JOIN (All-Entity Aggregation)

**When:** Aggregating metrics from all entity tools into a single wide table.

### spark_python (f-string)

```python
sql_query = f"""
WITH base_dimensions AS (
    SELECT {select_columns} FROM entity_a_source
    UNION ALL
    SELECT {select_columns} FROM entity_b_source
    UNION ALL
    SELECT {select_columns} FROM entity_c_source
)
SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{SOURCE_ZONE}' AS SOURCE_ZONE
    , bd.*
    , COALESCE(a.total_entity_a_create_count, 0) AS total_entity_a_create_count
    , COALESCE(b.total_entity_b_create_count, 0) AS total_entity_b_create_count
    , COALESCE(c.total_entity_c_create_count, 0) AS total_entity_c_create_count
FROM base_dimensions bd
LEFT JOIN entity_a_source a
    ON {' AND '.join([f"bd.{{col}} = a.{{col}}" for col in grain_columns])}
LEFT JOIN entity_b_source b
    ON {' AND '.join([f"bd.{{col}} = b.{{col}}" for col in grain_columns])}
LEFT JOIN entity_c_source c
    ON {' AND '.join([f"bd.{{col}} = c.{{col}}" for col in grain_columns])}
"""
```

**Key:** Uses `UNION ALL` (not `UNION`) for `base_dimensions` because each source CTE already produces distinct grain rows. LEFT JOIN is safe because `base_dimensions` guarantees completeness.

### dbt Variant

```sql
WITH base_dimensions AS (
    {%- for entity in entities %}
    SELECT
        {%- for col in grain_columns %}
        {{ col }}{% if not loop.last %},{% endif %}
        {%- endfor %}
    FROM {{ ref('{domain}__' ~ entity.name ~ '_metrics_snapshot_daily') }}
    {% if not loop.last %}UNION ALL{% endif %}
    {%- endfor %}
)

SELECT
    CURRENT_TIMESTAMP AS LOAD_TIMESTAMP
    , '{{ var("source_zone") }}' AS SOURCE_ZONE
    , bd.*
    {%- for entity in entities %}
    , COALESCE({{ entity.alias }}.total_{{ entity.name }}_create_count, 0) AS total_{{ entity.name }}_create_count
    {%- endfor %}
FROM base_dimensions bd
{%- for entity in entities %}
LEFT JOIN {{ ref('{domain}__' ~ entity.name ~ '_metrics_snapshot_daily') }} {{ entity.alias }}
    ON {% for col in grain_columns %}bd.{{ col }} = {{ entity.alias }}.{{ col }}{% if not loop.last %} AND {% endif %}{% endfor %}
{%- endfor %}
```

---

## Supplementary Patterns

### Conditional Grain Filter

Used when a table may have NULL values in a grain column that should be excluded at certain grains but not others.

**spark_python:**

```python
WORKSPACE_ID_CHECK = "AND workspace_id IS NOT NULL" if 'workspace_id' in grain_columns else ""
```

Applied in WHERE clauses:

```python
WHERE (TO_DATE(created_at) = '{snapshot_date}' OR TO_DATE(updated_at) = '{snapshot_date}')
    {WORKSPACE_ID_CHECK}
```

**dbt Variant:**

```sql
WHERE
    (TO_DATE(created_at) = '{{ var("snapshot_date") }}' OR TO_DATE(updated_at) = '{{ var("snapshot_date") }}')
    {% if 'workspace_id' in grain_columns %}
    AND workspace_id IS NOT NULL
    {% endif %}
```

### Reduced Grain for Child CTEs

When a child table does not have a grain column (e.g., `user_id`), strip it from that CTE's grain:

**spark_python:**

```python
child_columns = [col for col in grain_columns if col != 'user_id']
child_select = ',\n        '.join(child_columns)
```

The final `combined_metrics` CTE handles the asymmetric grain:

```python
{', '.join([
    f"COALESCE(a.{col}, b.{col}) AS {col}" if col in child_columns
    else f"a.{col} AS {col}"
    for col in grain_columns
])}
```

**dbt Variant:**

```sql
{%- set child_columns = grain_columns | reject('equalto', 'user_id') | list %}

-- In the combined_metrics CTE:
{%- for col in grain_columns %}
    {%- if col in child_columns %}
    COALESCE(a.{{ col }}, b.{{ col }}) AS {{ col }}
    {%- else %}
    a.{{ col }} AS {{ col }}
    {%- endif %}
    {%- if not loop.last %},{% endif %}
{%- endfor %}
```

### COALESCE Coercion for NULL Grain Keys

When a grain column can be NULL in source data but must not be NULL in the metric output, use COALESCE with a sentinel value:

```python
f"COALESCE({col}, -1) AS {col}"
```

**dbt Variant:**

```sql
COALESCE({{ col }}, -1) AS {{ col }}
```

### UNION ALL + NAMED_STRUCT (Many-Type Pattern)

When many sub-types (10+) share the same metric structure, create one CTE per type with identical column names, UNION ALL them, then aggregate into a struct:

**spark_python:**

```python
# Each CTE produces: {select_columns}, type_name, total_create_count, total_update_count
# UNION ALL combines them with a type discriminator column
# Final aggregate uses ARRAY_AGG(NAMED_STRUCT('type_name', type_name, 'create_count', total_create_count, ...))
```

**dbt Variant:**

```sql
{%- for type_def in type_definitions %}
{{ type_def.name }}_metrics AS (
    SELECT
        {%- for col in grain_columns %}
        {{ col }},
        {%- endfor %}
        '{{ type_def.label }}' AS type_name
        , COUNT(DISTINCT CASE WHEN TO_DATE(created_at) = '{{ var("snapshot_date") }}' THEN id END) AS total_create_count
    FROM {{ source('{source_name}', '{{ type_def.table }}') }}
    WHERE TO_DATE(created_at) = '{{ var("snapshot_date") }}'
    GROUP BY ALL
),
{%- endfor %}

all_types AS (
    {%- for type_def in type_definitions %}
    SELECT * FROM {{ type_def.name }}_metrics
    {% if not loop.last %}UNION ALL{% endif %}
    {%- endfor %}
)
```

### Column Remapping Techniques

| Technique | spark_python Pattern | dbt Equivalent |
| :--- | :--- | :--- |
| `.replace()` | `select_columns.replace('user_id', 'user_id AS user_id')` | `{% if col == 'user_id' %}user_id AS user_id{% else %}{{ col }}{% endif %}` |
| Subquery wrapper | `SELECT *, uploaded_by_id AS user_id FROM table` | Same SQL in a CTE or subquery |
| Alias prefixing | `',\n        '.join([f'tool.{col}' for col in grain_columns])` | `{%- for col in grain_columns %}tool.{{ col }}{%- endfor %}` |
| `.format()` template | `join_conditions.format(alias='f')` | Use `{% set alias = 'f' %}` with `{{ alias }}.{{ col }}` |
| COALESCE coercion | `COALESCE({col}, -1) AS {col}` | `COALESCE({{ col }}, -1) AS {{ col }}` |
