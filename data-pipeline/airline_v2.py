"""Compatibility wrapper for the sourced airline-route generator.

Keep this filename usable for muscle memory, but route all writes through
airline_from_hub_routes.py so generated data always has public sources.
"""
from __future__ import annotations

from airline_from_hub_routes import main


if __name__ == "__main__":
    raise SystemExit(main())
