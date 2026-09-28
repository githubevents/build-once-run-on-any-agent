---
name: forge-lint
description: >-
  Mandatory standards reference for any manifest-driven metric store. MUST be read before ANY
  modification to pipeline code, SQL, schema, or job configuration files. Enforces naming conventions,
  SQL formatting, join strategies, schema alignment, and quality gates -- all parameterized via
  the dataforge manifest. Triggers on "forge-lint", "dataforge lint", "check standards", "naming convention",
  "metric naming", "code compliance", "format check", "metric store", "metrics snapshot",
  "job definition", "engine config", "job json", "semicolon", "comment rule",
  "help me fix this pipeline", "pipeline error".
metadata:
  status: "beta"
  agent-tools: [read, search, edit]
  human-description: Enforces naming, SQL formatting, and safety rules for metric pipelines, checked automatically whenever pipeline code or schema files change.
---

# forge-lint

forge-lint is the standards gate. It defines what correct looks like. It does not build, deploy, or discover.

Read the resolved manifest before applying any rule. Check for `../../assets/dataforge.manifest.resolved.yaml` first; if missing or stale (seed `../../assets/dataforge.manifest.yaml` has a newer modification time), invoke [forge-init](../forge-init/SKILL.md) to regenerate it. If the seed `../../assets/dataforge.manifest.yaml` contains legacy full-manifest keys (e.g., `catalogs`, `domains`), read it directly as a pre-resolved manifest. If neither resolved nor seed exists, STOP and report. All project-specific values (naming, catalogs, grains, domains, orchestration, runner, spark_conf, downstream) are resolved from the manifest. User rules for source-based development, comprehensive lookups, logic preservation, code order, comment style, sequential work, current dates, consistent patterns, exact references, and auto-apply all remain in effect.

---

## Read on Entry

| Reference File | What It Covers |
| :--- | :--- |
| [references/naming-grammar.md](references/naming-grammar.md) | Column naming, metric pattern, singularization, CTE naming, system columns, validation regex |
| [references/join-patterns.md](references/join-patterns.md) | All 7 join strategy templates (spark_python and dbt), f-string safety, decision tree |
| [references/anti-patterns.md](references/anti-patterns.md) | Universal anti-pattern catalog with severity IDs, detection commands, agent scan directive |
| [references/python-conventions.md](references/python-conventions.md) | Runner architecture, entity file contract, SQL formatting, comment standards, schema standards, ALTER lifecycle |
| [references/dbt-standards.md](references/dbt-standards.md) | dbt-specific conventions: model naming, materialization, testing, deployment |

Read the relevant reference file(s) for the task at hand. Do not guess at rules -- the reference files are authoritative.

---

## Skill Routing

| Skill | When to Use |
| :--- | :--- |
| [forge-lint](SKILL.md) (this file) | Any modification to pipeline code, SQL, schema, or job configuration files |
| [forge-init](../forge-init/SKILL.md) | Resolve or refresh the manifest this skill reads its rules from |
| [forge-dbx](../forge-dbx/SKILL.md) | Run platform CLI jobs (schema changes, pipeline loads, SQL execution, run monitoring) |
| [forge-builder](../forge-builder/SKILL.md) | Build a new metric pipeline end-to-end |

---

## Framework Adapter

Read `platform.pipeline_framework` from the manifest.

**When `spark_python`:** Read [references/python-conventions.md](references/python-conventions.md) and [references/join-patterns.md](references/join-patterns.md).

**When `dbt`:** Read [references/dbt-standards.md](references/dbt-standards.md). Naming grammar and anti-patterns still apply.

---

## Quality Checklist

Run before completing any pipeline file edit. All values are parameterized by the manifest.

### Standards Compliance

