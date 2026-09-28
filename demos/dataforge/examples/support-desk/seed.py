#!/usr/bin/env python3
"""Build the support-desk DuckDB warehouse from synthetic data.

Creates one .duckdb file per zone under warehouse/, each holding a source
schema of raw service-desk events and a target schema with the already-built
Ticket metric tables. Every value is generated from a fixed seed; no real data
of any kind is involved.

    python seed.py            # build warehouse/zone1.duckdb and zone2.duckdb
    python seed.py --check    # verify an existing warehouse instead of rebuilding

Requires the duckdb CLI on PATH (brew install duckdb).
"""

from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import random
import shutil
import subprocess
import sys

WAREHOUSE = pathlib.Path(__file__).parent / "warehouse"

# Each zone gets its own file, its own catalog names, and its own volume of
# data. Deploying to them in order is what makes the multi-zone story real.
ZONES = {
    "zone1": {"accounts": 40, "seed": 11},
    "zone2": {"accounts": 15, "seed": 29},
}

SOURCE_SCHEMA = "demo_gold_source_a"
TARGET_SCHEMA = "demo_gold_support_metric_store"

# Three entities. Ticket is already built end to end and is what forge-init
# learns the house style from. Incident is the one the demo builds. Release is
# left alone so the store has an unbuilt entity after the demo finishes.
ENTITIES = {
    "ticket": ["new", "open", "pending", "resolved", "closed"],
    "incident": ["triage", "investigating", "mitigated", "resolved"],
    "release": ["planned", "staged", "shipped", "rolled_back"],
}

# Statuses that stamp closed_at. Every entity has at least one non-terminal
# status left over, which the in-flight case below depends on.
TERMINAL_STATUSES = ("closed", "resolved", "shipped")

# Every entity is measured at these three grains and two cadences. forge-init
# infers both lists from the Schema/ filenames rather than being told.
GRAINS = ("account", "workspace", "user")
CADENCES = ("Daily", "Cumulative")

# The window ends yesterday, which is what SNAPSHOT_DATE defaults to, so a
# pipeline run with no arguments lands on data whatever day the demo is given.
DAYS = 120
END_DATE = dt.date.today() - dt.timedelta(days=1)
START_DATE = END_DATE - dt.timedelta(days=DAYS - 1)


def ddl() -> str:
    stmts = [
        f"CREATE SCHEMA IF NOT EXISTS {SOURCE_SCHEMA};",
        f"CREATE SCHEMA IF NOT EXISTS {TARGET_SCHEMA};",
    ]
    for entity in ENTITIES:
        stmts.append(
            f"""
CREATE OR REPLACE TABLE {SOURCE_SCHEMA}.{entity}s (
    {entity}_id   BIGINT,
    account_id    BIGINT,
    workspace_id  BIGINT,
    user_id       BIGINT,
    status        VARCHAR,
    priority      VARCHAR,
    created_at    TIMESTAMP,
    updated_at    TIMESTAMP,
    closed_at     TIMESTAMP,
    is_deleted    BOOLEAN
);"""
        )
    # The target side only has Ticket. The demo creates the Incident tables.
    for grain in GRAINS:
        key = f"{grain}_id"
        extra = "" if grain == "account" else "    account_id      BIGINT,\n"
        for cadence in CADENCES:
            stmts.append(
                f"""
CREATE OR REPLACE TABLE {TARGET_SCHEMA}.Ticket_{grain.title()}_Metrics_Snapshot_{cadence} (
    SNAPSHOT_DATE   DATE,
{extra}    {key:<15} BIGINT,
    metric_name     VARCHAR,
    metric_value    BIGINT,
    LOAD_TIMESTAMP  TIMESTAMP,
    SOURCE_ZONE     VARCHAR
);"""
            )
    return "\n".join(stmts)


