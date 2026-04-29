"""One-shot migration: rename aircraft ids to a consistent variant-explicit
scheme and add 11 new variants. See docs/aircraft-photo-review.md for the
naming convention.

Run from repo root:  python data-pipeline/migrate_aircraft_ids.py

Idempotent: re-running with already-migrated data is a no-op.
"""
import json
import os
import sys
from copy import deepcopy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AIRCRAFT_JSON = os.path.join(ROOT, 'src', 'data', 'aircraft.json')
PHOTOS_JSON = os.path.join(ROOT, 'src', 'data', 'aircraft-photos.json')
BASELINE_JSON = os.path.join(ROOT, 'src', 'data', 'aircraft-review-baseline.json')

# OLD id -> NEW id. Ids not in this map are kept as-is.
RENAMES = {
    'a300':         'a300-600',
    'a220':         'a220-300',
    'a320':         'a320ceo',
    'a321':         'a321ceo',
    'a330':         'a330-300',
    'a330neo':      'a330-900',
    'a350':         'a350-900',
    'b727':         'b727-200',
    'b737classic':  'b737-400',
    'b737ng':       'b737-800',
    'b737-900':     'b737-900er',
    'b737max':      'b737max8',
    'b747':         'b747-400',
    'b757':         'b757-200',
    'b767':         'b767-300er',
    'b777':         'b777-300er',
    'b777-200':     'b777-200er',
    'b787':         'b787-9',
    'dash8classic': 'dash8-300',
    'dash8q400':    'dash8-q400',
    'e195e2':       'e195-e2',
}

# Patches to existing aircraft.json entries — name/keyTell/identification fields
# need a refresh once an id changes meaning (e.g. b787 -> b787-9 stays the
# same factually, but b777 -> b777-300er is unchanged too — still, double-check
# manually). For now we just rename the id field; the existing entry text
# already describes the specific sub-variant in every renamed case.

