"""Build airline-routes.json from sourced hub-airport route rankings.

This intentionally avoids vague unsourced airline rankings. An airline is
included only when it is the #1 listed carrier at its hub airport. Its
destinations are then taken, in order, from that hub airport's ranked destination
list and intersected with a public airline destination/source page.

This is not the same thing as a carrier-specific passenger ranking. The emitted
metadata says exactly what it is: a hub-dominant inference backed by a public
airport route source plus airline service confirmation.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

from wiki import airline_destinations, fetch_wiki_html, resolve_wiki_title

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
OUT_PATH = DATA / "airline-routes.json"


def wiki_url(source: str) -> str | None:
    prefix = "Wikipedia: "
    if not source.startswith(prefix):
        return None
    title = source[len(prefix):].split(" (", 1)[0].strip()
    if not title:
        return None
    return "https://en.wikipedia.org/wiki/" + quote(title.replace(" ", "_"))


def main() -> int:
    airlines = json.loads((DATA / "airlines.json").read_text(encoding="utf-8"))
    airports = json.loads((DATA / "airports.json").read_text(encoding="utf-8"))
    airport_routes = json.loads((DATA / "airport-routes.json").read_text(encoding="utf-8"))
    valid_airports = set(airports.keys())

    out: dict[str, dict] = {}
    excluded: list[str] = []
    no_service_source: list[str] = []

    for airline in airlines:
        iata = airline["iata"]
        hub = airline.get("hub")
        airport_entry = airport_routes.get(hub)
        if not airport_entry:
            excluded.append(iata)
            continue

        top_airlines = airport_entry.get("topAirlines") or []
        top_destinations = [d for d in (airport_entry.get("topDestinations") or []) if d != hub]
        if not top_airlines or top_airlines[0] != iata or len(top_destinations) < 3:
            excluded.append(iata)
            continue

        service_dests, service_source = sourced_service_destinations(airline, valid_airports)
        if not service_dests:
            no_service_source.append(iata)
            excluded.append(iata)
            continue

        service_set = set(service_dests)
        destinations = [d for d in top_destinations if d in service_set]
        if len(destinations) < 3:
            excluded.append(iata)
            continue

        source = airport_entry.get("source") or ""
        out[iata] = {
            "topDestinations": destinations[:10],
            "year": airport_entry.get("year"),
            "source": source,
            "sourceUrl": wiki_url(source),
            "serviceSource": service_source["source"],
            "serviceSourceUrl": service_source["url"],
            "metric": "hub airport ranked destinations",
            "basis": "Airline is the #1 listed carrier at its hub; ordering comes from the hub airport route table; each destination is also present in the airline's public destination list.",
            "confidence": "hub-dominant inference",
        }

    text = json.dumps(out, indent=2, ensure_ascii=False) + "\n"
    if re.search(r"manual|common knowledge|no ranked data", text, re.I):
        raise SystemExit("refusing to write unsourced airline route labels")
    OUT_PATH.write_text(text, encoding="utf-8")

    print(f"Wrote {OUT_PATH}")
    print(f"Included {len(out)} airlines; excluded {len(excluded)}")
    if excluded:
        print("Excluded:", ", ".join(excluded))
    if no_service_source:
        print("No service source:", ", ".join(no_service_source))
    return 0


def sourced_service_destinations(airline: dict, valid_airports: set[str]) -> tuple[list[str], dict]:
    """Return destinations from a public Wikipedia destination/list page."""
    name = airline.get("name") or airline.get("iata")
    candidates: list[str] = [f"List of {name} destinations"]
    title = resolve_wiki_title(name + " airline") or resolve_wiki_title(name)
    if title:
        candidates.append(f"List of {title} destinations")
        candidates.append(title)

    seen_titles: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen_titles:
            continue
        seen_titles.add(candidate)
        try:
            html = fetch_wiki_html(candidate)
        except Exception:
            continue
        dests = airline_destinations(html, valid_airports)
        if dests:
            return dests, {
                "source": f"Wikipedia: {candidate}",
                "url": "https://en.wikipedia.org/wiki/" + quote(candidate.replace(" ", "_")),
            }
    return [], {}


if __name__ == "__main__":
    raise SystemExit(main())
