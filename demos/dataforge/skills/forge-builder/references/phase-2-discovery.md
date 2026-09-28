# Phase 2 Data Discovery Reference

Loaded at Phase 2 entry. Contains the mandatory 5-query sequence, query failure halt protocols, source table lookup patterns, grain feasibility rules, domain placement, Hypothesis Resolution Log, and Discovery Presentation Gate. All project-specific values are resolved from `../../../assets/dataforge.manifest.resolved.yaml`.

---

## Evidence-First Directive

**The shape of the data is never assumed. Every assumption is a query.**

Issues, specs, and existing pipeline code describe intent. They do not describe data. Before writing any metric expression, filter condition, grain assignment, or date predicate, execute the query that proves the underlying data supports it. A filter that matches no rows produces no error — it silently returns zero. A grain column assumed populated may be NULL for every row. A column name from a spec may not exist in the table.

Discovery is not reading. Discovery is querying.

This applies without exception to:

- New entity builds
- Extension builds on existing entities
- Any build that references string values, status codes, categories, or custom labels

**No metric code is written until the queries below have returned results that prove the code is correct.**

---

## Pre-Query Setup

**Zone:** Primary development zone — first entry in `manifest.platform.zones`.

**Auth:** Authenticate via forge-dbx before any query. Auth failure is a hard stop.

**Catalog:** Resolve source catalog from `manifest.catalogs.sources[].pattern` with `{zone_suffix}` = `_{zone_id}`.

**Mode D profiler substitution:** If this build entered via Mode D (discovery-driven), profiler findings may substitute for Queries 1 and 2 **only if** the profiler queried the same catalog zone as `manifest.platform.zones[0]`. Before accepting the substitution, execute `SELECT current_catalog()` via forge-dbx and confirm the result matches `manifest.catalogs.sources[0].pattern` with zone 0's suffix. If the profiler output does not include a catalog path, or the path does not match zone 0, Queries 1 and 2 must run independently. Queries 3, 4, and 5 always run regardless of profiler output.

---

## Mandatory Query Sequence

Execute all queries that apply to the build in scope. Each query answers a specific question. Document what the result proves before moving to the next query.

### 1. Table Existence and Volume

**Proves:** The source table exists in this zone and contains data in the expected date range.

```sql
SELECT
    MIN(TO_DATE(created_at)) AS earliest_date
    ,MAX(TO_DATE(created_at)) AS latest_date
    ,COUNT(*) AS total_rows
FROM {catalog_pattern}.{schema}.{table}
```

**Failure halt:** If this returns zero rows or raises a table-not-found error, STOP. Update memory store `blocking` with the error. Ask the user to confirm the table path. Do not attempt to infer an alternate path. Do not proceed to Query 2.

### 2. Schema Inspection

**Proves:** The columns referenced in the metric design (entity ID, date columns, grain columns, filter columns) physically exist in the table with the expected data types.

```sql
DESCRIBE TABLE {catalog_pattern}.{schema}.{table}
```

Identify from the result:

- Entity ID column (primary key for COUNT DISTINCT)
- All date/timestamp columns (do not assume `created_at`, `updated_at`, or `closed_at` exist — confirm)
- User attribution column (e.g., `user_id`)
- Any string columns referenced in filter conditions

**Failure halt:** If a column named in the spec does not appear in `DESCRIBE TABLE` output, it does not exist. Remove it from the metric design immediately. Surface the discrepancy to the user: "Column `{column}` was specified in the issue but is not present in `DESCRIBE TABLE` output. Removing from design." Do not write any code that references a column absent from this output.

### 3. Grain Feasibility

**Proves:** Each grain defined in `manifest.grains` is viable for this entity. Run once per grain column.

```sql
SELECT
    COUNT(*) AS total_rows
    ,SUM(CASE WHEN {grain_column} IS NULL THEN 1 ELSE 0 END) AS null_count
    ,ROUND(100.0 * SUM(CASE WHEN {grain_column} IS NULL THEN 1 ELSE 0 END) / COUNT(*), 2) AS null_pct
FROM {catalog_pattern}.{schema}.{table}
```

| Result | Decision |
| :--- | :--- |
| `null_pct` = 100 | Grain INACTIVE — mark in memory store, schema file gets INACTIVE header, runner excludes grain. Inform user and continue. |
| `null_pct` > 50 | Grain SUSPECT — present the NULL rate to the user. Require explicit confirmation ("proceed with suspect grain" or "mark inactive") before continuing. Record the decision in the memory store `grains` object. Do not assume. |
| `null_pct` < 50 | Grain ACTIVE |

Grain feasibility is determined by data, not by what the spec assumes or what a prior pipeline uses. An issue that claims a grain is supported does not override a 100% NULL query result.

### 4. Soft-Delete Check

**Proves:** Whether the table uses soft deletes and whether the metric must exclude them.

