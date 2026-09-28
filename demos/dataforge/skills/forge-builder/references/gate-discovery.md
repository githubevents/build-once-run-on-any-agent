# Quality Gate: Discovery Session (Phases 1-3)

Verification checklists for intake, data discovery, and metric design phases. Items marked `[lint]` are rules owned by `forge-lint`. All checks reference the manifest for project-specific values.

---

## Phase 1: Intake and Scoping

- [ ] **Phase 1 Entry Check executed FIRST:** Checked for existing `.build-state/{build_id}.json` before any external call, GitHub fetch, or intake mode execution.
  - If found with `completed_phases: [1]`: Resume Protocol invoked — Phase 1 NOT re-executed.
  - If found with `completed_phases: []`: Pre-Phase 1 Start State Write skipped — continued from in-flight Phase 1.
  - If not found: Pre-Phase 1 Start State Write executed.
- [ ] Tool name identified and matches an entry in `manifest.domains` (or user confirmed new domain)
- [ ] Metric name(s) validated against `manifest.naming.metric_pattern` and pass `manifest.naming.metric_regex`
- [ ] Minimum Metric Spec: all 3 critical elements PRESENT (Tool Name, Metric Name, Source Table)
- [ ] Scoping document generated with: tool_name, metric_names, entity tables, business definitions, grains, cadences
- [ ] Build path determined: new entity, existing entity, or rename
- [ ] **BLOCKING — Hypothesis declaration:** Every value from the issue or request (table paths, column names, filter strings, entity ID columns, metric name proposals) recorded in the memory store `metrics` array as spec inputs with `status: "hypothesis"`. Explicitly labeled as hypotheses — not facts. None may appear in Phase 3 SQL without Phase 2 live query confirmation.
- [ ] **BLOCKING — candidate_filter_columns populated:** All string columns likely to be used in filter conditions identified and recorded in each metric object's `candidate_filter_columns` array. Phase 2 Query 5 runs for every column listed here.
- [ ] **Mode A only — tool-name resolution:** If start state was written with `unknown` as placeholder, Phase 1 checkpoint renames the file to the resolved `build_id`, deletes the `unknown--{issue_number}.json` placeholder, and updates the lock file.
- [ ] `.build-state/` directory verified to exist (do not create with mkdir; restore via `git checkout -- skills/forge-builder/.build-state/.gitkeep` if missing)
- [ ] **BLOCKING:** Memory store initialized with all v2 schema fields (including `schema_version: 2`, `hypothesis_log: []`, object-format `metrics`) and written to disk before Phase 2 begins
- [ ] **BLOCKING:** `verify.py schema-check {build_id}` executed and returned exit code 0

---

## Phase 2: Data Discovery

