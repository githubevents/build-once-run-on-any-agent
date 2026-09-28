# Quality Gate: Engineering Session (Phases 4-5)

Verification checklists for schema architecture, pipeline code, and downstream alignment phases. Items marked `[lint]` are rules owned by `forge-lint`. All checks reference the manifest for project-specific values.

---

## Phase 4: Schema Architecture

- [ ] **Phase Entry Hook passed:** `verify.py phase-entry {build_id} 4` returned exit code 0.

**spark_python framework:**
- [ ] Column order in schema DDL matches planned pipeline SELECT order `[lint]`
- [ ] All metric columns follow `manifest.naming.column_case` `[lint]`
- [ ] System columns from `manifest.naming.system_columns.uppercase` are UPPERCASE `[lint]`
- [ ] Every column has a COMMENT with correct grain suffix `[lint]`
- [ ] ALTER scripts have `-- [MODIFIED YYYY-MM-DD]` tags `[lint]`
- [ ] `ALTER_LOG.md` created or updated `[lint]`
- [ ] Inactive grains have INACTIVE header in schema file `[lint]`
- [ ] Correct number of schema files generated (active grains from `manifest.grains` x 2 cadences + inactive grains)
- [ ] **BLOCKING:** Memory store checkpoint written — append to `artifacts` (schema DDL and ALTER files), `current_phase`, `completed_phases`, `updated_at`, and `git_commit` before Phase 5 begins
- [ ] **BLOCKING:** `verify.py checkpoint-written {build_id} 4` executed and returned exit code 0.

**dbt framework:**
- [ ] Column order in schema.yml matches planned model SELECT order `[lint]`
- [ ] All metric columns follow `manifest.naming.column_case` `[lint]`
- [ ] System columns from `manifest.naming.system_columns.uppercase` are UPPERCASE `[lint]`
- [ ] Every column has a description
- [ ] Generic tests defined for grain columns (`not_null`)
- [ ] `on_schema_change` config present for incremental models
- [ ] Materialization matches `manifest.dbt.materialization_default`

---

## Phase 5: Pipeline Code

- [ ] **Phase Entry Hook passed:** `verify.py phase-entry {build_id} 5` returned exit code 0.

**spark_python framework:**
- [ ] **BLOCKING:** Runner import present (daily or cumulative runner from `manifest.runner`) `[lint]`
- [ ] **BLOCKING:** Zone stubs declared at module level for each global in `manifest.runner.injected_globals` (excluding `SNAPSHOT_DATE` for Daily) `[lint]`
- [ ] **BLOCKING:** `run_query` signature matches runner contract (Daily: `snapshot_date, table_name, group_by_columns`; Cumulative: `table_name, group_by_columns`) `[lint]`
- [ ] **BLOCKING:** Entry point calls the runner with appropriate `grains=` restriction `[lint]`
- [ ] **BLOCKING:** Every catalog reference includes the zone suffix variable `[lint]`
- [ ] **BLOCKING:** No argparse, no `load_data()`, no `get_date_range()`, no `get_parameters()` in entity file `[lint]`
- [ ] CTE names follow `manifest.naming.cte_case` (snake_case per manifest default) — verify with `rg "WITH [A-Z]" {file}` returning no matches `[lint]`
- [ ] F-string safety: no `\` in expressions, no `/* */` comments, no `#` in SQL, no `;` in comments `[lint]`
- [ ] `GROUP BY ALL` in every query `[lint]`
- [ ] `TO_DATE()` for all date casting `[lint]`
- [ ] Metric blocks formatted: COUNT/DISTINCT/CASE/WHEN/THEN/ELSE NULL/END on separate lines `[lint]`
- [ ] Grain restriction via `grains=` parameter matches Phase 2 grain feasibility findings `[lint]`
- [ ] Job definition task keys unique within the file (new entities only) `[lint]`
- [ ] Spark conf block has standard keys from `manifest.spark_conf.standard` (new entities only) `[lint]`
- [ ] STRUCT field names match between entity pipeline and entity schema `[lint]`

**dbt framework:**
- [ ] **BLOCKING:** Config block present with `materialized`, `tags`, and `incremental_strategy` from manifest `[lint]`
- [ ] **BLOCKING:** Source references use correct `{{ source() }}` macro with `dbt_source` from `manifest.catalogs.sources` `[lint]`
- [ ] **BLOCKING:** `is_incremental()` guard present for incremental models `[lint]`
- [ ] Metric blocks follow lint SQL formatting `[lint]`
- [ ] `GROUP BY ALL` or explicit GROUP BY in every query `[lint]`
- [ ] Grain restriction implemented via config or Jinja conditional `[lint]`
- [ ] `sources.yml` updated if new source table referenced `[lint]`

**Checkpoint:**
- [ ] **BLOCKING:** Memory store checkpoint written — append to `artifacts` (pipeline code and job definition files), `metrics[].status` updated to `"implemented"`, `current_phase`, `completed_phases`, `updated_at`, and `git_commit` before Phase 6 begins
- [ ] **BLOCKING:** `verify.py checkpoint-written {build_id} 5` executed and returned exit code 0.

---

## Cross-Phase Consistency Checks (End of Engineering Session)

Run these checks at the end of the engineering session before handing off to testing.

### Column Name Alignment (Phases 4-5)

Every metric column name must be identical across: Pipeline SELECT alias, Schema DDL/schema.yml column, Schema COMMENT/description, and ALTER script (if applicable). See [phase-4-schema.md](phase-4-schema.md) Cross-Phase Column Contract for the authoritative alignment table.

### Grain Consistency (Phases 2-5)

A grain marked INACTIVE in Phase 2 must be consistently handled across Phase 4 (INACTIVE header) and Phase 5 (`grains=` restriction). Job definitions still pass all grain table parameters regardless.
