---
name: forge-init
description: >-
  Cold-start manifest discovery engine. Reads a minimal seed dataforge.manifest.yaml
  (Tier 1 + optional Tier 2 overrides), auto-discovers all remaining
  configuration via the platform CLI and codebase scanning, then writes the full dataforge.manifest.resolved.yaml for sub-skills.
  Supports Databricks (Unity Catalog) and DuckDB (information_schema) engines.
  Triggers on "forge-init", "initialize dataforge", "discover manifest",
  "cold start", "setup dataforge", "resolve manifest", "dataforge/init",
  "regenerate manifest", "refresh manifest".
metadata:
  status: "beta"
  agent-tools: [read, search, runCommands]
  human-description: Turns a short seed config into the full dataforge project manifest by discovering catalogs, jobs, and naming conventions via the platform CLI.
---

# forge-init

Cold-start manifest discovery engine. Reads the seed `assets/dataforge.manifest.yaml`, auto-discovers all remaining configuration, and writes `assets/dataforge.manifest.resolved.yaml` for sub-skill consumption.

---

## Responsibility Matrix

### USER responsibilities (cannot be automated)

| # | Action | When |
| :--- | :--- | :--- |
| U1 | Write the seed `assets/dataforge.manifest.yaml` (Tier 1 + optional Tier 2 overrides) | Once, at project setup |
| U2 | Authenticate to the platform. `databricks`: `databricks configure --profile <name>`. `duckdb`: none required, but the `.duckdb` zone files must exist. | Once per workspace, refresh when expired |
| U3 | Review the resolved manifest summary and confirm or correct | After cold-start, when agent flags drift |
| U4 | Provide zone exceptions in Tier 2 (optional) | Only if catalog naming breaks the standard pattern |
| U5 | Provide display name overrides in Tier 2 (optional) | Only when `.title()` produces wrong output |

### AGENT responsibilities (all automated)

| # | Action | Discovery Method | Resolves |
| :--- | :--- | :--- | :--- |
| A1 | Discover zones and profiles | `databricks auth profiles`, or `.duckdb` files in `platform.duckdb_dir` | `platform.zones`, `platform.deployment_order` |
| A2 | Discover catalogs | `databricks catalogs list --profile <p>` per zone, or `duckdb_databases()` | Raw catalog inventory |
| A3 | Classify catalogs as source vs target | Pattern-match against `store_name` from seed | `catalogs.sources`, `catalogs.targets` |
| A4 | Discover schemas and tables | `databricks schemas list` / `tables list`, or `information_schema` | Table inventory |
| A5 | Discover grain definitions | `DESCRIBE TABLE EXTENDED` (or `DESCRIBE`) on target tables | `grains` |
| A6 | Discover jobs by naming convention | `databricks jobs list --output json`, filter by store_name prefix. Marked engine-unsupported for `duckdb`. | `orchestration.jobs`, `orchestration.domain_jobs` |
| A7 | Map domain jobs to domains | Cross-reference job names against codebase domains | `orchestration.domain_jobs` |
| A8 | Infer domain taxonomy from codebase | Scan directory tree under `{store_name}/` | `domains` |
| A9 | Infer entity folder structure | Scan one existing entity folder | `entity_structure` |
| A10 | Infer naming conventions | Parse pipeline `.py` files for metric column patterns | `naming.*` |
| A11 | Derive file classification patterns | Formulaic from `store_name` + `entity_structure` | `orchestration.file_patterns` |
| A12 | Locate runner architecture | Scan for runner files under `{store_name}/common/` | `runner` |
| A13 | Discover downstream integrations | Scan for `*_long.py`, `*_definitions.sql` | `downstream.integrations` |
| A14 | Discover spark_conf from existing jobs | `databricks jobs get <id> --output json` | `spark_conf` |
| A15 | Infer user_grain_excluded_tools | `DESCRIBE TABLE` on source tables, check for `user_id` | `user_grain_excluded_tools` |
| A16 | Derive singularization map | Compare directory names against metric column names | `naming.singularization` |
| A17 | Generate source_metadata query templates | Deterministic per `platform.engine` | `source_metadata.*` |
| A18 | Detect dbt configuration | Check for `dbt_project.yml`, parse if present | `dbt.*` |
| A19 | Detect virtual tools | Scan for pipeline files with mismatched tool/folder names | `virtual_tools`, `table_prefix_overrides`, `folder_name_overrides` |
| A20 | Write resolved manifest | Merge all discovered values with Tier 2 overrides | `dataforge.manifest.resolved.yaml` |

