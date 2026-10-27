# Build Memory Store -- Recovery Reference

Loaded on demand when a rollback, lock conflict, or non-revertible change situation is encountered. Not loaded during standard build checkpoints.

---

## Rollback Using the Memory Store

1. Read `artifacts` -- the list of files this build created or modified
2. For each file: delete it if it did not exist before this build; run `git checkout -- {file_path}` if it was modified from a prior state
3. Update `current_phase` and `completed_phases` to reflect the last valid phase
4. Set `blocking` to describe the rollback reason
5. Write the file

### Non-Revertible Changes

- **Deployed schema changes** (ALTER scripts already executed): Cannot be reverted via git. The column stays in the table. Add a `-- DEPRECATED` comment if the metric is being abandoned.
- **GitHub issue comments**: Cannot be deleted. Add a follow-up comment explaining the rollback.
- **Memory store entries**: Do not delete. Update status for audit trail.

### Phase Dependency Chain for Rollback

Rollback is always in reverse order. If Phase N is rolled back, all phases > N must also be rolled back.

| Rolling Back | Also Rollback |
| :--- | :--- |
| Phase 5 | None (Phase 5 is last in engineering session) |
| Phase 4 | Phase 5 (if completed) |
| Phase 3 | Return to design; Phases 4-5 not started |

---

## Concurrent Build Protection

Lock acquisition is **Step 0 of the Write Protocol** in [system-memory-store.md](system-memory-store.md) — it runs before every memory store write including the pre-Phase-1 start state. This guarantees no two builds for the same tool can overlap at any checkpoint boundary.

**Lock file convention:** `.build-state/{tool_name}.lock`

**Release lock:** Delete `.build-state/{tool_name}.lock` after Phase 7 completes (Final checkpoint) or when the build is explicitly abandoned. Stale locks (no write in >2 hours) are auto-released by Step 0.

Lock files are gitignored alongside `.build-state/*.json`.
