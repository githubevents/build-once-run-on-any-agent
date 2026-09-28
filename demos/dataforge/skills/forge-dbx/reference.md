# forge-dbx Reference

Comprehensive reference for Databricks CLI operations. Covers anti-patterns discovered through real failures, proven golden patterns, job parameter templates, and the full CLI command catalog. All project-specific values (zone names, profile names, catalog patterns, job names, domain schemas) are read from `../../assets/dataforge.manifest.resolved.yaml` (or from `../../assets/dataforge.manifest.yaml` if it contains legacy full-manifest keys).

---

## Shell-Agnostic Anti-Patterns (NEVER DO THESE)

These apply regardless of shell. Discovered through actual session failures.

### 1. Never Use `--job-id` Flag with `jobs run-now`

The `JOB_ID` is a **positional argument**, not a flag.

```bash
# WRONG -- "unknown flag: --job-id"
databricks jobs run-now --job-id 12345 --profile x

# CORRECT -- positional argument (when not using --json)
databricks jobs run-now 12345 --profile x

# CORRECT -- include job_id in JSON payload
databricks jobs run-now --json @payload.json --profile x
```

### 2. Never Run `jobs run-now` Without Explicit Parameters

Job definitions have default parameter values that may point to unrelated SQL files. Always supply all parameters explicitly.

```bash
# WRONG -- uses stale defaults, may run wrong SQL file
databricks jobs run-now 12345 --profile x

# CORRECT -- explicit parameters via JSON
databricks jobs run-now --json @payload.json --profile x
```

### 3. Never Mix `--json` with Positional JOB_ID

When using `--json`, the job_id must be inside the JSON body.

```bash
# WRONG -- "no positional arguments when --json is specified"
databricks jobs run-now 12345 --json @payload.json --profile x

# CORRECT -- job_id in JSON
databricks jobs run-now --json @payload.json --profile x
```

### 4. Never Pass SQL with `--` Comments as a Positional Argument

SQL files starting with `-- description:` cause the CLI to interpret `--` as flag prefixes.

```bash
# WRONG -- SQL comments parsed as CLI flags
databricks experimental aitools tools query "$(cat file.sql)" --profile x

# CORRECT -- use --file flag
databricks experimental aitools tools query --file file.sql --profile x
```

### 5. Unity Catalog Uses Positional Arguments

```bash
# WRONG -- these flags do not exist
databricks schemas list --catalog-name my_catalog
databricks tables list --catalog my_catalog

# CORRECT -- positional arguments
databricks schemas list my_catalog --profile x
databricks tables list my_catalog my_schema --profile x
databricks tables get my_catalog.my_schema.my_table --profile x
```

### 6. These Commands Do Not Exist

```bash
# NONE of these exist:
databricks execute-statement ...
databricks sql execute ...
databricks sql-warehouses list ...

# USE instead:
databricks experimental aitools tools query "SQL" --profile x
databricks warehouses list --profile x
```

---

## PowerShell-Specific Anti-Patterns

These only apply on Windows PowerShell.

### Never Use `&&` to Chain Commands

PowerShell 5.x does not support `&&` as a statement separator.

```powershell
# WRONG -- will fail with "not a valid statement separator"
git checkout main && git pull origin main
databricks auth profiles && databricks jobs list --profile x

# CORRECT -- use semicolons or separate commands
git checkout main; git pull origin main
```

### Never Use `Set-Content -Encoding UTF8` for Databricks Files

PowerShell 5.x `Set-Content -Encoding UTF8` adds a BOM (Byte Order Mark). Databricks SQL parser rejects BOM characters with `PARSE_SYNTAX_ERROR`.

```powershell
# WRONG -- adds BOM, Databricks rejects it
Set-Content -Path $tempFile -Value $sql -Encoding UTF8

# WRONG -- UTF8NoBOM does not exist in PowerShell 5.x
Set-Content -Path $tempFile -Value $sql -Encoding UTF8NoBOM

# CORRECT -- .NET method writes BOM-free UTF8
[System.IO.File]::WriteAllText($tempFile, $content)
```

### Never Pass Inline JSON in PowerShell

PowerShell mangles single-quoted JSON strings when passed to external commands.

```powershell
# WRONG -- PowerShell quote handling corrupts the JSON
databricks jobs run-now --json '{"job_id": 123}' --profile x

# CORRECT -- write to temp file, reference with @
$json = '{"job_id": 123, "job_parameters": {"KEY": "val"}}'
$tempJson = "$env:TEMP\payload.json"
[System.IO.File]::WriteAllText($tempJson, $json)
databricks jobs run-now --json "@$tempJson" --profile x
```

---

## Golden Patterns -- Bash/Zsh (macOS and Linux)

### JSON Payload + Job Trigger