---

## Prerequisites

- Seed `assets/dataforge.manifest.yaml` exists in the dataforge skill directory with at minimum the Tier 1 fields
- For `platform.engine: databricks`: Databricks CLI installed and on `PATH`, with at least one profile configured and valid
- For `platform.engine: duckdb`: DuckDB CLI installed and on `PATH`, with at least one `<zone_id>.duckdb` file under `platform.duckdb_dir`

---

## Step 0: Read Seed Manifest

Read `../../assets/dataforge.manifest.yaml` (relative to this SKILL.md). Validate Tier 1 required fields are present:

| Field | Required | Validation |
| :--- | :--- | :--- |
| `skill_version` | Yes | Semver string |
| `project.name` | Yes | Non-empty string. Placeholder values such as `my-project` must be confirmed or replaced before discovery. |
| `project.store_name` | Yes | Non-empty string, directory must exist in workspace root. Placeholder values such as `metric_store_directory` must be confirmed or replaced before discovery. |
| `project.repository` | No | String in `owner/name` form, or null |
| `platform.engine` | Yes | One of: `databricks`, `duckdb` |
| `platform.pipeline_framework` | Yes | One of: `spark_python`, `dbt` |
| `platform.duckdb_dir` | Only when engine is `duckdb` | Directory path relative to workspace root, must exist and contain at least one `.duckdb` file |

If any required field is missing or still uses a placeholder value, ask the user for the setup values before discovery.
Use the workspace directory name as the default suggestion for `project.name`.
Discover candidate `project.store_name` values by listing top-level directories and choosing the directory that contains metric/pipeline code; if multiple candidates exist, ask the user to choose.
Keep `project.repository` as `null` unless the user names a specific GitHub repository; when null, `gh` operates on the repository in the working directory.
After the user answers, update `../../assets/dataforge.manifest.yaml` with the resolved Tier 1 values and continue discovery.

Extract `overrides` (Tier 2) if present. These are applied after discovery in Step 11.

**Backward compatibility check:** If the seed file contains keys that belong to the resolved manifest (e.g., `catalogs`, `domains`, `grains`, `orchestration`), treat it as a pre-resolved (legacy full) manifest. Copy it directly to `assets/dataforge.manifest.resolved.yaml` without running discovery. Report: "Detected legacy full manifest. Copied to assets/dataforge.manifest.resolved.yaml. To switch to seed mode, remove discovered sections and keep only Tier 1 + Tier 2."

---

## Step 1: Detect Platform and Select Adapter

Read `platform.engine` from the seed.

| Engine | Adapter | Discovery Tools |
| :--- | :--- | :--- |
| `databricks` | Unity Catalog CLI adapter | `databricks` CLI commands, `forge-dbx` for SQL execution |
| `duckdb` | `information_schema` adapter | `duckdb` CLI, `forge-dbx` for SQL execution |

Proceed to the platform-specific discovery steps below. Steps 8 through 12 scan the codebase rather than the platform, so they run identically for both engines.

If `platform.engine` holds any other value, STOP and report that the engine is unsupported.

---

## Databricks Adapter (Unity Catalog-First)

### Step 2: Discover Zones and Profiles (A1)

Run:

```
databricks auth profiles
```

Parse the output for rows with `Valid: YES`. For each valid profile:

1. Extract the profile name
2. Infer the zone ID from the profile name suffix (last segment after the final `-`). Example: `analytics-prod-zone1` -> zone ID `zone1`
3. Infer `env` from the profile name: if contains `prod` -> `prod`; if contains `dev` or `staging` -> `dev`; otherwise -> `prod`
4. Build the zone entry: `{id: <zone_id>, profile: <profile_name>, env: <env>}`

Default `deployment_order` to zones sorted alphabetically by zone ID. If `overrides.deployment_order` exists in the seed, use that instead.

**STOP check:** If zero valid profiles are found, report to the user: "No valid Databricks profiles found. Run `databricks configure --profile <name>` to set up authentication (U2), then re-run forge-init."

### Step 3: Discover Catalogs via Unity Catalog (A2)

For the **first zone** in deployment_order (the discovery zone), run:

```
databricks catalogs list --profile <profile>
```

Parse the output. For each catalog:

1. Record the catalog `Name` and `Type`
2. **Exclude** catalogs with type `DELTASHARING_CATALOG`
3. **Exclude** system catalogs (e.g., `system`, `__internal`, `hive_metastore` if not relevant)
4. Keep only `MANAGED_CATALOG` entries (or entries without a type qualifier that are standard Unity Catalog catalogs)

### Step 4: Classify Catalogs as Source vs Target (A3)

Using the `store_name` from the seed manifest:

**Target catalogs:** Derive the store family prefix from `store_name` by stripping the category segment. For `support_metric_store`, the family prefix is `support_` and the family suffix is `_store`. Match any catalog whose name contains `support_*_store` (i.e., the family prefix followed by any segment followed by the family suffix). This ensures sibling stores are discovered:

- `demo_gold_support_metric_store_zone1` -> target (matches `support_metric_store`)
- `demo_gold_support_insight_store_zone1` -> target (matches `support_insight_store`)
- `demo_gold_support_benchmark_store_zone1` -> target (matches `support_benchmark_store`)

The matching regex: `support_[a-z]+_store` (derived from the store_name pattern). If the `store_name` does not follow the `{prefix}_{category}_{suffix}` pattern, fall back to exact substring match against `store_name`.

**STOP check:** If this classification yields zero target catalogs, do not continue and do not write a manifest with an empty `catalogs.targets`. Report the derived family pattern alongside the catalog names that were actually found, and ask the user whether `store_name` or the catalog naming is wrong. Every downstream write resolves through `catalogs.targets[].pattern`, so an empty map fails later, further from the cause.

For each target catalog:

1. Extract the store type: the segment between `support_` and `_store` (e.g., `metric`, `insight`, `benchmark`)
2. Derive the `name`: `{store_type}_store` (e.g., `metric_store`, `insight_store`)
3. Derive the `pattern`: replace the zone suffix with `{zone_suffix}` (e.g., `demo_gold_support_metric_store{zone_suffix}`)
4. Derive the `layer`: extract from prefix (`demo_gold_*` -> `gold`, `demo_silver_*` -> `silver`)

**Source catalogs:** Remaining catalogs matching known prefixes (`demo_gold_*`, `demo_silver_*`):

1. Strip the zone suffix to get the base name
2. Derive the `name`: drop the shared prefix and the zone suffix, then append the layer — `demo_gold_source_a_zone1` -> `source_a_gold`. The name must be reconstructible from the catalog it came from; do not invent a label the catalog does not contain.
3. Derive the `pattern`: replace zone suffix with `{zone_suffix}`
4. Derive the `layer`: from prefix

**Unclassified catalogs:** Catalogs that do not match target or source patterns. Record these separately for user review in the discovery summary.

### Step 5: Discover Schemas and Tables via Unity Catalog (A4)

For each **target catalog** discovered in Step 4, run:

```
databricks schemas list <target_catalog> --profile <profile>
```

For each schema (excluding `information_schema`, `default`), run:

```
databricks tables list <target_catalog> <schema> --profile <profile>
```

Record the full table inventory: `{catalog}.{schema}.{table_name}` for each table.

### Step 6: Discover Grain Definitions (A5)

Select up to 3 representative target tables — one per distinct grain token found in the table inventory, so the widest and narrowest grains are both sampled. For each, run via forge-dbx:

```sql
DESCRIBE TABLE EXTENDED <catalog>.<schema>.<table>
```

Parse the column list. The grain key is the table-name token immediately before
`_Metrics_Snapshot`, lowercased. The grain's columns are the id columns the
table actually declares, in ordinal order — read them from the describe output
rather than assuming a fixed set, because which ids a grain carries is a
per-project decision:

| Table name contains | Grain key | Columns |
| :--- | :--- | :--- |
| `Account` | `account` | as declared, e.g. `account_id` |
| `Workspace` | `workspace` | as declared, e.g. `account_id`, `workspace_id` |
| `User` | `user` | as declared, e.g. `account_id`, `user_id` |

Extract the `table_suffix` from the table name. For example, from `Change_Request_User_Metrics_Snapshot_Daily`:

- Strip the entity prefix (`Change_Request_`) and the cadence suffix (`_Daily`)
- Result: `User_Metrics_Snapshot`

Build the grains map:

```yaml
grains:
  account:
    columns: [account_id]
    table_suffix: "Account_Metrics_Snapshot"
  workspace:
    columns: [account_id, workspace_id]
    table_suffix: "Workspace_Metrics_Snapshot"
  user:
    columns: [account_id, user_id]
    table_suffix: "User_Metrics_Snapshot"
```

The grain key and the `table_suffix` token must agree. If discovery produces a
key that does not appear in its own `table_suffix`, the mapping is wrong — stop
and report it rather than writing a manifest whose grain names and table names
disagree.

### Step 7: Discover Jobs (A6, A7)

Run for the first zone:

```
databricks jobs list --profile <profile> --output json
```

**PowerShell parsing:**

```powershell
$jobs = databricks jobs list --profile <profile> --output json 2>&1 | ConvertFrom-Json
```

**Filter by store_name prefix:** Convert `store_name` to an uppercase prefix. For `support_metric_store`, the prefix is `SMS_` (first letter of each word). Filter jobs where `settings.name` starts with this prefix.

**Classify by naming convention:**

| Pattern in job name | Classification | Manifest key |
| :--- | :--- | :--- |
| `*_Schema_Changes_Runner` | Schema runner | `orchestration.jobs.schema_runner` |
| `*_Workflow_Creation_Runner` | Workflow runner | `orchestration.jobs.workflow_runner` |
| `*_{Domain}_Metrics_Daily_Load` or `*_{Domain}_Daily_Load` | Domain daily | `orchestration.domain_jobs.{domain}.daily` |
| `*_{Domain}_Metrics_Cumulative_Load` | Domain cumulative | `orchestration.domain_jobs.{domain}.cumulative` |

For domain jobs, extract the domain name from the job name. Normalize: `Service_Delivery` -> `service_delivery`, `Billing` -> `billing`, etc. Cross-reference against domains discovered in Step 8 to validate.

**Unmatched jobs:** Jobs with the store prefix that do not match any pattern. Record for the discovery summary but do not include in the resolved manifest.

---

## DuckDB Adapter (information_schema-First)

Active when `platform.engine` is `duckdb`. This section replaces Steps 2 through 7 above. Steps 8 through 12 are codebase scans and run unchanged.

### Step D2: Discover Zones (A1)

There are no profiles. Each zone is a database file. List them:

```
{platform.duckdb_dir}/*.duckdb
```

For each file:

1. The zone ID is the filename stem. `zone1.duckdb` -> zone ID `zone1`
2. `profile` is null — DuckDB has no profile concept
3. `env` defaults to `local` unless the zone ID contains `prod`, `dev`, or `staging`
4. Build the zone entry: `{id: <zone_id>, profile: null, env: <env>, path: "<duckdb_dir>/<zone_id>.duckdb"}`

Default `deployment_order` to zones sorted alphabetically by zone ID. If `overrides.deployment_order` exists in the seed, use that instead.

**STOP check:** If zero `.duckdb` files are found, report: "No DuckDB zone files found under `{duckdb_dir}`. Create at least one `<zone_id>.duckdb` file, then re-run forge-init." Do not create one implicitly — an empty database silently returns zero rows for every discovery query.

### Step D3: Discover Catalogs (A2)

For the **first zone** in deployment_order, run:

```bash
duckdb "{duckdb_dir}/{zone_id}.duckdb" -json -c "SELECT database_name FROM duckdb_databases() WHERE NOT internal"
```

DuckDB's catalog layer is shallower than Unity Catalog: a database file usually exposes one catalog named after the file. Treat schemas as the unit that Unity Catalog calls a catalog when the file has only one database.

### Step D4: Classify Catalogs as Source vs Target (A3)

Run:

```bash
duckdb "{duckdb_dir}/{zone_id}.duckdb" -json -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','pg_catalog','main')"
```

Classify each schema against `store_name` from the seed using the same rules as the Databricks adapter (Step 4): a schema whose name matches the store family pattern is a target, the rest are sources.

Because each zone is a separate file, catalog names carry no zone suffix. Set every `pattern` with `{zone_suffix}` resolved to the empty string, and record `catalogs.zone_exceptions` as an empty map.

### Step D5: Discover Schemas and Tables (A4)

```bash
duckdb "{duckdb_dir}/{zone_id}.duckdb" -json -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','pg_catalog') ORDER BY table_schema, table_name"
```

Record the full table inventory as `{schema}.{table_name}` for each table.

### Step D6: Discover Grain Definitions (A5)

