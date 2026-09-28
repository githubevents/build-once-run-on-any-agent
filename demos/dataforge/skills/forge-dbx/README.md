# Forge Dbx

forge-dbx is the execution primitive: one CLI layer that every other dataforge skill composes, instead of each skill growing its own.
It authenticates to workspace zones, discovers and triggers jobs (schema changes, pipeline loads, ad-hoc scripts), runs SQL, browses catalogs, and monitors runs, all driven by the project's resolved manifest rather than hardcoded zone names, catalogs, or job IDs.

Two engines are supported. `databricks` drives the Databricks CLI against Unity Catalog. `duckdb` drives the DuckDB CLI against local database files, which lets the full skill set run with no managed data platform and no account.

## Getting it

forge-dbx ships as part of dataforge:

```bash
git clone https://github.com/OWNER/dataforge.git
cd dataforge && node scripts/package.mjs
```

See the [repository README](../../README.md) for how to point Claude Code, Cursor, or GitHub Copilot at the generated packages.

## Where it fits

The other skills delegate their platform work here rather than calling a CLI directly: [`forge-builder`](../forge-builder/) uses it to authenticate, profile source tables, and deploy schema changes and pipeline loads, and [`forge-init`](../forge-init/) uses it to run `DESCRIBE TABLE` queries during discovery.
You can also ask for it directly, for example "run the schema change job for X" or "query this table", and it will read the manifest, determine the operation type, and route to the right job or query path.

## What to expect

Before touching the platform, forge-dbx reads `platform.engine` from the resolved manifest and selects an adapter. It also detects whether you're on bash/zsh or PowerShell, since payload quoting differs between the two, then reads the manifest for zone mappings, catalog patterns, and job names.

On Databricks it checks that every zone's profile shows `Valid: YES` before running any job, and re-authentication is on you if a token has expired. On DuckDB each zone is a database file, so authentication is a file existence check.

Direct SQL queries are restricted by default to metadata, aggregate, and capped categorical queries; row-level `SELECT *` and free-text column dumps are blocked unless you explicitly approve a break-glass exception for a specific diagnostic need.
Schema and pipeline jobs run one zone at a time in deployment order, stopping on the first failure rather than continuing into a zone that might make things worse.
Run status is polled roughly every 30 seconds until a job terminates, then reported with a status summary.

## Related skills

[`forge-init`](../forge-init/) generates the resolved manifest forge-dbx reads for zones, catalogs, and job names.
