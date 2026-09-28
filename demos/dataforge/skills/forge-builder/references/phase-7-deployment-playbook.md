# Deployment Playbook

Phase 7 reference for branch naming, PR creation, multi-zone deployment, and rollback procedures. All project-specific values are resolved from the manifest.

---

## Branch Naming Convention

```
issue-NNNN-short-description
```

- `NNNN`: Source issue number (from Mode A) or newly created issue number (Mode B/C/D)
- `short-description`: Kebab-case, 3-5 words max (e.g., `add-incident-metrics`, `release-entity-pipeline`)
- Branch from `main`, always

### Git Commands (PowerShell-safe)

```powershell
git fetch origin main
git checkout main
git pull origin main
git checkout -b issue-{NUMBER}-short-description
```

**Never** use `&&` in PowerShell. Chain with `;` if sequential, or run as separate commands.

**Stale main check:** After `git pull`, compare `git rev-parse HEAD` with `git rev-parse origin/main`. If they differ, the local main has diverged from remote. Abort and ask the user to reconcile before branching.

After making changes:

```powershell
git add .
git commit -m "Add {entity} metrics to {manifest.project.name} (#{NUMBER})"
git push -u origin HEAD
```

---

## PR Creation

### Body Template

Write the PR body to a temp file first (never inline `--body` in PowerShell):

```powershell
# 1. Write body to temp file (use the Write tool, not echo)
# File: .forge/pr-body-temp.md

# 2. Create PR via gh CLI
gh pr create --title "Add {entity} metrics" --body-file .forge/pr-body-temp.md

# 3. Delete the temp file after PR creation
```

### PR Body Structure

```markdown
Closes #{NUMBER}

## Summary

Add {metric_count} metrics for the {Tool Name} tool to {manifest.project.name}. This includes Daily and Cumulative pipelines and schema definitions for {grain_count} grains.

## Changes

- `{manifest.project.store_name}/{domain}/{Folder_Name}/{manifest.entity_structure.code_dir}/` -- Daily and Cumulative pipelines with {metric_count} metrics
- `{manifest.project.store_name}/{domain}/{Folder_Name}/{manifest.entity_structure.schema_dir}/` -- {N} schema files ({grain_count} grains x 2 cadences)
- `{manifest.project.store_name}/{domain}/{Folder_Name}/{manifest.entity_structure.schema_dir}/{manifest.entity_structure.alter_dir}/` -- {N} ALTER scripts
- Job definition task entries (from manifest.orchestration.domain_jobs)

## Testing

- Unit test SQL generated
- Quality gate passed (forge-lint checklist)

## Compliance

**Populate from memory store**: Read `validation` nodes from `skills/forge-builder/.build-state/{build_id}.json` and fill in results below.

| Phase | Gate | Result |
| :--- | :--- | :--- |
| 3 | Sample Execution | PASS |
| 4 | Schema Architecture | PASS |
| 5 | Pipeline Code | PASS |
| 6 | Quality Gate | PASS |
```

---

## Schema Change Sign-Off

**BLOCKING: Required before any schema runner job is triggered for `schema_ddl` or `alter_ddl` files. Skip only when the changeset contains no schema files.**

Classify the changeset against `manifest.orchestration.file_patterns` to determine which jobs must run and in which zones. Once the user confirms the job list and zones, display the full SQL content of every schema file that will execute. Do not summarize or truncate — the user must read every statement before approving.

Present each file as a labeled block:

```
--- Schema File N of N: <repo-relative-path> ---

<full SQL content>

--- End of File N ---
```

Then ask:

```
The above SQL will be executed against the data platform on zone(s): [zone list].
Type "approve schema changes" to proceed, or describe any corrections needed.
```

**Approval accepted from:** "approve schema changes", "looks good", "approved", "go ahead", "yes run it", "ship it" (must reference the schema content).

**Approval NOT accepted from:** Ambiguous one-word responses ("ok", "sure") or any message containing a question or change request.

**If corrections are requested:** Apply the edit, re-display only the corrected file(s), and re-ask for sign-off before continuing.

---

## Deployment

Classify changed files against `manifest.orchestration.file_patterns`, map each class to its job in `manifest.orchestration`, then hand off execution to [forge-dbx](../../forge-dbx/SKILL.md) for each zone.

