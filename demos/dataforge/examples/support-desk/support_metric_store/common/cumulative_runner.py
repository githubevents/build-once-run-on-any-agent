"""Execute one cumulative pipeline module with shared globals injected.

    python common/cumulative_runner.py service_delivery/Ticket/Code/Ticket_Metrics_Snapshot_Cumulative.py

Identical to daily_runner except for the CADENCE it injects. Keeping them as
two files rather than one flag is what lets the orchestration layer schedule
the cadences independently.
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import daily_runner  # noqa: E402

daily_runner.INJECTED["CADENCE"] = "Cumulative"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    daily_runner.run(sys.argv[1])
