# Anti-Patterns Catalog

Prohibited patterns and known violations for any manifest-driven metric store. This file is the single authoritative reference for what agents must never produce and must fix on contact.

---

## Agent Scan Directive

Execute this procedure before editing any pipeline file. Each step is mandatory.

1. **Read this file** in full before applying any edit.
2. **Run Detection commands** (listed per category below) against the file you are about to edit.
3. **Fix BLOCKING violations** found by detection scans as part of your edit. Do not defer.
4. **Fix WARNING violations** only when the file is being substantially modified (logic changes, new metrics, join restructuring).
5. **Fix COSMETIC violations** only when explicitly requested.
6. **Check the Violation Inventory** (Section 2) for the specific file. Incorporate listed remediations into your edit.
7. **After editing,** re-run detection commands on the modified file. Confirm zero new violations introduced.
8. **If a fix is too risky to combine** with the current edit, document the deferral in the PR description with the anti-pattern ID.

---

## Severity Levels

| Severity | Meaning | Action |
| :--- | :--- | :--- |
| BLOCKING | Affects correctness, downstream consumers, or deployment | Fix immediately when the file is read or edited |
| WARNING | Causes confusion or maintenance burden with no runtime impact | Fix when the file is substantially modified |
| COSMETIC | Style inconsistency only | Fix when explicitly requested |

---

## 1. Universal Anti-Patterns

Abstract rules that apply to every file in any manifest-driven metric store. These patterns are framework-agnostic unless noted. Violations are BLOCKING unless stated otherwise.

### 1.1 Naming

| ID | Anti-Pattern | Why It Breaks | Correct Pattern |
| :--- | :--- | :--- | :--- |
| N-01 | PascalCase or Mixed_Case metric columns | Downstream joins are case-sensitive in some engines; inconsistency splits aggregations | `total_{singular}_{present_verb}_count` in `lowercase_snake_case` |
| N-02 | Plural entity in column name (`total_files_create_count`) | Breaks the naming grammar; fails manifest regex validation | Singular: `total_file_create_count` |
| N-03 | Past-tense verb (`total_file_created_count`) | Inconsistent with grammar; fails manifest regex | Present tense: `total_file_create_count` |
| N-04 | Missing prefix or suffix (`file_create_count`, `total_file_create`) | Fails manifest regex; ambiguous aggregation intent | Always `total_` prefix and `_count` suffix |
| N-05 | PascalCase CTE names (`CoordinationIssues`, `INCIDENTS`) | Inconsistency across CTEs; hides refactor scope | `snake_case` always: `incidents`, `incidents` |
| N-06 | PascalCase GROUP_BY values (`Account_Id`, `Workspace_ID`) | Case mismatch with schema columns; potential silent join failures | `lowercase_snake_case`: `account_id`, `workspace_id` |
| N-07 | Hardcoded zone string (`_zone1`, `'ZONE2'`) | Silently restricts output to one zone; invisible in others | Use `{SOURCE_ZONE_SUFFIX}` / `'{SOURCE_ZONE}'` via interpolation |
| N-08 | PascalCase struct field references | Case mismatch between pipeline output and downstream consumer field access | All struct fields follow `naming.column_case` from manifest |
| N-09 | Dimension column casing mismatch across grains | Same column spelled differently in User vs Project vs Company schema files | Enforce identical casing from `manifest.grains` across all schema files for the entity |

#### Detection (Naming)

```
rg "[A-Z][a-z]+_[A-Z]" --type py                   # N-01, N-06: PascalCase/Mixed_Case in Python
rg "total_\w+s_(create|update)" --type py           # N-02: plural entity in metric name
rg "total_\w+_(created|updated|closed|deleted)" --type py  # N-03: past-tense verb
rg "'(zone1|zone2|zone3|ZONE1|ZONE2|ZONE3)'" --type py  # N-07: hardcoded zone string
rg "_zone1|_zone2|_zone3" --type py                     # N-07: hardcoded zone suffix in catalog ref
rg "GROUP_BY_COLUMNS\s*=" --type py -A 5             # N-06: check GROUP_BY array values for casing
```

---

### 1.2 SQL Logic