Soft deletes are expressed one of two ways, and the convention differs per table.
Read the Query 2 column list and pick the matching form — do not assume a
timestamp column.

| Convention in Query 2 output | Detection query | Exclusion predicate |
| :--- | :--- | :--- |
| Nullable timestamp (`deleted_at`, `archived_at`) | `SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END)` | `AND deleted_at IS NULL` |
| Boolean flag (`is_deleted`, `is_archived`) | `SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END)` | `AND is_deleted = false` |

```sql
SELECT
    COUNT(*) AS total_rows
    ,SUM(CASE WHEN {delete_column} IS NOT NULL THEN 1 ELSE 0 END) AS soft_deleted   -- timestamp form
    -- ,SUM(CASE WHEN {delete_flag} THEN 1 ELSE 0 END) AS soft_deleted              -- boolean form
FROM {catalog_pattern}.{schema}.{table}
```

If `soft_deleted > 0`, add the matching exclusion predicate to every WHERE clause.

**Only skip this query when Query 2 shows no delete column of either form.** Skipping
because one particular column name is absent, while a differently-named flag is
present, silently inflates every metric by the soft-deleted share and produces
code inconsistent with the sibling entities in the same store. Cross-check the
predicate against an existing pipeline in the same store before accepting it.

### 5. Filter Column Enumeration

**Proves:** The exact string values that exist in a filter column. Mandatory for every string column used in a CASE WHEN condition. Run regardless of how explicitly the spec names the expected values — spec values are hypotheses until this query confirms them.

```sql
SELECT
    {filter_column}
    ,COUNT(*) AS cnt
FROM {catalog_pattern}.{schema}.{table}
WHERE {filter_column} IS NOT NULL
GROUP BY ALL
ORDER BY cnt DESC
LIMIT 50
```

Run once per filter column. Record the top-50 result set by frequency.

**After running, answer these questions with data:**

1. Does every spec-named value appear in the result with an exact character match, including case and whitespace?
2. Are there case variants (e.g., mixed case vs. all caps) of the same value?
3. Are there whitespace variants (leading/trailing spaces)?
4. Are there synonym labels representing the same business concept with different spelling?
5. What percentage of the target population is missed by the unmatched variants?

**If a spec-named value is not visible in the top-50 results**, run a follow-up targeted query before concluding the value does not exist:

```sql
SELECT
    {filter_column}
    ,COUNT(*) AS cnt
FROM {catalog_pattern}.{schema}.{table}
WHERE UPPER(TRIM({filter_column})) IN ('SPEC_VALUE_1', 'SPEC_VALUE_2')
GROUP BY ALL
```

Or enumerate all distinct values without a limit — only when the column is a system-defined operational type (status, tier, category) and not a customer-defined free-text label.

For free-text, high-cardinality, or identifier-like columns, report only `DISTINCT COUNT(*)` and request user guidance rather than returning raw values:

```sql
-- High-cardinality fallback (free-text or identifier columns)
SELECT COUNT(DISTINCT {filter_column}) AS distinct_count
FROM {catalog_pattern}.{schema}.{table}
WHERE {filter_column} IS NOT NULL
```

Full enumeration (system-defined operational values only):

```sql
SELECT DISTINCT {filter_column}
FROM {catalog_pattern}.{schema}.{table}
WHERE {filter_column} IS NOT NULL
ORDER BY 1
```

**Failure halt:** If a spec-named filter value does not appear in the top-50 result **and** does not appear in a follow-up targeted or full enumeration query, STOP. Do not construct a CASE WHEN using that value. Present the actual enumeration result to the user and ask which values to use. Proceeding with a filter that matches zero rows produces silently correct SQL with incorrect counts.

**If any variant accounts for more than 1% of the target population, the filter must capture it.**

**Normalization pattern when variants exist:**

```sql
UPPER(TRIM({filter_column})) IN ('NORMALIZED_VALUE_1', 'NORMALIZED_VALUE_2', ...)
```

Use `UPPER(TRIM(...))` in both the CASE WHEN block and the outer WHERE clause. IN list values are UPPERCASE to match the normalization. This is the only form that handles case and whitespace in a single pass without enumerating every variant explicitly.

**Free-form user-customizable fields:** When a filter column has hundreds of account-defined custom labels (e.g., a `status` field where each account defines its own approval workflow labels), a hardcoded IN list will have known coverage gaps. At this stage:

1. Run a second enumeration filtered to rows where the business event is likely active (e.g., `WHERE closed_at IS NOT NULL`) to see which status values co-occur with the event signal.
2. Assess whether a higher-cardinality standardized categorical column exists alongside the free-form field (e.g., `status_category`) that could serve as a cleaner or complementary filter signal.
3. Choose and document the filter strategy: **inclusion list** (more conservative, counts only recognized values) or **exclusion list NOT IN** (more inclusive, counts everything except known disqualifiers). Document the strategy and known coverage gaps in the metric business definition.

