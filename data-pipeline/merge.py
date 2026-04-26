"""Merge BTS / Eurostat / Wikipedia partial outputs into routes.json.

Precedence per the spec: BTS > Eurostat > Wikipedia.
"""
from __future__ import annotations

import datetime
import json
import os
import sys

import sources

PIPE_DIR = sources.PIPE_DIR
ROOT = sources.ROOT
OUTPUT_PATH = os.path.join(ROOT, "src", "data", "routes.json")


def load_partial(name):
    path = os.path.join(PIPE_DIR, name)
    if not os.path.exists(path):
        return {"airports": {}, "airlines": {}}
    with open(path) as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {"airports": {}, "airlines": {}}


def merge():
    bts = load_partial("bts_partial.json")
    eu = load_partial("eurostat_partial.json")
    wiki = load_partial("wiki_partial.json")

    valid_airports = sources.airport_iatas()
    valid_airlines = sources.airline_iatas()
    hubs = sources.airline_hubs()

    sources_by_priority = [
        ("BTS T-100", bts),
        ("Eurostat avia_par", eu),
        ("Wikipedia", wiki),
    ]

    out_airports = {}
    coverage_per_source = {n: {"airports": 0, "airlines": 0} for n, _ in sources_by_priority}

    for iata in sorted(valid_airports):
        td = None
        ta = None
        td_src = None
        td_year = None
        ta_src = None
        ta_year = None
        ta_unranked = False
        for src_name, partial in sources_by_priority:
            entry = partial.get("airports", {}).get(iata)
            if not entry:
                continue
            if td is None and entry.get("topDestinations"):
                cand = [d for d in entry["topDestinations"]
                        if d in valid_airports and d != iata][:5]
                if cand:
                    td = cand
                    td_src = entry.get("source", src_name)
                    td_year = entry.get("year")
            if ta is None and entry.get("topAirlines"):
                cand = [a for a in entry["topAirlines"] if a in valid_airlines][:5]
                if cand:
                    ta = cand
                    ta_src = entry.get("source", src_name)
                    ta_year = entry.get("year")
                    ta_unranked = bool(entry.get("airlinesUnranked"))
            if td is not None and ta is not None:
                break
        if not td and not ta:
            continue
        record = {}
        if ta:
            record["topAirlines"] = ta
        if td:
            record["topDestinations"] = td
        if ta_unranked:
            record["airlinesUnranked"] = True
        years = [y for y in (td_year, ta_year) if y]
        srcs = []
        for s in (td_src, ta_src):
            if s and s not in srcs:
                srcs.append(s)
        record["year"] = max(years) if years else None
        record["source"] = " + ".join(srcs) if srcs else "unknown"
        out_airports[iata] = record

    out_airlines = {}
    all_iatas = set()
    for _, partial in sources_by_priority:
        all_iatas.update(partial.get("airlines", {}).keys())
    for iata in sorted(all_iatas):
        if iata not in valid_airlines:
            continue
        hub = hubs.get(iata)
        td = None
        td_src = None
        td_year = None
        for src_name, partial in sources_by_priority:
            entry = partial.get("airlines", {}).get(iata)
            if not entry:
                continue
            if entry.get("topDestinations"):
                cand = [d for d in entry["topDestinations"]
                        if d in valid_airports and d != hub][:5]
                if cand:
                    td = cand
                    td_src = entry.get("source", src_name)
                    td_year = entry.get("year")
                    break
        if not td:
            continue
        out_airlines[iata] = {
            "topDestinations": td,
            "year": td_year,
            "source": td_src or "unknown",
        }

    today = datetime.date.today().isoformat()
    final = {
        "version": "1.0",
        "generatedAt": today,
        "airports": out_airports,
        "airlines": out_airlines,
    }
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(final, f, indent=2, sort_keys=True)
    print(
        f"wrote {OUTPUT_PATH} airports={len(out_airports)} airlines={len(out_airlines)}",
        file=sys.stderr,
    )

    cov = {n: {"airports": len(p.get("airports", {})),
               "airlines": len(p.get("airlines", {}))}
           for n, p in sources_by_priority}
    print(json.dumps(cov, indent=2), file=sys.stderr)


if __name__ == "__main__":
    merge()