| ID | Anti-Pattern | Why It Breaks | Correct Pattern |
| :--- | :--- | :--- | :--- |
| SQL-01 | Fan-out join (1:many without pre-aggregation) | Inflates row counts; metrics multiply by child cardinality | Aggregate child table in a CTE first, then join at the grain |
| SQL-02 | COUNT without DISTINCT on a joined result | Double-counts when join produces duplicates | `COUNT(DISTINCT entity_id)` or aggregate before joining |
| SQL-03 | Non-deterministic dedup (`ROW_NUMBER` without full ORDER BY) | Results vary between runs; flaky metrics | Include a tiebreaker column (e.g., `id DESC`) in ORDER BY |
| SQL-04 | NULL-unsafe aggregation (`SUM(a + b)` where either is NULL) | NULL propagates; entire sum becomes NULL | `SUM(COALESCE(a, 0) + COALESCE(b, 0))` |
| SQL-05 | INNER JOIN where FULL OUTER JOIN is required | Silently drops rows that exist in only one CTE | Default to FULL OUTER JOIN; use INNER only for parent-child within a single CTE |
| SQL-06 | Missing COALESCE on grain columns after FULL OUTER JOIN | NULL grain keys break downstream GROUP BY and joins | `COALESCE(a.col, b.col) AS col` for every grain column |
| SQL-07 | Implicit type coercion in JOIN keys (`BIGINT = STRING`) | Engine coerces silently; may miss matches or degrade performance | Explicit `CAST()` to a common type |
| SQL-08 | Subquery where CTE should be used | Reduces readability; prevents reuse; harder to debug | CTEs always, except one-line aliasing shims |
| SQL-09 | Window function without PARTITION BY | Computes over full table instead of per-grain; produces wrong values or perf degradation | Always include `PARTITION BY {grain_columns}` in window functions |
| SQL-10 | OR condition in JOIN predicate | Produces partial Cartesian product; row explosion and wrong results | Restructure as UNION of two joins or move the OR into a WHERE filter |
| SQL-11 | COALESCE metric to 0 before aggregation instead of after | Masks data absence vs true zero at the row level; inflates counts | COALESCE to 0 only in the final `combined_metrics` CTE, never in source CTEs |

#### Detection (SQL Logic)

```
rg "COUNT\(" --type py | rg -v "DISTINCT"           # SQL-02: COUNT without DISTINCT
rg "ROW_NUMBER" --type py -A 3                       # SQL-03: check ORDER BY completeness
rg "INNER JOIN" --type py                            # SQL-05: verify parent-child context
rg "FULL OUTER JOIN" --type py -A 3                  # SQL-06: verify COALESCE follows
rg "OVER\s*\(" --type py -A 1                        # SQL-09: check for PARTITION BY
rg "\bOR\b" --type py -B 1 | rg "JOIN"              # SQL-10: OR in JOIN predicate
```

---

### 1.3 Metric Calculation

| ID | Anti-Pattern | Why It Breaks | Correct Pattern |
| :--- | :--- | :--- | :--- |
| MC-01 | Overlapping metric windows (create + update count the same event) | Inflates totals when both fire on same entity same day | Update metric excludes same-day creates: `AND TO_DATE(updated_at) != TO_DATE(created_at)` |
| MC-02 | Aggregating pre-aggregated data (SUM of a SUM) | Produces inflated or deflated values depending on grain | Always aggregate from the atomic source, not from a rolled-up table |
| MC-03 | Missing test-data exclusion | Test accounts and workspaces contaminate production metrics | Filter with `account_id NOT IN (...)` or manifest-defined exclusion list |
| MC-04 | Denominator-zero in rate calculations | Division by zero produces NULL or error | `CASE WHEN denominator > 0 THEN ... ELSE 0 END` or `NULLIF(denominator, 0)` |
| MC-05 | Mixing snapshot-scoped and cumulative logic in a Daily file | Daily file re-runs must be idempotent for a single date; cumulative logic violates this | Keep cumulative aggregation strictly in Cumulative files |
| MC-06 | Counting rows instead of distinct entities | Produces inflated counts when source has duplicates | `COUNT(DISTINCT id)` wrapped in a CASE for the date condition |
| MC-07 | Using `*` in a metric CTE SELECT | Column additions in source silently break UNION ALL or INSERT | Enumerate columns explicitly |
| MC-08 | Temporal misalignment between daily and cumulative scopes | Daily metric references cumulative state or vice versa within same CTE | Daily CTEs scope to `snapshot_date` only; Cumulative CTEs scope to `<= snapshot_date` |
| MC-09 | Double-counting via UNION ALL without grain dedup | Two CTEs contribute the same grain row; aggregation counts both | Dedup grain rows with `UNION` in `all_dimensions`, or pre-aggregate each CTE to its grain before combining |
| MC-10 | Rate/percentage with unfiltered denominator and filtered numerator | Denominator uses all-time data while numerator is date-scoped; rate is artificially deflated | Apply the same date scope to both numerator and denominator, or document the intentional mismatch |

