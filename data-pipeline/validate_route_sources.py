"""Fail if route datasets contain vague or missing source labels."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
FORBIDDEN = re.compile(r"manual|common knowledge|no ranked data", re.I)


def fail(msg: str) -> None:
    raise SystemExit(msg)


def validate_airline_routes() -> None:
    data = json.loads((DATA / "airline-routes.json").read_text(encoding="utf-8"))
    for iata, entry in data.items():
        dests = entry.get("topDestinations") or []
        if len(dests) < 3:
            fail(f"{iata}: fewer than 3 destinations")
        source = entry.get("source") or ""
        if not source:
            fail(f"{iata}: missing source")
        if FORBIDDEN.search(source):
            fail(f"{iata}: forbidden source label: {source}")
        if not entry.get("sourceUrl"):
            fail(f"{iata}: missing sourceUrl")
        if not entry.get("metric"):
            fail(f"{iata}: missing metric")
        if not entry.get("basis"):
            fail(f"{iata}: missing basis")
        if not entry.get("serviceSource"):
            fail(f"{iata}: missing serviceSource")
        if not entry.get("serviceSourceUrl"):
            fail(f"{iata}: missing serviceSourceUrl")


def validate_airport_routes() -> None:
    data = json.loads((DATA / "airport-routes.json").read_text(encoding="utf-8"))
    ranked = 0
    for iata, entry in data.items():
        if not entry.get("source"):
            fail(f"{iata}: missing airport route source")
        if not entry.get("sourceUrl"):
            fail(f"{iata}: missing airport route sourceUrl")
        if entry.get("destinationRanked") is not True:
            continue
        ranked += 1
        dests = entry.get("topDestinations") or []
        if len(dests) < 3:
            fail(f"{iata}: ranked airport route entry has fewer than 3 destinations")
        if not entry.get("destinationMetric"):
            fail(f"{iata}: ranked airport route entry missing destinationMetric")
        if not entry.get("destinationBasis"):
            fail(f"{iata}: ranked airport route entry missing destinationBasis")
    if ranked < 40:
        fail(f"airport routes: only {ranked} ranked destination entries")


def main() -> int:
    validate_airline_routes()
    validate_airport_routes()
    print("Route source validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