```bash
PROFILE="<profile_from_manifest>"
TMPFILE="/tmp/dbx_<purpose>_<zone>.json"

cat > "$TMPFILE" <<'ENDJSON'
{
  "job_id": <ID>,
  "job_parameters": {
    "KEY": "value"
  }
}
ENDJSON

RUN_ID=$(databricks jobs run-now --json @"$TMPFILE" --profile "$PROFILE" --no-wait 2>&1 | jq -r '.run_id')
echo "Run ID: $RUN_ID"
```

### Run Monitoring

```bash
databricks jobs get-run "$RUN_ID" --profile "$PROFILE" --output json 2>&1 \
  | jq '{run_id, life_cycle_state: .state.life_cycle_state, result_state: .state.result_state}'
```

### SQL File Execution via Temp File

Substitute variables using values derived from the manifest (`platform.zones[].env` for env, `platform.zones[].id` for zone):

```bash
TMPSQL="/tmp/dbx_query_<zone>.sql"
sed -e 's/${TARGET_ENV}/<env>/g' -e 's/${SOURCE_ZONE}/<zone>/g' "<path>" > "$TMPSQL"
databricks experimental aitools tools query --file "$TMPSQL" --profile "$PROFILE" 2>&1
```

### Job Discovery

Use the job name from `orchestration.jobs` or `orchestration.domain_jobs` in the manifest as the search pattern:

```bash
databricks jobs list --profile "$PROFILE" --output json 2>&1 \
  | jq '[.[] | select(.settings.name | test("<pattern_from_manifest>")) | {job_id, name: .settings.name}]'
```

### Profile-First Pattern

Always include `--profile` on every command. Never rely on environment variables or defaults. Derive the profile from `platform.zones[].profile` in the manifest.

```bash
databricks <command> --profile <profile_from_manifest>
```

---

## Golden Patterns -- PowerShell (Windows)

### BOM-Free Temp File

```powershell
$content = '...'
$tempFile = "$env:TEMP\dbx_<purpose>_<zone>.json"
[System.IO.File]::WriteAllText($tempFile, $content)
```

### JSON Payload + Job Trigger

```powershell
$json = '{"job_id": <ID>, "job_parameters": {<PARAMS>}}'
$tempJson = "$env:TEMP\dbx_<purpose>_<zone>.json"
[System.IO.File]::WriteAllText($tempJson, $json)
$result = databricks jobs run-now --json "@$tempJson" --profile <profile> --no-wait 2>&1
$runId = ($result | ConvertFrom-Json).run_id
```

### Run Monitoring

```powershell
$run = databricks jobs get-run $runId --profile <profile> --output json 2>&1 | ConvertFrom-Json
$run.state.life_cycle_state   # RUNNING, TERMINATED, INTERNAL_ERROR, SKIPPED
$run.state.result_state       # SUCCESS, FAILED (only when TERMINATED)
```

### SQL File Execution via Temp File

```powershell
$sql = (Get-Content "<path>" -Raw) -replace '\$\{TARGET_ENV\}', '<env>' -replace '\$\{SOURCE_ZONE\}', '<zone>'
$tempSql = "$env:TEMP\dbx_query_<zone>.sql"
[System.IO.File]::WriteAllText($tempSql, $sql)
databricks experimental aitools tools query --file $tempSql --profile <profile> 2>&1
```

### Job Discovery

```powershell
databricks jobs list --profile <profile> --output json 2>&1 | ConvertFrom-Json | Where-Object { $_.settings.name -like '*<pattern_from_manifest>*' } | Select-Object job_id, @{N='name';E={$_.settings.name}} | ConvertTo-Json
```

---

## Job Parameter Templates

All job names below are read from the manifest. The values shown are template placeholders.

### Schema Changes Runner

Reads `orchestration.jobs.schema_runner.name` from the manifest. Runs a SQL file through variable substitution and executes each statement via `spark.sql()`.

**Variable substitution mapping:**

| Template key | SQL placeholder | Job parameter |
| :--- | :--- | :--- |
| `catalog_name` | `${catalog_name}` | `CATALOG_NAME` |
| `schema_name` | `${schema_name}` | `SCHEMA_NAME` |
| `table_name` | `${table_name}` | `TABLE_NAME` |
| `SOURCE_ZONE` | `${SOURCE_ZONE}` | `SOURCE_ZONE` |
| `SOURCE_ENV` | `${SOURCE_ENV}` | `SOURCE_ENV` |
| `TARGET_ENV` | `${TARGET_ENV}` | `TARGET_ENV` |

**Full JSON template:**

```json
{
  "job_id": "<DISCOVERED_JOB_ID>",
  "job_parameters": {
    "QUERY_FILE_PATH": "<repo-relative-path-to-sql-file>",
    "CATALOG_NAME": "<resolved_catalog_or_empty>",
    "SCHEMA_NAME": "<domain_schema_or_empty>",
    "TABLE_NAME": "<table_name_or_empty>",
    "SOURCE_ZONE": "<zone_id>",
    "SOURCE_ENV": "<env>",
    "TARGET_ENV": "<env>"
  }
}
```

