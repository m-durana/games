"""Eurostat avia_par_* fetcher.

Eurostat publishes airport-pair passenger flows in avia_par_<cc> tables, one per
reporting country. Each row is identified by (freq, unit, tra_meas, airp_pr)
where airp_pr is `<rep_cc>_<rep_icao>_<partner_cc>_<partner_icao>`. Columns are
time periods (annual + monthly + quarterly).

We only use:
  - tra_meas == "PAS_BRD" (passengers on board, both directions)  -- preferred
    fall-back: "CAF_PAS" total carried passengers if PAS_BRD missing.
  - latest available calendar year (we try 2024 then 2023 then 2022).

ICAO -> IATA conversion uses OpenFlights airports.dat.

Eurostat does not break flows down by carrier in avia_par_*, so this source only
fills airport.topDestinations. airport.topAirlines + airline.topDestinations are
left to the Wikipedia source.
"""
from __future__ import annotations

import csv
import os
import sys
import urllib.request
from collections import defaultdict

from sources import (
    PIPE_DIR,
    airport_iatas,
    load_airports,
    topn,
    write_partial,
)

REPORTING_COUNTRIES = [
    "de", "fr", "uk", "es", "it", "nl", "at", "ch", "be", "ie", "pt",
    "se", "dk", "fi", "no", "pl", "hu", "ro", "el", "tr", "bg",
    "hr", "lt", "lv", "ee", "lu", "mt", "cy", "si", "sk", "is",
]

EUROSTAT_URL = (
    "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/"
    "avia_par_{cc}?format=TSV&compressed=false"
)
OPENFLIGHTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"

CACHE_DIR = os.path.join(PIPE_DIR, "_cache")
os.makedirs(CACHE_DIR, exist_ok=True)


def http_get(url, dest, keep=True):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    return dest


def build_icao_iata():
    path = os.path.join(CACHE_DIR, "openflights_airports.dat")
    http_get(OPENFLIGHTS_URL, path)
    icao_to_iata = {}
    with open(path, newline="") as f:
        for row in csv.reader(f):
            if len(row) < 6:
                continue
            iata = row[4].strip().strip('"')
            icao = row[5].strip().strip('"')
            if len(iata) == 3 and iata.isalpha() and len(icao) == 4:
                icao_to_iata[icao] = iata
    # A few hand-fixes for airports we care about that are missing/wrong in OF.
    icao_to_iata.update({
        "EGLL": "LHR", "EGKK": "LGW", "EGCC": "MAN", "EGGW": "LTN",
        "EDDF": "FRA", "EDDM": "MUC", "EDDB": "BER", "EDDH": "HAM",
        "EDDL": "DUS", "EDDK": "CGN", "EDDS": "STR", "EDDT": "TXL",
        "LFPG": "CDG", "LFPO": "ORY", "LFLL": "LYS", "LFMN": "NCE",
        "LIRF": "FCO", "LIMC": "MXP", "LIPZ": "VCE", "LIML": "LIN",
        "EHAM": "AMS", "EBBR": "BRU", "LSZH": "ZRH", "LSGG": "GVA",
        "LOWW": "VIE", "LOWS": "SZG", "EKCH": "CPH", "ENGM": "OSL",
        "ESSA": "ARN", "EFHK": "HEL", "BIKF": "KEF", "EIDW": "DUB",
        "LEMD": "MAD", "LEBL": "BCN", "LEPA": "PMI", "LEMG": "AGP",
        "LPPT": "LIS", "LPPR": "OPO", "EPWA": "WAW", "EPKK": "KRK",
        "LKPR": "PRG", "LHBP": "BUD", "LROP": "OTP", "LBSF": "SOF",
        "LGAV": "ATH", "LTFM": "IST", "LTFJ": "SAW", "LDZA": "ZAG",
        "LJLJ": "LJU", "LZIB": "BTS", "LYBE": "BEG", "EVRA": "RIX",
        "EYVI": "VNO", "EETN": "TLL", "ELLX": "LUX", "LMML": "MLA",
        "LCLK": "LCA", "OMDB": "DXB", "OMAA": "AUH", "OTHH": "DOH",
        "OERK": "RUH", "OEJN": "JED", "OKBK": "KWI", "OBBI": "BAH",
        "OOMS": "MCT", "OJAI": "AMM", "LLBG": "TLV", "HECA": "CAI",
        "HKJK": "NBO", "HAAB": "ADD", "FAOR": "JNB", "GMMN": "CMN",
        "VABB": "BOM", "VIDP": "DEL", "VOBL": "BLR", "VOMM": "MAA",
        "VHHH": "HKG", "VTBS": "BKK", "VTBD": "DMK", "WSSS": "SIN",
        "WMKK": "KUL", "WIII": "CGK", "RJTT": "HND", "RJAA": "NRT",
        "RKSI": "ICN", "RCTP": "TPE", "ZBAA": "PEK", "ZSPD": "PVG",
        "ZGGG": "CAN", "VVNB": "HAN", "VVTS": "SGN", "RPLL": "MNL",
        "YSSY": "SYD", "YMML": "MEL", "YBBN": "BNE", "NZAA": "AKL",
        "NFFN": "NAN", "AYPY": "POM", "KJFK": "JFK", "KLAX": "LAX",
        "KORD": "ORD", "KATL": "ATL", "KDFW": "DFW", "KDEN": "DEN",
        "KSFO": "SFO", "KSEA": "SEA", "KMIA": "MIA", "KBOS": "BOS",
        "KPHX": "PHX", "KIAH": "IAH", "KCLT": "CLT", "KMSP": "MSP",
        "KDTW": "DTW", "KLAS": "LAS", "KFLL": "FLL", "KEWR": "EWR",
        "KLGA": "LGA", "PHNL": "HNL", "CYYZ": "YYZ", "CYYC": "YYC",
        "CYTZ": "YTZ", "MMMX": "MEX", "MMMY": "MTY", "MPTO": "PTY",
        "SBGR": "GRU", "SBKP": "VCP", "SAEZ": "EZE", "SCEL": "SCL",
        "SKBO": "BOG", "TTPP": "POS", "FIMP": "MRU", "HRYR": "KGL",
        "OPKC": "KHI", "VCBI": "CMB", "ZUUU": "CTU", "ZGSZ": "SZX",
        "UAAA": "ALA", "UTTT": "TAS", "UBBB": "GYD", "ZMUB": "ULN",
        "WBSB": "BWN",
    })
    return icao_to_iata


