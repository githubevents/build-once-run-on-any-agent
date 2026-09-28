# Removal and Deprecation

Loaded on demand when the user requests deprecating a metric or retiring an entity.

---

## Removal Types

| Type | Scope | Action |
| :--- | :--- | :--- |
| Metric deprecation | One metric | Stop populating the metric in the pipeline. The column stays in the schema (never DROP COLUMN -- most columnar formats including Delta and Iceberg do not support safe column removal without rewrite). |
| Entity removal | Entire entity | Deprecate every metric on the entity, remove the entity's runner call, and comment out its job definition tasks. |

---

## Procedure

1. **Pipeline:** Remove the metric expression from `run_query()`. Leave the column out of the SELECT rather than emitting NULL, so the schema default applies.
2. **Schema:** Do NOT drop the column. Add a `-- DEPRECATED YYYY-MM-DD` comment to the column definition so the next reader knows it is no longer populated.
3. **Tests:** Remove the metric from test assertions. A deprecated column that still holds historical values should not be asserted against new source counts.
4. **Documentation:** Add a row to the entity development history table recording the deprecation date and reason.
5. **Memory store:** Create a removal-type build with `build_path: "removal"` and track all artifacts modified.

Historical values already written to the table are preserved. Deprecation stops new writes; it does not rewrite history.
