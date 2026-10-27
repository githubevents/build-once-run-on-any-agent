# Verification report template

Fill every bracket. Delete a section only if its rule below says you can.

```markdown
## Verdict

[2-4 sentences. Open with what holds up, named specifically: which boundaries
are honest, which mechanisms you confirmed. **Then the headline finding in one
bolded sentence**, e.g. "But the proposal-review timeout had three root causes
and the PR under review fixed only one." Close with what you did about it.]

## What the load reproduction found

Production config: pool=[N], client timeout=[N]s, dataset=[N] rows, entrypoint=[path]

| Scenario (production config) | Before | After review-branch fixes |
| --- | --- | --- |
| [METHOD /path, concurrency N] | [X% failures, p50 Y, p95 Y] | [0 errors, p50 Z, p95 Z] |
| [Payload at N rows] | [size, shape] | [size, shape] |
| [State growth per audited read] | [behavior] | [behavior] |

## Root causes

- **C1, [short name]:** [file ref]. [Mechanism in 2-3 sentences with the
  measured number that proves it: lock hold time, pool size, timeout values.]
  [What the PR's commit ([hash]) did or did not touch, with evidence either
  way: "the fix was real, I verified X, but didn't touch this."]
  **Why CI missed it:** [one sentence, almost always a row in the production-
  parity table: in-process wiring, fixture scale, mocked backend, missing prod
  config, superuser auth context.]
- **C2, [short name]:** [same shape, including the "Why CI missed it" line.]
- **C3, ...**

## Findings outside the symptom path

- **High:** [decorative security controls, data loss, unbounded growth. Name
  the exact missing call, e.g. "RLS was decorative (set_config never called,
  owner bypassed policies)".]
- **Medium:** [performance cliffs at known scale, error handling that converts
  failures into wrong answers.]
- **Low:** [hygiene. Omit this line if empty rather than padding it.]

## Review branches

| Branch | Closes | Diff |
| --- | --- | --- |
| [review/c1-lock-scope] | C1 | [files touched, +N/-N] |

## Not verified

[What you did not test and why: environments not reproduced, scales not
reached, paths not exercised. This section may not be deleted.]
```

## Rules

- Every claim in Verdict and Root causes carries a number or a file/commit ref.
- One bolded sentence: the headline finding in the Verdict. Cause labels
  (C1, C2) and severity tags use bold for structure, not emphasis.
- Every cause carries a `**Why CI missed it:**` line. This is the actionable
  output of the whole report — it tells the team which test to add.
- Severity rubric: High = security control that does not fire, data loss, or
  unbounded growth. Medium = failure or cliff at production scale. Low = hygiene.
- Credit before critique inside each cause: state what the PR's commit actually
  did, with evidence, before stating what it missed.
- The Before/After table rows must come from identical harness scenarios. Use
  `loadharness.mjs compare` output; do not hand-assemble numbers from different
  configs.
- If reproduction failed, the report still ships: Verdict states "could not
  reproduce under [config]", the table shows the attempted scenarios, and Root
  causes becomes "Candidate causes, unconfirmed".