#### Detection (Metric Calculation)

```
rg "updated_at.*snapshot_date" --type py -A 2        # MC-01: check update metric excludes same-day creates
rg "SUM\(.*total_" --type py                         # MC-02: SUM of a pre-aggregated metric
rg "COUNT\(\s*\*\s*\)" --type py                     # MC-06: COUNT(*) instead of COUNT(DISTINCT)
rg "SELECT\s+\*" --type py                           # MC-07: SELECT * in metric CTE
rg "UNION ALL" --type py -A 5                        # MC-09: check for grain dedup after UNION ALL
```

---

### 1.4 Pipeline Design

| ID | Anti-Pattern | Why It Breaks | Correct Pattern |
| :--- | :--- | :--- | :--- |
| PD-01 | INSERT without OVERWRITE (append-only) | Re-runs produce duplicate rows for the same partition | `INSERT OVERWRITE ... PARTITION (SNAPSHOT_DATE = ...)` |
| PD-02 | Unbounded query (no date filter in WHERE) | Full table scan; timeouts on large tables; cost explosion | Always scope with `TO_DATE(col) = '{snapshot_date}'` |
| PD-03 | Missing partition pruning hint | Query reads all partitions; performance degrades as data grows | Filter on the partition column in WHERE |
| PD-04 | SOURCE_ZONE not normalized to lowercase | Case-variant duplicates in output (`ZONE2` vs `zone2` split metrics) | `args.SOURCE_ZONE.lower()` at parse time (runner handles this for migrated files) |
| PD-05 | Redundant `.lower()` in runner-migrated files | Dead code; confuses future editors | Runner normalizes automatically; entity files must not re-apply |
| PD-06 | argparse / SparkSession / date-loop in entity files | Duplicates runner responsibilities; breaks runner contract | Entity files contain only `run_query()`; all orchestration lives in the runner |
| PD-07 | Schema SQL and ALTER script out of sync | CREATE TABLE is the source of truth; drift causes deployment failures | Update CREATE TABLE in the same PR as any ALTER |
| PD-08 | Missing zone suffix in catalog reference | Query reads wrong catalog in non-default zones | Every catalog ref uses `{SOURCE_ZONE_SUFFIX}` per manifest pattern |
| PD-09 | DataFrame API instead of SQL-based pipeline | Inconsistent with the rest of the metric store; no CTE reuse; harder to audit | Use SQL CTEs with `INSERT OVERWRITE` pattern |
| PD-10 | Hardcoded catalog or schema path | Breaks when deployed to a different zone or environment | Parameterize via manifest `catalogs.sources[].pattern` |
| PD-11 | Non-idempotent cumulative logic (reads own output from prior day) | Re-runs or backfills produce cascading drift; each day depends on the prior day's result | Cumulative files must compute from the atomic source with `<= snapshot_date`, never from their own prior output |
| PD-12 | Empty result set written silently (0 rows) | Downstream sees stale partition data or NULL metrics; no alert fires | Log row count after write; assert `row_count > 0` or log a WARNING when zero rows are written |
| PD-13 | Partition key mismatch between INSERT and schema | INSERT targets a partition column that does not match the table's PARTITIONED BY definition | Verify `PARTITION (SNAPSHOT_DATE = ...)` matches the schema DDL `PARTITIONED BY (SNAPSHOT_DATE)` |

#### Detection (Pipeline Design)

```
rg "INSERT INTO" --type py | rg -v "OVERWRITE"      # PD-01: append-only INSERT
rg "FROM\s+\w+\." --type py | rg -v "WHERE"         # PD-02: unbounded query (manual check)
rg "\.lower\(\)" --type py                           # PD-04/PD-05: zone normalization check
rg "argparse|SparkSession|get_date_range|get_parameters" --type py  # PD-06: runner contract violation
rg "spark\.read|\.write\." --type py                 # PD-09: DataFrame API usage
rg "demo_gold_|demo_silver_" --type py | rg -v "SOURCE_ZONE_SUFFIX\|zone_suffix"  # PD-10: hardcoded catalog
```

---

### 1.5 Data Quality