Do not proceed to Phase 3 until every filter column has been enumerated and the filter expression reflects actual data values.

**Sequence completion verification:** Before leaving Phase 2, confirm all applicable queries ran and produced results:

- [ ] Query 1 ran and returned non-zero rows
- [ ] Query 2 ran and column list was reviewed against the full design
- [ ] Query 3 ran for every grain in `manifest.grains`
- [ ] Query 4 ran (or explicitly skipped because `deleted_at` was absent from Query 2 output)
- [ ] Query 5 ran for every string column in any CASE WHEN filter condition (new and extension builds)
- [ ] Any INACTIVE or SUSPECT grains documented in memory store `grains` object

A skipped query that was applicable is a blocking error. Document the skip reason explicitly before proceeding.

---

## Source Table Lookup

When the source table path is not immediately known, use these patterns to find the table name. Finding the name via codebase search does not replace the mandatory queries above — once the path is known, all applicable queries from the sequence must still run.

**Pattern 1 — Schema search (preferred):** Confirms the table exists in the platform in a single step.

```sql
SHOW TABLES IN {catalog_pattern}.{schema} LIKE '*{tool_name}*'
```

**Pattern 2 — Codebase search:** Finds table name references in existing pipeline code. Use to discover the path, then verify via live query.

```
rg "{tool_name}" --type py --glob "{manifest.project.store_name}/**"
```

**Pattern 3 — Existing entity cross-reference:** If an entity folder exists, read the `FROM` clause in the pipeline's `run_query()` to extract the table path. Verify via live query.

---

## Domain Placement

See [phase-1-intake.md](phase-1-intake.md) Scoping Decision Tree for domain lookup, folder name derivation, and display name derivation rules.

---

## Hypothesis Resolution Log

**Mandatory before the Phase 2 checkpoint write.** After all queries complete, evaluate every Phase 1 hypothesis against the live query results and write structured resolution entries to the memory store `hypothesis_log` array.

Write one JSON object per hypothesis:

```json
{
  "hypothesis": "source_table: demo_gold_source_a.service_delivery.releases",
  "source": "github_issue",
  "status": "CONFIRMED",
  "evidence": "Query 1 returned 12.4M rows, table exists in zone1",
  "phase": 2
}
```

| Field | Required | Values |
| :--- | :--- | :--- |
| `hypothesis` | yes | What was assumed (e.g., `source_table: ...`, `column: status`, `filter value: 'Approved'`, `entity_id: bid_id`, `grain user: active`) |
| `source` | yes | `github_issue`, `natural_language`, `definitions_sql`, `profiler`, or `prior_pipeline` |
| `status` | yes | `CONFIRMED`, `REVISED`, or `INVALIDATED` |
| `evidence` | yes | Which query proved/disproved it and what the result showed |
| `phase` | yes | `2` (or later if re-evaluated) |

Also update each `metrics[]` object's `status` field from `"hypothesis"` to `"confirmed"` for metrics whose source table, entity ID, and date columns were all confirmed. Update `date_column` and `entity_id` fields with the confirmed values from Query 2.

Every Phase 1 hypothesis must appear in the `hypothesis_log` array. A hypothesis that is not explicitly evaluated is treated as unconfirmed and must not appear in Phase 3 SQL. If any hypothesis was INVALIDATED, the `evidence` field must describe what action was taken (removed from design, surfaced to user, halted).

**Enforcement:** After writing the Phase 2 checkpoint, execute:

```bash
python skills/forge-builder/verify.py hypothesis-count {build_id}
```

The script asserts: (a) array is non-empty, (b) every entry has a valid `status`, (c) no entry is missing `hypothesis` or `evidence`. Nonzero exit = the log is incomplete; fix before Phase 3.

---

## Discovery Presentation Gate

**BLOCKING — Present the complete Data Discovery Report to the user before Phase 3 begins.** The report must include:

- Confirmed source table path(s) and row count
- Full column inventory from `DESCRIBE TABLE`
- Date range (min/max of created_at)
- Grain feasibility matrix with NULL rates for each grain
- All data quality flags observed
- Domain assignment

**Acknowledgment accepted from:** "looks good", "proceed", "yes", "confirmed", "continue", or any clear affirmative. If the user raises a concern, address it before proceeding.

**Autonomous mode:** Log the full report to the memory store `source_table` and `grains` fields and continue — do not suppress findings.

---

## Lineage

**Upstream:** `manifest.catalogs.sources` → CTE in `run_query()` → INSERT OVERWRITE Daily → INSERT OVERWRITE Cumulative

**Downstream:** `manifest.downstream.integrations` → long_table → sql_definitions

Do not trace upstream beyond the source table. Do not trace downstream beyond the last integration in the manifest.

---

> If query output shows unexpected patterns, check the Data Quality Red Flags table in [gate-recovery.md](gate-recovery.md).
