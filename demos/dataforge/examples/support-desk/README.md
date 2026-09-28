# support-desk

A complete, runnable dataforge project backed by local DuckDB files. Everything
here is synthetic and generated from a fixed seed.

```bash
brew install duckdb
python seed.py
```

That builds `warehouse/zone1.duckdb` and `warehouse/zone2.duckdb`, each holding
a source schema of raw service-desk events and a target schema with the Ticket
metric tables already built. No account, no cluster, no credentials.

[DEMO.md](DEMO.md) is the scripted walkthrough: a GitHub issue in, a pull
request out, through all seven `forge-builder` phases.

## What is here

| Path | What it is |
| --- | --- |
| `dataforge.manifest.yaml` | The seed manifest. Eight lines of config; everything else is discovered. |
| `seed.py` | Builds the warehouse. `--check` verifies an existing one. |
| `support_metric_store/` | The metric store `forge-init` scans to learn the house style. |
| `issues/` | The issue body used as intake for the demo. |
| `warehouse/` | Generated DuckDB files. Not committed. |

## The data

Two zones, two sizes, so that multi-zone deployment is a real sequence rather
than a duplicated command.

| | zone1 | zone2 |
| --- | --- | --- |
| Accounts | 40 | 15 |
| Source tables | `tickets`, `incidents`, `releases` | same |
| Built entities | `Ticket` only | `Ticket` only |

`Incident` is what the demo builds. `Release` is left unbuilt so the store
still has somewhere to go after the demo ends.

Every source table carries `account_id`, `workspace_id`, and `user_id`, so all
three grains are viable for every entity — which means the grain decision in
Phase 1 is a real decision rather than a foregone one.

## Why DuckDB

`forge-dbx` treats the platform as one swappable primitive. Under
`engine: duckdb` a zone is a file and a query is a subprocess; under
`engine: databricks` a zone is a workspace profile and a query is a job run.
Callers never branch on which. Switching this project between the two is a
one-line manifest edit, and that is the claim the example exists to let you
check for yourself.

The tradeoff is honest and visible: DuckDB has no job scheduler, so
`forge-init` marks `orchestration` engine-unsupported rather than fabricating
one, and `forge-dbx` executes pipeline SQL directly instead of triggering runs.
