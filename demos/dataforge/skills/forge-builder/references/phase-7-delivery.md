# Phase 7 Delivery Reference

Loaded at Phase 7 entry alongside [phase-7-deployment-playbook.md](phase-7-deployment-playbook.md). Contains documentation update procedures, the delivery summary template, and the post-deployment monitoring baseline. All project-specific values are resolved from `../../../assets/dataforge.manifest.resolved.yaml`.

---

## Entry Prerequisites

1. Phase 6 complete — quality gate passed.
2. Memory store checkpoint 6 written with `validation` and `completed_phases` including `6`.
3. `verify.py phase-entry {build_id} 7` returned exit code 0.

---

## Documentation Updates (Always)

These updates apply to every build regardless of `build_path`. Perform them before opening the PR — Guardrail S4 blocks a PR with stale documentation.

### Store-Level README

Update `{manifest.project.store_name}/README.md` — specifically the Key Numbers table.

| Field | Source of Truth | Update When |
| :--- | :--- | :--- |
| Tools count | Count distinct entity folders across all domains | New entity added |
| Metrics count | Count distinct metric columns across all schema DDL files | Any metric added or removed |
| Tables count | Count schema DDL files (spark_python) or models (dbt) | New entity or grain changes |
| Domains count | Count `manifest.domains` entries | New domain added |
| In-Progress | List tools currently under development | Build started or completed |

**Do not manually recount.** Use a structured search:
- Metric columns: `rg "total_.*_count" --type sql --glob "{manifest.project.store_name}/**/Schema*" --count`
- Entity folders: list directories per domain under `manifest.project.store_name`

If the Key Numbers table does not exist, do not create it — only update existing entries.

### Entity Development History Table

Each entity folder may contain a development history table in its AGENTS.md or a dedicated documentation file. Locate the entity's existing documentation:

1. Check `{store}/{domain}/{Folder_Name}/README.md` or `AGENTS.md` at the entity root.
2. If no history table exists, add one to the most appropriate file.

**Row format** (follow the existing formatting in the file):

```markdown
| Type | Date | Contributors | Issue | Summary |
| :------- | :--------- | :----------- | :-------------------------------------------------------------- | :-------------------------------- |
```

Add a new row with:

| Field | Value |
| :--- | :--- |
| Type | `New Entity`, `Extension`, `Rename`, or `Bug Fix` |
| Date | Current date in MM/DD/YYYY format — look up the actual date, do not estimate |
| Contributors | `@{contributor}` — from the memory store `contributor` field or user identity |
| Issue | `#{NUMBER}` |
| Summary | One-line description of what was added (e.g., "Add 3 incident metrics") |

**Formatting rules:**
- Colons on the left side of the alignment row (`:-------`)
- Follow the existing table formatting exactly — do not introduce a new style
- Append to the bottom of the table

---

## Documentation Updates (New Entity Only)

These updates apply only when `build_path` is `new_entity`.

### Architecture Visualization

If the store-level README contains a Mermaid diagram or other visualization of the entity architecture, update it to include the new entity node.

**Mermaid node format:**

```mermaid
{DOMAIN_ABBREV}["{Domain}: {count}"]
```

Update the count for the relevant domain subgraph. If the entity has a unique characteristic (e.g., multiple source tables, non-standard grain), note it in the node label.

### Domain Tool List

If the README maintains a per-domain tool list, add the new tool to the correct domain's list in alphabetical order.

---

## Final Delivery Summary

Present a structured summary of the build to the user. This is the last user-facing output before the build is marked complete.

### Template

```
Build Complete: {tool_name} ({build_path})

FILES PRODUCED
  Pipeline:
    - {store}/{domain}/{Folder_Name}/{code_dir}/{Folder_Name}_Metrics_Snapshot_Daily.py
    - {store}/{domain}/{Folder_Name}/{code_dir}/{Folder_Name}_Metrics_Snapshot_Cumulative.py
  Schema:
    - {N} schema DDL files across {grain_count} grains x 2 cadences
    - {N} ALTER scripts (extension builds only)
  Testing:
    - Test SQL: {test_file_path}

METRICS
  {For each metric: metric_name — verb — driving date column}

DEPLOYMENT
  | Zone | Schema | Pipeline | Status |
  {zone summary from memory store deployment node}

LINKS
  PR: {pr_url}
  Issue: {issue_url}
  Catalog: {manifest.catalogs.targets[0].pattern}.{domain}.{table_name}

VERIFY
  - Review PR for approval
  - Confirm pipeline runs completed in each zone
  - Monitor for 48 hours per the monitoring baseline below

OUTSTANDING
  - {Any deferred items: manual verification, unmerged PR}
```

Populate all fields from the memory store. For `OUTSTANDING`, list any items that were not completed during the build:
- Schema changes (if staged but not deployed)
- PR review (if PR was created but not merged)
- Any zone that failed deployment and was not retried

---

## Post-Deployment Monitoring Baseline (48 Hours)

After deployment, the following conditions should be monitored for 48 hours. Present these thresholds to the user as part of the delivery summary.

| Condition | Threshold | Action |
| :--- | :--- | :--- |
| Row counts deviate from source volume estimate | >20% deviation | Investigate pipeline run — check run output for errors, verify WHERE clause date predicate |
| Any metric 100% zero across all dates | Zero for all rows | Check entity ID column reference, date predicate expression, filter CASE WHEN logic |
| Zero rows in one zone while others are populated | Zone produces 0 rows | Pipeline run failure in that zone — check job run status via forge-dbx |
| SNAPSHOT_DATE gaps | Missing dates in sequence | Pipeline did not run for those dates — check scheduler, re-run if needed |
| Metric values significantly higher than expected | >10x source estimate | Check for fan-out from incorrect join or missing GROUP BY |
| NULL values in grain columns | Any NULL | Schema constraint missing or pipeline SELECT order mismatch |

These are observation thresholds, not automated alerts. The user is responsible for checking pipeline output during the monitoring window.

---

## Verification

Run the [gate-deployment.md](gate-deployment.md) Phase 7 checklist before writing the final memory store checkpoint.

Key verification items:
1. Phase Entry Hook passed.
2. Store-level README updated with current key numbers.
3. Entity development history table updated with current date.
4. Visualization updated with new node labels (new entity only).
5. Final delivery summary presented to the user.
6. Memory store final checkpoint written with `status: "completed"`.
