"""Supplemental Eurostat fetcher: only UK + EL (Greece) + a couple late additions.

The main eurostat.py covers 24 airports. UK uses older year range (Brexit -> stops at 2019)
and EL uses 'el' code. This script adds those without re-fetching the rest.
"""
from __future__ import annotations

import json
import os
import sys

import eurostat as eu
import sources


def main():
    icao_to_iata = eu.build_icao_iata()
    valid = sources.airport_iatas()

    extras = ["uk", "el", "lu", "mt", "cy", "si", "sk", "se", "ee", "lt"]
    year_priority = ["2024", "2023", "2022", "2021", "2020", "2019"]

    # Load existing partial
    path = os.path.join(eu.PIPE_DIR, "eurostat_partial.json")
    with open(path) as f:
        existing = json.load(f)
    existing_airports = existing.get("airports", {})

    new_airports = {}
    failed = []
    for cc in extras:
        url = eu.EUROSTAT_URL.format(cc=cc)
        local = os.path.join(eu.CACHE_DIR, f"avia_par_{cc}.tsv")
        try:
            eu.http_get(url, local)
        except Exception as e:
            failed.append((cc, f"fetch: {e}"))
            continue
        try:
            year, rows = eu.parse_avia_par(local, icao_to_iata, valid, year_priority)
        except Exception as e:
            failed.append((cc, f"parse: {e}"))
            try:
                os.remove(local)
            except OSError:
                pass
            continue
        try:
            os.remove(local)
        except OSError:
            pass
        if not rows:
            failed.append((cc, f"no rows; year={year}"))
            continue

        from collections import defaultdict
        flows = defaultdict(lambda: defaultdict(int))
        for rep_iata, partner_iata, tra_meas, pax in rows:
            if rep_iata == partner_iata:
                continue
            flows[rep_iata][partner_iata] = max(flows[rep_iata][partner_iata], pax)

        for rep_iata, partners in flows.items():
            td = sources.topn(partners, 5)
            if not td:
                continue
            new_airports[rep_iata] = {
                "topDestinations": td,
                "year": int(year) if year else None,
                "source": "Eurostat avia_par",
            }
        print(f"  {cc}: {len(rows)} rows, year={year}, new airports={[k for k in flows]}",
              file=sys.stderr)

    # Merge: existing wins (from main eurostat run) unless new is more recent
    for iata, rec in new_airports.items():
        if iata not in existing_airports:
            existing_airports[iata] = rec
        else:
            # keep newer year
            if (rec.get("year") or 0) > (existing_airports[iata].get("year") or 0):
                existing_airports[iata] = rec

    existing["airports"] = existing_airports
    existing.setdefault("_failed_supplement", []).extend(failed)
    with open(path, "w") as f:
        json.dump(existing, f, indent=2, sort_keys=True)
    print(f"wrote {path} (airports={len(existing_airports)})", file=sys.stderr)


if __name__ == "__main__":
    main()