Select up to 3 representative target tables using the same heuristic as Step 6. For each:

```bash
duckdb "{duckdb_dir}/{zone_id}.duckdb" -json -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = '{schema}' AND table_name = '{table}' ORDER BY ordinal_position"
```

Parse the column list and build the `grains` map exactly as the Databricks adapter does in Step 6. Grain inference is a naming exercise, not a platform feature, so the logic is identical.

### Step D7: Orchestration (A6, A7) — Engine-Unsupported

DuckDB has no job scheduler. Do not invent job names. Write the orchestration section as explicitly unsupported so downstream skills can branch on it rather than fail on a missing key:

```yaml
orchestration:
  supported: false
  unsupported_reason: "duckdb has no job scheduler; forge-dbx executes SQL directly per zone"
  jobs: {}
  domain_jobs: {}
  file_patterns: { ... }   # still derived in Step 10 — these are path globs, not jobs
```

`file_patterns` is still populated in Step 10 because it classifies files by path, which does not depend on an orchestrator.

`spark_conf` (A14) is likewise inapplicable. Write `spark_conf: {}` and note it in the discovery summary rather than emitting Databricks defaults.

### Step D8: Source Metadata Query Templates (A17)

Generate these deterministically for DuckDB instead of the Databricks block in Step 10:

```yaml
source_metadata:
  discovery_method: "information_schema"
  catalog_list_query: "SELECT database_name FROM duckdb_databases() WHERE NOT internal"
  schema_list_query: "SELECT schema_name FROM information_schema.schemata"
  table_list_query: "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = '{schema}'"
  table_describe_query: "DESCRIBE {schema}.{table}"
  column_metadata_query: >-
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = '{schema}'
      AND table_name = '{table}'
    ORDER BY ordinal_position
  date_column_query: >-
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = '{schema}'
      AND table_name = '{table}'
      AND (data_type LIKE '%TIMESTAMP%' OR data_type LIKE '%DATE%')
    ORDER BY ordinal_position
  row_count_query: "SELECT COUNT(*) AS total_rows FROM {schema}.{table}"
  date_range_query: "SELECT MIN({date_column}) AS min_date, MAX({date_column}) AS max_date, COUNT(*) AS total_rows FROM {schema}.{table}"
  top_k_distribution_query: "SELECT {column}, COUNT(*) AS cnt, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS row_pct FROM {schema}.{table} WHERE {column} IS NOT NULL GROUP BY {column} ORDER BY cnt DESC LIMIT {limit}"
  table_format: "duckdb"
  version_history:
    enabled: false
    unsupported_reason: "duckdb has no transactional table history; recover by re-running the load for the affected date range"
```

Setting `version_history.enabled: false` is what tells the deployment playbook to skip `DESCRIBE HISTORY` and `RESTORE TABLE` rather than attempt them and fail.

---

### Step 8: Infer Domain Taxonomy from Codebase (A8)

Scan the directory tree:

```
{store_name}/
  {domain_1}/
    {tool_1}/
    {tool_2}/
  {domain_2}/
    {tool_3}/
  common/           <-- SKIP (infrastructure, not a domain)
  all_combined/     <-- SKIP (aggregation layer)
  account_health/  <-- SKIP (derived layer)
  config.py         <-- SKIP (file, not directory)
```

**Non-domain directories to skip:** `common`, `all_combined`, `account_health`, `config.py`, `__pycache__`, `.build-state`, any file (non-directory).

For each domain directory:

1. The domain key is the directory name in `lowercase_snake_case`
2. List its subdirectories -- each is a tool
3. Convert tool directory names to `lowercase_snake_case` (e.g., `Change_Request` -> `change_request`, `SLA` -> `sla`, `Ticket` -> `ticket`)

Build the `domains` map.

### Step 9: Infer Entity and Naming Conventions (A9, A10, A16)

**Entity folder structure (A9):** Pick one entity folder (e.g., the first tool in the first domain). List its contents:

```
{tool}/
  Code/
  Schema/
  Schema/Alter/
  Backfill/
```

Read file names in `Code/` to extract suffixes. Example: `Change_Request_Metrics_Snapshot_Daily.py` -> suffix `_Metrics_Snapshot_Daily.py`. Read `Schema/` files to extract the schema pattern. Example: `Change_Request_User_Metrics_Snapshot_Daily.sql` -> pattern `{Entity}_{Grain}_Metrics_Snapshot_{Cadence}.sql`.