**Parameter derivation by SQL file type:**

| SQL File Type | Example Path | CATALOG_NAME | SCHEMA_NAME | TABLE_NAME |
| :--- | :--- | :--- | :--- | :--- |
| CREATE TABLE | `<tool>/Schema/<Entity>_<Grain>_Metrics_Snapshot_<Cadence>.sql` | Resolve from `catalogs.targets[metric_store].pattern` | Domain from `domains` section | Table name from CREATE statement |
| ALTER TABLE | `<tool>/Schema/Alter/<alter_name>.sql` | Resolve from `catalogs.targets[metric_store].pattern` | Domain from `domains` section | `""` (empty -- hardcoded in SQL) |
| Standalone | `<path>/<standalone_definitions>.sql` | `""` (empty) | `""` (empty) | `""` (empty) |

**Standalone SQL files** use `${TARGET_ENV}` and `${SOURCE_ZONE}` directly in catalog references. The runner still requires all 7 parameters but `CATALOG_NAME`, `SCHEMA_NAME`, and `TABLE_NAME` can be empty strings when the SQL does not reference them.

### Domain Daily/Cumulative Load Jobs

Reads `orchestration.domain_jobs.<domain>.daily` or `.cumulative` from the manifest.

```json
{
  "job_id": "<DISCOVERED_JOB_ID>",
  "job_parameters": {
    "START_DATE": "YYYY-MM-DD",
    "END_DATE": "YYYY-MM-DD"
  }
}
```

Leave `START_DATE` and `END_DATE` as empty strings to use defaults (yesterday/today).

### Ad-hoc Script Runner

```json
{
  "job_id": "<DISCOVERED_JOB_ID>",
  "job_parameters": {
    "SCRIPT_FILE_PATH": "<repo-relative-path-to-python-file>",
    "RUN_ARGS": "{\"key\": \"value\"}",
    "ZONE": "<zone_id>"
  }
}
```

### dbt Task (when pipeline_framework = dbt)

For Databricks-hosted dbt execution:

```json
{
  "job_id": "<DISCOVERED_JOB_ID>",
  "tasks": [
    {
      "task_key": "dbt_run",
      "dbt_task": {
        "commands": ["dbt", "run", "--select", "<model_name>"],
        "project_directory": "<dbt.project_dir from manifest>",
        "profiles_directory": "<dbt.profiles_dir from manifest>"
      }
    }
  ]
}
```

---

## Domain-to-Schema Mapping

Read `domains` from the manifest to build the full mapping. The domain key is the schema name. Each domain contains a list of tools (entities).

To derive the schema name from a file path:
1. Identify the directory immediately under the store root (from `project.store_name` in manifest)
2. That directory name is the schema name
3. Cross-reference against `domains.<key>` in the manifest to validate

---

## CLI Command Reference

These commands are identical on bash/zsh and PowerShell. Always include `--profile` with the value from `platform.zones[].profile` in the manifest.

### Authentication

```bash
databricks --version
databricks auth profiles
databricks auth login --profile <name>
databricks auth token --profile <name>
databricks current-user me --profile <name>
```

### Jobs and Runs

```bash
databricks jobs list --profile <name>
databricks jobs get --job-id <id> --profile <name>
databricks jobs run-now <JOB_ID> --profile <name>
databricks jobs run-now --json @file.json --profile <name>
databricks jobs run-now --json @file.json --profile <name> --no-wait
databricks jobs cancel-run --run-id <id> --profile <name>
databricks jobs get-run <RUN_ID> --profile <name>
databricks jobs get-run-output --run-id <RUN_ID> --profile <name>
databricks jobs list-runs --job-id <id> --profile <name>
databricks jobs list-runs --job-id <id> --limit 1 --expand-tasks --profile <name>
databricks jobs list-runs --active-only --profile <name>
```

**PowerShell note:** Quote the `@`-reference: `--json "@file.json"`

### Data Exploration (AI Tools)

```bash
databricks experimental aitools tools query "SQL" --profile <name>
databricks experimental aitools tools query --file <path.sql> --profile <name>
databricks experimental aitools tools discover-schema <catalog.schema.table> --profile <name>
databricks experimental aitools tools get-default-warehouse --profile <name>
```

### Unity Catalog (Positional Arguments)

```bash
databricks catalogs list --profile <name>
databricks schemas list <catalog> --profile <name>
databricks tables list <catalog> <schema> --profile <name>
databricks tables get <catalog>.<schema>.<table> --profile <name>
databricks volumes list <catalog> <schema> --profile <name>
```

### SQL Warehouses

