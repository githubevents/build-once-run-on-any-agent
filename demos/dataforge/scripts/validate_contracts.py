"""
Lightweight contract checks for dataforge skill docs.

Checks:
1) Deprecated deployment playbook link pattern
2) Invalid manifest-key token for user-grain exclusion
3) Invalid Databricks CLI command shape: `databricks tables list <catalog>.<schema>`
4) Raw physical-table SELECT * patterns in doc examples
5) Raw manifest sample_query / point_in_time_query templates using SELECT *
6) Raw time-travel row projection (SELECT * ... VERSION AS OF)
"""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterable
from pathlib import Path

DEPRECATED_PLAYBOOK_REF = "forge-builder/references/deployment-playbook.md"
BAD_MANIFEST_KEY_TOKEN = "USER_GRAIN_EXCLUDED_TOOLS"
TABLE_LIST_DOT_PATTERN = re.compile(
    r"databricks\s+tables\s+list\s+<catalog>\.<schema>", re.IGNORECASE
)

# Matches SELECT * targeting a physical table (dotted path or template placeholder).
# Physical tables use dots or {placeholder} notation; plain CTE names do not.
RAW_PHYSICAL_SELECT_STAR = re.compile(
    r"SELECT\s+\*\s+FROM\s+"
    r"(?:\{[^}]+\}\.[^,\s\n]+|[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_.]*)",
    re.IGNORECASE,
)

# Matches time-travel raw row queries: SELECT * ... VERSION AS OF
RAW_TIME_TRAVEL_SELECT_STAR = re.compile(
    r"SELECT\s+\*\s+FROM\s+\S+\s+VERSION\s+AS\s+OF",
    re.IGNORECASE,
)

# Matches manifest sample_query or point_in_time_query using SELECT *
RAW_SAMPLE_QUERY_TEMPLATE = re.compile(
    r'(sample_query|point_in_time_query)\s*:\s*["\']SELECT\s+\*',
    re.IGNORECASE,
)

_SKIP_FILES = {"CHANGELOG.md"}


# Lines that explicitly document a blocked pattern are not themselves violations.
# Only Markdown table rows (starting with `|`) that contain a block-list marker
# qualify — prevents suppressing real violations in prose or code comments.
def _is_policy_documentation_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return False
    lower = stripped.lower()
    return "blocked" in lower or "raw_rows" in lower


def _iter_markdown_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*.md"):
        if path.is_file():
            yield path


def _iter_contract_text_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".md", ".yaml", ".yml"}:
            yield path


def check_deprecated_deployment_ref(root: Path) -> list[str]:
    errors: list[str] = []
    for md in _iter_markdown_files(root):
        if md.name == "CHANGELOG.md":
            continue
        for i, line in enumerate(md.read_text(encoding="utf-8").splitlines(), start=1):
            if DEPRECATED_PLAYBOOK_REF in line:
                errors.append(
                    f"[deprecated-link] {md.relative_to(root)}:{i} -> "
                    f"{DEPRECATED_PLAYBOOK_REF}"
                )
    return errors


def check_manifest_refs(root: Path) -> list[str]:
    errors: list[str] = []
    for md in _iter_markdown_files(root):
        if md.name == "CHANGELOG.md":
            continue
        for i, line in enumerate(md.read_text(encoding="utf-8").splitlines(), start=1):
            if BAD_MANIFEST_KEY_TOKEN in line:
                errors.append(
                    f"[manifest-ref] {md.relative_to(root)}:{i} -> "
                    f"use `manifest.user_grain_excluded_tools`"
                )
    return errors


def check_cli_command_shapes(root: Path) -> list[str]:
    errors: list[str] = []
    for md in _iter_markdown_files(root):
        for i, line in enumerate(md.read_text(encoding="utf-8").splitlines(), start=1):
            if TABLE_LIST_DOT_PATTERN.search(line):
                errors.append(
                    f"[cli-shape] {md.relative_to(root)}:{i} -> "
                    "use `databricks tables list <catalog> <schema>`"
                )
    return errors


def check_raw_egress_patterns(root: Path) -> list[str]:
    errors: list[str] = []
    for path in _iter_contract_text_files(root):
        if path.name in _SKIP_FILES:
            continue
        for i, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if _is_policy_documentation_line(line):
                continue
            if RAW_PHYSICAL_SELECT_STAR.search(line):
                errors.append(
                    f"[raw-egress] {path.relative_to(root)}:{i} -> "
                    "SELECT * from a physical table is not allowed; use aggregate or metadata queries"
                )
            elif RAW_TIME_TRAVEL_SELECT_STAR.search(line):
                errors.append(
                    f"[raw-egress] {path.relative_to(root)}:{i} -> "
                    "SELECT * VERSION AS OF is not allowed; use COUNT(*) for row-count verification"
                )
            elif RAW_SAMPLE_QUERY_TEMPLATE.search(line):
                errors.append(
                    f"[raw-egress] {path.relative_to(root)}:{i} -> "
                    "sample_query / point_in_time_query must not use SELECT *; use COUNT(*) or aggregate form"
                )
    return errors


def run_checks(root: Path, manifest_path: Path) -> list[str]:
    errors: list[str] = []
    if not manifest_path.exists():
        errors.append(
            f"[manifest-missing] {manifest_path} -> manifest file is required"
        )
    errors.extend(check_deprecated_deployment_ref(root))
    errors.extend(check_manifest_refs(root))
    errors.extend(check_cli_command_shapes(root))
    errors.extend(check_raw_egress_patterns(root))
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate dataforge skill contracts.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Dataforge root directory",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    manifest_path = root / "assets" / "dataforge.manifest.yaml"
    if not manifest_path.exists():
        raise SystemExit(f"assets/dataforge.manifest.yaml not found at {manifest_path}")

    errors = run_checks(root, manifest_path)
    if errors:
        print("Contract validation failed:")
        for err in errors:
            print(f"- {err}")
        raise SystemExit(1)

    print("Contract validation passed.")


if __name__ == "__main__":
    main()
