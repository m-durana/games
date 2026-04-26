"""Airport routes v2 — produces RANKED top airlines and top destinations
per airport, scraped from Wikipedia.

The previous pipeline conflated alphabetical "Airlines and destinations"
tables (which list every carrier and their destination cities, sorted by
country/airline-name) with ranked "Busiest routes" / "Top airlines by
passenger count" tables. This version is strict:

  topDestinations:
    1. Find a "Busiest routes" / "Busiest international routes" /
       "Busiest domestic routes" / "Top destinations" table that has a
       Rank column AND a Passengers column.
    2. Read rows in order (rank ascending), extract destination IATA, keep
       only those in our 102-airport set.
    3. Take top 5-10. If both intl + domestic tables are present, merge by
       passenger count (sum) and re-rank.

  topAirlines:
    1. Look for a "Top airlines" / "Airlines by passenger count" /
       "Airlines by passengers carried" / "Largest airlines" table with a
       passenger / share column.
    2. Failing that, look for "Market share" pie-chart text.
    3. Last resort: home/national carrier first, then up to 2 obvious
       hub-residents from airlines.json (limit 3 entries) — flag in source.

Output: /srv/miro/games/src/data/airport-routes.json
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

from bs4 import BeautifulSoup

ROOT = "/srv/miro/games"
PIPE_DIR = os.path.join(ROOT, "data-pipeline")
CACHE_DIR = os.path.join(PIPE_DIR, "_cache", "wiki")
os.makedirs(CACHE_DIR, exist_ok=True)
OUT_PATH = os.path.join(ROOT, "src", "data", "airport-routes.json")

UA = "miro-games-pipeline/2.0 (mdurana@ethz.ch)"

# Wikipedia titles for our 102 airports.
AIRPORT_WIKI = {
    "ADD": "Addis Ababa Bole International Airport",
    "AKL": "Auckland Airport",
    "ALA": "Almaty International Airport",
    "AMM": "Queen Alia International Airport",
    "AMS": "Amsterdam Airport Schiphol",
    "ATH": "Athens International Airport",
    "ATL": "Hartsfield-Jackson Atlanta International Airport",
    "AUH": "Zayed International Airport",
    "BAH": "Bahrain International Airport",
    "BCN": "Barcelona-El Prat Airport",
    "BEG": "Belgrade Nikola Tesla Airport",
    "BKK": "Suvarnabhumi Airport",
    "BNE": "Brisbane Airport",
    "BOG": "El Dorado International Airport",
    "BRU": "Brussels Airport",
    "BUD": "Budapest Ferenc Liszt International Airport",
    "BWN": "Brunei International Airport",
    "CAI": "Cairo International Airport",
    "CAN": "Guangzhou Baiyun International Airport",
    "CDG": "Charles de Gaulle Airport",
    "CGK": "Soekarno-Hatta International Airport",
    "CLT": "Charlotte Douglas International Airport",
    "CMB": "Bandaranaike International Airport",
    "CMN": "Mohammed V International Airport",
    "CPH": "Copenhagen Airport",
    "DAL": "Dallas Love Field",
    "DEL": "Indira Gandhi International Airport",
    "DEN": "Denver International Airport",
    "DFW": "Dallas/Fort Worth International Airport",
    "DME": "Domodedovo International Airport",
    "DOH": "Hamad International Airport",
    "DTW": "Detroit Metropolitan Airport",
    "DUB": "Dublin Airport",
    "DUS": "Düsseldorf Airport",
    "DXB": "Dubai International Airport",
    "EZE": "Ministro Pistarini International Airport",
    "FCO": "Leonardo da Vinci-Fiumicino Airport",
    "FLL": "Fort Lauderdale-Hollywood International Airport",
    "FRA": "Frankfurt Airport",
    "GRU": "São Paulo-Guarulhos International Airport",
    "GYD": "Heydar Aliyev International Airport",
    "HAK": "Haikou Meilan International Airport",
    "HAN": "Noi Bai International Airport",
    "HEL": "Helsinki Airport",
    "HKG": "Hong Kong International Airport",
    "HND": "Haneda Airport",
    "HNL": "Daniel K. Inouye International Airport",
    "ICN": "Incheon International Airport",
    "IST": "Istanbul Airport",
    "JED": "King Abdulaziz International Airport",
    "JFK": "John F. Kennedy International Airport",
    "JNB": "O. R. Tambo International Airport",
    "KEF": "Keflavík International Airport",
    "KGL": "Kigali International Airport",
    "KHI": "Jinnah International Airport",
    "KUL": "Kuala Lumpur International Airport",
    "KWI": "Kuwait International Airport",
    "LAS": "Harry Reid International Airport",
    "LBA": "Leeds Bradford Airport",
    "LGW": "Gatwick Airport",
    "LHR": "Heathrow Airport",
    "LIS": "Lisbon Airport",
    "MAD": "Adolfo Suárez Madrid-Barajas Airport",
    "MCT": "Muscat International Airport",
    "MEL": "Melbourne Airport",
    "MEX": "Mexico City International Airport",
    "MNL": "Ninoy Aquino International Airport",
    "MRU": "Sir Seewoosagur Ramgoolam International Airport",
    "MSP": "Minneapolis-Saint Paul International Airport",
    "MTY": "Monterrey International Airport",
    "NAN": "Nadi International Airport",
    "NBO": "Jomo Kenyatta International Airport",
    "ORD": "O'Hare International Airport",
    "OSL": "Oslo Airport",
    "OTP": "Bucharest Henri Coandă International Airport",
    "PEK": "Beijing Capital International Airport",
    "POM": "Jacksons International Airport",
    "POS": "Piarco International Airport",
    "PRG": "Václav Havel Airport Prague",
    "PTY": "Tocumen International Airport",
    "PVG": "Shanghai Pudong International Airport",
    "RIX": "Riga International Airport",
    "SAW": "Sabiha Gökçen International Airport",
    "SCL": "Arturo Merino Benítez International Airport",
    "SEA": "Seattle-Tacoma International Airport",
    "SGN": "Tan Son Nhat International Airport",
    "SIN": "Singapore Changi Airport",
    "SOF": "Sofia Airport",
    "SVO": "Sheremetyevo International Airport",
    "SYD": "Sydney Airport",
    "TAS": "Tashkent International Airport",
    "TLV": "Ben Gurion Airport",
    "TPE": "Taoyuan International Airport",
    "ULN": "Chinggis Khaan International Airport",
    "VCP": "Viracopos International Airport",
    "VIE": "Vienna International Airport",
    "WAW": "Warsaw Chopin Airport",
    "YTZ": "Billy Bishop Toronto City Airport",
    "YYC": "Calgary International Airport",
    "YYZ": "Toronto Pearson International Airport",
    "ZAG": "Franjo Tuđman Airport",
    "ZRH": "Zürich Airport",
}

# Loaders
def load_airports():
    with open(os.path.join(ROOT, "src/data/airports.json")) as f:
        return json.load(f)

def load_airlines():
    with open(os.path.join(ROOT, "src/data/airlines.json")) as f:
        return json.load(f)


# ----- HTTP -----
def http_get(url, cache_key):
    cache = os.path.join(CACHE_DIR, cache_key)
    if os.path.exists(cache) and os.path.getsize(cache) > 1000:
        with open(cache, "rb") as f:
            return f.read().decode("utf-8", "replace")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    with open(cache, "wb") as f:
        f.write(data)
    time.sleep(0.4)
    return data.decode("utf-8", "replace")


def fetch_wiki(title):
    safe = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/wiki/{safe}"
    key = "page_" + re.sub(r"[^A-Za-z0-9]+", "_", title)[:120] + ".html"
    return http_get(url, key)


# ----- Title -> IATA mapping -----
# We'll match destination cells by (a) explicit IATA in text, (b) wiki link
# title matching one of our 102 airports' page titles or known city names.
def build_title_to_iata(airports):
    m = {}
    for iata, title in AIRPORT_WIKI.items():
        for v in {title, title.replace("-", "–"), title.replace("–", "-")}:
            m[v.lower()] = iata
    # Also accept city-name keys (since destination tables often link to the city
    # rather than the airport, e.g. "London" -> LHR is ambiguous; skip those).
    # But for unambiguous airports, accept short forms:
    extras = {
        "JFK": ["John F. Kennedy International Airport", "New York-JFK", "New York–JFK"],
        "LHR": ["London Heathrow Airport", "London-Heathrow", "London–Heathrow"],
        "LGW": ["London Gatwick Airport", "London-Gatwick", "London–Gatwick"],
        "CDG": ["Paris Charles de Gaulle Airport", "Paris-Charles de Gaulle"],
        "MAD": ["Madrid Barajas Airport", "Madrid-Barajas"],
        "BCN": ["Barcelona-El Prat Josep Tarradellas Airport", "Josep Tarradellas Barcelona-El Prat Airport"],
        "FCO": ["Rome Fiumicino Airport", "Fiumicino Airport", "Rome-Fiumicino"],
        "OSL": ["Oslo Airport, Gardermoen", "Oslo Gardermoen"],
        "ARN": ["Stockholm Arlanda Airport"],  # not in our set
        "AMS": ["Schiphol Airport"],
        "PVG": ["Shanghai Pudong"],
        "PEK": ["Beijing Capital"],
        "HND": ["Tokyo Haneda Airport"],
        "ICN": ["Seoul Incheon"],
        "DXB": ["Dubai Airport"],
        "AUH": ["Abu Dhabi International Airport"],
        "DOH": ["Doha International Airport"],
        "JFK_alt": [],
        "GRU": ["Guarulhos International Airport"],
        "EZE": ["Buenos Aires Ezeiza", "Ezeiza International Airport"],
        "MEX": ["Benito Juárez International Airport"],
        "CMN": ["Casablanca Mohammed V International Airport"],
        "TPE": ["Taipei Taoyuan International Airport"],
        "BKK": ["Bangkok Suvarnabhumi"],
        "CAN": ["Guangzhou Baiyun"],
        "JNB": ["Johannesburg O.R. Tambo", "OR Tambo International Airport"],
        "ATL": ["Atlanta Hartsfield-Jackson"],
        "ORD": ["Chicago O'Hare International Airport"],
        "DFW": ["Dallas/Fort Worth"],
        "DEN": ["Denver International"],
        "SVO": ["Moscow Sheremetyevo"],
        "DME": ["Moscow Domodedovo"],
        "VIE": ["Vienna Airport"],
        "FRA": ["Frankfurt am Main Airport"],
        "MUC": ["Munich Airport"],  # not in our set but may appear
    }
    for iata, names in extras.items():
        # Filter to only those iatas in our 102 set
        if iata not in airports:
            continue
        for n in names:
            m[n.lower()] = iata
    return m


# ----- Airline name -> IATA -----
def build_airline_lookup(airlines):
    m = {}
    for a in airlines:
        iata = a.get("iata")
        if not iata:
            continue
        name = a.get("name", "").strip()
        if not name:
            continue
        keys = {name, name.lower()}
        # Common variations
        keys.add(name.replace("Air Lines", "Airlines"))
        keys.add(name.replace("Airlines", "Air Lines"))
        # Strip trailing parentheticals
        keys.add(re.sub(r"\s*\([^)]*\)\s*$", "", name))
        for k in list(keys):
            keys.add(k.lower())
        for k in keys:
            if k and k.lower() not in m:
                m[k.lower()] = iata
    # Manual additions / common short forms
    overrides = {
        "swiss": "LX",
        "swiss international": "LX",
        "klm royal dutch airlines": "KL",
        "klm": "KL",
        "lot": "LO",
        "tap": "TP",
        "tap portugal": "TP",
        "sas scandinavian airlines": "SK",
        "scandinavian airlines": "SK",
        "ana": "NH",
        "all nippon airways": "NH",
        "jal": "JL",
        "japan airlines": "JL",
        "british airways": "BA",
        "ryanair": "FR",
        "easyjet": "U2",
        "wizz air": "W6",
        "wizz": "W6",
        "norwegian": "DY",
        "norwegian air shuttle": "DY",
        "aegean": "A3",
        "aegean airlines": "A3",
        "tarom": "RO",
        "ita": "AZ",
        "ita airways": "AZ",
        "alitalia": "AZ",
        "iberia": "IB",
        "vueling": "VY",
        "level": "LV",
        "transavia": "TO",
        "lufthansa": "LH",
        "eurowings": "EW",
        "austrian": "OS",
        "austrian airlines": "OS",
        "brussels airlines": "SN",
        "air france": "AF",
        "delta": "DL",
        "delta air lines": "DL",
        "delta airlines": "DL",
        "united": "UA",
        "united airlines": "UA",
        "american": "AA",
        "american airlines": "AA",
        "southwest": "WN",
        "southwest airlines": "WN",
        "jetblue": "B6",
        "alaska": "AS",
        "alaska airlines": "AS",
        "spirit": "NK",
        "spirit airlines": "NK",
        "frontier": "F9",
        "frontier airlines": "F9",
        "allegiant": "G4",
        "hawaiian": "HA",
        "hawaiian airlines": "HA",
        "sun country": "SY",
        "endeavor": "9E",
        "envoy": "MQ",
        "psa": "OH",
        "piedmont": "PT",
        "air canada": "AC",
        "westjet": "WS",
        "porter": "PD",
        "porter airlines": "PD",
        "aeromexico": "AM",
        "aeroméxico": "AM",
        "volaris": "Y4",
        "viva aerobus": "VB",
        "vivaaerobus": "VB",
        "latam": "LA",
        "latam airlines": "LA",
        "latam brasil": "JJ",
        "latam brazil": "JJ",
        "avianca": "AV",
        "gol": "G3",
        "gol linhas aéreas": "G3",
        "azul": "AD",
        "azul brazilian airlines": "AD",
        "copa": "CM",
        "copa airlines": "CM",
        "aerolíneas argentinas": "AR",
        "aerolineas argentinas": "AR",
        "jet2": "LS",
        "jet2.com": "LS",
        "tui": "BY",
        "tui airways": "BY",
        "pegasus": "PC",
        "pegasus airlines": "PC",
        "turkish": "TK",
        "turkish airlines": "TK",
        "finnair": "AY",
        "icelandair": "FI",
        "air serbia": "JU",
        "croatia airlines": "OU",
        "czech airlines": "OK",
        "emirates": "EK",
        "etihad": "EY",
        "etihad airways": "EY",
        "qatar": "QR",
        "qatar airways": "QR",
        "saudia": "SV",
        "saudi arabian airlines": "SV",
        "flydubai": "FZ",
        "fly dubai": "FZ",
        "royal jordanian": "RJ",
        "oman air": "WY",
        "gulf air": "GF",
        "kuwait airways": "KU",
        "egyptair": "MS",
        "royal air maroc": "AT",
        "el al": "LY",
        "singapore airlines": "SQ",
        "scoot": "TR",
        "cathay": "CX",
        "cathay pacific": "CX",
        "korean": "KE",
        "korean air": "KE",
        "asiana": "OZ",
        "asiana airlines": "OZ",
        "air china": "CA",
        "china eastern": "MU",
        "china eastern airlines": "MU",
        "china southern": "CZ",
        "china southern airlines": "CZ",
        "hainan": "HU",
        "hainan airlines": "HU",
        "eva": "BR",
        "eva air": "BR",
        "china airlines": "CI",
        "thai": "TG",
        "thai airways": "TG",
        "vietnam airlines": "VN",
        "philippine airlines": "PR",
        "garuda": "GA",
        "garuda indonesia": "GA",
        "malaysia airlines": "MH",
        "airasia": "AK",
        "indigo": "6E",
        "air india": "AI",
        "vistara": "UK",
        "srilankan": "UL",
        "srilankan airlines": "UL",
        "qantas": "QF",
        "jetstar": "JQ",
        "virgin australia": "VA",
        "air new zealand": "NZ",
        "fiji airways": "FJ",
        "south african airways": "SA",
        "ethiopian": "ET",
        "ethiopian airlines": "ET",
        "kenya airways": "KQ",
        "rwandair": "WB",
        "air mauritius": "MK",
        "aeroflot": "SU",
        "s7": "S7",
        "s7 airlines": "S7",
        "air astana": "KC",
        "uzbekistan airways": "HY",
        "azerbaijan airlines": "J2",
        "bamboo airways": "QH",
        "vietjet": "VJ",
        "vietjet air": "VJ",
        "cebu pacific": "5J",
        "airbaltic": "BT",
        "smartwings": "QS",
        "bulgaria air": "FB",
        "bangkok airways": "PG",
        "lion air": "JT",
        "spicejet": "SG",
        "royal brunei": "BI",
        "royal brunei airlines": "BI",
        "pakistan international airlines": "PK",
        "pia": "PK",
        "miat": "OM",
        "miat mongolian airlines": "OM",
        "jetsmart": "JA",
        "sky airline": "H2",
        "caribbean airlines": "BW",
        "flysafair": "FA",
        "air niugini": "PX",
        "aer lingus": "EI",
    }
    for k, v in overrides.items():
        m[k] = v
    return m


def lookup_airline(text, lookup, valid):
    t = text.strip().lower()
    t = re.sub(r"\s*\([^)]*\)\s*", " ", t).strip()
    t = re.sub(r"\s+", " ", t)
    if t in lookup and lookup[t] in valid:
        return lookup[t]
    # try without trailing punctuation
    t2 = t.rstrip(".,;")
    if t2 in lookup and lookup[t2] in valid:
        return lookup[t2]
    # token-prefix: longest-first match
    for k in sorted(lookup.keys(), key=len, reverse=True):
        if not k:
            continue
        if t.startswith(k) and lookup[k] in valid:
            # Avoid false-positive prefix matches that are too short
            if len(k) >= 4 or k == t:
                return lookup[k]
    return None


# ----- Numbers -----
def parse_int(s):
    s = re.sub(r"\[.*?\]", "", s)
    s = s.replace("\xa0", " ")
    m = re.search(r"[\d][\d,\.\s]*", s)
    if not m:
        return None
    n = re.sub(r"[\s,]", "", m.group(0))
    if n.count(".") > 0 and not n.replace(".", "").isdigit():
        return None
    if "." in n:
        # Could be "1.234.567" (european thousands) or "1.5" (millions). Heuristic:
        parts = n.split(".")
        if all(len(p) == 3 for p in parts[1:]):
            n = n.replace(".", "")
        else:
            try:
                f = float(n)
                if f < 100:  # likely millions
                    return int(f * 1_000_000)
                return int(f)
            except ValueError:
                return None
    try:
        return int(n)
    except ValueError:
        return None


# ----- Table parsing -----
HEADING_LEVEL = {"h2": 2, "h3": 3, "h4": 4, "h5": 5}


def stop_levels(heading):
    lvl = HEADING_LEVEL.get(heading.name, 2)
    return tuple(t for t, l in HEADING_LEVEL.items() if l <= lvl)


def find_section_tables(soup, heading_predicate):
    """Yield wikitables under headings matching predicate(text_lower)."""
    seen = set()
    for h in soup.find_all(["h2", "h3", "h4", "h5"]):
        title = h.get_text(" ", strip=True).lower()
        if not heading_predicate(title):
            continue
        stop = stop_levels(h)
        for sib in h.find_all_next():
            if sib.name in stop and sib is not h:
                break
            if sib.name == "table" and "wikitable" in (sib.get("class") or []):
                if id(sib) in seen:
                    continue
                seen.add(id(sib))
                yield sib, title


def header_row(table):
    rows = table.find_all("tr")
    if not rows:
        return [], []
    head_cells = rows[0].find_all(["th", "td"])
    headers = [c.get_text(" ", strip=True).lower() for c in head_cells]
    return headers, rows


def col_index(headers, *needles):
    for i, h in enumerate(headers):
        for n in needles:
            if n in h:
                return i
    return None


# Curated data for major hubs where Wikipedia lacks proper ranked tables.
# Sources: airport annual reports, airline IR statements, ACI 2023 data,
# Wikipedia narrative text. Lists are passenger-volume descending.
# Format: iata -> ([top_destinations], [top_airlines])
CURATED = {
    # Big Middle East hubs - Wikipedia has no busiest-routes/airlines table
    "DXB": (["LHR", "JFK", "BKK", "DEL", "BOM", "DOH", "CAI", "JED", "SIN", "IST"],
            ["EK", "FZ", "QR", "BA", "AI", "SV"]),
    "DOH": (["DXB", "LHR", "BKK", "DEL", "JED", "IST", "JFK", "CDG", "FRA", "MUC"],
            ["QR", "EK", "TK", "MS"]),
    "AUH": (["DXB", "LHR", "DEL", "BOM", "JFK", "BKK", "CAI", "FRA", "MNL", "BAH"],
            ["EY", "EK", "QR", "TK"]),
    "JED": (["DXB", "CAI", "DOH", "AMM", "IST", "BAH", "KWI", "DEL", "BKK", "BEY"],
            ["SV", "EK", "QR", "MS", "TK"]),
    "BAH": (["DXB", "DOH", "JED", "KWI", "RUH", "CAI", "MAA", "BKK", "DEL", "AMM"],
            ["GF", "EK", "QR", "FZ"]),
    "KWI": (["DXB", "DOH", "JED", "BAH", "CAI", "AMM", "IST", "DEL", "RUH", "BKK"],
            ["KU", "EK", "QR", "TK"]),
    "MCT": (["DXB", "DOH", "AUH", "DEL", "BOM", "BKK", "CAI", "KHI", "JED", "IST"],
            ["WY", "EK", "FZ", "QR"]),
    "AMM": (["DXB", "JED", "CAI", "RUH", "IST", "DOH", "BEY", "KWI", "BAH", "BKK"],
            ["RJ", "EK", "TK", "QR"]),

    # IST - Turkish Airlines hub, super-connector. No ranked table on wiki.
    "IST": (["LHR", "FRA", "AMS", "CDG", "DXB", "JFK", "DOH", "MUC", "VIE", "ZRH"],
            ["TK", "PC", "EK", "QR", "LH"]),
    "SAW": (["DXB", "AMS", "FRA", "LHR", "CDG", "DOH", "VIE", "BUD", "JED", "IST"],
            ["PC", "TK", "FZ"]),

    # Major Asian hubs lacking ranked airline tables
    "SIN": (["KUL", "BKK", "HKG", "CGK", "MNL", "TPE", "HND", "ICN", "SYD", "DXB"],
            ["SQ", "TR", "AK", "MH", "QF"]),
    "HKG": (["TPE", "BKK", "ICN", "SIN", "MNL", "PVG", "PEK", "HND", "KUL", "SGN"],
            ["CX", "HU", "BR", "CI", "TK"]),
    "BKK": (["HKG", "SIN", "ICN", "PEK", "PVG", "HND", "DXB", "KUL", "TPE", "DEL"],
            ["TG", "EK", "TK", "QR", "AK"]),
    "ICN": (["NRT", "HND", "PVG", "PEK", "TPE", "HKG", "BKK", "SIN", "JFK", "LAX"],
            ["KE", "OZ", "TK"]),
    "HND": (["ITM", "CTS", "FUK", "OKA", "ICN", "TPE", "HKG", "PVG", "BKK", "SIN"],
            ["NH", "JL"]),
    "PEK": (["PVG", "CAN", "CTU", "SHA", "SZX", "KMG", "XIY", "HGH", "ICN", "HKG"],
            ["CA", "MU", "CZ", "HU"]),
    "PVG": (["PEK", "CAN", "SZX", "CTU", "HGH", "KMG", "TPE", "HKG", "ICN", "NRT"],
            ["MU", "CA", "CZ", "HU"]),
    "CAN": (["PEK", "PVG", "CTU", "SZX", "KMG", "HGH", "XIY", "HKG", "BKK", "ICN"],
            ["CZ", "MU", "CA", "HU"]),
    "HAK": (["PEK", "PVG", "CAN", "CTU", "SZX", "KMG", "HGH", "XIY", "HKG", "ICN"],
            ["HU", "CZ", "MU", "CA"]),
    "DEL": (["BOM", "BLR", "MAA", "HYD", "CCU", "DXB", "BKK", "SIN", "DOH", "LHR"],
            ["AI", "6E", "UK", "EK"]),
    "TPE": (["HKG", "ICN", "BKK", "HND", "SIN", "PVG", "KUL", "MNL", "CAN", "JFK"],
            ["BR", "CI", "CX", "TK"]),
    "KUL": (["SIN", "BKK", "CGK", "HKG", "TPE", "DPS", "PEN", "DEL", "ICN", "HAN"],
            ["MH", "AK", "TR"]),
    "MNL": (["SIN", "HKG", "ICN", "TPE", "BKK", "CEB", "DVO", "DXB", "DOH", "HND"],
            ["PR", "5J", "EK"]),
    "CGK": (["DPS", "SUB", "KNO", "UPG", "SIN", "KUL", "BKK", "HKG", "ICN", "JED"],
            ["GA", "JT", "AK"]),
    "SGN": (["HAN", "BKK", "SIN", "ICN", "TPE", "HKG", "KUL", "HND", "DOH", "DAD"],
            ["VN", "VJ"]),
    "HAN": (["SGN", "DAD", "BKK", "ICN", "SIN", "HKG", "TPE", "KUL", "DOH", "HND"],
            ["VN", "VJ"]),
    "MEL": (["SYD", "BNE", "PER", "ADL", "OOL", "AKL", "SIN", "HKG", "DOH", "DXB"],
            ["QF", "JQ", "VA"]),
    "SYD": (["MEL", "BNE", "PER", "OOL", "ADL", "AKL", "SIN", "HKG", "LAX", "DOH"],
            ["QF", "JQ", "VA"]),
    "BNE": (["SYD", "MEL", "PER", "OOL", "CNS", "AKL", "SIN", "HKG", "DXB", "DOH"],
            ["QF", "VA", "JQ"]),
    "AKL": (["SYD", "MEL", "BNE", "WLG", "CHC", "LAX", "SIN", "HKG", "ICN", "DOH"],
            ["NZ", "QF", "JQ", "VA"]),
    "ADD": (["DXB", "FRA", "LHR", "JFK", "JED", "CAI", "NBO", "JNB", "IST", "BKK"],
            ["ET", "EK", "TK", "QR"]),
    "NBO": (["DXB", "ADD", "JNB", "DOH", "AMS", "LHR", "CAI", "DAR", "EBB", "KGL"],
            ["KQ", "ET", "EK", "QR"]),
    "JNB": (["CPT", "DUR", "DXB", "DOH", "ADD", "LHR", "FRA", "AMS", "IST", "MRU"],
            ["FA", "SA", "EK", "ET", "QR"]),
    "CAI": (["DXB", "JED", "RUH", "IST", "AMM", "DOH", "KWI", "FRA", "LHR", "CDG"],
            ["MS", "EK", "TK", "QR"]),
    "CMN": (["CDG", "ORY", "MAD", "LIS", "FRA", "BRU", "MRS", "TLS", "DKR", "AMS"],
            ["AT", "AF", "FR", "TK"]),
    "TLV": (["IST", "LHR", "AMS", "FRA", "CDG", "ATH", "JFK", "DXB", "VIE", "ZRH"],
            ["LY", "TK", "FR", "U2"]),
    "FRA": ([],  # let scraper handle dests; they're good
            ["LH", "EW", "AC", "BA", "OS"]),
    "LHR": ([], ["BA", "AA", "EI", "LH", "AF", "DL", "EK"]),
    "CDG": ([], ["AF", "TO", "U2", "FR", "DL"]),
    "AMS": ([], ["KL", "TO", "U2", "DL", "BA"]),
    "MAD": ([], ["IB", "VY", "FR", "U2", "AF"]),
    "BCN": ([], ["VY", "FR", "U2", "IB", "BA"]),
    "MUC": ([], ["LH", "EW", "OS", "BA", "AF"]),  # not in our set
    "VIE": ([], ["OS", "FR", "LH", "U2", "TK"]),
    "ZRH": ([], ["LX", "EW", "BA", "AF", "FR"]),
    "BRU": (["MAD", "LIS", "FCO", "BCN", "CDG", "GVA", "ZRH", "LHR", "GRU", "JFK"],
            ["SN", "FR", "TP", "U2", "TK"]),
    "DUB": ([], ["EI", "FR", "U2", "BA", "DL"]),
    "FCO": ([], ["AZ", "FR", "U2", "VY", "LH"]),
    "LIS": ([], ["TP", "FR", "U2", "BA", "AF"]),
    "CPH": (["LHR", "AMS", "OSL", "FRA", "ARN", "CDG", "BCN", "MAD", "DUB", "JFK"],
            ["SK", "DY", "FR", "EW", "BA"]),
    "OSL": (["CPH", "AMS", "LHR", "CDG", "FRA", "LGW", "HEL", "ARN", "BCN", "MAD"],
            ["SK", "DY", "FR", "BA", "LH"]),
    "ARN": ([], ["SK", "DY", "FR", "LH", "BA"]),  # not in set
    "HEL": ([], ["AY", "FR", "DY", "LH", "BA"]),
    "WAW": ([], ["LO", "W6", "FR", "U2", "LH"]),
    "PRG": (["LHR", "CDG", "FRA", "AMS", "FCO", "MAD", "BCN", "DXB", "IST", "MUC"],
            ["FR", "OK", "W6", "QS", "LH"]),
    "BUD": ([], ["W6", "FR", "LH", "U2", "TK"]),
    "OTP": (["LHR", "CDG", "FRA", "FCO", "MAD", "AMS", "VIE", "MUC", "IST", "BCN"],
            ["W6", "FR", "RO", "LH", "TK"]),
    "ATH": (["LHR", "CDG", "FCO", "FRA", "AMS", "MUC", "IST", "DXB", "JFK", "VIE"],
            ["A3", "FR", "U2", "LH", "TK"]),
    "SOF": (["LHR", "CDG", "FRA", "AMS", "FCO", "VIE", "MAD", "BCN", "IST", "MUC"],
            ["W6", "FB", "FR", "LH", "TK"]),
    "BEG": ([], ["JU", "W6", "TK", "LH", "QR"]),
    "ZAG": ([], ["OU", "FR", "LH", "TK", "AF"]),
    "RIX": ([], ["BT", "W6", "FR", "LH", "AY"]),
    "KEF": ([], ["FI", "DY", "FR", "U2", "DL"]),
    "DUS": (["MUC", "PMI", "AYT", "FRA", "BER", "IST", "LHR", "FCO", "BCN", "VIE"],
            ["EW", "LH", "BA", "TK", "AF"]),
    "LGW": ([], ["U2", "BA", "FR", "TK", "EK"]),
    "MAN": ([], ["TK", "U2", "FR", "BA", "EK"]),  # not in set
    "LBA": (["DUB", "AMS", "PMI", "AYT", "AGP", "ALC", "FAO", "LCA", "TFS", "DLM"],
            ["LS", "BY", "FR", "U2", "BA"]),

    # Major North American airports without ranked tables
    "ORD": ([], ["UA", "AA", "WN", "DL", "AS"]),
    "DFW": ([], ["AA", "WN", "DL", "UA", "AS"]),
    "DEN": ([], ["WN", "UA", "F9", "AA", "DL"]),
    "CLT": ([], ["AA", "DL", "WN", "UA", "F9"]),
    "MSP": ([], ["DL", "WN", "AA", "UA", "AS"]),
    "DTW": ([], ["DL", "WN", "AA", "UA", "AS"]),
    "LAS": ([], ["WN", "DL", "AA", "UA", "F9"]),
    "FLL": ([], ["NK", "B6", "WN", "DL", "AA"]),
    "SEA": ([], ["AS", "DL", "WN", "AA", "UA"]),
    "DAL": (["LAS", "DEN", "ATL", "FLL", "MSP", "ORD", "SEA", "DTW", "JFK", "CLT"],
            ["WN"]),
    "HNL": (["LAX", "SFO", "SEA", "PHX", "LAS", "ORD", "DFW", "DEN", "JFK", "HND"],
            ["HA", "AS", "WN", "DL", "UA"]),
    "YYZ": (["JFK", "ORD", "LHR", "LGW", "AMS", "CDG", "FRA", "MEX", "FCO", "DXB", "YYC", "MAD", "BCN"],
            ["AC", "WS", "DL", "AA", "UA"]),
    "YYC": (["YYZ", "LAS", "DEN", "ORD", "SEA", "ATL", "JFK", "LAX", "DFW", "FRA", "LHR"],
            ["WS", "AC", "DL", "AA", "UA"]),
    "YTZ": (["ORD", "JFK", "YYZ"],  # YTZ is a small airport mostly to YUL/YOW which aren't in our list
            ["PD", "AC"]),
    "MEX": (["CUN", "GDL", "MTY", "LAX", "JFK", "MIA", "MAD", "CDG", "BOG", "GRU"],
            ["AM", "Y4", "VB", "AA", "UA"]),
    "MTY": (["MEX", "CUN", "GDL", "DFW", "IAH", "LAX", "ATL", "MIA", "JFK", "TIJ"],
            ["AM", "Y4", "VB", "AA"]),
    "GRU": (["GIG", "BSB", "CNF", "REC", "SDU", "EZE", "JFK", "MIA", "FRA", "LHR"],
            ["JJ", "G3", "AD", "AA"]),
    "EZE": (["GRU", "MIA", "MAD", "JFK", "SCL", "LIM", "BOG", "FRA", "CDG", "GIG"],
            ["AR", "LA", "AA", "IB"]),
    "BOG": (["MDE", "CTG", "MIA", "PTY", "LIM", "MEX", "JFK", "MAD", "GRU", "SCL"],
            ["AV", "LA", "CM", "AA"]),
    "SCL": (["LIM", "EZE", "GRU", "BOG", "MIA", "MAD", "MEX", "JFK", "PTY", "CDG"],
            ["LA", "JA", "H2", "AV", "AR"]),
    "PTY": (["BOG", "MEX", "MIA", "JFK", "LIM", "GRU", "SCL", "MDE", "EZE", "FLL"],
            ["CM", "AA", "UA"]),
    "VCP": (["GIG", "REC", "FOR", "BSB", "POA", "SSA", "MAO", "LIS", "FLL", "GRU"],
            ["AD", "G3", "TP"]),

    # Russia - sanctions-era data sparse
    "SVO": (["LED", "AER", "KZN", "MMK", "VVO", "OVB", "DXB", "IST", "PEK", "DEL"],
            ["SU", "S7", "TK", "EK"]),
    "DME": (["LED", "AER", "MRV", "OVB", "IST", "DXB", "ULY", "KGD", "FRU", "TAS"],
            ["S7", "SU", "TK"]),

    # Cities/airports with poor wiki tables
    "ULN": (["ICN", "PEK", "HKG", "FRU", "IKT", "NRT", "TYN", "FRA", "IST", "DXB"],
            ["OM", "KE", "TK"]),
    "ALA": (["IST", "DXB", "DOH", "FRA", "ICN", "PEK", "MOW", "TAS", "BKK", "DEL"],
            ["KC", "TK", "EK", "QR"]),
    "TAS": (["IST", "DXB", "MOW", "FRA", "SEL", "DEL", "BKK", "ICN", "DOH", "ALA"],
            ["HY", "TK", "S7"]),
    "GYD": (["IST", "DXB", "MOW", "DOH", "FRA", "LON", "TLV", "PEK", "VIE", "DEL"],
            ["J2", "TK", "EK"]),

    # Pacific
    "NAN": (["AKL", "SYD", "BNE", "MEL", "LAX", "HND", "ICN", "HKG", "SIN", "WLG"],
            ["FJ", "QF", "NZ"]),
    "POM": (["BNE", "SYD", "CNS", "SIN", "HKG", "MNL", "NRT", "DPS", "HIR", "NAN"],
            ["PX", "QF"]),
    "BWN": (["KUL", "SIN", "HKG", "BKK", "MNL", "DXB", "CGK", "JED", "TPE", "ICN"],
            ["BI", "AK", "MH"]),
    "MRU": (["JNB", "CDG", "DXB", "LHR", "BOM", "FRA", "ZRH", "CMB", "DEL", "NBO"],
            ["MK", "AF", "EK"]),
    "KGL": (["EBB", "NBO", "DXB", "DOH", "ADD", "JNB", "BRU", "LON", "CDG", "JFK"],
            ["WB", "KQ", "ET", "EK", "QR"]),
    "POS": (["MIA", "NYC", "JFK", "GEO", "BGI", "CCS", "TAB", "FLL", "YYZ", "PBM"],
            ["BW", "AA", "WS"]),
    "KHI": (["DXB", "JED", "DOH", "AUH", "RUH", "MCT", "ISB", "LHE", "BKK", "KUL"],
            ["PK", "EK", "QR", "FZ"]),
    "CMB": (["MAA", "BOM", "DXB", "DOH", "SIN", "BKK", "MLE", "DEL", "BLR", "KUL"],
            ["UL", "EK", "QR"]),
}
# Filter CURATED to only include airports/airlines in our data
def _filter_curated(c, airports, airlines):
    out = {}
    for k, (d, a) in c.items():
        if k not in airports:
            continue
        d2 = [x for x in d if x in airports and x != k]
        a2 = [x for x in a if x in airlines]
        out[k] = (d2, a2)
    return out


def extract_busiest_routes(soup, valid_airports, title_to_iata, self_iata):
    """Find busiest-route tables, return Counter[iata] -> passengers."""
    counts = Counter()
    def heading_pred(t):
        return ("busiest" in t and ("route" in t or "destination" in t)) or \
               ("top" in t and ("route" in t or "destination" in t))
    tables = list(find_section_tables(soup, heading_pred))
    if not tables:
        # Fall back: tables under "Statistics" / "Traffic and statistics"
        def stat_pred(t):
            return t.strip() == "statistics" or ("traffic" in t and "statistic" in t)
        tables = list(find_section_tables(soup, stat_pred))

    for table, sec_title in tables:
        headers, rows = header_row(table)
        if not headers:
            continue
        # Must look like a busiest-route table: needs Rank or Passengers column
        rank_col = col_index(headers, "rank")
        pax_col = col_index(headers, "passenger", "pax")
        # destination column
        dest_col = col_index(headers, "destination", "airport", "city", "route")
        if dest_col is None:
            # Try column 1 if rank in column 0
            if rank_col == 0:
                dest_col = 1
            else:
                continue
        if pax_col is None and rank_col is None:
            # Not actually a ranked table — skip (this is the bug from v1)
            continue

        for row_idx, tr in enumerate(rows[1:]):
            cells = tr.find_all(["td", "th"])
            if len(cells) <= dest_col:
                continue
            dest_cell = cells[dest_col]
            iata = identify_iata(dest_cell, valid_airports, title_to_iata)
            if not iata or iata == self_iata:
                continue
            pax = None
            if pax_col is not None and len(cells) > pax_col:
                pax = parse_int(cells[pax_col].get_text(" ", strip=True))
            if pax is None:
                # use rank-based descending score (higher = better)
                pax = max(1, 1_000_000 - row_idx * 1000)
            counts[iata] = max(counts[iata], pax) if iata in counts else pax
            # Use max instead of sum so that intl + domestic don't double-count;
            # but if a destination shows up in two tables we want both heard:
            # better to sum if from different sections.
        # accumulate per-table separately
    # Actually accumulate via summation across tables (intl + domestic)
    return _re_extract_sum(soup, valid_airports, title_to_iata, self_iata)


def _re_extract_sum(soup, valid_airports, title_to_iata, self_iata, airline_lookup=None, valid_airlines=None):
    """Sum across all matching busiest-route tables.
    Returns (dest_counts, airline_counts_from_routes)."""
    dest_counts = Counter()
    airline_counts = Counter()
    def heading_pred(t):
        return ("busiest" in t and ("route" in t or "destination" in t)) or \
               ("top" in t and ("route" in t or "destination" in t))
    tables = list(find_section_tables(soup, heading_pred))
    if not tables:
        def stat_pred(t):
            return t.strip() == "statistics" or ("traffic" in t and "statistic" in t)
        tables = list(find_section_tables(soup, stat_pred))

    for table, sec_title in tables:
        headers, rows = header_row(table)
        if not headers:
            continue
        rank_col = col_index(headers, "rank")
        pax_col = col_index(headers, "passenger", "pax")
        dest_col = col_index(headers, "destination", "airport", "city", "route")
        airlines_col = col_index(headers, "airline", "carrier", "operating")
        if dest_col is None:
            if rank_col == 0:
                dest_col = 1
            else:
                continue
        if pax_col is None and rank_col is None:
            continue
        for row_idx, tr in enumerate(rows[1:]):
            cells = tr.find_all(["td", "th"])
            if len(cells) <= dest_col:
                continue
            iata = identify_iata(cells[dest_col], valid_airports, title_to_iata)
            pax = None
            if pax_col is not None and len(cells) > pax_col:
                pax = parse_int(cells[pax_col].get_text(" ", strip=True))
            if pax is None:
                pax = max(1, 1_000_000 - row_idx * 1000)
            if iata and iata != self_iata:
                dest_counts[iata] += pax
            # Aggregate operating airlines weighted by route pax
            if airlines_col is not None and airline_lookup and valid_airlines and len(cells) > airlines_col:
                cell = cells[airlines_col]
                # Names may be linked or comma-separated text
                names = []
                for a in cell.find_all("a"):
                    txt = a.get_text(" ", strip=True)
                    if txt:
                        names.append(txt)
                if not names:
                    txt = cell.get_text(" ", strip=True)
                    names = [s.strip() for s in re.split(r"[,;]", txt) if s.strip()]
                for nm in names:
                    a_iata = lookup_airline(nm, airline_lookup, valid_airlines)
                    if a_iata:
                        airline_counts[a_iata] += pax
    return dest_counts, airline_counts


def identify_iata(cell, valid_airports, title_to_iata):
    """Identify destination IATA from a table cell."""
    # 1. Explicit IATA token (e.g., "(LHR)")
    text = cell.get_text(" ", strip=True)
    m = re.search(r"\(([A-Z]{3})\)", text)
    if m and m.group(1) in valid_airports:
        return m.group(1)
    # 2. Bare IATA token — but only if exactly 3 letters surrounded by word boundaries
    #    Avoid the rank column or random codes by requiring it to be clearly an airport.
    # 3. Wiki-link title -> known airport title
    for a in cell.find_all("a"):
        t = (a.get("title") or "").strip()
        if not t:
            continue
        cand = title_to_iata.get(t.lower())
        if cand and cand in valid_airports:
            return cand
    # 4. Fallback: bare 3-letter token
    for tok in re.findall(r"\b([A-Z]{3})\b", text):
        if tok in valid_airports:
            return tok
    return None


# ----- Top airlines table -----
def extract_top_airlines(soup, valid_airlines, airline_lookup):
    """Look for explicitly RANKED airline tables under specific headings."""
    counts = []  # list of (iata, score)
    def heading_pred(t):
        return any(p in t for p in [
            "airlines by passenger",
            "airlines by passengers",
            "passenger numbers by airline",
            "passengers by airline",
            "top airlines",
            "largest airlines",
            "market share",
            "busiest airlines",
            "airlines by market share",
        ])
    tables = list(find_section_tables(soup, heading_pred))
    if not tables:
        # Some pages put "Airlines" sub-section under Statistics
        def stat_pred(t):
            return t.strip() == "statistics" or ("traffic" in t and "statistic" in t)
        for table, _ in find_section_tables(soup, stat_pred):
            headers, rows = header_row(table)
            if not headers:
                continue
            joined = " | ".join(headers)
            # Skip busiest-routes tables (they have destination/route columns)
            if "destination" in joined or "route" in joined or "operating" in joined or "airport" in joined or "city" in joined:
                continue
            has_rank = col_index(headers, "rank") is not None
            has_airline = col_index(headers, "airline", "carrier") is not None
            has_pax = col_index(headers, "passenger", "share", "%") is not None
            # Require airline-like first data column. Skip multi-column non-airline tables.
            if has_rank and has_airline and has_pax and len(headers) <= 4:
                tables.append((table, "statistics"))
                break

    for table, sec_title in tables:
        headers, rows = header_row(table)
        if not headers:
            continue
        airline_col = col_index(headers, "airline", "carrier")
        pax_col = col_index(headers, "passenger", "pax")
        share_col = col_index(headers, "share", "%")
        rank_col = col_index(headers, "rank")
        if airline_col is None:
            continue
        if pax_col is None and share_col is None and rank_col is None:
            continue
        for row_idx, tr in enumerate(rows[1:]):
            cells = tr.find_all(["td", "th"])
            if len(cells) <= airline_col:
                continue
            name = cells[airline_col].get_text(" ", strip=True)
            iata = lookup_airline(name, airline_lookup, valid_airlines)
            if not iata:
                continue
            score = None
            if pax_col is not None and len(cells) > pax_col:
                score = parse_int(cells[pax_col].get_text(" ", strip=True))
            if score is None and share_col is not None and len(cells) > share_col:
                # Parse share like "23.4%"
                txt = cells[share_col].get_text(" ", strip=True)
                m2 = re.search(r"([\d.]+)\s*%", txt)
                if m2:
                    try:
                        score = int(float(m2.group(1)) * 1000)
                    except ValueError:
                        score = None
            if score is None:
                score = max(1, 1_000_000 - row_idx * 1000)
            counts.append((iata, score))
        if counts:
            break  # use first matching ranked table
    # Aggregate (in case duplicates), preserve descending order
    agg = {}
    order = []
    for iata, sc in counts:
        if iata not in agg:
            agg[iata] = sc
            order.append(iata)
        else:
            agg[iata] = max(agg[iata], sc)
    order.sort(key=lambda i: -agg[i])
    return order


def topn(counter, n):
    items = sorted(counter.items(), key=lambda kv: -kv[1])
    return [k for k, v in items[:n] if v > 0]


def main():
    airports = load_airports()
    airlines = load_airlines()
    valid_airports = set(airports.keys())
    valid_airlines = {a["iata"] for a in airlines if a.get("iata")}
    title_to_iata = build_title_to_iata(valid_airports)
    airline_lookup = build_airline_lookup(airlines)
    curated = _filter_curated(CURATED, valid_airports, valid_airlines)

    # National-carrier fallback: airline whose hub == airport
    hub_to_airline = defaultdict(list)
    for a in airlines:
        if a.get("hub") and a.get("iata"):
            hub_to_airline[a["hub"]].append(a["iata"])

    out = {}
    failures = []
    weak_airlines = []
    weak_dests = []

    for iata in sorted(airports.keys()):
        title = AIRPORT_WIKI.get(iata)
        if not title:
            failures.append((iata, "no title mapping"))
            out[iata] = {"topAirlines": [], "topDestinations": [], "year": 2023, "source": "no data found"}
            continue
        try:
            html = fetch_wiki(title)
        except Exception as e:
            print(f"  FETCH FAIL {iata} {title}: {e}", file=sys.stderr)
            failures.append((iata, f"fetch: {e}"))
            out[iata] = {"topAirlines": [], "topDestinations": [], "year": 2023, "source": "no data found"}
            continue

        soup = BeautifulSoup(html, "lxml")
        dest_counts, airlines_from_routes = _re_extract_sum(
            soup, valid_airports, title_to_iata, iata, airline_lookup, valid_airlines)

        # Curated overrides take priority for both dimensions
        cur_dests, cur_airlines = curated.get(iata, ([], []))
        if cur_dests:
            top_dests = cur_dests[:10]
        else:
            top_dests = topn(dest_counts, 10)

        ranked_airlines = extract_top_airlines(soup, valid_airlines, airline_lookup)
        if cur_airlines:
            top_airlines = cur_airlines[:7]
        elif ranked_airlines and len(ranked_airlines) >= 3:
            top_airlines = ranked_airlines[:7]
        elif airlines_from_routes:
            # Use operating-airlines aggregation from busiest-routes tables
            top_airlines = topn(airlines_from_routes, 7)
        else:
            top_airlines = []

        source = f"Wikipedia: {title}"
        airline_fallback_used = False
        if len(top_airlines) < 3:
            # Fallback: hub airlines + airlines-and-destinations table list
            fallback = list(hub_to_airline.get(iata, []))
            mentioned = extract_mentioned_airlines(soup, valid_airlines, airline_lookup)
            for x in mentioned:
                if x not in fallback:
                    fallback.append(x)
            if fallback:
                top_airlines = fallback[:3]
                airline_fallback_used = True

        if len(top_dests) < 3:
            weak_dests.append(iata)
        if len(top_airlines) < 3:
            weak_airlines.append(iata)

        # Determine year — try to read from page (best-effort)
        year = guess_year(html)

        if not top_dests and not top_airlines:
            out[iata] = {"topAirlines": [], "topDestinations": [], "year": year, "source": "no data found"}
            continue

        entry = {
            "topAirlines": top_airlines,
            "topDestinations": top_dests[:10] if len(top_dests) >= 5 else top_dests,
            "year": year,
            "source": source + (" (airlines: hub fallback)" if airline_fallback_used else ""),
        }
        # If <5 dests we still emit what we have (rare case)
        out[iata] = entry
        msg_a = ",".join(top_airlines) if top_airlines else "-"
        msg_d = ",".join(top_dests[:7]) if top_dests else "-"
        print(f"  {iata}: A=[{msg_a}] D=[{msg_d}]", file=sys.stderr)

    # Write out
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True, ensure_ascii=False)
    print(f"\nWrote {OUT_PATH}", file=sys.stderr)

    # ---- Sanity checks ----
    print("\n=== SANITY CHECKS ===", file=sys.stderr)
    def check(cond, msg):
        flag = "OK " if cond else "FAIL"
        print(f"  {flag}: {msg}", file=sys.stderr)
        return cond

    lhr = out.get("LHR", {})
    check("JFK" in lhr.get("topDestinations", []), "LHR topDestinations contains JFK")
    dxb = out.get("DXB", {})
    da = dxb.get("topAirlines", [])
    check(da and da[0] == "EK", f"DXB topAirlines[0] == EK (got {da[:3]})")
    atl = out.get("ATL", {})
    aa = atl.get("topAirlines", [])
    check(aa and aa[0] == "DL", f"ATL topAirlines[0] == DL (got {aa[:3]})")
    fra = out.get("FRA", {})
    fa = fra.get("topAirlines", [])
    check(fa and fa[0] == "LH", f"FRA topAirlines[0] == LH (got {fa[:3]})")
    ist = out.get("IST", {})
    ia = ist.get("topAirlines", [])
    check(ia and ia[0] == "TK", f"IST topAirlines[0] == TK (got {ia[:3]})")

    # Per-entry minimums
    bad_min = []
    for iata, e in out.items():
        if e.get("source") == "no data found":
            continue
        if len(e.get("topAirlines", [])) < 3 or len(e.get("topDestinations", [])) < 3:
            bad_min.append((iata, len(e.get("topAirlines", [])), len(e.get("topDestinations", []))))
    if bad_min:
        print(f"  WARN: {len(bad_min)} airports with <3 airlines or <3 dests:", file=sys.stderr)
        for x in bad_min:
            print(f"    {x[0]}: A={x[1]} D={x[2]}", file=sys.stderr)
    else:
        print("  OK : all entries have >=3 airlines and >=3 destinations", file=sys.stderr)

    # Coverage
    total = len(out)
    no_data = sum(1 for e in out.values() if e.get("source") == "no data found")
    print(f"\nCoverage: {total} airports, {no_data} marked 'no data found'", file=sys.stderr)
    print(f"Failures during fetch: {len(failures)}", file=sys.stderr)
    for f_iata, reason in failures:
        print(f"  {f_iata}: {reason}", file=sys.stderr)


def extract_mentioned_airlines(soup, valid_airlines, airline_lookup):
    """Pull airline IATAs from 'Airlines and destinations' table; unranked."""
    seen = []
    seen_set = set()
    def pred(t):
        return "airline" in t and "destination" in t
    for table, _ in find_section_tables(soup, pred):
        for tr in table.find_all("tr")[1:]:
            cells = tr.find_all(["td", "th"])
            if not cells:
                continue
            name = cells[0].get_text(" ", strip=True)
            iata = lookup_airline(name, airline_lookup, valid_airlines)
            if iata and iata not in seen_set:
                seen.append(iata)
                seen_set.add(iata)
    return seen


def guess_year(html):
    # Best-effort: look for "in 2023" or "(2023)" near the data
    m = re.search(r"\bin (20\d{2})\b", html)
    if m:
        y = int(m.group(1))
        if 2020 <= y <= 2025:
            return y
    return 2023


if __name__ == "__main__":
    main()
