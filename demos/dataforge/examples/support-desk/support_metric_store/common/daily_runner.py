"""Execute one daily pipeline module with shared globals injected.

    python common/daily_runner.py service_delivery/Ticket/Code/Ticket_Metrics_Snapshot_Daily.py

The runner is deliberately thin. It exists so that every pipeline file can be a
flat list of SQL statements with no imports and no boilerplate, which is what
makes them safe for an agent to generate and cheap for a human to review.
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import config  # noqa: E402

INJECTED = {
    "SOURCE_ZONE": config.SOURCE_ZONE,
    "SOURCE_ZONE_SUFFIX": config.SOURCE_ZONE_SUFFIX,
    "SNAPSHOT_DATE": config.SNAPSHOT_DATE,
    "SOURCE_CATALOG": config.SOURCE_CATALOG,
    "TARGET_CATALOG": config.TARGET_CATALOG,
    "CADENCE": "Daily",
}


def run(pipeline_path: str) -> None:
    source = pathlib.Path(pipeline_path).read_text()
    namespace = dict(INJECTED)
    namespace["__name__"] = "__pipeline__"
    exec(compile(source, pipeline_path, "exec"), namespace)  # noqa: S102

    statements = namespace.get("STATEMENTS")
    if not statements:
        sys.exit(f"{pipeline_path} defined no STATEMENTS list")
    for statement in statements:
        print(statement.strip())
        print(";")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    run(sys.argv[1])