# New aircraft entries to append. Each must conform to the Aircraft TS interface.
NEW_AIRCRAFT = [
    {
        "id": "a220-100",
        "name": "Airbus A220-100",
        "manufacturer": "Airbus",
        "family": "A220",
        "body": "Narrow",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 35.0,
        "tail": "Conventional",
        "generation": 2010,
        "wikipedia": "Airbus A220",
        "identification": {
            "manufacturer": "Bombardier-designed cockpit (now Airbus), small Airbus-style radome.",
            "family": "A220 - narrowbody twin sitting low to the ground with disproportionately large geared turbofan engines for its size.",
            "variant": "The A220-100 is the shorter of the two A220s - about 35.0m, with two pairs of overwing exits in a tight cluster (the -300 has three pairs)."
        },
        "keyTell": "Short A220 with two overwing exit pairs (vs three on the -300)."
    },
    {
        "id": "a320neo",
        "name": "Airbus A320neo",
        "manufacturer": "Airbus",
        "family": "A320 family",
        "body": "Narrow",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 37.6,
        "tail": "Conventional",
        "generation": 2010,
        "wikipedia": "Airbus A320neo family",
        "identification": {
            "manufacturer": "Airbus radome, four-pane V-bottom cockpit window, clean wing-body fairing.",
            "family": "A320 family - single-aisle twin sitting noticeably high on its gear, with full-round engine inlets.",
            "variant": "The A320neo has noticeably LARGER engines (PW1100G geared turbofan or LEAP-1A) than the CEO and tall scimitar-shaped SHARKLETS at the wingtips (vs the older CEO's small angle-cut wingtip fence)."
        },
        "keyTell": "A320 with tall scimitar sharklets and oversized geared turbofan engines."
    },
    {
        "id": "a321neo",
        "name": "Airbus A321neo",
        "manufacturer": "Airbus",
        "family": "A320 family",
        "body": "Narrow",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 44.5,
        "tail": "Conventional",
        "generation": 2015,
        "wikipedia": "Airbus A321neo",
        "identification": {
            "manufacturer": "Airbus radome, four-pane V-bottom cockpit window.",
            "family": "A320 family - longest member with two pairs of overwing exits.",
            "variant": "A321neo has the same long fuselage as the CEO (~44.5m) but with sharklets and large LEAP/PW1100G engines. The LR and XLR sub-variants add belly fuel tanks for transatlantic range."
        },
        "keyTell": "Longest A320-family jet with sharklets and oversized engines."
    },
    {
        "id": "a340-300",
        "name": "Airbus A340-300",
        "manufacturer": "Airbus",
        "family": "A340",
        "body": "Wide",
        "engines": 4,
        "engineType": "Turbofan",
        "length": 63.7,
        "tail": "Conventional",
        "generation": 1990,
        "wikipedia": "Airbus A340",
        "identification": {
            "manufacturer": "Airbus radome and clean fairings, classic 1990s Airbus widebody style.",
            "family": "A340 - four-engine Airbus widebody. From a distance very similar to the A330; the four engines are the giveaway.",
            "variant": "The A340-300 is the original long-range A340 (~63.7m) - same length as an A330-300 but with FOUR engines and no center main landing gear (the -500 and -600 add a center gear leg)."
        },
        "keyTell": "Four-engine Airbus widebody, ~64m long, four-wheel main bogies only (no center gear)."
    },
    {
        "id": "b737max9",
        "name": "Boeing 737 MAX 9",
        "manufacturer": "Boeing",
        "family": "737",
        "body": "Narrow",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 42.2,
        "tail": "Conventional",
        "generation": 2017,
        "wikipedia": "Boeing 737 MAX",
        "identification": {
            "manufacturer": "Boeing pointed nose with sharp lower cockpit window edge.",
            "family": "737 MAX - oversized LEAP-1B engines, split-tip Advanced Technology winglets, EE-bay tail vent.",
            "variant": "MAX 9 is the longer MAX (~42.2m) - same engines and winglets as the MAX 8 but with TWO pairs of overwing exits (vs one on MAX 8). Operators: Alaska, United, Copa."
        },
        "keyTell": "737 MAX with two pairs of overwing exits and a longer fuselage than the MAX 8."
    },
    {
        "id": "b747-8",
        "name": "Boeing 747-8",
        "manufacturer": "Boeing",
        "family": "747",
        "body": "Wide",
        "engines": 4,
        "engineType": "Turbofan",
        "length": 76.3,
        "tail": "Conventional",
        "generation": 2010,
        "wikipedia": "Boeing 747-8",
        "identification": {
            "manufacturer": "Boeing pointed nose with the classic 747 hump on top.",
            "family": "747 - four-engine widebody with the partial upper-deck hump on the front of the fuselage.",
            "variant": "747-8 is the modern stretch (~76.3m) with RAKED wingtips (no winglets) and GEnx engines. The hump is noticeably LONGER than the -400 (extending further back along the fuselage). Operators: Lufthansa, Korean, Air China; freighter: UPS, Cargolux, Atlas, Polar."
        },
        "keyTell": "747 with raked wingtips (NO winglets) and an extended longer hump."
    },
    {
        "id": "b777-300",
        "name": "Boeing 777-300",
        "manufacturer": "Boeing",
        "family": "777",
        "body": "Wide",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 73.9,
        "tail": "Conventional",
        "generation": 1995,
        "wikipedia": "Boeing 777",
        "identification": {
            "manufacturer": "Boeing pointed nose, classic 777 fairings.",
            "family": "777 - twin-engine widebody with very large GE90/Trent/PW4000 engines and a six-wheel main bogie.",
            "variant": "The non-ER 777-300 is rare today (most retired). Same length as the -300ER (~73.9m) but with smaller PW4090/Trent 892 engines and SQUARED-OFF wingtips (no rake). Last operators were ANA and a handful of carriers."
        },
        "keyTell": "777 stretch with SQUARED (not raked) wingtips - distinguishes it from the much more common -300ER."
    },
    {
        "id": "b787-8",
        "name": "Boeing 787-8",
        "manufacturer": "Boeing",
        "family": "787",
        "body": "Wide",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 56.7,
        "tail": "Conventional",
        "generation": 2011,
        "wikipedia": "Boeing 787 Dreamliner",
        "identification": {
            "manufacturer": "Boeing pointed nose, distinctive 787 four-pane cockpit window with deep slope.",
            "family": "787 Dreamliner - twin engines with chevron-edged exhaust nozzles, raked carbon-fiber wings that flex visibly upward in flight.",
            "variant": "The 787-8 is the SHORTEST 787 (~56.7m) - visibly stubbier than the -9's 62.8m or the -10's 68.3m. Operators: ANA, JAL, United, Norwegian, Qatar, BA, Air India."
        },
        "keyTell": "Shortest 787 - stubbier silhouette than the -9 or -10."
    },
    {
        "id": "b787-10",
        "name": "Boeing 787-10",
        "manufacturer": "Boeing",
        "family": "787",
        "body": "Wide",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 68.3,
        "tail": "Conventional",
        "generation": 2017,
        "wikipedia": "Boeing 787 Dreamliner",
        "identification": {
            "manufacturer": "Boeing pointed nose, distinctive 787 four-pane cockpit window with deep slope.",
            "family": "787 Dreamliner - twin engines with chevron-edged exhaust nozzles, raked carbon-fiber wings that flex visibly upward in flight.",
            "variant": "The 787-10 is the LONGEST 787 (~68.3m) - noticeably longer than the -9's 62.8m, with the SAME wing and engines as the -9 (no range increase, just extra fuselage). Operators: United, Singapore, Etihad, KLM."
        },
        "keyTell": "Longest 787 - same wing as -9 but stretched fuselage."
    },
    {
        "id": "e190-e2",
        "name": "Embraer E190-E2",
        "manufacturer": "Embraer",
        "family": "E-Jet E2",
        "body": "Narrow",
        "engines": 2,
        "engineType": "Turbofan",
        "length": 36.2,
        "tail": "T-tail",
        "generation": 2018,
        "wikipedia": "Embraer E-Jet E2 family",
        "identification": {
            "manufacturer": "Embraer pointed nose, T-tail.",
            "family": "E-Jet E2 - second-generation E-Jet with much LARGER Pratt geared turbofan engines (vs the smaller CF34 of the E1) and redesigned raked wingtips.",
            "variant": "E190-E2 is the middle E2 (~36.2m) - same fuselage length as the E1 E190 but with the giant geared turbofans and raked tips. Operators: KLM Cityhopper, Helvetic, Air Astana, Aeromexico Connect."
        },
        "keyTell": "E190-sized fuselage with the new oversized geared turbofan engines and raked wingtips."
    },
    {
        "id": "md11",
        "name": "McDonnell Douglas MD-11",
        "manufacturer": "McDonnell Douglas",
        "family": "MD-11",
        "body": "Wide",
        "engines": 3,
        "engineType": "Turbofan",
        "length": 61.2,
        "tail": "Conventional",
        "generation": 1990,
        "wikipedia": "McDonnell Douglas MD-11",
        "identification": {
            "manufacturer": "McDonnell Douglas style - rounded nose, three-engine widebody silhouette derived from the DC-10.",
            "family": "MD-11 - three-engine widebody. The third engine is mounted high on the rear fuselage with an S-duct intake at the base of the tail.",
            "variant": "Single passenger variant. Distinctive trijet layout with winglets and swept wings. Almost entirely cargo today: FedEx and UPS run the largest fleets; Lufthansa Cargo retired theirs in 2021. Passenger operators all retired by 2014."
        },
        "keyTell": "Three-engine widebody with the third engine mounted high on the rear fuselage - the only such trijet still flying in significant numbers."
    },
]