**Naming conventions (A10):** Read one existing pipeline `.py` file. Search for SQL column aliases matching the pattern `total_*_count`. Extract:

1. The full metric column names
2. The verb set (e.g., `create`, `update`, `close`, `submit`, etc.)
3. The entity names (singular form)

Build `naming.metric_pattern` from the observed pattern.

Before generating the regex, union the discovered verb set with
`overrides.naming.verbs` from the seed, if present. A project can only be
measured with verbs its existing code already demonstrates, plus the ones the
user has explicitly declared — this override is the only supported way to
introduce a verb, because the resolved manifest is regenerated and must not be
hand-edited. Record the union in `naming.verbs` so the source of each verb stays
inspectable.

Generate `naming.metric_regex` from the unioned verb set:

```
^total_[a-z]+(_[a-z]+)*_({verb1}|{verb2}|...)_count$
```

If a metric proposed in a later phase fails this regex, the fix is a new entry in
`overrides.naming.verbs` followed by a `forge-init` re-run — not a hand-edit of
the resolved manifest, and not a relaxed regex.

Search Schema SQL files for system columns. Identify `SNAPSHOT_DATE`, `LOAD_TIMESTAMP`, `SOURCE_ZONE` as uppercase system columns.

Set `naming.cte_case: snake_case` and `naming.column_case: lowercase_snake_case` (verify from codebase).

**Singularization map (A16):** For each tool directory name, check if the corresponding metric columns use a singular form. Build the map by comparing:

- Directory/table name uses `plans` but metrics say `plan` -> `plans: plan`
- Directory uses `tickets` but metrics say `ticket` -> `tickets: ticket`

If the directory name is already singular, no entry needed.

### Step 10: Discover Remaining Sections

**File classification patterns (A11):**

Derive deterministically from `store_name` and entity_structure:

```yaml
orchestration:
  file_patterns:
    schema_ddl: "{store_name}/**/Schema/*.sql"
    alter_ddl: "{store_name}/**/Schema/Alter/*.sql"
    workflow_json: "workflows/job_definitions/{store_name}/*.json"
    pipeline_code: "{store_name}/**/Code/*.py"
    dbt_models: "models/**/*.sql"
    dbt_schema: "models/**/*.yml"
    dbt_macros: "macros/**/*.sql"
```

**Runner architecture (A12):**

Scan for `daily_runner.py`, `cumulative_runner.py`, `config.py` under `{store_name}/common/`. If found, read `config.py` and search for global variable assignments to identify `injected_globals`.

```yaml
runner:
  daily: "{store_name}/common/daily_runner.py"
  cumulative: "{store_name}/common/cumulative_runner.py"
  config: "{store_name}/config.py"
  injection_pattern: "sys.modules"
  injected_globals: [SOURCE_ZONE, SOURCE_ZONE_SUFFIX, SNAPSHOT_DATE]
```

If `config.py` does not exist under `{store_name}/`, check `{store_name}/common/`. Use whichever path contains the file.

**Downstream integrations (A13):**

Scan `{store_name}/` recursively for:

- Files matching `*_long.py` -> classify as `long_table` type
- Files matching `*_definitions.sql` -> classify as `sql_definitions` type

For each discovered file, derive the `name` from the filename (strip path and extension, convert to snake_case).

**Spark configuration (A14):**

Take the first discovered job ID from Step 7. Run:

```
databricks jobs get <job_id> --profile <profile> --output json
```

Parse `job_clusters[].new_cluster.spark_conf` (or `settings.tasks[].new_cluster.spark_conf`). Extract the standard key-value pairs.

If no job was discovered, use sensible defaults:

```yaml
spark_conf:
  standard:
    spark.databricks.io.cache.enabled: "true"
    spark.databricks.delta.optimizeWrite.enabled: "true"
    spark.databricks.delta.autoCompact.enabled: "true"
```

**Source metadata query templates (A17):**

Generate deterministically for Databricks:

```yaml
source_metadata:
  discovery_method: "unity_catalog"
  catalog_list_query: "SHOW CATALOGS"
  schema_list_query: "SHOW SCHEMAS IN {catalog}"
  table_list_query: "SHOW TABLES IN {catalog}.{schema}"
  table_describe_query: "DESCRIBE TABLE {catalog}.{schema}.{table}"
  column_metadata_query: >-
    SELECT column_name, data_type, comment
    FROM {catalog}.information_schema.columns
    WHERE table_catalog = '{catalog}'
      AND table_schema = '{schema}'
      AND table_name = '{table}'
    ORDER BY ordinal_position
  date_column_query: >-
    SELECT column_name, data_type
    FROM {catalog}.information_schema.columns
    WHERE table_catalog = '{catalog}'
      AND table_schema = '{schema}'
      AND table_name = '{table}'
      AND (data_type LIKE '%TIMESTAMP%' OR data_type LIKE '%DATE%')
    ORDER BY ordinal_position
  row_count_query: "SELECT COUNT(*) AS total_rows FROM {catalog}.{schema}.{table}"
  date_range_query: "SELECT MIN({date_column}) AS min_date, MAX({date_column}) AS max_date, COUNT(*) AS total_rows FROM {catalog}.{schema}.{table}"
  column_metadata_query: "SELECT column_name, data_type, comment FROM {catalog}.information_schema.columns WHERE table_catalog = '{catalog}' AND table_schema = '{schema}' AND table_name = '{table}' ORDER BY ordinal_position"
  top_k_distribution_query: "SELECT {column}, COUNT(*) AS cnt, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS row_pct FROM {catalog}.{schema}.{table} WHERE {column} IS NOT NULL GROUP BY {column} ORDER BY cnt DESC LIMIT {limit}"
  table_format: "delta"
  version_history:
    enabled: true
    history_query: "DESCRIBE HISTORY {catalog}.{schema}.{table}"
    restore_query: "RESTORE TABLE {catalog}.{schema}.{table} TO VERSION AS OF {version}"
    point_in_time_row_count_query: "SELECT COUNT(*) AS total_rows FROM {catalog}.{schema}.{table} VERSION AS OF {version}"
```

**dbt configuration (A18):**

Check if `dbt_project.yml` exists in the workspace root. If yes, parse it and populate:

```yaml
dbt:
  project_dir: "."
  profiles_dir: "~/.dbt"
  target: "<from dbt_project.yml or default 'prod'>"
  version: "<from dbt_project.yml require-dbt-version>"
  adapter: "<infer from profile: dbt-databricks>"
  model_paths: "<from dbt_project.yml model-paths>"
  seed_paths: "<from dbt_project.yml seed-paths>"
  test_paths: "<from dbt_project.yml test-paths>"
  macro_paths: "<from dbt_project.yml macro-paths>"
  schema_generation: "dbt"
  materialization_default: "<from dbt_project.yml models config>"
  incremental_strategy: "<from dbt_project.yml or default 'merge'>"
  tags:
    daily: "daily_snapshot"
    cumulative: "cumulative_snapshot"
```

If `dbt_project.yml` does not exist but `platform.pipeline_framework` is `spark_python`, include a minimal placeholder:

```yaml
dbt:
  project_dir: "."
  profiles_dir: "~/.dbt"
  target: "prod"
  schema_generation: "raw_ddl"
```

**Virtual tools, table_prefix_overrides, folder_name_overrides (A19):**

Scan all entity folders. For each entity directory, list its `Code/` files. If a pipeline file name does not match `{FolderName}_Metrics_Snapshot_*.py` (where `FolderName` is the parent directory converted to PascalCase), it may be a virtual tool or a folder override.

Detection heuristics:

- If `Forecasting/Code/Forecasting_Company_*` exists, `forecasting_company` is a virtual tool with base `forecasting`
- If the folder name is all-caps (`SLA`, `CSAT`, `API`), record a `folder_name_overrides` entry
- If the table prefix in schema SQL differs from the tool name, record a `table_prefix_overrides` entry

Merge with `overrides.virtual_tools`, `overrides.table_prefix_overrides`, `overrides.folder_name_overrides` from the seed.

**User grain excluded tools (A15):**

For each tool discovered in Step 8, check if it has a user grain table in the target catalog (from Step 5 table inventory). If a tool has workspace and account grain tables but no user grain table, record it in `user_grain_excluded_tools` with the highest available grain suffix.

Merge with `overrides.user_grain_excluded_tools` from the seed (overrides win).

## Step 11: Merge Overrides and Write Resolved Manifest

1. Start with all discovered values from Steps 2-10
2. Read `overrides` from the seed manifest (Tier 2)
3. For each override key, replace the discovered value with the override value
4. Assemble the full resolved manifest in the same schema as the legacy full manifest
5. Write to `assets/dataforge.manifest.resolved.yaml` (in the `assets/` directory alongside the seed)

