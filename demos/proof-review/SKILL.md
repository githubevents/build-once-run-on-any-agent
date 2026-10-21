---
name: proof-review
description: Adversarial verification of bugfix PRs through production-shaped load reproduction. Use whenever the user asks to review a PR that claims to fix a bug, verify whether a fix is complete, reproduce a timeout or failure, find missed root causes, load-test a change, or produce a verdict-style verification report on a pull request. Trigger on phrases like "proof review", "verify the fix under load", "reproduce the timeout", "did this PR actually fix it", "adversarial review", or "run the load harness", and for any code review where the PR's claims should be checked against measured runtime behavior instead of read from the diff.
---

# Proof Review

Verify bugfix PRs by reproducing the reported symptom under production-shaped load, enumerating every root cause, and measuring whether the PR closes each one. The output is a verdict-first report where every finding carries a number.

## Stance

The PR description is a claim, not a fact. The unit of review is the reported symptom, not the diff. Reading a diff tells you the code is tidy; only reproduction tells you the bug is dead.

Two rules govern everything below:

1. No finding without a number.
2. No criticism of anything unverified. Confirm what the PR does fix, with evidence, before listing what it misses.

## Workflow

### 1. Scope the claim

Read the bug report and the PR description. Extract three lists:

- The symptom as the user experiences it (e.g. "proposal review times out after 12s"). This is the unit of review.
- What the PR claims to fix, with commit hashes. You will verify each claim in step 4.
- Every guarantee-word in the PR, the diff, and adjacent code: bounded, audited, idempotent, atomic, RLS, rate-limited, retried, cached, deduplicated. Each is a claim you will audit in step 5.

### 2. Build production parity

Most bugs that survive CI live in the gap between test wiring and production wiring, so the environment matters more than the test cases. Walk this checklist, set each dimension to its production value, and record the values in the report's config line:

| Dimension | Test default | Production shape |
| --- | --- | --- |
| Connection pool | large or unlimited | small and fixed, often 2-10 |
| Entrypoint | in-process imports | the deployed handler over HTTP |
| Registration / wiring | the test suite registers things itself | only what the entrypoint registers |
| Dataset scale | 5-50 fixture rows | hundreds to thousands |
| Client timeout | none | a real number; find it in the consumer's code |
| Storage backend | in-memory or embedded | what prod uses, plus parity checks on the embedded one |
| Auth context | superuser or owner | the role real requests run as |

Driving load through the real entrypoint instead of importing internals is the step that surfaces missing-registration bugs: tests pass because the suite wires components in-process, while production reaches the code only through the entrypoint.

### 3. Reproduce before the fix

Check out the base branch (pre-PR). Run `scripts/loadharness.mjs` against the symptom's endpoint at production-shaped concurrency, with `--timeout` set to the real client timeout from step 2. Save the JSON.

```
node scripts/loadharness.mjs run --url http://localhost:3000/proposals \
  --concurrency 4,8 --requests 200 --timeout 12000 --json before.json
```

If you cannot reproduce the symptom under production config, stop and say so in the report. Do not proceed to judgment without a baseline number. "Could not reproduce under config X" is a valid and useful finding.

### 4. Enumerate every root cause

A symptom usually has more than one parent. For each candidate cause, name the file, the mechanism, and one measured number that proves it participates. Hunting list, in rough order of yield:

- **Lock scope.** Which lock is held, for how long, by which requests. Hold time times concurrency against pool size tells you whether requests starve each other.
- **Pool arithmetic.** Pool size vs concurrent acquisitions. A 2-connection pool with a lock held across the whole request deadlocks at concurrency 2+.
- **Client timeout vs server time.** If the server needs ~20s and the client allows 12s, the client timeout is the symptom's face, not its cause. Report both numbers.
- **Payload growth.** Measure response bytes at fixture scale and production scale. "Bounded" rendering over an unbounded fetch shows up here.
- **Wiring gaps.** Anything registered in test setup but absent from the production entrypoint.
- **Per-read writes.** State growth caused by read operations (audit logs, counters). Measure state size before and after N reads.

Then check the PR against the full list. Partial fixes get named as partial: "three root causes, the PR fixed one."

### 5. Audit the guarantee-words

For each word collected in step 1, find runtime proof it is enforced. Read where the control is defined, then verify it is invoked on the real request path. A control that exists but is never called is decorative; flag it with the exact missing call (e.g. RLS policies present but `set_config` never executed, so the owner role bypasses every policy). Decorative security controls are High severity regardless of whether they relate to the symptom.

### 6. Explain the CI gap

For every cause the PR missed, write one sentence on why tests passed anyway. The answer is almost always a row in the step 2 table: in-process wiring, fixture scale, mocked backend, missing prod config. This sentence is what makes the report actionable, because it tells the team which test to add.

### 7. Fix on review branches

For each unaddressed cause, write the minimal fix on a review branch: one branch per cause, or grouped when causes share a fix. No refactors, no cleanup, nothing the cause does not require. Re-run the identical harness scenarios and generate the table:

```
node scripts/loadharness.mjs run --url http://localhost:3000/proposals \
  --concurrency 4,8 --requests 200 --timeout 12000 --json after.json
node scripts/loadharness.mjs compare before.json after.json
```

### 8. Write the report

Use `references/report-template.md`. Verdict paragraph first with the headline finding bolded, then the before/after table, then causes as C1..Cn with file refs and commit hashes, then severity-tagged findings outside the symptom path, then review branches, then what was not verified.

## Harness reference

`scripts/loadharness.mjs` is a zero-dependency Node 18+ load driver.

`run` flags: `--url` (required), `--method`, `--header "Name: value"` (repeatable), `--body` / `--body-file`, `--concurrency 4,8` (comma list), `--requests` per level, `--timeout` ms (set to the real client timeout), `--warmup`, `--json out.json`.

It reports per level: failure rate, p50/p95/p99 latency, mean and max payload bytes, and a failure breakdown by kind (`http_500`, `timeout_12000ms`, `net_ECONNRESET`). Failed and timed-out requests are included in the latency percentiles.

`compare before.json after.json` matches levels by concurrency and emits the report's markdown table directly, including payload rows. `--label-b` sets the after-column header.

## Honesty constraints

- Numbers come from runs, never from estimation. Arithmetic on measured numbers is allowed and must show its inputs.
- Credit is evidence too. If the PR's fix is real, say so and show the measurement that proves it.
- The "Not verified" section is mandatory. An empty one means you checked everything, which is rarely true.
