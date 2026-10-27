# Phase 6 Testing and Validation Reference

Loaded at Phase 6 entry. Contains test SQL patterns, quality gate execution procedures, and the lint compliance checklist. All project-specific values are resolved from `../../../assets/dataforge.manifest.resolved.yaml`.

For the Phase 6 checklist, see [gate-deployment.md](gate-deployment.md).

---

## Entry Prerequisites

1. Phase 5 complete — all pipeline code written and dry-run validated.
2. Memory store checkpoint 5 written with `artifacts` containing all Phase 4-5 files and `completed_phases` including `5`.
3. `verify.py phase-entry {build_id} 6` returned exit code 0.
4. `verify.py artifacts-exist {build_id}` returned exit code 0 — confirms all Phase 4-5 artifacts are on disk.

---

## Build Path Routing

| Build Path | Testing Work |
| :--- | :--- |
| `new_entity` | Generate the full test suite. Run lint quality gate on all new files. |
| `extension` | Extend the existing test SQL to cover the new metrics. Run lint quality gate on modified files. |
| `rename` | Update test SQL with the renamed columns. Run lint quality gate on modified files. |
| `removal` | Not handled in Phase 6 — see [on-demand-removal.md](on-demand-removal.md). |

---

## Step 1: Test SQL Generation

Write the test SQL alongside the entity's pipeline code as `__<entity>_test.sql`. The test SQL validates pipeline output against source data.

### Test Window

The test window start date defaults to `MIN(TO_DATE(created_at))` from the source table (verified during Phase 2 Query 1). If the user provided a specific start date, use that instead. The end date defaults to yesterday (UTC). Record the window in the memory store `validation` node.

### Test Categories

Generate one query per category. Each must be independently runnable through `forge-dbx`.

| Category | What It Proves |
| :--- | :--- |
| Source-vs-target row count | The pipeline produced the expected number of rows per date |
| Metric rollup | Metric values match a direct COUNT on the source table |
| Grain completeness | Every active grain has non-zero rows |
| Date range coverage | Every date in the window has at least one row |
| NULL checks | No NULL values in grain columns or metric columns |
| Schema alignment | Column names and types match the DDL |

### Test Exclusion: _update_count Metrics

Metrics with the `_update_count` suffix are excluded from row-count test assertions. The reason: `_update_count` uses `AND TO_DATE(updated_at) != TO_DATE(created_at)` which makes the daily count non-reproducible from a simple source count. The pipeline correctly populates these values, but test SQL cannot independently verify the count without replicating the full exclusion logic.

Verify that:
- `_update_count` metrics appear in the pipeline output (they are populated).
- `_update_count` metrics do NOT appear in test assertion WHERE clauses (they are not tested for exact counts).
- A comment documents why `_update_count` is excluded from each test that omits it.

### Custom Test Additions

If the metric design includes filter conditions (CASE WHEN with string predicates), add a test that verifies the filter column values match the Phase 2 Query 5 enumeration results:

```sql
SELECT DISTINCT {filter_column}
FROM {target_table}
WHERE SNAPSHOT_DATE = DATE '{test_date}'
  AND total_{entity}_{verb}_count > 0
```

If the result set includes values not in the Phase 2 enumeration, the filter may be too broad. If it excludes expected values, the filter may be too narrow.

---

## Step 2: Lint Quality Gate

Run the Phase 4 and 5 checklists from [gate-engineering.md](gate-engineering.md) plus the Cross-Phase Consistency Checks section across all files produced in Phases 4-5. These checklists collectively cover standards compliance (naming, casing, formatting), pipeline integrity (runner contract, f-string safety, forbidden patterns), cross-file consistency (schema-pipeline alignment), and final review (zone hardcoding, comment safety, grain restriction). All items must pass.

---

## Step 3: Issue Resolution

If the quality gate reveals issues:

1. Attempt auto-fix using the Self-Healing Patterns in [gate-recovery.md](gate-recovery.md).
2. If auto-fix succeeds, re-verify the specific check.
3. If auto-fix fails, present the issue to the user with file path, line number, expected vs. actual.
4. Record all issues and resolutions in the memory store `validation` node.

### Validation Node Structure

```json
{
  "phase_6": {
    "test_sql_generated": true,
    "lint_gate_result": "PASS",
    "issues_found": 0,
    "issues_fixed": 0,
    "failures": [],
    "update_count_exclusions": ["total_{entity}_update_count"],
    "test_window": {
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD"
    }
  }
}
```

---

## Verification

Run the [gate-deployment.md](gate-deployment.md) Phase 6 checklist before writing the memory store checkpoint.

Key verification items:
1. Phase Entry Hook and artifacts-exist check both passed.
2. Test SQL covers all non-update metrics.
3. `_update_count` metrics excluded from test assertions.
4. Full lint quality checklist passed (all 4 categories).
5. Memory store updated with `validation` and `blocking` fields.
