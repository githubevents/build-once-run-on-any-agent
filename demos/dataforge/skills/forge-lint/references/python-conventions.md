# Python and SQL Conventions (spark_python mode)

Applicability: This file applies when `platform.pipeline_framework = spark_python` in the manifest. When `platform.pipeline_framework = dbt`, skip this file and see [dbt-standards.md](dbt-standards.md).

---

## Runner Architecture

Entity files use shared runners defined in the manifest under `runner`. The runner handles all orchestration; entity files contain only the SQL query logic.

| Component | Location (from manifest `runner`) | Responsibility |
| :--- | :--- | :--- |
| Daily runner | `runner.daily` | CLI parsing, date range, grain dispatch, SparkSession, zone normalization, row-count logging |
| Cumulative runner | `runner.cumulative` | CLI parsing, single snapshot date, grain dispatch, SparkSession, zone normalization, row-count logging |
| Config | `runner.config` | Grain column lists, catalog name templates |

## Entity File Contract

| Element | Standard |
| :--- | :--- |
| Daily import | Import the daily runner from the path in `runner.daily` |
| Cumulative import | Import the cumulative runner from the path in `runner.cumulative` |
| Zone stubs | `SOURCE_ZONE = None`, `SOURCE_ZONE_SUFFIX = None` at module level (injected by runner) |
| Cumulative date stub | `SNAPSHOT_DATE = None` at module level (cumulative only, injected by runner) |
| Function params | lowercase: `snapshot_date`, `table_name`, `group_by_columns` |
| select_columns | `',\n        '.join(group_by_columns)` |
| Daily run_query signature | `def run_query(snapshot_date: str, table_name: str, group_by_columns: List[str]):` (3 params) |
| Cumulative run_query signature | `def run_query(table_name: str, group_by_columns: List[str]):` (2 params, no `snapshot_date`) |
| Daily entry point | `run_daily_job(run_query)` or `run_daily_job(run_query, grains=[...])` |
| Cumulative entry point | `run_cumulative_job(run_query)` or `run_cumulative_job(run_query, grains=[...])` |

Entity files must **NOT** contain: argparse, `load_data()`, `get_date_range()`, `get_parameters()`, SparkSession creation, hardcoded `GROUP_BY_COLUMNS` arrays, or date iteration loops.

## Injection Mechanism

The runner injects globals into the entity module before calling `run_query()`: `spark` (both runners), `SOURCE_ZONE` (both, lowercase zone), `SOURCE_ZONE_SUFFIX` (both, prefixed zone), `SNAPSHOT_DATE` (cumulative only). Entity files declare `SOURCE_ZONE = None` etc. as placeholders.

## Zone Normalization

The runner normalizes `SOURCE_ZONE` to lowercase automatically. Entity files must **not** add redundant `.lower()` calls.

**BLOCKING -- Catalog suffix:** Every catalog reference in SQL must include `{SOURCE_ZONE_SUFFIX}` as defined in the manifest's `catalogs.sources[].pattern`. A missing suffix fails at deployment in every zone except the one it was hardcoded for. CTE references (e.g., `FROM combined_metrics`) are exempt.

**BLOCKING -- Hardcoded zones:** Never hardcode a specific zone string. Always use the `SOURCE_ZONE` variable via f-string interpolation.

## Grain Dispatch

Grain column lists are read from `grains.{grain}.columns` in the manifest. The runner iterates over requested grains, builds the fully-qualified table name from CLI args, and passes the corresponding column list as `group_by_columns` to `run_query()`.

### Grain-Specific Patterns

**Reduced grain for child CTEs** (when a child table lacks a grain column):

```python
child_columns = [col for col in group_by_columns if col != 'user_id']
```

**Conditional WHERE filter** (when a table may have NULL grain values):

```python
WORKSPACE_ID_CHECK = "AND workspace_id IS NOT NULL" if 'workspace_id' in group_by_columns else ""
```

### Inactive Grain Handling

