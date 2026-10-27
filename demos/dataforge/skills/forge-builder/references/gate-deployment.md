# Quality Gate: Deployment Session (Phases 6-7)

Verification checklists for testing, deployment orchestration, and delivery. All checks reference the manifest for project-specific values.

---

## Phase 6: Testing and Validation

- [ ] **Phase Entry Hook passed:** `verify.py phase-entry {build_id} 6` returned exit code 0.
- [ ] **Artifacts verified:** `verify.py artifacts-exist {build_id}` returned exit code 0 (all Phase 4-5 artifacts confirmed on disk).
- [ ] Test SQL covers all non-update metrics
- [ ] Unit test structure: source-vs-target, rollup, data quality
- [ ] `_update_count` metrics excluded from test assertions
- [ ] Full lint quality checklist passed (all 4 sections: standards compliance, pipeline, debug, final review)
- [ ] **BLOCKING:** Memory store checkpoint written with `validation`, `blocking`, `current_phase`, `completed_phases`, `updated_at`, and `git_commit` before Phase 7 begins
- [ ] **BLOCKING:** `verify.py checkpoint-written {build_id} 6` executed and returned exit code 0.

---

## Phase 7: Deployment and Delivery

- [ ] **Phase Entry Hook passed:** `verify.py phase-entry {build_id} 7` returned exit code 0.
- [ ] Branch created from `main` with correct naming convention (issue number from the intake source)
- [ ] PR created with `--body-file` (never inline `--body` in PowerShell)
- [ ] PR body includes the issue link, Summary, Changes, and Testing sections
- [ ] **BLOCKING:** Full SQL content of every `schema_ddl` and `alter_ddl` file displayed to the user before any schema runner job is triggered (skip if no schema files in changeset)
- [ ] **BLOCKING:** User has explicitly approved the DDL content with "approve schema changes" or a clear affirmative referencing the SQL. No schema runner job executes without this approval.
- [ ] Schema changes deployed to all zones in `manifest.platform.deployment_order` (sequential, not parallel)
- [ ] Pipeline loads executed after schema success per zone
- [ ] Zone summary table produced
- [ ] GitHub issue updated with deployment results
- [ ] GitHub issue closed (or failure documented)
- [ ] Store-level README updated (key numbers, metric counts, tool coverage)
- [ ] Visualization / diagram updated with new node labels (new entity only)
- [ ] Entity development history table updated with current date
- [ ] Final delivery summary presented to user
- [ ] **BLOCKING:** Memory store checkpoint written with `branch`, `deployment`, `pr_url`, `current_phase`, `completed_phases`, `updated_at`, and `git_commit` as the final action of Phase 7
- [ ] **BLOCKING:** `verify.py checkpoint-written {build_id} 7` executed and returned exit code 0.
- [ ] Lock released: `.build-state/{tool_name}.lock` deleted after the final checkpoint. A build that completes without releasing it blocks the next differently-named build for the same tool until the lock ages out.
