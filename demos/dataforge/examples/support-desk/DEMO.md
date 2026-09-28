# Scripted demo: GitHub issue to pull request

A full `forge-builder` run against local DuckDB. No cloud account, no cluster,
no credentials. Takes about fifteen minutes end to end at a conversational
pace; the setup below takes under a minute.

The thing worth watching is not that an agent wrote SQL. It is that four
skills, none of which contain a single support-desk noun, produce
support-desk-correct code — because everything they need to know about this
business is in one resolved manifest.

## Setup

```bash
brew install duckdb                       # or see duckdb.org/docs/installation
cd examples/support-desk
python seed.py                            # builds warehouse/zone1.duckdb and zone2.duckdb
```

Point your agent at this directory. `hooks/scripts/session-start.mjs` finds
`dataforge.manifest.yaml` and loads it into the session automatically.

## Act 1 — Cold start

> initialize dataforge

`forge-init` runs. It reads eight lines of seed manifest, then discovers
everything else:

| Discovered from | What it learns |
| --- | --- |
| `warehouse/*.duckdb` | two zones, deployment order `zone1` then `zone2` |
| `information_schema` | three source tables, their columns and types |
| `support_metric_store/` tree | one domain, three entities, one of them built |
| `Schema/*.sql` filenames | three grains, two cadences, the table name pattern |
| `Code/*.py` contents | the metric grammar `total_{entity}_{verb}_count` |
| `common/config.py` | the injected globals the runners provide |

Output is `dataforge.manifest.resolved.yaml`. Open it on stage. Every
support-desk-specific fact in the entire system is in that one file, and
almost none of it was typed by a human.

Then say the quiet part: `orchestration` comes back marked
engine-unsupported, because DuckDB has no job scheduler. The skill reports the
gap instead of inventing a scheduler that does not exist.

## Act 2 — Intake

```bash
# metric-request is not one of GitHub's default labels, so create it first.
# --force makes this safe to re-run between rehearsals.
gh label create metric-request --color 0E8A16 \
  --description "Request for a new metric build" --force

gh issue create --title "Add incident lifecycle metrics" \
  --body-file issues/incident-metrics.md --label metric-request
```

> build the metrics in issue #N

Use the issue number that `gh issue create` just printed — on a fresh repository
it will be `#1`. `forge-builder` Phase 1 reads the issue with `gh issue view`. The issue is
vague on purpose — it never says which grains, which verbs, which cadences, or
what to do about soft-deleted rows. Phase 1 proposes defaults drawn from the
resolved manifest and asks you to confirm the rest. This is the first
checkpoint of seven.

## Act 3 — Discovery and design

Phases 2 and 3. `forge-builder` delegates every query to `forge-dbx`, which
sees `engine: duckdb` and shells out to the `duckdb` CLI. Profiling
`demo_gold_source_a.incidents` establishes that `account_id`, `workspace_id`,
and `user_id` are all populated, so all three grains are viable.

Worth pausing on: the Raw Data Egress Policy in `forge-dbx` refuses row-level
`SELECT *` even here, against synthetic data on your own laptop. It is a
dataforge rule, not a platform restriction, so it does not relax when the
platform does.

Phase 3 names the metrics. `forge-lint` supplies the grammar and rejects
anything that does not fit it. `total_incident_create_count` and
`total_incident_resolve_count` survive; `incident_count` and
`num_incidents_opened` do not.

## Act 4 — Codegen

Phases 4 and 5 write six `Schema/*.sql` files and two `Code/*.py` pipelines
into `support_metric_store/service_delivery/Incident/`. Diff them against the
`Ticket/` folder: same structure, same system columns, same runner contract.
Nothing told the agent that shape — `forge-init` read it out of the existing
code in Act 1.

`verify.py` runs as a hook after each phase and blocks the checkpoint if a
declared metric has no matching artifact.

The runners only ever print SQL; nothing executes until `forge-dbx` is called.
That split is worth showing, because it is what makes generated pipeline code
reviewable before it touches a warehouse:

```bash
python3 support_metric_store/common/daily_runner.py \
  support_metric_store/service_delivery/Incident/Code/Incident_Metrics_Snapshot_Daily.py
```

## Act 5 — Tests and deploy

Phase 6 writes `Code/__incident_test.sql` and runs it through `forge-dbx`.
Phase 7 deploys, and this is where the two zone files earn their keep: DDL
applies to `zone1` first, and only after it succeeds does `zone2` run. The
sequential, stop-on-first-failure loop is the same code path a real
multi-region rollout takes.

Guardrail S5 fires before any of it: the agent prints all six DDL files and
stops until you approve. Say yes on stage — that pause is the point.

Loading one snapshot date would only prove the pipeline runs. Backfill the
last thirty days instead, so the store holds a series and both metrics are
visible. The loop is the whole execution contract in four lines — the runner
emits SQL, `duckdb` executes it, once per date per zone:

```bash
for zone in zone1 zone2; do
  for i in $(seq 30 -1 1); do
    SNAP=$(python3 -c "import datetime as dt,sys;print(dt.date.today()-dt.timedelta(days=int(sys.argv[1])))" $i)
    SOURCE_ZONE=$zone SNAPSHOT_DATE=$SNAP python3 support_metric_store/common/daily_runner.py \
      support_metric_store/service_delivery/Incident/Code/Incident_Metrics_Snapshot_Daily.py \
      | duckdb "warehouse/$zone.duckdb"
    SOURCE_ZONE=$zone SNAPSHOT_DATE=$SNAP python3 support_metric_store/common/cumulative_runner.py \
      support_metric_store/service_delivery/Incident/Code/Incident_Metrics_Snapshot_Cumulative.py \
      | duckdb "warehouse/$zone.duckdb"
  done
done
```

Both metrics now have rows, the new verb among them:

```bash
duckdb warehouse/zone1.duckdb -c "SELECT metric_name, COUNT(*) AS rows, SUM(metric_value) AS total FROM demo_gold_support_metric_store.Incident_Account_Metrics_Snapshot_Daily GROUP BY 1 ORDER BY 1"
```

The stronger claim is that the store agrees with the source exactly. The
cumulative snapshot for the latest date should reproduce a direct count over
all 120 days of source data — no approximation, no drift:

```bash
duckdb warehouse/zone1.duckdb -c "
SELECT metric_name, SUM(metric_value) AS metric_store_says
FROM demo_gold_support_metric_store.Incident_Account_Metrics_Snapshot_Cumulative
WHERE SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM demo_gold_support_metric_store.Incident_Account_Metrics_Snapshot_Cumulative)
GROUP BY 1 ORDER BY 1;
SELECT COUNT(*) AS source_created, COUNT(*) FILTER (WHERE status = 'resolved') AS source_resolved
FROM demo_gold_source_a.incidents WHERE is_deleted = false;"
```

Then `gh pr create`, with the issue linked and the entity README updated.

## The closing move

Open `dataforge.manifest.yaml` and change one line:

```yaml
platform:
  engine: "databricks"
```

Nothing else in the repository changes. Not a skill, not a phase, not a hook.
That line is the entire porting cost, and it is also the reason this code
could be open-sourced at all: sanitizing it for release was find-and-replace
on examples, because the business context was never in the skills to begin
with.

## Reset

```bash
python seed.py                            # rebuild both zone files from scratch
git clean -fd support_metric_store/service_delivery/Incident
rm -f dataforge.manifest.resolved.yaml .build-state/*
```
