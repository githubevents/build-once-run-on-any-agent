# Phase 1 Intake Reference

Loaded at Phase 1 entry. Contains all intake mode procedures, the Universal Hypothesis Boundary, and the Scoping Decision Tree. All project-specific values are resolved from `../../../assets/dataforge.manifest.resolved.yaml` (or `../../../assets/dataforge.manifest.yaml` if it contains legacy full-manifest keys).

---

## Universal Hypothesis Boundary

**This rule applies to every intake mode without exception.** All values provided by an issue, natural language request, definitions SQL reference, or profiler output are hypotheses — not facts.

| Hypothesis Source | Resolving Query | Resolution Phase |
| :--- | :--- | :--- |
| Source table path from issue, spec, or prior code | Query 1 — live existence and volume check | Phase 2 |
| Column names from issue, spec, or any existing pipeline | Query 2 — `DESCRIBE TABLE` | Phase 2 |
| Filter values (status labels, type strings, etc.) from issue or spec | Query 5 — `SELECT DISTINCT` enumeration | Phase 2 |
| Entity ID column from issue or spec | Query 2 — `DESCRIBE TABLE` | Phase 2 |
| Metric name proposals from issue | `manifest.naming.metric_regex` validation | Phase 2 |
| NULL rates and grain feasibility | Query 3 — live NULL-rate queries per grain | Phase 2 |
| Soft-delete column existence | Query 4 — soft-delete check from `DESCRIBE TABLE` | Phase 2 |

**Rule:** Record all issue and spec values in the memory store `metrics` array as initial spec inputs. Do not carry any of these values into Phase 3 SQL expressions without Phase 2 live confirmation. If Phase 2 evidence contradicts a hypothesis, the hypothesis is wrong — not the data.

---

## Mode A: GitHub Issue (Primary)

**Trigger:** User provides a GitHub issue number (e.g., `1234`) or says "build metrics from issue X".

**`gh` invocation patterns:** Read [phase-1-issue-intake.md](phase-1-issue-intake.md) for exact command syntax, the Minimum Metric Spec checklist, and the Spec Challenge Comment template.

The target repository comes from `manifest.project.repository`. When that is null, `gh` operates on the repository in the working directory.

**Step 1 -- Retrieve issue:**
- Use the `gh` CLI to fetch the issue. See [phase-1-issue-intake.md](phase-1-issue-intake.md) for exact invocation syntax.
- Take the author's login from the `author.login` field for the @-mention.

**Step 2 -- Evaluate against the Minimum Metric Spec (7 elements):**
See [phase-1-issue-intake.md](phase-1-issue-intake.md) for the full 7-element checklist and scoring rules.

Score each element PRESENT, PARTIAL, or MISSING.

**Step 3 -- Decision:**

- **Spec sufficient** (all 3 critical elements PRESENT — Tool Name, Metric Name, Source Table — and agent can data-default the rest): Extract scoping data. Add a confirmation comment and apply an in-progress label if the repository uses one. Proceed to Scoping Decision Tree.
- **Spec insufficient** (any critical element MISSING, or 3+ total MISSING): Write the start-state memory store NOW with `blocking: "Spec challenge posted — awaiting issue update by {reporter}"` and `status: "blocked"`. Then post a Spec Challenge Comment tagging the reporter. STOP. Inform the user. Resume when the issue is re-submitted.

Writing the memory store before stopping ensures the resume protocol finds the build in a blocked state and does not re-post the challenge comment.

---

## Mode B: Natural Language

**Trigger:** User describes metrics directly (e.g., "build metrics for Incident").

- Parse into: tool_name, metric_name(s), verb(s), business definitions
- Validate metric_name(s) against the naming pattern from `manifest.naming.metric_pattern`
- Validate each verb appears in `manifest.naming.metric_regex` verb allowlist
- If tool name only, look up all metrics for that tool from the definitions SQL listed in `manifest.downstream.integrations` (type: `sql_definitions`)
- If ambiguous, ask up to 3 targeted questions before proceeding

---

## Mode C: Definitions SQL Reference

**Trigger:** User references a definitions SQL file with a tool filter.

- Read the definitions file from `manifest.downstream.integrations` (type: `sql_definitions`), filter to requested tool_name(s)
- Extract metric_name and metric_definition pairs
- Cross-reference against existing entity folders to find what is already built — any metrics already present are excluded from the build scope

---

## Mode D: Discovery-Driven (Analyst / Data Scientist)

**Trigger:** User provides a source table name or catalog path and wants to discover what metrics can be built from it.

This mode is the Explore-to-Build workflow for users who do not yet know the tool name, metric names, or business definitions. It profiles the source table through `forge-dbx`, then proposes candidate metrics for the user to select.