| ID | Anti-Pattern | Why It Breaks | Correct Pattern |
| :--- | :--- | :--- | :--- |
| DQ-01 | Silent data loss from wrong JOIN type | INNER JOIN drops unmatched rows; metrics under-report | FULL OUTER JOIN as default; document exceptions |
| DQ-02 | Implicit CAST that truncates (`TIMESTAMP` to `DATE` via engine default) | Precision loss; timezone-dependent behavior | Explicit `TO_DATE()` cast |
| DQ-03 | Timezone-unaware date comparison | UTC-stored timestamps compared to local-date snapshot; off-by-one for non-UTC zones | Ensure all date comparisons use `TO_DATE()` consistently |
| DQ-04 | NULL grain key in GROUP BY | NULLs collapse into a single group; metrics attributed to "unknown" | `COALESCE(grain_col, -1)` or filter NULLs explicitly |
| DQ-05 | Missing `deleted_at IS NULL` filter | Counts deleted entities; inflates metrics | Add soft-delete filter when source supports it |
| DQ-06 | `DATE()` instead of `TO_DATE()` | Inconsistent with lint standard; some engines interpret differently | `TO_DATE()` always |
| DQ-07 | No grain uniqueness assertion | Duplicate grain rows in output go undetected; downstream aggregations double-count | Assert `COUNT(*) = COUNT(DISTINCT grain_key_combo)` in backfill tests or dbt uniqueness tests |
| DQ-08 | Negative metric count value | Count metrics must be non-negative; a negative value indicates a logic error | Wrap with `GREATEST(metric, 0)` or investigate the source logic that produces negative values |
| DQ-09 | Partition date gap in time series | Missing dates in a daily snapshot break cumulative aggregation and downstream trend analysis | Validate partition completeness; backfill missing dates or insert zero-rows |
| DQ-10 | Stale dimension join (no date-scoped filter on dimension table) | Dimension table changes over time; joining without date scope attributes metrics to the wrong entity state | Join dimension tables on both the entity key AND a temporal scope that matches the snapshot date |

#### Detection (Data Quality)

```
rg "INNER JOIN" --type py                            # DQ-01: verify parent-child context for each
rg "DATE\(" --type py | rg -v "TO_DATE\|SNAPSHOT_DATE"  # DQ-06: non-standard date function
rg "deleted_at" --type py                            # DQ-05: verify IS NULL filter present
rg "GROUP BY" --type py -B 5                         # DQ-04: check for NULL grain risk in grouped columns
```

---

### 1.6 Tooling & Environment

| ID | Anti-Pattern | Why It Breaks | Correct Pattern |
| :--- | :--- | :--- | :--- |
| TE-01 | `/* */` block comment inside f-string SQL | `*/` in an interpolated value closes the comment early; SQL injection risk | `#` outside the f-string or `--` inside |
| TE-02 | `#` comment inside f-string SQL | SQL engines do not recognize `#`; parse error | `--` for inline SQL comments |
| TE-03 | `;` inside any comment text | SQL tools may split the statement at `;` even inside comments | Avoid `;` in comments; use only as DDL terminators |
| TE-04 | `{variable}` inside a `--` SQL comment | F-string still interpolates inside comments; unintended value exposure | Move interpolated values to executable SQL; keep comments static |
| TE-05 | `\` inside f-string expression | Python syntax error | Use `.replace()`, subquery wrapper, or `.format()` instead |
| TE-06 | PowerShell `Set-Content -Encoding UTF8` for temp SQL files | Adds BOM; causes `PARSE_SYNTAX_ERROR` | `[System.IO.File]::WriteAllText()` |
| TE-07 | `gh pr create --body "..."` in PowerShell | Backticks in inline body corrupt formatting | Always `--body-file` |
| TE-08 | PowerShell `&&` to chain commands | Invalid separator in PowerShell; parse error | Use `;` or separate commands |
| TE-09 | Guessing catalog/schema/table paths | Wrong paths fail silently in some zones | Verify via platform CLI discovery before use |
| TE-10 | Skipping PoC queries | Full pipeline built on wrong assumptions | Always run a 1-day proof-of-concept query first |

#### Detection (Tooling)

```
rg "/\*" --type py                                   # TE-01: block comment in Python SQL
rg ';\s*$' --type sql -B 1 | rg "^\s*--"            # TE-03: semicolon inside SQL comment
rg "Set-Content.*UTF8" --type ps1                     # TE-06: BOM-producing PowerShell command
rg "\-\-body " | rg "gh pr"                          # TE-07: inline --body in gh pr create
```

---

## 2. Project Violation Inventory

Keep a per-project inventory of known non-compliant files here, or in a
sibling document the manifest points at. Record the entity, the rule it
violates, and the severity. Fix BLOCKING items on contact, and remove the
row once fixed. If a fix is too risky to combine with the current change,
document the deferral in the pull request description.

This section is intentionally empty in the published skill: the inventory is
a property of a specific codebase, not of the rules.