def remap_keys(d, rename_map):
    """Return a new dict with keys renamed per rename_map. Keys not in the
    map are kept as-is. If both the OLD and NEW keys exist (already migrated
    on a previous run), prefer NEW and drop OLD silently."""
    out = {}
    for k, v in d.items():
        new_k = rename_map.get(k, k)
        if new_k in out and k in rename_map:
            # already-migrated state already wrote NEW; skip stale OLD
            continue
        out[new_k] = v
    return out


def migrate_aircraft_json():
    with open(AIRCRAFT_JSON, encoding='utf-8') as f:
        data = json.load(f)
    seen = {a['id'] for a in data}
    changed = 0
    # Rename ids in place.
    for a in data:
        if a['id'] in RENAMES:
            new_id = RENAMES[a['id']]
            if new_id in seen and new_id != a['id']:
                # already-migrated; skip (will be deduped below)
                continue
            a['id'] = new_id
            changed += 1
    # Dedupe in case someone has both old + new entries.
    seen2 = set()
    deduped = []
    for a in data:
        if a['id'] in seen2:
            continue
        seen2.add(a['id'])
        deduped.append(a)
    # Append new aircraft if not already present.
    for new in NEW_AIRCRAFT:
        if new['id'] not in seen2:
            deduped.append(deepcopy(new))
            changed += 1
    with open(AIRCRAFT_JSON, 'w', encoding='utf-8') as f:
        json.dump(deduped, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return changed, len(deduped)


def migrate_keyed_json(path, rename_map, ensure_keys):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    out = remap_keys(data, rename_map)
    for k in ensure_keys:
        out.setdefault(k, [] if 'photos' in path else {'approved': [], 'rejected': [], 'verified': []})
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return len(out)


def main():
    new_ids = [a['id'] for a in NEW_AIRCRAFT]
    a_changed, a_total = migrate_aircraft_json()
    photos_total = migrate_keyed_json(PHOTOS_JSON, RENAMES, new_ids)
    baseline_total = migrate_keyed_json(BASELINE_JSON, RENAMES, new_ids)
    print(f'aircraft.json: {a_changed} entries changed, {a_total} total')
    print(f'aircraft-photos.json: {photos_total} keys')
    print(f'aircraft-review-baseline.json: {baseline_total} keys')
    print()
    print('NEW ids ready for photo fetch:')
    for nid in new_ids:
        print(f'  {nid}')


if __name__ == '__main__':
    main()