```bash
databricks warehouses list --profile <name>
databricks warehouses get --id <id> --profile <name>
databricks warehouses start --id <id> --profile <name>
databricks warehouses stop --id <id> --profile <name>
```

### Clusters

```bash
databricks clusters list --profile <name>
databricks clusters get --cluster-id <id> --profile <name>
databricks clusters start --cluster-id <id> --profile <name>
databricks clusters events --cluster-id <id> --profile <name>
```

### Workspace Files

```bash
databricks workspace list /path --profile <name>
databricks workspace export /path --format SOURCE -o file --profile <name>
databricks workspace import file.py /path --language PYTHON --format SOURCE --profile <name>
```

### Asset Bundles

```bash
databricks bundle validate --profile <name>
databricks bundle deploy -t <target> --profile <name>
databricks bundle run <resource> -t <target> --profile <name>
```

### dbt Commands (when pipeline_framework = dbt)

These run on the developer machine or CI runner, not through the Databricks CLI:

```bash
dbt run --select <model> --profiles-dir <dbt.profiles_dir> --target <dbt.target>
dbt test --select <model> --profiles-dir <dbt.profiles_dir> --target <dbt.target>
dbt run --select state:modified+ --defer --state <artifacts_path>
dbt compile --select <model>
dbt docs generate
dbt seed --select <seed>
dbt run --full-refresh --select <model>
dbt ls --select <model> --resource-type model
```

---

## Operation Decision Tree

```
What are you trying to do?
|
+-- Modify database structure (DDL)?
|   +-- CREATE TABLE / CREATE VIEW / CREATE OR REPLACE
|   |   +-- Schema Changes Runner (Step 4)
|   +-- ALTER TABLE (ADD/RENAME/DROP COLUMN)
|   |   +-- Schema Changes Runner (Step 4)
|   +-- Standalone SQL (definitions, cohorts, admin)
|   |   +-- Schema Changes Runner (Step 4)
|   +-- dbt schema.yml change (when pipeline_framework = dbt)
|       +-- dbt run --full-refresh (dbt Mode)
|
+-- Load or backfill data?
|   +-- Daily metrics for a date range
|   |   +-- Domain Daily Load Job (Step 5)
|   +-- Cumulative metrics rebuild
|   |   +-- Domain Cumulative Load Job (Step 5)
|   +-- Custom Python script
|   |   +-- Ad-hoc Script Runner (Step 6)
|   +-- dbt model refresh (when pipeline_framework = dbt)
|       +-- dbt run --select <model> (dbt Mode)
|
+-- Query data interactively?
|   +-- Short SQL (no special characters)
|   |   +-- aitools tools query "SQL" (Step 7)
|   +-- Long SQL or SQL with comments
|   |   +-- aitools tools query --file (Step 7)
|   +-- Explore table structure
|       +-- aitools tools discover-schema (Step 7)
|
+-- Monitor or troubleshoot?
    +-- Check run status
    |   +-- jobs get-run (Step 8)
    +-- Get failure details
    |   +-- jobs get-run-output (Step 8)
    +-- Inspect task breakdown
        +-- jobs list-runs --expand-tasks (Step 8)
```

---

## Troubleshooting

| Error | Cause | Fix |
| :--- | :--- | :--- |
| `cannot configure default credentials` | No profile or expired token | Use `--profile` flag; run `auth login` if expired |
| `PERMISSION_DENIED` | Insufficient workspace/UC permissions | Check grants with `databricks grants get` |
| `RESOURCE_DOES_NOT_EXIST` | Wrong resource name/id or wrong profile | Verify resource exists with list command; check profile |
| `PARSE_SYNTAX_ERROR` with BOM character | BOM character in SQL file (PowerShell) | Use `[System.IO.File]::WriteAllText()` instead of `Set-Content` |
| `unknown flag: --` | SQL comments parsed as flags | Use `--file` flag instead of positional argument |
| `unknown flag: --job-id` | `--job-id` is not a flag for `run-now` | Use positional argument or include `job_id` in `--json` |
| `no positional arguments when --json` | Mixed positional arg with `--json` | Put `job_id` inside the JSON body |
| `INTERNAL_ERROR: Task failed` | SQL execution error on Databricks | Run `jobs get-run-output --run-id <id>` for details |
| `refresh token is invalid` | OAuth token expired | Run `databricks auth login --profile <name>` |
| `not a valid statement separator` | `&&` used in PowerShell 5.x | Use semicolons or separate commands |
| `dbt command not found` | dbt CLI not installed or not on PATH | Install dbt with `pip install <dbt.adapter from manifest>` |
| `Could not find profile` | dbt profiles.yml not at expected path | Check `dbt.profiles_dir` in manifest; create profile if missing |
| `Compilation Error: model not found` | Model name or selector incorrect | Use `dbt ls --select <model>` to verify the model exists |
