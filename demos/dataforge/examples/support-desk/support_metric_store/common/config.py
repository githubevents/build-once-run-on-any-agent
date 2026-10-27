"""Shared configuration for every pipeline in the support metric store.

The runners inject these names into each pipeline module's global namespace
before executing it, so pipeline files reference SOURCE_ZONE, SNAPSHOT_DATE,
and the catalog helpers without importing anything.

forge-init reads this file to discover `runner.injected_globals`.
"""

from __future__ import annotations

import datetime as dt
import os

ENGINE = os.environ.get("ENGINE", "duckdb")

# Zone currently being processed. The deploy loop sets this once per zone.
SOURCE_ZONE = os.environ.get("SOURCE_ZONE", "zone1")

# Suffix appended to catalog names to target a specific zone. On DuckDB every
# zone is its own database file, so the suffix resolves to empty and catalogs
# collapse to bare schema names -- the rule forge-dbx documents in D1.
SOURCE_ZONE_SUFFIX = "" if ENGINE == "duckdb" else SOURCE_ZONE

# Date being built. Defaults to yesterday so a run with no arguments is safe.
SNAPSHOT_DATE = os.environ.get(
    "SNAPSHOT_DATE", str(dt.date.today() - dt.timedelta(days=1))
)


def _catalog(prefix: str) -> str:
    return f"{prefix}_{SOURCE_ZONE_SUFFIX}" if SOURCE_ZONE_SUFFIX else prefix


SOURCE_CATALOG = _catalog("demo_gold_source_a")
TARGET_CATALOG = _catalog("demo_gold_support_metric_store")