When a tool cannot support a grain (e.g., no `user_id` in source), restrict grains via the `grains` parameter on the runner call:

```python
if __name__ == "__main__":
    run_daily_job(run_query, grains=['workspace', 'account'])
```

Valid grain values match the keys in the manifest's `grains` section. Defaults to all grains when omitted.

**Schema rule for inactive grains:** Full CREATE TABLE DDL stays uncommented. Add an INACTIVE header at the top with: date, which Python file does not write to it, rationale, and active sibling reference.

---

## SQL Formatting

- Leading commas in all column and CTE lists
- One column per row
- `GROUP BY ALL`
- `INSERT OVERWRITE {table_name} PARTITION (SNAPSHOT_DATE = DATE '{snapshot_date}') BY NAME`
  - Substitute system column names from `naming.system_columns.uppercase` in the manifest
- Final SELECT: `CURRENT_TIMESTAMP AS LOAD_TIMESTAMP`, `'{SOURCE_ZONE}' AS SOURCE_ZONE`, then `*`
- Date casting: `TO_DATE()` always. Never `DATE()`.
- `UNION ALL` by default. `UNION` only when dedup is required (e.g., `all_dimensions` collector CTEs).
- CTEs over subqueries -- always. Only exception: one-line aliasing shims (`SELECT *, source_col AS grain_col FROM table`).

### Code Comment Standards

**Pipeline-level comments** (`#` in Python, `--` in dbt Jinja): Use for code structure, grain blocks, section banners. Never sent to the SQL engine.

**SQL line comments** (`--`): Acceptable inside SQL strings for static annotations. Do not place `{variable}` interpolation inside `--` comments.

**BLOCKING bans (all frameworks):**
- **No `/* */`** inside f-string SQL (spark_python). F-strings perform raw string interpolation with zero sanitization -- `*/` anywhere in an interpolated value closes the comment early.
- **No `#`** as a comment inside f-string SQL. SQL engines do not recognize it -- causes parse error.
- **No `;`** in any comment, anywhere (SQL `--`, schema `COMMENT` strings, pipeline `#`, MD entries). SQL tools may split the statement at `;` even inside comments. Semicolons as DDL terminators are correct usage -- the ban applies only to comment text.

### Standard WHERE Clause (Daily)

```sql
    WHERE
        (
        TO_DATE(created_at) = '{snapshot_date}'
        OR TO_DATE(updated_at) = '{snapshot_date}'
        )
```

Additional date columns are added as extra `OR` conditions. Special conditions go after the date filter block.

### Standard Metric Block

**Create metric:**

```sql
        COUNT(
            DISTINCT CASE
                WHEN TO_DATE(created_at) = '{snapshot_date}' THEN entity_id
                ELSE NULL
            END
        ) AS total_<entity>_create_count,
```

**Update metric** (excludes same-day creates):

```sql
        COUNT(
            DISTINCT CASE
                WHEN TO_DATE(updated_at) = '{snapshot_date}'
                AND TO_DATE(updated_at) != TO_DATE(created_at) THEN entity_id
                ELSE NULL
            END
        ) AS total_<entity>_update_count,
```

**Formatting rules:**

- `COUNT(` on its own line
- `DISTINCT CASE` indented one level deeper
- `WHEN` condition indented one level deeper than `DISTINCT CASE`
- `THEN entity_id` on same line as final `WHEN` condition
- `ELSE NULL` on its own line, aligned with `WHEN`
- `END` on its own line, aligned with `DISTINCT CASE`
- `) AS alias` closing parenthesis aligned with `COUNT(`

### F-String Safety

