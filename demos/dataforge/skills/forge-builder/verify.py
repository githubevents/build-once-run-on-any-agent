"""
forge-builder deterministic verification script.

Produces PASS/HALT output with nonzero exit codes for enforcement at phase
boundaries, checkpoint writes, hypothesis resolution, artifact existence,
schema contract validation, and metric content verification.

Usage:
    python verify.py phase-entry        {build_id} {phase_n}
    python verify.py checkpoint-written {build_id} {phase_n}
    python verify.py hypothesis-count   {build_id}
    python verify.py artifacts-exist    {build_id}
    python verify.py content-verify     {build_id}
    python verify.py schema-check       {build_id}
"""

import json
import os
import re
import sys

BUILD_STATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".build-state")

SCHEMA_VERSION = 2

REQUIRED_FIELDS = [
    "build_id", "tool_name", "folder_name", "domain", "intake_mode",
    "build_path", "status", "current_phase", "completed_phases", "hypothesis_log",
    "metrics", "artifacts", "deployment", "updated_at", "git_commit", "schema_version",
]

VALID_STATUSES = {"intake_started", "in_progress", "blocked", "completed"}
VALID_BUILD_PATHS = {"new_entity", "extension", "rename", "removal"}
VALID_HYPOTHESIS_STATUSES = {"CONFIRMED", "REVISED", "INVALIDATED"}
VALID_METRIC_STATUSES = {"hypothesis", "confirmed", "designed", "implemented"}
VALID_FRAMEWORKS = {"spark_python", "dbt", "hybrid"}


def _load_state(build_id: str) -> dict:
    path = os.path.join(BUILD_STATE_DIR, f"{build_id}.json")
    if not os.path.exists(path):
        print(f"HALT: No build-state file at {path}")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _halt(msg: str):
    print(f"HALT: {msg}")
    sys.exit(1)


def _pass(msg: str):
    print(msg)
    sys.exit(0)


def _artifact_path(artifact: str) -> str:
    return artifact.replace("\\", "/")


def _is_alter_sql(artifact: str) -> bool:
    normalized = _artifact_path(artifact).lower()
    return "/schema/alter/" in normalized or "/alter/" in normalized


def _declares_metric_name_column(artifact: str) -> bool:
    """True if a schema file stores metric names as data rather than as columns.

    A long-format metric table declares one `metric_name` character column and
    carries one row per metric, so the DDL can never name an individual metric.
    A wide table gets a column per metric and does.
    """
    try:
        with open(_artifact_path(artifact), encoding="utf-8") as f:
            body = f.read()
    except (OSError, UnicodeDecodeError):
        return False

    return bool(
        re.search(
            r"\bmetric_name\s+(?:varchar|string|text|char)\b",
            body,
            re.IGNORECASE,
        )
    )


def _entity_and_cadence(artifact: str) -> tuple:
    """Leading and trailing name tokens of an artifact, e.g. ('incident', 'daily').

    Used to pair a pipeline with the schema files it writes. The table name
    inside a pipeline is interpolated per grain, so it cannot be read out
    statically; the file names carry the same entity and cadence, and that
    correspondence is checkable.
    """
    stem = os.path.splitext(os.path.basename(artifact))[0]
    tokens = [t for t in stem.split("_") if t]
    if len(tokens) < 2:
        return ("", "")
    return (tokens[0].lower(), tokens[-1].lower())


def _schema_contract_error(
    metric_name: str,
    found_in: list,
    sql_hits: list,
    py_hits: list,
    schema_artifacts: list,
    label: str,
):
    """Error string if a metric has no schema contract, or None if satisfied.

    A wide table names the metric in its DDL, so a direct hit is required. A
    long-format table cannot name it, so the contract is instead that every
    pipeline carrying the metric has a schema file for the same entity and
    cadence.
    """
    if sql_hits:
        return None

    long_format = [a for a in schema_artifacts if _declares_metric_name_column(a)]
    if not long_format:
        return (
            f"  '{metric_name}' missing {label} (.sql, non-ALTER). "
            f"Found in: {', '.join(found_in)}"
        )

    schema_pairs = {_entity_and_cadence(a) for a in long_format}
    unpaired = [p for p in py_hits if _entity_and_cadence(p) not in schema_pairs]
    if unpaired:
        return (
            f"  '{metric_name}' is written by {', '.join(unpaired)}, but no "
            f"long-format schema file shares that entity and cadence."
        )

    return None


