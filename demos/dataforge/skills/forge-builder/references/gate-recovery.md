# Quality Gates: Recovery and Diagnostics

Loaded on demand when a verification gate fails, a runtime error occurs, or an edge case is encountered. Not loaded during standard phase execution.

---

## Self-Healing Patterns

When a verification gate fails, the agent should attempt these auto-fixes before escalating to the user:

| Failure | Auto-Fix |
| :--- | :--- |
| Column name casing mismatch | Convert to `manifest.naming.column_case` |
| Missing COMMENT suffix (spark_python) or description (dbt) | Add correct grain suffix |
| Duplicate alias in wide table | Pick next available alias from registry |
| Inclusion list out of order | Re-sort alphabetically |
| `metric_label` used where `metric_name` expected (or vice versa) | Swap to correct format |
| Missing `-- [MODIFIED YYYY-MM-DD]` tag | Add with current date |
| Schema column order mismatches pipeline | Reorder schema to match pipeline |
| Entity file contains argparse or `load_data()` (spark_python) | Replace with runner import and runner call |

If auto-fix succeeds, log the fix and re-verify. If auto-fix fails or the issue is structural, present to the user with:
- File path
- Line number or section
- Expected value
- Actual value

---

## Runtime Error Catalog

Common data platform errors encountered during metric builds, with root causes and fixes.

| Error | Phase | Root Cause | Fix |
| :--- | :--- | :--- | :--- |
| SQL parse / syntax error | 3, 5, 8 | Bare quote inside f-string SQL terminates the string, or template expression imbalance | Use variables for zone/date references, double-brace `{{` for literal braces |
| Unresolved column | 3, 5, 8 | Column name does not exist in the table, or wrong table alias | Verify column name against schema inspection output. Check alias prefix. |
| Table or view not found | 3, 8 | Wrong catalog path, missing zone suffix, or table does not exist in the target zone | Verify full path against `manifest.catalogs.sources` pattern. Check zone suffix. |
| Ambiguous column reference | 5, 8 | Same column name in multiple tables within a JOIN | Add explicit table alias prefix to the column |
| Division by zero | 3, 8 | Division in a metric expression with zero denominator | Wrap with `CASE WHEN denominator > 0 THEN ... ELSE 0 END` |
| Invalid cast input | 3, 8 | Casting a non-date string to DATE | Verify source column data type. Use defensive casting (e.g., `TRY_CAST`). |
| Missing column in INSERT | 5, 9 | Pipeline SELECT column list does not match schema DDL column order | Align pipeline SELECT order to match schema exactly. Use `BY NAME` clause if available. |
| Missing partition column | 5, 9 | Partition column missing from SELECT output | Ensure partition clause references the correct partition column from schema |
| Template variable KeyError (Python) | 5 | Brace `{` inside SQL interpreted as f-string variable | Escape with `{{` for literal braces, or extract SQL to a non-f-string variable |
| f-string backslash error (Python) | 5 | `\n` or `\t` inside an f-string expression | Move the backslash-containing string outside the f-string |
| dbt compilation error | 5 | Invalid Jinja syntax, missing source definition, or macro not found | Check `sources.yml` for source declaration, verify macro imports, validate Jinja syntax |

### Diagnosis Protocol

When a runtime error occurs:

1. Match the error message against this catalog
2. If matched, apply the documented fix
3. If not matched, check the backfill skill for additional patterns
4. If still unmatched, capture the full error message, the SQL that produced it, and the file/line that generated the SQL. Present to user with diagnosis.
5. After fixing, record the error and fix in the memory store as a `validation` node with `result: "fail_then_fix"` and the error details in `failures`

---

## Engineering Rollback

When a phase fails and the agent needs to revert code changes from a previous phase.

### When to Rollback

- Phase 5 fails and Phase 4 changes were made to an existing entity's pipeline file
- Phase 4 fails and schema files need to be removed
- Quality gate at Phase 6 fails with structural issues that require redesign from Phase 3

### Rollback Procedure

See [system-memory-store-recovery.md](system-memory-store-recovery.md) for the full rollback protocol, non-revertible changes, and phase dependency chain.

---

## Session Boundary Protocol

At each session boundary:

1. **Write the memory store checkpoint** (see [system-memory-store.md](system-memory-store.md)) for the current phase
2. **Present a human-readable summary** to the user, derived from the memory store state:

- Phases completed: {from `completed_phases`}
- Artifacts produced: {from `artifacts`}
- Metrics in scope: {from `metrics`}
- Next phase: {from `max(completed_phases) + 1`}
- Blocking issues: {from `blocking` field, or "None"}
- Entity: {tool_name} / {folder_name}
- Domain: {domain}
- Source table: {source_table}
- GitHub issue: {issue_number}
- Branch: {branch}