- [ ] Column casing, metric naming, CTE casing per manifest `naming.*`. Fix non-compliant on contact. See [references/naming-grammar.md](references/naming-grammar.md).
- [ ] SQL formatting: leading commas, one column per row, `GROUP BY ALL`, `TO_DATE()`. See [references/python-conventions.md](references/python-conventions.md).
- [ ] **BLOCKING:** Comment safety bans: no `/* */` in f-string SQL, no `#` in f-string SQL, no `;` in any comment, no `{variable}` in `--` comments, no `\` in f-strings. See [references/python-conventions.md](references/python-conventions.md).
- [ ] **BLOCKING (spark_python):** Every catalog reference includes zone suffix per manifest `catalogs.sources[].pattern`.
- [ ] **BLOCKING (dbt):** `dbt compile` succeeds, all columns in `schema.yml`, no hardcoded table refs.
- [ ] Pipeline SELECT column order matches all associated schema files.
- [ ] **BLOCKING:** Standard `spark_conf` keys from manifest `spark_conf.standard` present in every job cluster config. Never patch a single job config in isolation.

### Pipeline Checks (if applicable)

- [ ] If new metric: all propagation steps completed in order (entity code -> schema -> downstream integration -> documentation).
- [ ] If architecture change: documentation updated.
- [ ] If modifying a Daily pipeline file: check if Backfill folder exists (per `entity_structure.backfill_dir`). If yes, re-compile backfill SQL and test SQL to match changes.
- [ ] If creating an ALTER script: place in `entity_structure.alter_dir`, verify Schema CREATE TABLE includes the column. Add `-- [MODIFIED YYYY-MM-DD]` above each block. Update `ALTER_LOG.md` with a MODIFIED entry.
- [ ] **BLOCKING:** If marking an ALTER as EXECUTED: verify current date > MODIFIED date. Replace tag with `-- [EXECUTED YYYY-MM-DD]` and comment out all SQL lines below. Append EXECUTED entry to `ALTER_LOG.md`. No partial execution.
- [ ] **BLOCKING:** Never mark an ALTER as EXECUTED on the same day as MODIFIED.
- [ ] If modifying a Schema SQL CREATE TABLE: verify no ALTER script conflicts.
- [ ] If reviewing an ALTER folder: verify no stale MODIFIED ALTERs, `ALTER_LOG.md` exists and is current, no `[EXECUTED` with same date as `[MODIFIED`.
- [ ] If modifying downstream integration files: verify alignment across all downstream files listed in `downstream.integrations` in the manifest. Any mismatch causes silent NULLs.
- [ ] If adding entries to any MD development history table: use `:` left-aligned column separators and look up the actual current date.
- [ ] **BLOCKING (dbt):** If adding a new model: `schema.yml` entry exists, at least one schema test and one data test defined.

### Debug Pass (run immediately after completing code changes)

- [ ] Read the modified code in full. Evaluate every line for syntax errors, logical bugs, mismatched variable names, and broken expressions.
- [ ] Trace data flow through each CTE: verify WHERE filters, JOIN conditions, COALESCE chains, and GROUP BY produce the expected grain and row count.
- [ ] If a backfill test SQL exists, dry-run the test cases against the modified query.
- [ ] If downstream integration files are affected, verify tuple entries, included metrics lists, and name overrides produce correct string matches end-to-end.
- [ ] If downstream files are affected, verify all struct column and field references follow `naming.column_case` from the manifest.
- [ ] If adding entries to a subcategorized block in a downstream long view, verify intra-block label ordering: `create` before `update`, `update` before `close`, `close` before any other verb, within the same tool section.
- [ ] If modifying downstream long-view tuple entries, verify all `metric_name` values (4th element) are `lowercase_snake_case` per `manifest.naming.column_case`. A PascalCase value silently breaks the long-view join.

### Final Review (mandatory after every major change)

- [ ] Upstream impact: Search for every file that references the modified table, column, or CTE name.
- [ ] Downstream impact: Trace the modified metric through all downstream integrations listed in `downstream.integrations` in the manifest.
- [ ] Code is concise and clean: no dead code, no commented-out blocks left behind, no redundant logic.
- [ ] Plan is concise and clean: all changes documented with minimum necessary detail.

### Output Limits

| Output Type | Max | When Exceeded |
| :--- | :--- | :--- |
| Schema validation findings per file | 20 | Summarize remaining as "N additional issues of same type" |
| Clarifying questions per phase | 5 | Prioritize by blocking impact, defer the rest |
| Auto-fix attempts per verification failure | 3 | Escalate to user with file path, line number, expected vs. actual |
| Quality checklist items flagged per edit | 30 | Group by category, present top issues with counts |