def _framework_from_state(state: dict, artifacts: list) -> str:
    framework = str(state.get("pipeline_framework", "")).strip().lower()
    if framework in VALID_FRAMEWORKS:
        return framework

    has_py = any(a.endswith(".py") for a in artifacts)
    has_yml = any(a.endswith(".yml") or a.endswith(".yaml") for a in artifacts)

    if has_py and has_yml:
        return "hybrid"
    if has_py:
        return "spark_python"
    if has_yml:
        return "dbt"

    # Conservative default for legacy build-state files that do not
    # include framework metadata and have only SQL artifacts recorded.
    return "spark_python"


# ---------------------------------------------------------------------------
# phase-entry: assert completed_phases contains N-1
# ---------------------------------------------------------------------------
def cmd_phase_entry(build_id: str, phase_n: int):
    state = _load_state(build_id)
    required = phase_n - 1
    completed = state.get("completed_phases", [])
    if required in completed:
        _pass(f"Phase {phase_n} entry check: PASS")
    else:
        _halt(
            f"Phase {phase_n} entry check: HALT — Phase {required} not in "
            f"completed_phases {completed}. Phase {required} must complete "
            f"before Phase {phase_n} can begin."
        )


# ---------------------------------------------------------------------------
# checkpoint-written: assert phase N is in completed_phases after write
# ---------------------------------------------------------------------------
def cmd_checkpoint_written(build_id: str, phase_n: int):
    state = _load_state(build_id)
    completed = state.get("completed_phases", [])
    current = state.get("current_phase")

    if phase_n not in completed:
        _halt(
            f"Checkpoint {phase_n}: MISSING — Phase {phase_n} not in "
            f"completed_phases {completed}. The checkpoint write failed or "
            f"was skipped."
        )

    if current is not None and current < phase_n:
        _halt(
            f"Checkpoint {phase_n}: INCONSISTENT — current_phase is "
            f"{current} but completed_phases includes {phase_n}."
        )

    if not state.get("updated_at"):
        _halt(f"Checkpoint {phase_n}: updated_at is null or missing.")

    if not state.get("git_commit"):
        _halt(f"Checkpoint {phase_n}: git_commit is null or missing.")

    _pass(f"Checkpoint {phase_n}: VERIFIED")


# ---------------------------------------------------------------------------
# hypothesis-count: assert hypothesis_log is non-empty and all resolved
# ---------------------------------------------------------------------------
def cmd_hypothesis_count(build_id: str):
    state = _load_state(build_id)
    log = state.get("hypothesis_log")

    if log is None:
        _halt("hypothesis_log field is missing from the build-state file.")

    if not isinstance(log, list):
        _halt(f"hypothesis_log must be an array, got {type(log).__name__}.")

    if len(log) == 0:
        _halt(
            "hypothesis_log is empty — Phase 2 did not write hypothesis "
            "resolutions. Every Phase 1 hypothesis must have a resolution entry."
        )

    errors = []
    for i, entry in enumerate(log):
        if not isinstance(entry, dict):
            errors.append(f"  [{i}] Entry is not an object: {entry}")
            continue

        status = entry.get("status")
        if status is None:
            errors.append(f"  [{i}] Missing status for hypothesis: {entry.get('hypothesis', '?')}")
        elif status not in VALID_HYPOTHESIS_STATUSES:
            errors.append(
                f"  [{i}] Invalid status '{status}' for hypothesis: "
                f"{entry.get('hypothesis', '?')}. Must be one of: "
                f"{', '.join(sorted(VALID_HYPOTHESIS_STATUSES))}"
            )

        if not entry.get("hypothesis"):
            errors.append(f"  [{i}] Missing 'hypothesis' field.")

        if not entry.get("evidence"):
            errors.append(f"  [{i}] Missing 'evidence' field for: {entry.get('hypothesis', '?')}")

    if errors:
        _halt(
            f"{len(errors)} hypothesis_log error(s):\n" + "\n".join(errors)
        )

    confirmed = sum(1 for e in log if e.get("status") == "CONFIRMED")
    revised = sum(1 for e in log if e.get("status") == "REVISED")
    invalidated = sum(1 for e in log if e.get("status") == "INVALIDATED")

    _pass(
        f"All {len(log)} hypotheses resolved. "
        f"CONFIRMED: {confirmed}, REVISED: {revised}, INVALIDATED: {invalidated}"
    )


