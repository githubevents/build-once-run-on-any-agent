# Phase 3 Metric Design Reference

Loaded at Phase 3 entry. Contains SQL expression design patterns, join strategy selection, proof-of-concept query procedure, and user approval gate. All project-specific values are resolved from `../../../assets/dataforge.manifest.resolved.yaml`.

The join pattern decision tree lives in `forge-lint` Section 5 — read that section if it has not been loaded already.

---

## SQL Expression Design

For each metric_name in scope, design the aggregation expression:

- Map to the standard metric block pattern:
  ```sql
  COUNT(DISTINCT CASE WHEN {date_predicate} THEN {entity_id} ELSE NULL END)
  ```
- Determine the driving date column:
  - `create` verb → `created_at`
  - `update` verb → `updated_at`
  - `close` / `approve` / `submit` / `sign` etc. → the column that represents the completion event (confirmed by Phase 2 `DESCRIBE TABLE` output)
- Determine additional filter conditions from Phase 2 Query 5 enumeration results
- Classify each verb against `manifest.naming.metric_regex` — a verb not in the allowlist fails the naming check

**Metric block formatting (spark_python):**

```python
COUNT(
    DISTINCT CASE
        WHEN TO_DATE({date_column}) = '{snapshot_date}'
        {filter_condition}
        THEN {entity_id}
        ELSE NULL
    END
) AS total_{entity}_{verb}_count
```

Each keyword (COUNT, DISTINCT, CASE, WHEN, THEN, ELSE NULL, END) on a separate line per lint Section 3.

**Metric block formatting (cumulative):**

```python
COUNT(
    DISTINCT CASE
        WHEN TO_DATE({date_column}) <= '{SNAPSHOT_DATE}'
        {filter_condition}
        THEN {entity_id}
        ELSE NULL
    END
) AS total_{entity}_{verb}_count
```

---

## Join Strategy

Determine the join strategy using the lint join pattern decision tree (forge-lint Section 5).

CTE naming follows `manifest.naming.cte_case`:
- `combined_metrics` — final output CTE
- `{entity}_metrics` — per-entity aggregation CTE
- `{parent}_{child}` — child table join CTEs

Set `join_strategy` in the memory store to one of: `Pattern1` through `Pattern6` (or `"Single CTE (existing entity extension)"` for extension builds).

---

## Sample Execution (Validate Before Build)

**BLOCKING:** Execute a proof-of-concept query via `forge-dbx` before presenting the design to the user. Phase 4 does not begin until all PoC queries succeed.

**Run one PoC query per metric in scope** (not just the first). Each query:
1. Wraps the metric's SQL expression in a standalone SELECT against the source table
2. Uses a 1-day date range (yesterday) to minimize scan cost
3. Verifies: query returns rows, column names match expected aliases, no runtime errors

**Zero-count handling:**
- If a filter-conditioned metric returns zero counts: the CASE WHEN expression does not match any data. Return to Phase 2 Query 5 enumeration results and diagnose before proceeding.
- If a non-filter metric returns zero counts: retry with the last 7 days. If still zero, flag to user — do not assume the expression is correct. Record the date range tested and the count result in memory store `validation`.

**Failure diagnosis:** Use the Runtime Error Catalog in [gate-recovery.md](gate-recovery.md). Fix the expression and re-test. Do not proceed to Phase 4 until every metric has a passing PoC query with a non-zero result.

### candidate_filter_columns Validation

If the PoC query introduces a filter on a column that was NOT in the metric object's `candidate_filter_columns` array from Phase 1, that column has not been enumerated by Phase 2 Query 5. Before the design can be finalized:
1. Return to Phase 2 and run Query 5 for the new column
2. Update `hypothesis_log` with the new hypothesis and its resolution
3. Re-run `verify.py hypothesis-count {build_id}` to confirm the log is complete

---

## Pre-User-Gate Hypothesis Check

**Mandatory before presenting the design.** Execute:

    python skills/forge-builder/verify.py hypothesis-count {build_id}

This confirms all hypotheses are resolved and none with `status: "INVALIDATED"` leaked into the design. If any INVALIDATED hypothesis's value appears in a metric's `filter` or `date_column`, the design must be revised before presentation.

---

## User Gate

**BLOCKING:** Present the complete metric design to the user for approval before proceeding to Phase 4.

**Design presentation must include:**
- Each metric name, verb, driving date column, entity ID column
- Filter expression (if any), normalized with `UPPER(TRIM(...))` if applicable
- Join strategy and CTE structure
- Grain matrix (which grains are ACTIVE/INACTIVE/SUSPECT from Phase 2)
- Any assumptions or deviations from the issue spec

**Approval accepted from:** "approved", "looks good", "go ahead", "yes", "ship it", or any clear affirmative.

**Approval NOT accepted from:** Ambiguous text ("hmm", "interesting", "okay I guess") or any message containing a change request or question. Re-present the revised design and wait for a new approval.

**Autonomous mode exception:** If the user invoked the skill with language indicating full autonomy ("build metrics for X autonomously", "run the full pipeline", "no questions"), skip the User Gate. Log the design as auto-approved in the memory store `notes` field with `"source: autonomous_mode"` and proceed.

**Artifact:** Metric Design Specification (in-memory and in memory store `metrics` array): SQL expressions, join strategy, CTE structure, grain matrix, driving date columns, filter expressions, assumptions.