Do not maintain a separate text-based summary independently of the memory store. The memory store IS the session state -- the summary is a human-readable projection of it.

---

## Context Budget Guidance

| Session | Expected File Reads | Expected File Writes | Estimated Context |
| :--- | :--- | :--- | :--- |
| Discovery and Design (1-3) | 5-10 (definitions, source tables, existing patterns) | 0 (artifacts in-memory) | Low |
| Engineering (4-5) | 10-15 (schemas, pipelines, existing entity files) | 10-20 (new files + modifications) | High |
| Testing and Deployment (6-7) | 5-8 (tests, README) | 5-10 (test files, docs, PR) | Medium |

If context is running low during a session:
1. Summarize current state
2. List remaining work
3. Offer to continue in a new session with the summary as context

---

## Data Quality Red Flags

Every row in this table is a query result pattern, not an assumption. If any of these conditions are observed in query output, apply the mitigation before writing metric code.

| Observed in Query Output | Risk | Mitigation |
| :--- | :--- | :--- |
| Grain column 100% NULL | Grain is impossible | Mark INACTIVE in Phase 4, exclude from runner |
| Grain column >50% NULL | Grain is suspect | Flag to user — confirm intent before proceeding |
| `created_at` has future dates | Bad upstream data | Add `AND TO_DATE(created_at) <= CURRENT_DATE()` |
| `deleted_at` present with non-NULL values | Soft deletes exist | Add `AND deleted_at IS NULL` |
| Entity ID column has duplicates per date | Source has fan-out | Present the fan-out to the user. Confirm COUNT DISTINCT is the correct deduplication strategy, or determine if a more specific entity ID is needed. User must confirm before proceeding. |
| `updated_at` < `created_at` for some rows | Data quality anomaly | Use `AND TO_DATE(updated_at) != TO_DATE(created_at)` for update metrics |
| String filter column has case or whitespace variants | Filter silently misses rows | Use `UPPER(TRIM({column})) IN (...)` |
| String filter column has synonym labels | Filter silently misses rows | Enumerate and include all synonyms, or normalize with UPPER |
| Spec-named filter value absent from enumeration result | Filter returns zero rows | Align filter to actual data — do not trust the spec |
| Filter column is high-cardinality with user-defined labels | Partial coverage | Check for a categorical column that groups labels by business intent |

---

## Edge Cases

| Scenario | Handling |
| :--- | :--- |
| Entity folder already exists | Scoping Decision Tree: abbreviated path (Phases 1, 2-3 scoped, 4-9). Read existing pipeline code before designing. |
| Memory store file exists for this build_id | Resume Protocol: reconstruct state, present summary, continue from identified phase. |
| Memory store is stale (>48h old) | Warn user: "Source tables or codebase may have changed. Re-run Phase 2 discovery?" |
| Codebase drift (`git_commit` != current HEAD) | Warn user with old and new commit SHAs. Offer to re-run Phase 2 discovery to verify assumptions still hold. |
| Build-state claims completion but metric absent from code | Fabricated build-state: a prior session wrote checkpoints without implementing. Treat all claimed-complete phases as unverified. Search each pipeline file for the metric alias (e.g., `rg "total_{entity}_{verb}_count" --type py`). For each file where the metric is absent, mark the producing phase incomplete and re-execute from there. Do NOT skip re-implementation because the build-state claims a phase is done. |
| Concurrent builds for the same tool | Lock file prevents conflict (`.build-state/{tool_name}.lock`). Stale locks (>2h) are auto-released. See [system-memory-store.md](system-memory-store.md). |
| Platform auth expired mid-build | Pause. Re-authenticate via `forge-dbx`. Resume from the failed step. |
| Source table does not exist in a zone | Stop. Do not guess. Ask user to confirm the table path for that zone. |
| Ambiguous tool name | Ask with concrete options from `manifest.domains`. |
| Virtual tool name referenced | Resolve via `manifest.virtual_tools`. Use `base_tool` for source table lookup, apply the virtual tool's grain override. Virtual tools share the base entity folder but have separate pipeline files. |
| Spec challenge not answered | STOP after posting the comment. Resume when the issue is updated. Do not guess missing spec elements. |
| Schema drift (DDL does not match target) | Phase 6 quality gate catches this. Generate an ALTER script to reconcile. |
| Phase 3 sample query fails | Diagnose using the Runtime Error Catalog above. Fix expression and re-test before proceeding. |
| All grains inactive for an entity | Generate schema files with INACTIVE headers. Pipeline should not process inactive grains. Job definitions still pass all params. |
| Pipeline load failure | Check table history, restore if needed. Report to user, comment on the GitHub issue. |
| Schema change failure | No rollback needed (DDL fails cleanly). Fix the SQL and re-run. |