# ---------------------------------------------------------------------------
# artifacts-exist: assert every path in artifacts exists on disk
# ---------------------------------------------------------------------------
def cmd_artifacts_exist(build_id: str):
    state = _load_state(build_id)
    artifacts = state.get("artifacts", [])

    if not artifacts:
        _halt("artifacts array is empty — no files to verify.")

    missing = []
    for artifact in artifacts:
        if not os.path.exists(artifact):
            missing.append(artifact)

    if missing:
        _halt(
            f"{len(missing)} of {len(artifacts)} artifact(s) missing from disk:\n"
            + "\n".join(f"  - {m}" for m in missing)
        )

    _pass(f"All {len(artifacts)} artifacts present on disk.")


# ---------------------------------------------------------------------------
# content-verify: assert every implemented metric exists in pipeline + schema
# ---------------------------------------------------------------------------
def cmd_content_verify(build_id: str):
    state = _load_state(build_id)
    metrics = state.get("metrics", [])
    artifacts = state.get("artifacts", [])

    if not artifacts:
        _halt("artifacts array is empty — no files to search for metric content.")

    target_metrics = [
        m["name"] for m in metrics
        if isinstance(m, dict)
        and m.get("status") in ("implemented",)
        and m.get("name")
    ]

    if not target_metrics:
        _pass("No metrics with status 'implemented' to verify — skipping content check.")

    framework = _framework_from_state(state, artifacts)
    schema_artifacts = [
        a for a in artifacts if a.endswith(".sql") and not _is_alter_sql(a)
    ]
    errors = []
    for metric_name in target_metrics:
        found_in = []
        for artifact in artifacts:
            if not os.path.exists(artifact):
                continue
            try:
                with open(artifact, encoding="utf-8") as f:
                    if metric_name in f.read():
                        found_in.append(artifact)
            except (OSError, UnicodeDecodeError):
                continue

        if not found_in:
            errors.append(
                f"  '{metric_name}' not found in any artifact file. "
                f"Pipeline code and schema DDL were never written for this metric."
            )
            continue

        py_hits = [a for a in found_in if a.endswith(".py")]
        yml_hits = [a for a in found_in if a.endswith(".yml") or a.endswith(".yaml")]
        sql_hits = [a for a in found_in if a.endswith(".sql") and not _is_alter_sql(a)]

        if framework == "spark_python":
            if not py_hits:
                errors.append(
                    f"  '{metric_name}' missing spark_python pipeline hit (.py). "
                    f"Found in: {', '.join(found_in)}"
                )
            schema_error = _schema_contract_error(
                metric_name,
                found_in,
                sql_hits,
                py_hits,
                schema_artifacts,
                "schema contract hit",
            )
            if schema_error:
                errors.append(schema_error)
        elif framework == "dbt":
            if not sql_hits:
                errors.append(
                    f"  '{metric_name}' missing dbt model/schema SQL hit (.sql, non-ALTER). "
                    f"Found in: {', '.join(found_in)}"
                )
            if not yml_hits:
                errors.append(
                    f"  '{metric_name}' missing dbt schema contract hit (.yml/.yaml). "
                    f"Found in: {', '.join(found_in)}"
                )
        else:
            # Hybrid mode validates only artifact types that are actually
            # present for this build to avoid false negatives.
            has_py_artifacts = any(a.endswith(".py") for a in artifacts)
            has_yml_artifacts = any(a.endswith(".yml") or a.endswith(".yaml") for a in artifacts)
            has_sql_artifacts = any(a.endswith(".sql") and not _is_alter_sql(a) for a in artifacts)

            if has_py_artifacts and not py_hits:
                errors.append(
                    f"  '{metric_name}' missing hybrid spark_python hit (.py). "
                    f"Found in: {', '.join(found_in)}"
                )
            if has_yml_artifacts and not yml_hits:
                errors.append(
                    f"  '{metric_name}' missing hybrid dbt schema hit (.yml/.yaml). "
                    f"Found in: {', '.join(found_in)}"
                )
            if has_sql_artifacts:
                schema_error = _schema_contract_error(
                    metric_name,
                    found_in,
                    sql_hits,
                    py_hits,
                    schema_artifacts,
                    "hybrid SQL schema/model hit",
                )
                if schema_error:
                    errors.append(schema_error)

    if errors:
        _halt(
            f"Content verification failed — {len(errors)} issue(s):\n"
            + "\n".join(errors)
        )

    _pass(
        f"Content verified ({framework}): all {len(target_metrics)} implemented "
        f"metric(s) satisfy required artifact contracts."
    )