- [ ] **Phase Entry Hook passed:** `verify.py phase-entry {build_id} 2` returned exit code 0.
- [ ] **BLOCKING:** forge-dbx authentication completed to the primary development zone before any queries run. Codebase pattern search alone does NOT satisfy this gate.
- [ ] **BLOCKING:** Source table existence and volume confirmed via live SQL query (Query 1). Codebase inference does not satisfy this gate. Query failure = STOP and update memory store `blocking`.
- [ ] **BLOCKING:** `DESCRIBE TABLE {source_table}` executed and results reviewed (Query 2). Every column referenced in the metric design appears in this output. Columns absent from the output do not exist — remove from design immediately and surface to user. Column names from specs, issues, or prior pipelines are hypotheses until confirmed here.
- [ ] **BLOCKING:** Grain feasibility NULL-rate queries executed for all grains in `manifest.grains` against the live data platform (Query 3). INACTIVE grains documented in memory store. SUSPECT grains flagged to user with NULL rate — user must confirm before proceeding. Inference from existing pipeline code does not satisfy this gate.
- [ ] **BLOCKING:** Soft-delete check (Query 4) run or explicitly skipped with documented reason (absent from Query 2 output).
- [ ] **BLOCKING:** For every string column in `candidate_filter_columns`, top-50 values by frequency enumerated via `SELECT {column}, COUNT(*) AS cnt ... GROUP BY ALL ORDER BY cnt DESC LIMIT 50` against the primary development zone (Query 5). Issue descriptions and specs are not data evidence. Mandatory for new and extension builds.
- [ ] **BLOCKING:** Every spec-named filter value confirmed present with exact character-level match: either visible in the top-50 frequency result, or confirmed via a required follow-up targeted equality query or full distinct-values query without `LIMIT` when the top-50 result was insufficient. Case variants, whitespace variants, and synonym labels identified. Filter adjusted with `UPPER(TRIM({column}))` or explicit variant inclusion so no meaningful subset of the target population is silently excluded. A spec value absent from both the top-50 result and all follow-up queries = STOP.
- [ ] **BLOCKING:** All applicable queries from the 5-query sequence completed. A skipped query that was applicable is a blocking error — document skip reason explicitly.
- [ ] **BLOCKING:** Discovery Presentation Gate passed — complete Data Discovery Report (source table, column inventory, date range, grain matrix, quality flags, domain) presented to user and acknowledged before Phase 3 begins. In autonomous mode, log to memory store and continue.
- [ ] **BLOCKING — Hypothesis Resolution Log written:** Every Phase 1 hypothesis evaluated against live query results and written to `hypothesis_log` array as structured objects. Each hypothesis explicitly marked CONFIRMED, REVISED, or INVALIDATED. No unresolved hypothesis may carry forward into Phase 3.
- [ ] **BLOCKING:** `verify.py hypothesis-count {build_id}` executed and returned exit code 0.
- [ ] **BLOCKING:** Memory store checkpoint written with `source_table`, `grains`, `hypothesis_log`, `metrics[].status` updated to `"confirmed"`, `current_phase`, `completed_phases`, `updated_at`, `git_commit` before Phase 3 begins.
- [ ] **BLOCKING:** `verify.py checkpoint-written {build_id} 2` executed and returned exit code 0.
- [ ] Entity ID column confirmed from `DESCRIBE TABLE` output — not assumed from spec
- [ ] All date columns relevant to the metric confirmed to exist via `DESCRIBE TABLE` output — not assumed
- [ ] Soft-delete column presence determined from `DESCRIBE TABLE` output, not inferred
- [ ] Domain assignment confirmed via `manifest.domains` tool lists

---

## Phase 3: Metric Design

- [ ] **Phase Entry Hook passed:** `verify.py phase-entry {build_id} 3` returned exit code 0.
- [ ] **Hypothesis verification passed:** `verify.py hypothesis-count {build_id}` returned exit code 0 (confirms no unresolved hypotheses before design begins).
- [ ] SQL expression designed for every metric_name in scope
- [ ] Join strategy determined from lint join patterns decision tree `[lint]`
- [ ] CTE names follow `manifest.naming.cte_case` convention `[lint]`
- [ ] Metric block formatting follows standard pattern `[lint]`
- [ ] **BLOCKING:** Proof-of-concept query executed against a single recent date via forge-dbx and returned valid rows with no runtime errors. Phase 4 does NOT begin until this query succeeds.
- [ ] **BLOCKING:** If the metric uses a string filter condition and the single-date PoC query returns zero counts, do not immediately treat the filter as incorrect. Run a diagnostic query over a recent 7-day window (`TO_DATE(created_at) BETWEEN DATE_SUB(CURRENT_DATE(), 7) AND CURRENT_DATE()`) to confirm whether the filter matches at least one row across a broader date range. A zero result across the full 7-day window indicates the filter expression does not match any data — diagnose against Query 5 enumeration results and correct before proceeding. A zero result on the single-date PoC alone is acceptable if the 7-day diagnostic returns a non-zero count.
- [ ] If the metric has no filter condition and the PoC returns zero counts, retry with a 7-day window before proceeding. If still zero across 7 days, flag to user — do not assume the expression is correct. Record in memory store `validation` with the date range tested and the count result.
- [ ] User gate presented -- design approved before proceeding
- [ ] **BLOCKING:** Memory store checkpoint written with `join_strategy`, `metrics[].status` updated to `"designed"`, `current_phase`, `completed_phases`, `updated_at`, and `git_commit` before Phase 4 begins
- [ ] **BLOCKING:** `verify.py checkpoint-written {build_id} 3` executed and returned exit code 0.