| File class | Pattern key | Job |
| :--- | :--- | :--- |
| Schema DDL | `schema_ddl` | `orchestration.jobs.schema_runner` |
| ALTER DDL | `alter_ddl` | `orchestration.jobs.schema_runner` |
| Workflow JSON | `workflow_json` | `orchestration.jobs.workflow_runner` |
| Pipeline code | `pipeline_code` | `orchestration.domain_jobs.{domain}.daily` and `.cumulative` |

- **Ordering**: Schema changes before workflow creation. Sequential zone dispatch following `manifest.platform.deployment_order`.
- **Payloads**: forge-dbx defines parameter derivation and JSON payloads.
- **Monitoring**: forge-dbx defines polling and status interpretation.

When `manifest.orchestration` is marked unsupported for the active engine (for example `duckdb`, which has no job scheduler), skip job dispatch and execute the schema and pipeline SQL directly through forge-dbx, one zone at a time in the same order.

### Zone Summary Table

After deployment, present this table to the user and post it as an issue comment. Zone rows are generated dynamically from `manifest.platform.deployment_order`:

```markdown
| Zone | Schema Change | Pipeline Load | Status |
| :--- | :--- | :--- | :--- |
{dynamic zone rows from manifest.platform.deployment_order}
```

---

## Rollback on Failure

### Decision Tree

```
Failure occurs during deployment
    |
    +-- Schema change failed?
    |   |
    |   +-- No rollback needed. DDL failed cleanly. Table unchanged.
    |   +-- Fix the ALTER script and retry.
    |
    +-- Pipeline load failed with INSERT OVERWRITE?
        |
        +-- Was data overwritten before failure?
        |   |
        |   +-- Check via table version history (manifest.source_metadata.version_history):
        |   |   SELECT COUNT(*) AS total_rows FROM table VERSION AS OF <version_before>
        |   |
        |   +-- Data missing? Restore:
        |       RESTORE TABLE table TO VERSION AS OF <safe_version>
        |
        +-- Pipeline failed before INSERT? No data loss. Fix and retry.
```

### Table Version History Commands

Target catalog is resolved from `manifest.catalogs.targets[].pattern` with zone suffix applied. The query templates below come from `manifest.source_metadata.version_history`. When `manifest.source_metadata.version_history.enabled` is `false`, skip these commands -- the platform does not support version-based rollback. Engines without transactional table history (including `duckdb`) set this flag to `false`; recover there by re-running the load for the affected date range.

**Check table history** (from `manifest.source_metadata.version_history.history_query`):

```sql
DESCRIBE HISTORY {target_catalog_pattern}.{domain}.{table_name}
```

**Read a prior version row count** (from `manifest.source_metadata.version_history.point_in_time_row_count_query`):

```sql
SELECT COUNT(*) AS total_rows FROM {target_catalog_pattern}.{domain}.{table_name} VERSION AS OF {version_number}
```

To verify data presence use the row count above.
For row-level inspection of a prior version, obtain break-glass approval first — see [Raw Data Egress Policy](../../../README.md#raw-data-egress-policy).

**Restore to a prior version** (from `manifest.source_metadata.version_history.restore_query`):

```sql
RESTORE TABLE {target_catalog_pattern}.{domain}.{table_name} TO VERSION AS OF {version_number}
```

### Failure Protocol

1. **STOP** -- do not proceed to the next zone
2. Fetch the run output through forge-dbx for the failed run
3. Determine failure type (schema change vs. pipeline load)
4. If data was potentially overwritten, check via table version history
5. If data loss confirmed, restore immediately
6. Report to user with: error details, zone, run ID, rollback status
7. Add a comment to the GitHub issue documenting the failure (see [phase-1-issue-intake.md](phase-1-issue-intake.md) templates)

---

## Issue Close-Out

After successful deployment across all zones:

1. **Add closing comment** to the source issue (see [phase-1-issue-intake.md](phase-1-issue-intake.md) Deployment Summary template)
2. **Close the issue:** `gh issue close {NUMBER} --comment "<completion note>"`. When the PR body contains `Closes #{NUMBER}`, merging the PR closes it automatically — verify rather than closing twice.
3. **Close follow-up issues** opened during Phase 7
