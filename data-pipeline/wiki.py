"""Wikipedia scraper for airport "Busiest routes" tables.

For each airport in airports.json, resolve its Wikipedia page via the
opensearch API, then look for tables under headings like "Busiest routes",
"Top destinations", "Statistics", "Traffic and statistics", etc., or any
wikitable on the page that has columns matching {Rank, Airport/Destination,
Passengers}. Extract destination IATA codes and passenger counts.

For airline.topDestinations: for each airline in airlines.json, hit its
Wikipedia page and look for the "Destinations" table or "Routes" sections
listing IATA codes. Without ranks we can't order by traffic, so we fall back
to listing the airline's hub-served routes by appearance order — but only when
no other source covers that airline. We mark these with "Wikipedia (unranked)".

For airport.topAirlines: same idea — scrape "Airlines and destinations" table
listing carriers; mark unranked.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict, Counter

from bs4 import BeautifulSoup

from sources import (
    PIPE_DIR,
    airline_hubs,
    airline_iatas,
    airport_iatas,
    load_airlines,
    load_airports,
    topn,
    write_partial,
)

CACHE_DIR = os.path.join(PIPE_DIR, "_cache", "wiki")
os.makedirs(CACHE_DIR, exist_ok=True)

UA = "miro-games-data-pipeline/1.0 (educational; mdurana@ethz.ch)"

# Wikipedia titles that opensearch sometimes mis-resolves for our airports.
AIRPORT_WIKI_OVERRIDE = {
    "JFK": "John F. Kennedy International Airport",
    "LAX": "Los Angeles International Airport",
    "ORD": "O'Hare International Airport",
    "ATL": "Hartsfield-Jackson Atlanta International Airport",
    "DFW": "Dallas/Fort Worth International Airport",
    "DEN": "Denver International Airport",
    "SFO": "San Francisco International Airport",
    "SEA": "Seattle-Tacoma International Airport",
    "MIA": "Miami International Airport",
    "BOS": "Logan International Airport",
    "PHX": "Phoenix Sky Harbor International Airport",
    "IAH": "George Bush Intercontinental Airport",
    "CLT": "Charlotte Douglas International Airport",
    "MSP": "Minneapolis-Saint Paul International Airport",
    "DTW": "Detroit Metropolitan Airport",
    "LAS": "Harry Reid International Airport",
    "FLL": "Fort Lauderdale-Hollywood International Airport",
    "EWR": "Newark Liberty International Airport",
    "LGA": "LaGuardia Airport",
    "HNL": "Daniel K. Inouye International Airport",
    "DAL": "Dallas Love Field",
    "YYZ": "Toronto Pearson International Airport",
    "YYC": "Calgary International Airport",
    "YTZ": "Billy Bishop Toronto City Airport",
    "MEX": "Mexico City International Airport",
    "MTY": "Monterrey International Airport",
    "GRU": "São Paulo-Guarulhos International Airport",
    "VCP": "Viracopos International Airport",
    "EZE": "Ministro Pistarini International Airport",
    "SCL": "Arturo Merino Benítez International Airport",
    "BOG": "El Dorado International Airport",
    "PTY": "Tocumen International Airport",
    "POS": "Piarco International Airport",
    "FRA": "Frankfurt Airport",
    "MUC": "Munich Airport",
    "BER": "Berlin Brandenburg Airport",
    "DUS": "Düsseldorf Airport",
    "CDG": "Charles de Gaulle Airport",
    "LHR": "Heathrow Airport",
    "LGW": "Gatwick Airport",
    "MAN": "Manchester Airport",
    "LBA": "Leeds Bradford Airport",
    "AMS": "Amsterdam Airport Schiphol",
    "BRU": "Brussels Airport",
    "ZRH": "Zürich Airport",
    "VIE": "Vienna International Airport",
    "MAD": "Adolfo Suárez Madrid-Barajas Airport",
    "BCN": "Josep Tarradellas Barcelona-El Prat Airport",
    "FCO": "Leonardo da Vinci-Fiumicino Airport",
    "LIS": "Lisbon Airport",
    "DUB": "Dublin Airport",
    "CPH": "Copenhagen Airport",
    "OSL": "Oslo Airport, Gardermoen",
    "ARN": "Stockholm Arlanda Airport",
    "HEL": "Helsinki Airport",
    "KEF": "Keflavík International Airport",
    "WAW": "Warsaw Chopin Airport",
    "PRG": "Václav Havel Airport Prague",
    "BUD": "Budapest Ferenc Liszt International Airport",
    "OTP": "Bucharest Henri Coandă International Airport",
    "SOF": "Sofia Airport",
    "ATH": "Athens International Airport",
    "IST": "Istanbul Airport",
    "SAW": "Sabiha Gökçen International Airport",
    "BEG": "Belgrade Nikola Tesla Airport",
    "RIX": "Riga International Airport",
    "ZAG": "Franjo Tuđman Airport",
    "SVO": "Sheremetyevo International Airport",
    "DME": "Domodedovo International Airport",
    "DXB": "Dubai International Airport",
    "AUH": "Zayed International Airport",
    "DOH": "Hamad International Airport",
    "JED": "King Abdulaziz International Airport",
    "KWI": "Kuwait International Airport",
    "BAH": "Bahrain International Airport",
    "MCT": "Muscat International Airport",
    "AMM": "Queen Alia International Airport",
    "TLV": "Ben Gurion Airport",
    "CAI": "Cairo International Airport",
    "NBO": "Jomo Kenyatta International Airport",
    "ADD": "Addis Ababa Bole International Airport",
    "JNB": "O. R. Tambo International Airport",
    "CMN": "Casablanca Mohammed V International Airport",
    "MRU": "Sir Seewoosagur Ramgoolam International Airport",
    "KGL": "Kigali International Airport",
    "DEL": "Indira Gandhi International Airport",
    "KHI": "Jinnah International Airport",
    "CMB": "Bandaranaike International Airport",
    "HKG": "Hong Kong International Airport",
    "BKK": "Suvarnabhumi Airport",
    "SIN": "Singapore Changi Airport",
    "KUL": "Kuala Lumpur International Airport",
    "CGK": "Soekarno-Hatta International Airport",
    "HND": "Haneda Airport",
    "ICN": "Incheon International Airport",
    "TPE": "Taoyuan International Airport",
    "PEK": "Beijing Capital International Airport",
    "PVG": "Shanghai Pudong International Airport",
    "CAN": "Guangzhou Baiyun International Airport",
    "HAK": "Haikou Meilan International Airport",
    "HAN": "Noi Bai International Airport",
    "SGN": "Tan Son Nhat International Airport",
    "MNL": "Ninoy Aquino International Airport",
    "SYD": "Sydney Airport",
    "MEL": "Melbourne Airport",
    "BNE": "Brisbane Airport",
    "AKL": "Auckland Airport",
    "NAN": "Nadi International Airport",
    "POM": "Jacksons International Airport",
    "BWN": "Brunei International Airport",
    "ALA": "Almaty International Airport",
    "TAS": "Tashkent International Airport",
    "GYD": "Heydar Aliyev International Airport",
    "ULN": "Chinggis Khaan International Airport",
}


def http_get_text(url, cache_key):
    cache = os.path.join(CACHE_DIR, cache_key)
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, "rb") as f:
            return f.read().decode("utf-8", "replace")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    with open(cache, "wb") as f:
        f.write(data)
    time.sleep(0.2)  # be polite
    return data.decode("utf-8", "replace")


def resolve_wiki_title(query):
    safe = urllib.parse.quote(query)
    url = (
        f"https://en.wikipedia.org/w/api.php?action=opensearch"
        f"&search={safe}&limit=1&format=json"
    )
    key = "search_" + re.sub(r"[^A-Za-z0-9]+", "_", query)[:80] + ".json"
    try:
        text = http_get_text(url, key)
        data = json.loads(text)
        if len(data) >= 2 and data[1]:
            return data[1][0]
    except Exception:
        pass
    return None


def fetch_wiki_html(title):
    safe = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/wiki/{safe}"
    key = "page_" + re.sub(r"[^A-Za-z0-9]+", "_", title)[:120] + ".html"
    return http_get_text(url, key)


IATA_RE = re.compile(r"\b([A-Z]{3})\b")
AIRLINE_IATA_RE = re.compile(r"\(([A-Z0-9]{2})\)")


def parse_int(s):
    s = re.sub(r"[\s,]", "", s.strip())
    s = re.sub(r"\[.*?\]", "", s)
    if not s or not re.match(r"^\d+", s):
        return None
    try:
        return int(re.match(r"^\d+", s).group(0))
    except ValueError:
        return None


_TITLE_TO_IATA = None
OPENFLIGHTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "openflights_airports.dat")


def _wiki_title_to_iata():
    global _TITLE_TO_IATA
    if _TITLE_TO_IATA is not None:
        return _TITLE_TO_IATA
    m = {}
    # OpenFlights airport names — broad, but lower priority than overrides.
    if os.path.exists(OPENFLIGHTS_PATH):
        import csv as _csv
        with open(OPENFLIGHTS_PATH, newline="") as f:
            for row in _csv.reader(f):
                if len(row) < 6:
                    continue
                name = row[1].strip().strip('"')
                iata = row[4].strip().strip('"')
                if len(iata) == 3 and iata.isalpha() and name:
                    key = name.lower()
                    m.setdefault(key, iata)
                    m.setdefault(key.replace("-", " "), iata)
                    m.setdefault(key.replace("-", "–"), iata)
    # Manual overrides + variants take priority
    for iata, title in AIRPORT_WIKI_OVERRIDE.items():
        for variant in {
            title.lower(),
            title.replace("-", "–").lower(),
            title.replace("–", "-").lower(),
        }:
            m[variant] = iata
    _TITLE_TO_IATA = m
    return m


def airport_busiest_routes(html, valid_airports):
    """Return Counter[dest_iata] -> passengers from busiest-routes tables."""
    soup = BeautifulSoup(html, "lxml")
    counts = Counter()
    visited = set()
    headings = list(soup.find_all(["h2", "h3", "h4"]))
    # Pass 1: explicit "busiest routes / top destinations" headings
    matchers = [
        lambda t: "busiest" in t and ("route" in t or "destination" in t),
        lambda t: "top" in t and ("route" in t or "destination" in t),
        # Sub-sections under "Traffic and statistics" (often "Domestic"/"International"
        # that contain busiest-routes tables on Asia/Oceania pages).
    ]
    for h in headings:
        title = h.get_text(" ", strip=True).lower()
        if not any(m(title) for m in matchers):
            continue
        stop = _stop_levels_for(h)
        for sib in h.find_all_next():
            if sib.name in stop and sib is not h:
                break
            if sib.name == "table" and "wikitable" in (sib.get("class") or []):
                if id(sib) in visited:
                    continue
                visited.add(id(sib))
                _extract_route_table(sib, counts, valid_airports)
    # Pass 2: tables inside a "Traffic and statistics"/"Statistics" section.
    if not counts:
        for h in headings:
            t = h.get_text(" ", strip=True).lower()
            if not (("traffic" in t and "statistic" in t) or t.strip() == "statistics"):
                continue
            for sib in h.find_all_next():
                if sib.name in ("h2",) and sib is not h:
                    break
                if sib.name == "table" and "wikitable" in (sib.get("class") or []):
                    if id(sib) in visited:
                        continue
                    visited.add(id(sib))
                    _extract_route_table(sib, counts, valid_airports)
    return counts


def _extract_route_table(table, counts, valid_airports):
    rows = table.find_all("tr")
    if not rows:
        return
    headers = [c.get_text(" ", strip=True).lower() for c in rows[0].find_all(["th", "td"])]
    if not headers:
        return
    dest_col = None
    pax_col = None
    for i, h in enumerate(headers):
        if dest_col is None and (
            "airport" in h or "city" in h or "destination" in h or "route" in h
        ):
            dest_col = i
        if pax_col is None and ("passenger" in h or "pax" in h):
            pax_col = i
    if dest_col is None:
        return
    title_to_iata = _wiki_title_to_iata()
    rank = 0
    for tr in rows[1:]:
        cells = tr.find_all(["td", "th"])
        if len(cells) <= dest_col:
            continue
        dest_cell = cells[dest_col]
        iata = None
        # Try links' title attr → wiki page title → known iata
        for a in dest_cell.find_all("a"):
            t = (a.get("title") or "").strip()
            if not t:
                continue
            cand = title_to_iata.get(t.lower())
            if cand and cand in valid_airports:
                iata = cand
                break
        if not iata:
            # explicit IATA token in cell text
            text = dest_cell.get_text(" ", strip=True)
            m = re.search(r"\b([A-Z]{3})\b", text)
            if m and m.group(1) in valid_airports:
                iata = m.group(1)
        if not iata:
            continue
        pax = None
        if pax_col is not None and len(cells) > pax_col:
            pax = parse_int(cells[pax_col].get_text(" ", strip=True))
        if pax is None:
            rank += 1
            pax = max(1, 1_000_000 - rank * 1000)
        counts[iata] += pax


_HEADING_LEVEL = {"h2": 2, "h3": 3, "h4": 4}


def _stop_levels_for(heading):
    """Return tuple of heading tag names that should stop traversal.
    Stop only at headings of the same or higher level."""
    lvl = _HEADING_LEVEL.get(heading.name, 2)
    return tuple(t for t, l in _HEADING_LEVEL.items() if l <= lvl)


def airport_airlines_table(html, valid_airlines):
    """From "Airlines and destinations" tables, return list of carrier IATAs ranked
    by number of destination tokens served (proxy for traffic share)."""
    soup = BeautifulSoup(html, "lxml")
    counts = Counter()
    visited = set()
    for h in soup.find_all(["h2", "h3", "h4"]):
        t = h.get_text(" ", strip=True).lower()
        if "airline" not in t or "destination" not in t:
            continue
        stop = _stop_levels_for(h)
        for sib in h.find_all_next():
            if sib.name in stop and sib is not h:
                break
            if sib.name != "table":
                continue
            if "wikitable" not in (sib.get("class") or []):
                continue
            if id(sib) in visited:
                continue
            visited.add(id(sib))
            for tr in sib.find_all("tr")[1:]:
                cells = tr.find_all(["td", "th"])
                if not cells:
                    continue
                name = cells[0].get_text(" ", strip=True)
                iata = _airline_name_to_iata(name, valid_airlines)
                if not iata:
                    continue
                dests = 1
                if len(cells) >= 2:
                    dest_text = cells[1].get_text(" ", strip=True)
                    parts = [p for p in re.split(r"[,;]", dest_text) if p.strip()]
                    if parts:
                        dests = len(parts)
                counts[iata] += dests
    return [k for k, _ in counts.most_common()]


# Airline-name -> IATA cache, built from airlines.json
_NAME_TO_IATA = None


def _airline_name_to_iata(name, valid_airlines):
    global _NAME_TO_IATA
    if _NAME_TO_IATA is None:
        _NAME_TO_IATA = {}
        for a in load_airlines():
            iata = a.get("iata")
            if not iata or iata not in valid_airlines:
                continue
            n = a.get("name", "").strip().lower()
            if n:
                _NAME_TO_IATA[n] = iata
                # also strip "Airlines"/"Airways" suffix
                short = re.sub(r"\b(airlines|airways|air|group)\b", "", n).strip()
                if short and short not in _NAME_TO_IATA:
                    _NAME_TO_IATA[short] = iata
    name_l = name.strip().lower()
    if name_l in _NAME_TO_IATA:
        return _NAME_TO_IATA[name_l]
    # fuzzy: any known name is a substring
    for k, v in _NAME_TO_IATA.items():
        if k and (k in name_l or name_l in k):
            return v
    return None


def airline_destinations(html, valid_airports):
    """Return ordered list of dest IATAs from an airline destinations page."""
    soup = BeautifulSoup(html, "lxml")
    seen = []
    seen_set = set()
    title_to_iata = _wiki_title_to_iata()
    for table in soup.find_all("table"):
        if "wikitable" not in (table.get("class") or []):
            continue
        rows = table.find_all("tr")
        if not rows:
            continue
        for tr in rows[1:]:
            cells = tr.find_all(["td", "th"])
            for cell in cells[:4]:
                iata = None
                for a in cell.find_all("a"):
                    t = (a.get("title") or "").strip()
                    if not t:
                        continue
                    cand = title_to_iata.get(t.lower())
                    if cand and cand in valid_airports:
                        iata = cand
                        break
                    m = re.search(r"\(([A-Z]{3})\)", t)
                    if m and m.group(1) in valid_airports:
                        iata = m.group(1)
                        break
                if not iata:
                    text = cell.get_text(" ", strip=True)
                    m = re.search(r"\b([A-Z]{3})\b", text)
                    if m and m.group(1) in valid_airports:
                        iata = m.group(1)
                if iata and iata not in seen_set:
                    seen.append(iata)
                    seen_set.add(iata)
    return seen


def main():
    valid_airports = airport_iatas()
    valid_airlines = airline_iatas()
    hubs = airline_hubs()
    airports = load_airports()
    airlines = load_airlines()

    out_airports = {}
    out_airlines = {}
    failed = []

    # ---- Airports ----
    for iata, city in airports.items():
        title = AIRPORT_WIKI_OVERRIDE.get(iata)
        if not title:
            title = resolve_wiki_title(f"{city} airport")
        if not title:
            failed.append((iata, "no wiki title"))
            continue
        try:
            html = fetch_wiki_html(title)
        except Exception as e:
            failed.append((iata, f"fetch: {e}"))
            continue
        dest_counts = airport_busiest_routes(html, valid_airports)
        # Don't include self
        dest_counts.pop(iata, None)
        top_dests = topn(dest_counts, 5)
        airline_list = airport_airlines_table(html, valid_airlines)
        top_airlines = airline_list[:5]
        if not top_dests and not top_airlines:
            continue
        entry = {
            "year": 2023,
            "source": "Wikipedia",
        }
        if top_dests:
            entry["topDestinations"] = top_dests
        if top_airlines:
            entry["topAirlines"] = top_airlines
            entry["airlinesUnranked"] = True
        out_airports[iata] = entry
        print(f"  airport {iata}: dests={top_dests} airlines={top_airlines[:5]}", file=sys.stderr)

    # ---- Airlines ----
    for a in airlines:
        iata = a.get("iata")
        name = a.get("name")
        if not iata or not name:
            continue
        hub = hubs.get(iata)
        # Try the airline's main page first; many have a "Destinations" subpage.
        title = resolve_wiki_title(name + " airline")
        if not title:
            title = resolve_wiki_title(name)
        if not title:
            failed.append((iata, "no wiki title"))
            continue
        # Try destinations subpage. Use the airline's proper name (not the
        # opensearch-resolved title which often has "airline" disambiguator).
        candidates_dests = [
            f"List of {name} destinations",
            f"List of {title} destinations",
        ]
        html = None
        for cand in candidates_dests:
            try:
                html = fetch_wiki_html(cand)
                if html and ("destinations" in html.lower()[:5000] or "<table" in html[:5000].lower()):
                    break
            except Exception:
                continue
        if html is None:
            try:
                html = fetch_wiki_html(title)
            except Exception as e:
                failed.append((iata, f"fetch: {e}"))
                continue
        dests = airline_destinations(html, valid_airports)
        # Exclude home hub
        if hub and hub in dests:
            dests = [d for d in dests if d != hub]
        # Keep first 5 (no traffic ranks)
        top = dests[:5]
        if not top:
            continue
        out_airlines[iata] = {
            "topDestinations": top,
            "year": 2023,
            "source": "Wikipedia (unranked)",
        }
        print(f"  airline {iata}: {top}", file=sys.stderr)

    out = {
        "version": "1.0",
        "source": "Wikipedia",
        "year": 2023,
        "airports": out_airports,
        "airlines": out_airlines,
        "_failed": failed,
    }
    write_partial("wiki_partial.json", out)


if __name__ == "__main__":
    main()