**Step 1 -- Profile the source table:**
- Through [forge-dbx](../../forge-dbx/SKILL.md), run `DESCRIBE TABLE` on the user-provided table, then a row count and a per-column NULL rate query using `manifest.source_metadata` templates
- From the profile, extract:
  - **Entity ID candidates:** columns with high cardinality and `_id` suffix (e.g., `change_request_id`, `ticket_id`, `id`)
  - **Date column candidates:** columns with DATE or TIMESTAMP types (e.g., `created_at`, `updated_at`, `closed_at`, `due_date`)
  - **User attribution candidates:** columns matching grain column names from `manifest.grains` (e.g., `user_id`, `user_id`)
  - **Row count and temporal range:** to assess viability

**Step 2 -- Propose candidate metrics:**
- For each (entity_id, date_column) pair, propose a metric following `manifest.naming.metric_pattern`:
  - `created_at` → `total_{entity}_create_count`
  - `updated_at` → `total_{entity}_update_count`
  - `closed_at` → `total_{entity}_close_count`
  - Other date columns → `total_{entity}_{verb}_count` where verb is inferred from the column name and must appear in the `manifest.naming.metric_regex` verb allowlist
- For each candidate, include: proposed metric name, driving date column, entity ID column, estimated non-zero rate (from profile completeness data)
- Flag candidates where the date column has >50% NULL rate as low-confidence

**Step 3 -- Present proposals to the user:**
- Display a numbered list of candidate metrics with confidence indicators
- Ask the user to select which metrics to build (all, a subset, or none)
- Ask for the tool name if it cannot be inferred from the table name
- Ask which domain the tool belongs to (present options from `manifest.domains`)

**Step 4 -- Transition to standard pipeline:**
- With the user's selections, construct the Scoping Document as if Mode B had been used
- Proceed to Phase 2. Profile findings may substitute for mandatory Queries 1 and 2 **only if** the profile queried the same catalog zone as `manifest.platform.zones[0]` and its output includes an explicit column list and a row count. Queries 3 (grain feasibility NULL rates), 4 (soft-delete check), and 5 (filter column enumeration) must execute independently as live queries regardless of profile findings.

**Data-Default decisions for Mode D:**

| Decision | Default |
| :--- | :--- |
| Entity ID column | Highest-cardinality `_id` column |
| Date columns | All DATE/TIMESTAMP columns with <50% NULL rate |
| Tool name | Inferred from table name or schema, ask if ambiguous |
| Domain | Ask user (present `manifest.domains` options) |

---

## Scoping Decision Tree

After intake, determine the build path. Set the `build_path` field in the memory store to one of the four canonical values below.

| Condition | `build_path` value | Phases |
| :--- | :--- | :--- |
| Entity folder already exists; adding new metrics | `"extension"` | 1, 2-3 (scoped to new metrics), 4-7 |
| New entity / tool | `"new_entity"` | 1-7 |
| Metric rename or re-categorization | `"rename"` | 1, 4, 6, 7 |
| Full removal or deprecation | `"removal"` | Removal and Deprecation flow |

**Existing entity scoping:** When adding metrics to an existing entity, Phase 2 discovery is scoped to verifying that new date columns and entity ID columns exist in the source table. Phase 3 designs SQL expressions for new metrics only. The agent reads the existing pipeline code to understand the current CTE structure before designing the integration approach.

**Domain placement:** Look up the tool_name in `manifest.domains`. Each domain entry has a `tools` list. If the tool is not in any domain's list, ask the user which domain it belongs to before proceeding.

**Folder and display name derivation:**
- Folder name: `manifest.folder_name_overrides.{tool}` if present, otherwise `tool_name.replace('_', ' ').title().replace(' ', '_')`
- Display name: `manifest.tool_name_overrides.{tool}` if present, otherwise `.title()`

### candidate_filter_columns Identification

During intake, identify all string columns likely to be used in filter conditions based on the metric verb and business definition. Record these in each metric object's `candidate_filter_columns` array. Phase 2 Query 5 runs `SELECT DISTINCT` for every column in this list.

Sources for filter column candidates:
- GitHub issue description mentions a column or status value
- Business definition implies filtering (e.g., "approved releases" implies a status column)
- Metric verb is a state transition (approve, reject, close) that implies a status/type filter
- Existing pipeline code for the same entity uses a CASE WHEN filter on a string column

If Phase 3 introduces a filter on a column not in `candidate_filter_columns`, the agent must return to Phase 2 for enumeration before finalizing the design. See [phase-3-design.md](phase-3-design.md) for the validation protocol.

**Artifact:** Scoping Document (in-memory): tool_name, metric_name(s), entity table(s), business definitions, grain requirements, temporal requirements, GitHub issue key (if Mode A), build path, folder name, display name, candidate_filter_columns per metric.