# ---------------------------------------------------------------------------
# schema-check: validate build-state JSON against the v2 schema contract
# ---------------------------------------------------------------------------
def cmd_schema_check(build_id: str):
    state = _load_state(build_id)
    errors = []

    sv = state.get("schema_version")
    if sv is None:
        errors.append("Missing 'schema_version' field. Expected 2.")
    elif sv != SCHEMA_VERSION:
        errors.append(f"schema_version is {sv}, expected {SCHEMA_VERSION}.")

    for field in REQUIRED_FIELDS:
        if field not in state:
            errors.append(f"Missing required field: '{field}'")

    status = state.get("status")
    if status and status not in VALID_STATUSES:
        errors.append(
            f"Invalid status '{status}'. Must be one of: "
            f"{', '.join(sorted(VALID_STATUSES))}"
        )

    build_path = state.get("build_path")
    if build_path and build_path not in VALID_BUILD_PATHS:
        errors.append(
            f"Invalid build_path '{build_path}'. Must be one of: "
            f"{', '.join(sorted(VALID_BUILD_PATHS))}"
        )

    completed = state.get("completed_phases")
    if completed is not None and not isinstance(completed, list):
        errors.append(f"completed_phases must be an array, got {type(completed).__name__}.")

    metrics = state.get("metrics")
    if metrics is not None:
        if not isinstance(metrics, list):
            errors.append(f"metrics must be an array, got {type(metrics).__name__}.")
        else:
            for i, m in enumerate(metrics):
                if isinstance(m, str):
                    errors.append(
                        f"metrics[{i}] is a string ('{m}'). Schema v2 requires "
                        f"object format with 'name', 'verb', 'status' fields."
                    )
                elif isinstance(m, dict):
                    if not m.get("name"):
                        errors.append(f"metrics[{i}] missing 'name' field.")
                    ms = m.get("status")
                    if ms and ms not in VALID_METRIC_STATUSES:
                        errors.append(
                            f"metrics[{i}] invalid status '{ms}'. Must be one of: "
                            f"{', '.join(sorted(VALID_METRIC_STATUSES))}"
                        )

    grains = state.get("grains")
    if grains is not None:
        if isinstance(grains, list):
            errors.append(
                "grains is an array but must be an object with grain names as "
                "keys and booleans as values (e.g., {\"user\": true})."
            )
        elif isinstance(grains, dict):
            for k, v in grains.items():
                if not isinstance(v, bool):
                    errors.append(f"grains['{k}'] must be boolean, got {type(v).__name__}.")

    hypothesis_log = state.get("hypothesis_log")
    if hypothesis_log is not None and not isinstance(hypothesis_log, list):
        errors.append(f"hypothesis_log must be an array, got {type(hypothesis_log).__name__}.")

    artifacts = state.get("artifacts")
    if artifacts is not None and not isinstance(artifacts, list):
        errors.append(f"artifacts must be an array, got {type(artifacts).__name__}.")

    deployment = state.get("deployment")
    if deployment is not None and not isinstance(deployment, dict):
        errors.append(f"deployment must be an object, got {type(deployment).__name__}.")

    if errors:
        _halt(
            f"Schema check failed with {len(errors)} error(s):\n"
            + "\n".join(f"  - {e}" for e in errors)
        )

    _pass(f"Schema check: PASS (v{SCHEMA_VERSION})")


# ---------------------------------------------------------------------------
# CLI dispatcher
# ---------------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "phase-entry":
        if len(sys.argv) != 4:
            _halt("Usage: verify.py phase-entry {build_id} {phase_n}")
        cmd_phase_entry(sys.argv[2], int(sys.argv[3]))

    elif cmd == "checkpoint-written":
        if len(sys.argv) != 4:
            _halt("Usage: verify.py checkpoint-written {build_id} {phase_n}")
        cmd_checkpoint_written(sys.argv[2], int(sys.argv[3]))

    elif cmd == "hypothesis-count":
        if len(sys.argv) != 3:
            _halt("Usage: verify.py hypothesis-count {build_id}")
        cmd_hypothesis_count(sys.argv[2])

    elif cmd == "artifacts-exist":
        if len(sys.argv) != 3:
            _halt("Usage: verify.py artifacts-exist {build_id}")
        cmd_artifacts_exist(sys.argv[2])

    elif cmd == "content-verify":
        if len(sys.argv) != 3:
            _halt("Usage: verify.py content-verify {build_id}")
        cmd_content_verify(sys.argv[2])

    elif cmd == "schema-check":
        if len(sys.argv) != 3:
            _halt("Usage: verify.py schema-check {build_id}")
        cmd_schema_check(sys.argv[2])

    else:
        _halt(f"Unknown command: {cmd}")


if __name__ == "__main__":
    main()