**Rule:** Never use `\` inside f-string expressions. It causes syntax errors.

Five approved techniques for column remapping:

| Technique | When | Example Pattern |
| :--- | :--- | :--- |
| `.replace()` | Source has different grain column name | `select_columns.replace('user_id', 'user_id AS user_id')` |
| Subquery wrapper | Every downstream reference needs standard name | `SELECT *, source_col AS grain_col FROM table` |
| Alias prefixing | Disambiguation needed for joins | `',\n        '.join([f'tool.{col}' for col in group_by_columns])` |
| `.format()` template | Same join pattern reused with different aliases | `join_conditions.format(alias='f')` |
| COALESCE coercion | NULL grain keys in UNION ALL or GROUP BY | `COALESCE({col}, -1) AS {col}` |

Full examples in [join-patterns.md](join-patterns.md).

---

## Schema Standards

Read `naming.system_columns.uppercase` from the manifest for system column definitions. Read `grains` for grain column definitions. Read `entity_structure` for file naming conventions.

### CREATE TABLE Pattern

```sql
CREATE TABLE ${catalog_name}.${schema_name}.${table_name} (
    <SYSTEM_COL_1> <TYPE> COMMENT '<description>'
    , <SYSTEM_COL_2> <TYPE> COMMENT '<description>'
    , <SYSTEM_COL_3> <TYPE> COMMENT '<description>'
    , <grain_col_1> <TYPE> COMMENT '<description>'
    , <grain_col_2> <TYPE> COMMENT '<description>'
    , total_<entity>_create_count BIGINT COMMENT '<description>'
    , total_<entity>_update_count BIGINT COMMENT '<description>'
) USING delta PARTITIONED BY (<PARTITION_SYSTEM_COL>)
```

### Schema Rules

| Rule | Standard |
| :--- | :--- |
| Case | All columns follow `naming.column_case` except those listed in `naming.system_columns.uppercase` |
| Comments | Every column has a COMMENT |
| Column order | Matches Python SELECT exactly |
| PascalCase in schema files | BLOCKING anti-pattern. Fix on contact. |

### BLOCKING -- Schema-Alter Sync

All ALTER scripts must reside in the path defined by `entity_structure.alter_dir` in the manifest. A top-level `Alter/` at the tool root is non-compliant -- relocate to the correct path.

Every Schema SQL CREATE TABLE file must reflect the full current state of the table, including all columns added by ALTER scripts. When writing an ALTER, update the corresponding CREATE TABLE file in the same step.

### Alter Execution Tracking -- Two-Phase Lifecycle

ALTER statements are one-time operations. Every ALTER file uses two phases: **MODIFIED** (pending deployment) then **EXECUTED** (confirmed deployed).

**Phase 1 -- MODIFIED:** Add `-- [MODIFIED YYYY-MM-DD]` on the line above the statement block.

```sql
-- [MODIFIED 2026-04-01]
ALTER TABLE ${catalog_name}.${schema_name}.table_name
ADD COLUMN total_entity_create_count BIGINT COMMENT '...';
```

**Phase 2 -- EXECUTED:** Replace tag with `-- [EXECUTED YYYY-MM-DD]` and comment out all SQL lines below. EXECUTED date must be at least +1 day after MODIFIED.

```sql
-- [EXECUTED 2026-04-02]
-- ALTER TABLE ${catalog_name}.${schema_name}.table_name
-- ADD COLUMN total_entity_create_count BIGINT COMMENT '...';
```

**Transition rules:**

| Rule | Detail |
| :--- | :--- |
| Add MODIFIED tag | When creating or editing any ALTER statement |
| Never same-day EXECUTED | Minimum +1 day gap between MODIFIED and EXECUTED |
| EXECUTED conditions | (a) current date > MODIFIED date AND (b) PR merged or change confirmed deployed |
| Audit pending ALTERs | `rg "^\-\- \[MODIFIED"` finds all pending, `rg "^\-\- \[EXECUTED"` finds all completed |

### ALTER_LOG.md

Every ALTER folder must contain an `ALTER_LOG.md`:

```markdown
# ALTER Execution Log

| Date | File | Operation Summary | Status |
| :------- | :--------- | :----------- | :-------------------------------------------------------------- |
| 2026-04-01 | add_column.sql | ADD total_entity_create_count to 6 tables | MODIFIED |
| 2026-04-02 | add_column.sql | ADD total_entity_create_count to 6 tables | EXECUTED |
```