def rows(zone: str) -> str:
    cfg = ZONES[zone]
    rng = random.Random(cfg["seed"])
    inserts: list[str] = []

    for entity, statuses in ENTITIES.items():
        values = []
        row_id = 1
        for account in range(1, cfg["accounts"] + 1):
            account_id = 1000 * (1 if zone == "zone1" else 2) + account
            for _ in range(rng.randint(3, 12)):
                created = START_DATE + dt.timedelta(days=rng.randrange(DAYS))
                status = rng.choice(statuses)
                closed = created + dt.timedelta(days=rng.randint(1, 21))
                terminal = status in TERMINAL_STATUSES
                if terminal and closed > END_DATE:
                    # Would close past the window, so it is still in flight: the
                    # status has to move too, or the row would claim a terminal
                    # state with no closed_at and break the invariant the
                    # discovery queries rely on.
                    status = rng.choice(
                        [s for s in statuses if s not in TERMINAL_STATUSES]
                    )
                    terminal = False
                values.append(
                    "({id}, {acct}, {ws}, {usr}, '{st}', '{pr}', "
                    "'{c} 09:00:00', '{u} 17:00:00', {cl}, {d})".format(
                        id=row_id,
                        acct=account_id,
                        ws=account_id * 10 + rng.randint(1, 4),
                        usr=account_id * 100 + rng.randint(1, 25),
                        st=status,
                        pr=rng.choice(["low", "normal", "high", "urgent"]),
                        c=created,
                        u=min(created + dt.timedelta(days=rng.randint(0, 5)), END_DATE),
                        cl=f"'{closed} 17:00:00'" if terminal else "NULL",
                        d="true" if rng.random() < 0.04 else "false",
                    )
                )
                row_id += 1
        inserts.append(
            f"INSERT INTO {SOURCE_SCHEMA}.{entity}s VALUES\n" + ",\n".join(values) + ";"
        )

    # Build the Ticket metric tables from the source rows so the target side is
    # internally consistent with what a real pipeline run would have produced.
    # Daily counts events that happened on the snapshot date; Cumulative counts
    # everything up to and including it. That distinction is the house pattern
    # forge-init reads back out of the code in Step 9.
    for grain in GRAINS:
        key = f"{grain}_id"
        select_cols = "d.snapshot_date, " + (
            "" if grain == "account" else "t.account_id, "
        ) + f"t.{key}"
        group_cols = "1, 2" if grain == "account" else "1, 2, 3"
        for cadence in CADENCES:
            op = "=" if cadence == "Daily" else "<="
            for metric, column in (
                ("total_ticket_create_count", "created_at"),
                ("total_ticket_close_count", "closed_at"),
            ):
                inserts.append(
                    f"""
INSERT INTO {TARGET_SCHEMA}.Ticket_{grain.title()}_Metrics_Snapshot_{cadence}
SELECT {select_cols}, '{metric}', COUNT(*), now(), '{zone}'
FROM (SELECT UNNEST(generate_series(
        DATE '{START_DATE}',
        DATE '{END_DATE}',
        INTERVAL 1 DAY))::DATE AS snapshot_date) d
JOIN {SOURCE_SCHEMA}.tickets t
  ON t.{column} IS NOT NULL AND t.{column}::DATE {op} d.snapshot_date
WHERE t.is_deleted = false
GROUP BY {group_cols}
ORDER BY {group_cols};"""
                )
    return "\n".join(inserts)


def run_sql(db: pathlib.Path, sql: str) -> str:
    result = subprocess.run(
        ["duckdb", str(db), "-c", sql],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(f"duckdb failed on {db.name}:\n{result.stderr.strip()}")
    return result.stdout


def build() -> None:
    if shutil.which("duckdb") is None:
        sys.exit("duckdb CLI not found on PATH. Install it with: brew install duckdb")

    WAREHOUSE.mkdir(exist_ok=True)
    for zone in ZONES:
        db = WAREHOUSE / f"{zone}.duckdb"
        db.unlink(missing_ok=True)
        run_sql(db, ddl())
        run_sql(db, rows(zone))
        counts = run_sql(
            db,
            f"SELECT 'tickets' AS t, COUNT(*) FROM {SOURCE_SCHEMA}.tickets "
            f"UNION ALL SELECT 'incidents', COUNT(*) FROM {SOURCE_SCHEMA}.incidents "
            f"UNION ALL SELECT 'releases', COUNT(*) FROM {SOURCE_SCHEMA}.releases "
            f"UNION ALL SELECT 'ticket metric rows', COUNT(*) "
            f"FROM {TARGET_SCHEMA}.Ticket_Account_Metrics_Snapshot_Daily;",
        )
        print(f"built {db.relative_to(WAREHOUSE.parent)}")
        print(counts.rstrip())


def check() -> None:
    missing = [z for z in ZONES if not (WAREHOUSE / f"{z}.duckdb").exists()]
    if missing:
        sys.exit(f"missing zone files: {', '.join(missing)}. Run: python seed.py")
    for zone in ZONES:
        db = WAREHOUSE / f"{zone}.duckdb"
        out = run_sql(db, "SELECT table_schema, COUNT(*) FROM information_schema.tables GROUP BY 1 ORDER BY 1;")
        print(f"{zone}:\n{out.rstrip()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify instead of rebuild")
    check() if parser.parse_args().check else build()