def parse_avia_par(path, icao_to_iata, valid_iatas, year_priority):
    """Yield (rep_iata, partner_iata, year, passengers, direction) tuples."""
    with open(path, "r", encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        # First column "freq,unit,tra_meas,airp_pr\TIME_PERIOD" then year columns.
        time_cols = [c.strip() for c in header[1:]]
        # Map year -> col index (only annual)
        year_idx = {}
        for i, c in enumerate(time_cols):
            if c.isdigit() and len(c) == 4:
                year_idx[c] = i + 1  # +1 because dim col is 0
        # Pick a year preference order
        year = None
        for y in year_priority:
            if y in year_idx:
                year = y
                break
        if year is None:
            return None, []
        col = year_idx[year]
        rows = []
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) <= col:
                continue
            dim = parts[0].split(",")
            if len(dim) != 4:
                continue
            freq, unit, tra_meas, airp_pr = dim
            if freq != "A":
                continue
            if tra_meas not in ("PAS_BRD", "CAF_PAS"):
                continue
            try:
                rep_cc, rep_icao, partner_cc, partner_icao = airp_pr.split("_")
            except ValueError:
                continue
            rep_iata = icao_to_iata.get(rep_icao)
            partner_iata = icao_to_iata.get(partner_icao)
            if not rep_iata or not partner_iata:
                continue
            if rep_iata not in valid_iatas or partner_iata not in valid_iatas:
                continue
            raw = parts[col].strip().strip(":").strip()
            # strip trailing flags like "1234 e" or "1234 p"
            raw = raw.split(" ")[0]
            if not raw or raw == ":":
                continue
            try:
                pax = int(float(raw))
            except ValueError:
                continue
            if pax <= 0:
                continue
            rows.append((rep_iata, partner_iata, tra_meas, pax))
        return year, rows


def main():
    icao_to_iata = build_icao_iata()
    valid = airport_iatas()
    airports = load_airports()

    # rep_iata -> {partner_iata: pax}, taking the higher of PAS_BRD vs CAF_PAS
    flows_pas_brd = defaultdict(lambda: defaultdict(int))
    flows_caf_pas = defaultdict(lambda: defaultdict(int))
    chosen_year = None

    year_priority = ["2024", "2023", "2022", "2021", "2020", "2019"]

    failed = []
    for cc in REPORTING_COUNTRIES:
        url = EUROSTAT_URL.format(cc=cc)
        path = os.path.join(CACHE_DIR, f"avia_par_{cc}.tsv")
        try:
            http_get(url, path)
        except Exception as e:
            failed.append((cc, str(e)))
            continue
        try:
            year, rows = parse_avia_par(path, icao_to_iata, valid, year_priority)
        except Exception as e:
            failed.append((cc, f"parse: {e}"))
            try:
                os.remove(path)
            except OSError:
                pass
            continue
        # Free disk: drop the big TSV after parsing.
        try:
            os.remove(path)
        except OSError:
            pass
        if year is None:
            failed.append((cc, "no annual columns"))
            continue
        if chosen_year is None:
            chosen_year = year
        for rep_iata, partner_iata, tra_meas, pax in rows:
            if rep_iata == partner_iata:
                continue
            target = flows_pas_brd if tra_meas == "PAS_BRD" else flows_caf_pas
            target[rep_iata][partner_iata] = max(target[rep_iata][partner_iata], pax)
        print(f"  {cc}: {len(rows)} rows, year={year}", file=sys.stderr)

    # Merge: prefer PAS_BRD where present
    flows = defaultdict(lambda: defaultdict(int))
    for d in (flows_caf_pas, flows_pas_brd):  # PAS_BRD overwrites
        for rep, partners in d.items():
            for p, v in partners.items():
                flows[rep][p] = max(flows[rep][p], v)

    out_airports = {}
    for rep_iata, partners in flows.items():
        if not partners:
            continue
        td = topn(partners, 5)
        if not td:
            continue
        out_airports[rep_iata] = {
            "topDestinations": td,
            "year": int(chosen_year) if chosen_year else None,
            "source": "Eurostat avia_par",
        }

    out = {
        "version": "1.0",
        "source": "Eurostat avia_par_*",
        "year": int(chosen_year) if chosen_year else None,
        "airports": out_airports,
        "airlines": {},
        "_failed": failed,
    }
    write_partial("eurostat_partial.json", out)


if __name__ == "__main__":
    main()