The resolved manifest must contain all sections that sub-skills expect:

```yaml
skill_version: "..."
project: { ... }
platform: { zones: [...], deployment_order: [...], ... }
dbt: { ... }
source_metadata: { ... }
catalogs: { sources: [...], targets: [...], zone_exceptions: { ... } }
naming: { ... }
grains: { ... }
domains: { ... }
tool_name_overrides: { ... }
user_grain_excluded_tools: { ... }
table_prefix_overrides: { ... }
folder_name_overrides: { ... }
virtual_tools: { ... }
downstream: { integrations: [...] }
orchestration: { jobs: { ... }, domain_jobs: { ... }, file_patterns: { ... } }
runner: { ... }
spark_conf: { ... }
entity_structure: { ... }
```

### Header Comment

Prepend the resolved manifest with:

```yaml
# =============================================================================
# dataforge.manifest.resolved.yaml -- AUTO-GENERATED by forge-init
#
# Do NOT hand-edit this file. It is regenerated from the seed assets/dataforge.manifest.yaml
# whenever the seed changes or forge-init is invoked explicitly.
#
# To change a value: add an override in assets/dataforge.manifest.yaml under the 'overrides' key.
# To regenerate: invoke forge-init or delete this file and run any sub-skill.
#
# Generated: <ISO 8601 timestamp>
# Seed checksum: <SHA-256 of assets/dataforge.manifest.yaml>
# =============================================================================
```

---

## Step 12: Present Discovery Summary

After writing the resolved manifest, present a structured summary to the user:

```
forge-init Discovery Summary
=============================

Platform: <engine> (<pipeline_framework>)
Zones: <N> zones discovered (<zone_1>, <zone_2>, ...)

Catalogs:
  Target: <N> catalogs (<name_1>, <name_2>, ...)
  Source: <N> catalogs (<name_1>, <name_2>, ...)
  Unclassified: <N> catalogs (listed below if any)

Domains: <N> domains, <N> tools total
  <domain_1>: <tool_1>, <tool_2>, ...
  <domain_2>: <tool_3>, <tool_4>, ...

Grains: <N> grain levels (<grain_1>, <grain_2>, ...)

Jobs: <N> jobs matched  (or "not supported on this engine")
  Schema runner: <job_name>
  Workflow runner: <job_name>
  Domain jobs: <N> daily, <N> cumulative

Naming: metric pattern = <pattern>, <N> verbs discovered

Overridden (from Tier 2):
  <key_1>: <summary>
  <key_2>: <summary>

Unresolved (needs user input):
  <item_1>: <reason>
```

Wait for the user to confirm (U3). Accepted responses: "looks good", "approved", "confirmed", "yes", or any clear affirmative.

If the user requests a correction, guide them to add the corrected value to the `overrides` section of `assets/dataforge.manifest.yaml`, then re-run forge-init.

---

## Staleness Detection

Sub-skills check for staleness before reading the resolved manifest:

1. Compare the modification time of `assets/dataforge.manifest.yaml` (seed) against `assets/dataforge.manifest.resolved.yaml`
2. If the seed is newer than the resolved file, the resolved manifest is stale
3. If `assets/dataforge.manifest.resolved.yaml` does not exist, it needs to be generated

When staleness is detected, the sub-skill invokes forge-init before proceeding with its own workflow.

---

## Error Handling

| Error | Action |
| :--- | :--- |
| No valid Databricks profiles | Report to user, request authentication (U2) |
| Unity Catalog CLI returns no catalogs | Report to user, check permissions |
| `duckdb` not on `PATH` | STOP, report to user with the install command for their platform |
| `platform.duckdb_dir` missing or contains no `.duckdb` files | STOP, report to user -- do not create an empty database |
| `platform.engine` is neither `databricks` nor `duckdb` | STOP, report the engine as unsupported |
| No jobs match the store_name prefix | Warn user, suggest manual `orchestration` override in Tier 2. Not an error when engine is `duckdb`. |
| `store_name` directory does not exist | STOP, report to user -- seed may be misconfigured |
| Permission denied on catalog/schema | Skip that catalog/schema, record in discovery summary |
| Zero tables found in target catalog | Warn user -- store may not be deployed yet, write partial manifest |
