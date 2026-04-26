#!/usr/bin/env python3
"""
airline_v2.py — Build /srv/miro/games/src/data/airline-routes.json.

Strategy:
  1. Use a curated, hand-built mapping of major airline -> ranked top destinations.
     Rankings are based on well-known route-volume / frequency facts (Wikipedia
     "Most-flown routes" tables, IR reports, common aviation knowledge).
  2. Filter out the airline's own hub.
  3. Filter to only destinations that are present in airports.json.
  4. If airport-routes.json exists (parallel agent), use it to:
        - cross-validate
        - fill in any airline that has no manual entry
  5. Validate against the spec and print a summary.

Everything is hub-agnostic at the source-of-truth level: candidate lists may
include the airline's own hub (e.g. FRA for LH); we strip the hub at filter
time.  This keeps the data table readable and reusable.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path("/srv/miro/games")
DATA = ROOT / "src" / "data"
AIRLINES = json.loads((DATA / "airlines.json").read_text())
AIRPORTS = json.loads((DATA / "airports.json").read_text())
AIRPORT_ROUTES_PATH = DATA / "airport-routes.json"
OUT_PATH = DATA / "airline-routes.json"

VALID_IATAS = set(AIRPORTS.keys())

# -----------------------------------------------------------------------------
# Curated ranked destinations.
#
# Each list is ordered by route-level traffic / frequency on the airline,
# DESCENDING.  Entries that are not in airports.json are silently dropped at
# filter time — we deliberately include some out-of-list candidates so the
# rankings make sense to a reviewer.  Hubs may be present and will be stripped.
#
# Sources cited per-airline.
# -----------------------------------------------------------------------------
CURATED: dict[str, dict] = {
    # ---- Lufthansa Group ----
    "LH": {
        "topDestinations": ["JFK", "EWR", "ORD", "LAX", "PEK", "PVG", "DEL",
                             "BKK", "HND", "SFO", "IAD", "MIA", "BOS"],
        "year": 2023,
        "source": "Wikipedia: Lufthansa most-flown long-haul + manual",
    },
    "OS": {  # Austrian, hub VIE — short-haul focus on European/E-Med + JFK/ORD
        "topDestinations": ["FRA", "JFK", "ORD", "TLV", "CDG", "LHR", "FCO",
                             "ZRH", "AMS", "MAD", "BKK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "LX": {  # Swiss, hub ZRH
        "topDestinations": ["JFK", "EWR", "ORD", "LAX", "MIA", "BKK", "HKG",
                             "PEK", "BOS", "LHR", "FRA", "CDG"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "SN": {  # Brussels Airlines, hub BRU
        "topDestinations": ["JFK", "FRA", "LHR", "FCO", "MAD", "GVA", "NBO",
                             "JNB", "DAR", "KGL", "ABJ"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "EW": {  # Eurowings, hub DUS
        "topDestinations": ["VIE", "PMI", "BCN", "FCO", "LHR", "MAD", "AGP",
                             "FAO", "HER", "ATH"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AZ": {  # ITA Airways, hub FCO
        "topDestinations": ["JFK", "EWR", "ORD", "LAX", "MIA", "BOS", "GRU",
                             "EZE", "LHR", "CDG", "FRA", "MAD", "TLV"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- IAG ----
    "BA": {  # British Airways, hub LHR
        "topDestinations": ["JFK", "LAX", "MIA", "ORD", "BOS", "DXB", "SIN",
                             "HKG", "JNB", "GRU", "DEL", "DOH", "SFO", "IAD"],
        "year": 2023,
        "source": "Wikipedia: British Airways most-flown routes",
    },
    "IB": {  # Iberia, hub MAD
        "topDestinations": ["JFK", "MIA", "MEX", "GRU", "EZE", "BOG", "LIM",
                             "SCL", "LHR", "CDG", "FCO", "BCN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "EI": {  # Aer Lingus, hub DUB
        "topDestinations": ["LHR", "JFK", "BOS", "ORD", "MCO", "LAX", "MIA",
                             "AMS", "CDG", "MAD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "VY": {  # Vueling, hub BCN — short haul leisure
        "topDestinations": ["FCO", "CDG", "LHR", "AMS", "MAD", "LIS", "ATH",
                             "BRU", "MXP", "ORY"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "LV": {  # LEVEL, hub BCN — long-haul leisure
        "topDestinations": ["JFK", "EWR", "MIA", "BOS", "LAX", "EZE", "SCL",
                             "PUJ"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Air France-KLM ----
    "AF": {  # Air France, hub CDG
        "topDestinations": ["JFK", "LAX", "MIA", "ORD", "BOS", "SFO", "ATL",
                             "PEK", "PVG", "HND", "GRU", "MEX", "LHR", "FCO",
                             "MAD", "DXB"],
        "year": 2023,
        "source": "Wikipedia: Air France destinations + IR",
    },
    "KL": {  # KLM, hub AMS
        "topDestinations": ["JFK", "ATL", "ORD", "LAX", "IAH", "GRU", "EZE",
                             "PVG", "PEK", "ICN", "HND", "DEL", "DXB", "LHR",
                             "FCO", "MAD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "TO": {  # Transavia, hub AMS — leisure/charter
        "topDestinations": ["AGP", "BCN", "FAO", "ALC", "LIS", "ATH", "FCO",
                             "TFS"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- US Big Three ----
    "DL": {  # Delta, hub ATL
        "topDestinations": ["LHR", "CDG", "AMS", "FRA", "FCO", "MEX", "GRU",
                             "HND", "ICN", "NRT", "DXB", "TLV", "JNB"],
        "year": 2023,
        "source": "Wikipedia: Delta Air Lines destinations + IR",
    },
    "9E": {  # Endeavor, regional, hub DTW (also operates from ATL/JFK/MSP/LGA)
        "topDestinations": ["ATL", "MSP", "JFK", "LGA"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "UA": {  # United, hub ORD (also EWR/IAH/SFO/DEN/IAD)
        "topDestinations": ["LHR", "FRA", "CDG", "FCO", "AMS", "HND", "PEK",
                             "PVG", "ICN", "HKG", "SIN", "DEL", "TLV", "GRU",
                             "MEX", "SYD", "DXB"],
        "year": 2023,
        "source": "Wikipedia: United Airlines destinations + IR",
    },
    "AA": {  # American, hub DFW
        "topDestinations": ["LHR", "CDG", "MAD", "FCO", "MEX", "GRU", "EZE",
                             "HND", "ICN", "DOH", "JFK", "LAX", "ORD", "MIA",
                             "CLT", "PHX"],
        "year": 2023,
        "source": "Wikipedia: American Airlines destinations + IR",
    },
    "MQ": {"topDestinations": ["DFW", "ORD", "MIA", "CLT"], "year": 2023,
           "source": "manual: common knowledge"},
    "OH": {"topDestinations": ["CLT", "DCA", "PHL"], "year": 2023,
           "source": "manual: common knowledge"},
    "PT": {"topDestinations": ["CLT", "DCA", "PHL"], "year": 2023,
           "source": "manual: common knowledge"},

    # ---- US others ----
    "AS": {  # Alaska, hub SEA
        "topDestinations": ["LAX", "SFO", "ANC", "PDX", "SAN", "LAS", "PHX",
                             "JFK", "ORD", "DFW"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "HA": {  # Hawaiian, hub HNL
        "topDestinations": ["LAX", "SFO", "SEA", "LAS", "PDX", "JFK", "ICN",
                             "HND", "SYD", "AKL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "B6": {  # JetBlue, hub JFK
        "topDestinations": ["FLL", "LAX", "BOS", "MCO", "LAS", "LHR", "SFO",
                             "SJU", "DCA"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "WN": {  # Southwest, hub DAL but operates network style
        "topDestinations": ["LAS", "DEN", "MDW", "PHX", "BWI", "HOU", "MCO",
                             "ATL", "OAK", "SAN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "NK": {  # Spirit, hub FLL
        "topDestinations": ["LAS", "MCO", "DTW", "ORD", "LAX", "ATL", "DFW",
                             "EWR", "ACY"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "F9": {  # Frontier, hub DEN
        "topDestinations": ["LAS", "MCO", "ATL", "PHL", "MIA", "ORD", "LAX",
                             "DFW"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "G4": {  # Allegiant, hub LAS
        "topDestinations": ["MCO", "PIE", "SFB", "PGD", "AVL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "SY": {  # Sun Country, hub MSP
        "topDestinations": ["LAS", "MCO", "PHX", "DFW", "LAX", "JFK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Canada ----
    "AC": {  # Air Canada, hub YYZ
        "topDestinations": ["LHR", "CDG", "FRA", "FCO", "JFK", "LAX", "ORD",
                             "MIA", "HND", "ICN", "PEK", "PVG", "HKG", "DEL",
                             "GRU", "DXB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "WS": {  # WestJet, hub YYC
        "topDestinations": ["YYZ", "YVR", "YEG", "YWG", "LAX", "LAS", "MCO",
                             "LHR"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "PD": {  # Porter, hub YTZ
        "topDestinations": ["YYZ", "YOW", "YUL", "YHZ", "YQB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Mexico / LatAm ----
    "AM": {  # Aeromexico, hub MEX
        "topDestinations": ["JFK", "LAX", "MIA", "ORD", "DFW", "MAD", "CDG",
                             "AMS", "FCO", "HND", "ICN", "GRU", "EZE", "BOG",
                             "LIM"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "Y4": {  # Volaris, hub MEX/GDL/TIJ
        "topDestinations": ["LAX", "ORD", "MTY", "GDL", "TIJ", "CUN", "MIA",
                             "SFO", "DEN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "VB": {  # Viva Aerobus, hub MTY
        "topDestinations": ["MEX", "CUN", "GDL", "TIJ", "LAS", "MIA", "ORD",
                             "JFK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "LA": {  # LATAM Chile, hub SCL
        "topDestinations": ["LIM", "GRU", "EZE", "MIA", "JFK", "LAX", "MAD",
                             "CDG", "FCO", "FRA", "MEX", "BOG", "AKL", "SYD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "JJ": {  # LATAM Brasil, hub GRU
        "topDestinations": ["EZE", "SCL", "LIM", "BOG", "MEX", "JFK", "MIA",
                             "LAX", "MAD", "CDG", "FCO", "FRA", "LHR"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AV": {  # Avianca, hub BOG
        "topDestinations": ["MIA", "JFK", "LAX", "MEX", "MAD", "FCO", "LIM",
                             "SCL", "EZE", "GRU", "PTY", "SAL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "G3": {  # GOL, hub GRU/CGH/GIG
        "topDestinations": ["EZE", "MIA", "MVD", "SCL", "BOG", "PTY", "POA",
                             "BSB", "REC"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AD": {  # Azul, hub VCP
        "topDestinations": ["GRU", "FLL", "MCO", "JFK", "LIS", "CDG", "EZE",
                             "POA", "REC"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "CM": {  # Copa, hub PTY
        "topDestinations": ["MIA", "MEX", "BOG", "LIM", "SCL", "EZE", "GRU",
                             "JFK", "LAX", "ORD", "MCO", "JNB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AR": {  # Aerolineas Argentinas, hub EZE
        "topDestinations": ["MIA", "JFK", "MAD", "FCO", "GRU", "SCL", "LIM",
                             "BOG", "MEX", "AEP", "COR", "MDZ"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- European LCC ----
    "FR": {  # Ryanair, hub DUB plus many bases
        "topDestinations": ["STN", "BCN", "MAD", "FCO", "BGY", "AGP", "PMI",
                             "ALC", "ATH", "DUB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "U2": {  # easyJet, hub LGW (also LTN/STN/BCN/CDG etc)
        "topDestinations": ["AGP", "BCN", "FCO", "AMS", "GVA", "LIS", "ATH",
                             "MXP", "CDG"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "W6": {  # Wizz Air, hub BUD plus E. European bases
        "topDestinations": ["LTN", "WAW", "OTP", "SOF", "FCO", "BCN", "MAD",
                             "TLV", "DXB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "DY": {  # Norwegian, hub OSL
        "topDestinations": ["AGP", "ALC", "LGW", "CPH", "LHR", "BCN", "AMS",
                             "FCO"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "LS": {  # Jet2, hub LBA + other UK bases (operates many UK->leisure)
        "topDestinations": ["AGP", "PMI", "ALC", "TFS", "LPA", "FAO", "HER",
                             "FCO"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "BY": {  # TUI Airways, hub LGW (leisure)
        "topDestinations": ["AGP", "TFS", "PMI", "LPA", "CUN", "PUJ", "HER"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Other Europe ----
    "PC": {  # Pegasus, hub SAW
        "topDestinations": ["IST", "AYT", "ESB", "ADB", "DXB", "LHR", "CDG",
                             "FRA", "AMS"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "TK": {  # Turkish, hub IST — huge global network
        "topDestinations": ["FRA", "LHR", "CDG", "AMS", "JFK", "DXB", "DOH",
                             "MOW", "PEK", "SIN", "BKK", "HND", "GRU", "JNB",
                             "TLV"],
        "year": 2023,
        "source": "Wikipedia: Turkish Airlines destinations",
    },
    "TP": {  # TAP, hub LIS
        "topDestinations": ["GRU", "JFK", "EWR", "MIA", "BOS", "GIG", "CDG",
                             "LHR", "FRA", "MAD", "FCO", "LAD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "A3": {  # Aegean, hub ATH
        "topDestinations": ["LHR", "CDG", "FRA", "FCO", "MAD", "BRU", "AMS",
                             "TLV", "MUC", "ZRH"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AY": {  # Finnair, hub HEL
        "topDestinations": ["HND", "ICN", "PEK", "PVG", "HKG", "BKK", "SIN",
                             "DEL", "JFK", "LHR", "CDG", "FRA"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "SK": {  # SAS, hub CPH (also OSL/ARN)
        "topDestinations": ["LHR", "CDG", "FRA", "FCO", "JFK", "EWR", "ORD",
                             "LAX", "PEK", "OSL", "ARN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "LO": {  # LOT, hub WAW
        "topDestinations": ["LHR", "JFK", "ORD", "FRA", "CDG", "AMS", "BUD",
                             "ICN", "HND", "PEK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "OK": {  # Czech Airlines, hub PRG (small now)
        "topDestinations": ["CDG", "MAD", "AMS", "FRA"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "JU": {  # Air Serbia, hub BEG
        "topDestinations": ["JFK", "VIE", "FRA", "CDG", "FCO", "ZRH", "IST",
                             "MOW", "TLV"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "OU": {  # Croatia Airlines, hub ZAG
        "topDestinations": ["FRA", "MUC", "CDG", "AMS", "LHR", "FCO", "ZRH"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "FI": {  # Icelandair, hub KEF
        "topDestinations": ["JFK", "EWR", "BOS", "ORD", "MSP", "SEA", "DEN",
                             "LHR", "CPH", "OSL", "AMS", "CDG"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Middle East / North Africa ----
    "EK": {  # Emirates, hub DXB
        "topDestinations": ["LHR", "JFK", "BKK", "SIN", "SYD", "MEL", "MAN",
                             "FRA", "CDG", "FCO", "BOM", "DEL", "JNB", "HKG",
                             "LAX"],
        "year": 2023,
        "source": "Wikipedia: Emirates most-flown routes",
    },
    "EY": {  # Etihad, hub AUH
        "topDestinations": ["LHR", "JFK", "BKK", "SIN", "SYD", "MEL", "FRA",
                             "CDG", "FCO", "BOM", "DEL", "MNL", "ICN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "QR": {  # Qatar, hub DOH
        "topDestinations": ["LHR", "CDG", "FRA", "FCO", "JFK", "ORD", "LAX",
                             "BKK", "SIN", "HKG", "BOM", "DEL", "SYD", "MEL",
                             "JNB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "SV": {  # Saudia, hub JED (also RUH)
        "topDestinations": ["DXB", "CAI", "IST", "LHR", "CDG", "FRA", "JFK",
                             "MNL", "DEL", "BOM", "BKK", "JKT"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "FZ": {  # flydubai, hub DXB
        "topDestinations": ["IST", "JED", "RUH", "DOH", "MCT", "BKK", "KTM",
                             "BOM", "MOW", "TLV"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "RJ": {  # Royal Jordanian, hub AMM
        "topDestinations": ["DXB", "CAI", "JED", "RUH", "LHR", "CDG", "FRA",
                             "JFK", "ORD", "BKK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "WY": {  # Oman Air, hub MCT
        "topDestinations": ["DXB", "DOH", "JED", "BAH", "BKK", "DEL", "BOM",
                             "LHR", "CDG", "FRA"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "GF": {  # Gulf Air, hub BAH
        "topDestinations": ["DXB", "DOH", "JED", "RUH", "CAI", "AMM", "LHR",
                             "CDG", "FRA", "BKK", "BOM", "DEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "KU": {  # Kuwait Airways, hub KWI
        "topDestinations": ["DXB", "DOH", "BAH", "JED", "RUH", "CAI", "LHR",
                             "CDG", "FRA", "JFK", "BKK", "DEL", "BOM"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "MS": {  # EgyptAir, hub CAI
        "topDestinations": ["DXB", "JED", "RUH", "LHR", "CDG", "FRA", "FCO",
                             "JFK", "BKK", "PEK", "JNB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AT": {  # Royal Air Maroc, hub CMN
        "topDestinations": ["CDG", "ORY", "MAD", "BCN", "BRU", "FCO", "FRA",
                             "LHR", "JFK", "DXB", "CAI"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "LY": {  # El Al, hub TLV
        "topDestinations": ["JFK", "EWR", "LAX", "MIA", "LHR", "CDG", "FRA",
                             "FCO", "AMS", "BKK", "BOM"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Asia Pacific ----
    "SQ": {  # Singapore Airlines, hub SIN
        "topDestinations": ["BKK", "HKG", "ICN", "HND", "PEK", "PVG", "DEL",
                             "BOM", "LHR", "CDG", "FRA", "JFK", "LAX", "SFO",
                             "SYD", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "TR": {  # Scoot, hub SIN
        "topDestinations": ["BKK", "HKG", "TPE", "ICN", "HND", "PVG", "DEL",
                             "CGK", "MNL", "KUL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "CX": {  # Cathay Pacific, hub HKG
        "topDestinations": ["LHR", "CDG", "FRA", "FCO", "JFK", "LAX", "SFO",
                             "ORD", "HND", "ICN", "PVG", "PEK", "BKK", "SIN",
                             "SYD", "MEL"],
        "year": 2023,
        "source": "Wikipedia: Cathay Pacific destinations",
    },
    "JL": {  # JAL, hub HND (also NRT)
        "topDestinations": ["JFK", "LAX", "SFO", "ORD", "BOS", "LHR", "CDG",
                             "FRA", "BKK", "SIN", "HKG", "ICN", "PEK", "PVG",
                             "SYD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "NH": {  # ANA, hub HND (also NRT)
        "topDestinations": ["LAX", "SFO", "JFK", "ORD", "IAD", "FRA", "LHR",
                             "CDG", "BKK", "SIN", "HKG", "ICN", "PEK", "PVG",
                             "SYD"],
        "year": 2023,
        "source": "Wikipedia: ANA destinations",
    },
    "KE": {  # Korean Air, hub ICN
        "topDestinations": ["JFK", "LAX", "SFO", "ORD", "IAD", "ATL", "LHR",
                             "CDG", "FRA", "FCO", "BKK", "SIN", "HKG", "HND",
                             "PEK", "PVG", "SYD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "OZ": {  # Asiana, hub ICN
        "topDestinations": ["JFK", "LAX", "SFO", "ORD", "SEA", "LHR", "CDG",
                             "FRA", "FCO", "BKK", "SIN", "HKG", "HND", "PEK",
                             "PVG"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "CA": {  # Air China, hub PEK
        "topDestinations": ["HKG", "HND", "ICN", "BKK", "SIN", "FRA", "CDG",
                             "LHR", "FCO", "JFK", "LAX", "SFO", "SYD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "MU": {  # China Eastern, hub PVG
        "topDestinations": ["HKG", "HND", "ICN", "BKK", "SIN", "FRA", "CDG",
                             "LHR", "JFK", "LAX", "SFO", "SYD", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "CZ": {  # China Southern, hub CAN
        "topDestinations": ["HKG", "BKK", "SIN", "ICN", "HND", "CDG", "LHR",
                             "FRA", "AMS", "JFK", "LAX", "SYD", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "HU": {  # Hainan Airlines, hub HAK (also PEK)
        "topDestinations": ["PEK", "PVG", "CAN", "HKG", "BKK", "ICN", "HND",
                             "CDG", "LHR", "FRA", "JFK", "LAX"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "BR": {  # EVA Air, hub TPE
        "topDestinations": ["HKG", "BKK", "SIN", "ICN", "HND", "PVG", "PEK",
                             "JFK", "LAX", "SFO", "SEA", "LHR", "CDG", "FRA",
                             "VIE", "SYD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "CI": {  # China Airlines, hub TPE
        "topDestinations": ["HKG", "BKK", "SIN", "ICN", "HND", "PVG", "PEK",
                             "JFK", "LAX", "SFO", "AMS", "FRA", "FCO", "SYD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "TG": {  # Thai, hub BKK
        "topDestinations": ["HKG", "SIN", "ICN", "HND", "PEK", "PVG", "DEL",
                             "BOM", "LHR", "CDG", "FRA", "FCO", "SYD", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "VN": {  # Vietnam Airlines, hub HAN (also SGN)
        "topDestinations": ["SGN", "BKK", "HKG", "SIN", "ICN", "HND", "PVG",
                             "PEK", "CDG", "LHR", "FRA", "SYD", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "PR": {  # Philippine Airlines, hub MNL
        "topDestinations": ["LAX", "SFO", "JFK", "HNL", "GUM", "HND", "ICN",
                             "PVG", "PEK", "HKG", "SIN", "BKK", "SYD", "MEL",
                             "DXB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "GA": {  # Garuda, hub CGK
        "topDestinations": ["DPS", "SIN", "KUL", "BKK", "HKG", "ICN", "HND",
                             "PVG", "PEK", "AMS", "DXB", "JED", "SYD", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "MH": {  # Malaysia, hub KUL
        "topDestinations": ["SIN", "BKK", "HKG", "ICN", "HND", "PVG", "PEK",
                             "DEL", "BOM", "LHR", "CDG", "JED", "SYD", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AK": {  # AirAsia, hub KUL
        "topDestinations": ["SIN", "BKK", "DPS", "CGK", "MNL", "HKG", "ICN",
                             "PVG", "PEK", "DEL", "SYD"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "6E": {  # IndiGo, hub DEL
        "topDestinations": ["BOM", "BLR", "MAA", "HYD", "CCU", "DXB", "DOH",
                             "BKK", "SIN", "KUL", "CMB", "KTM", "IST"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "AI": {  # Air India, hub DEL (also BOM)
        "topDestinations": ["BOM", "BLR", "MAA", "HYD", "CCU", "DXB", "DOH",
                             "JFK", "EWR", "ORD", "SFO", "LHR", "CDG", "FRA",
                             "SIN", "BKK", "HKG"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "UK": {  # Vistara, hub DEL (merging with AI but historically)
        "topDestinations": ["BOM", "BLR", "MAA", "HYD", "DXB", "SIN", "BKK",
                             "LHR", "CDG", "FRA"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "UL": {  # SriLankan, hub CMB
        "topDestinations": ["DEL", "BOM", "MAA", "DXB", "DOH", "SIN", "BKK",
                             "KUL", "HKG", "ICN", "LHR", "CDG", "FRA", "MLE"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Oceania ----
    "QF": {  # Qantas, hub SYD
        "topDestinations": ["MEL", "BNE", "PER", "AKL", "LAX", "SFO", "DFW",
                             "JFK", "LHR", "SIN", "HKG", "HND", "ICN", "DOH",
                             "JNB"],
        "year": 2023,
        "source": "Wikipedia: Qantas international destinations",
    },
    "JQ": {  # Jetstar, hub MEL
        "topDestinations": ["SYD", "BNE", "AKL", "DPS", "BKK", "SIN", "HND",
                             "HNL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "VA": {  # Virgin Australia, hub BNE (also SYD)
        "topDestinations": ["SYD", "MEL", "PER", "AKL", "DPS", "NAN", "HND"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "NZ": {  # Air New Zealand, hub AKL
        "topDestinations": ["SYD", "MEL", "BNE", "LAX", "SFO", "JFK", "ORD",
                             "HND", "ICN", "PVG", "SIN", "HKG", "NAN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "FJ": {  # Fiji Airways, hub NAN
        "topDestinations": ["SYD", "MEL", "BNE", "AKL", "LAX", "SFO", "HND",
                             "ICN", "HNL", "SIN", "HKG"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- Africa ----
    "SA": {  # South African, hub JNB
        "topDestinations": ["CPT", "DUR", "GRU", "FRA", "LHR", "CDG", "DXB",
                             "PER", "ADD", "NBO", "ACC", "LOS"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "ET": {  # Ethiopian, hub ADD
        "topDestinations": ["JNB", "NBO", "DXB", "DOH", "JED", "CDG", "LHR",
                             "FRA", "FCO", "JFK", "IAD", "PEK", "BKK", "BOM",
                             "DEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "KQ": {  # Kenya Airways, hub NBO
        "topDestinations": ["JNB", "ADD", "DXB", "DOH", "LHR", "CDG", "AMS",
                             "JFK", "BKK", "BOM", "GRU"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "WB": {  # RwandAir, hub KGL
        "topDestinations": ["NBO", "JNB", "ADD", "DXB", "BRU", "LHR", "CDG",
                             "ACC", "LOS"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "MK": {  # Air Mauritius, hub MRU
        "topDestinations": ["JNB", "CPT", "CDG", "LHR", "FRA", "DXB", "BOM",
                             "DEL", "SIN", "HKG", "PER", "MEL"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- CIS / Central Asia ----
    "SU": {  # Aeroflot, hub SVO
        "topDestinations": ["LED", "AER", "DXB", "IST", "ALA", "GYD", "TAS",
                             "PEK", "PVG", "ICN", "HND"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "S7": {  # S7, hub DME (now mostly OVB/DME)
        "topDestinations": ["AER", "LED", "OVB", "ALA", "IST", "PEK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "KC": {  # Air Astana, hub ALA
        "topDestinations": ["TSE", "IST", "DXB", "FRA", "LHR", "CDG", "DEL",
                             "PEK", "BKK", "SVO"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "HY": {  # Uzbekistan, hub TAS
        "topDestinations": ["IST", "DXB", "FRA", "LHR", "CDG", "DEL", "BKK",
                             "PEK", "ICN", "SVO"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "J2": {  # Azerbaijan Airlines, hub GYD
        "topDestinations": ["IST", "DXB", "MOW", "LHR", "CDG", "FRA", "FCO",
                             "PEK", "TLV"],
        "year": 2023,
        "source": "manual: common knowledge",
    },

    # ---- SE Asia / smaller ----
    "QH": {  # Bamboo Airways, hub HAN/SGN
        "topDestinations": ["SGN", "DAD", "BKK", "ICN", "NRT", "TPE"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "VJ": {  # VietJet, hub SGN
        "topDestinations": ["HAN", "DAD", "BKK", "SIN", "KUL", "ICN", "HND",
                             "TPE", "DEL", "BOM"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "5J": {  # Cebu Pacific, hub MNL
        "topDestinations": ["CEB", "DVO", "ILO", "HKG", "SIN", "BKK", "ICN",
                             "HND", "DXB"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "BT": {  # airBaltic, hub RIX
        "topDestinations": ["LHR", "CDG", "FRA", "AMS", "FCO", "MAD", "BCN",
                             "OSL", "CPH", "TLL", "VNO"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "QS": {  # Smartwings, hub PRG (leisure)
        "topDestinations": ["AYT", "HRG", "RHO", "PMI", "BCN", "FCO", "AGP"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "FB": {  # Bulgaria Air, hub SOF
        "topDestinations": ["FRA", "LHR", "CDG", "AMS", "FCO", "MAD", "VIE",
                             "ZRH", "BRU", "TLV"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "RO": {  # Tarom, hub OTP
        "topDestinations": ["FRA", "LHR", "CDG", "AMS", "FCO", "MAD", "VIE",
                             "BRU", "TLV", "ATH"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "PG": {  # Bangkok Airways, hub BKK
        "topDestinations": ["USM", "HKT", "CNX", "CEI", "SIN", "HKG", "PNH",
                             "REP"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "JT": {  # Lion Air, hub CGK
        "topDestinations": ["DPS", "SUB", "MES", "UPG", "SIN", "KUL", "BKK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "SG": {  # SpiceJet, hub DEL
        "topDestinations": ["BOM", "BLR", "MAA", "HYD", "CCU", "DXB", "BKK",
                             "CMB", "KTM"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "BI": {  # Royal Brunei, hub BWN
        "topDestinations": ["SIN", "KUL", "HKG", "BKK", "MNL", "DXB", "LHR",
                             "HND", "ICN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "PK": {  # PIA, hub KHI (also LHE/ISB)
        "topDestinations": ["DXB", "DOH", "JED", "RUH", "LHR", "CDG", "FRA",
                             "PEK", "BKK", "ICN", "TLV"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "OM": {  # MIAT, hub ULN
        "topDestinations": ["PEK", "ICN", "HND", "FRA", "IST", "HKG", "BKK"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "JA": {  # JetSMART, hub SCL
        "topDestinations": ["LIM", "EZE", "AEP", "GRU", "BOG", "MVD", "ASU"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "H2": {  # Sky Airline, hub SCL
        "topDestinations": ["LIM", "EZE", "MVD", "GRU", "ASU", "AEP"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "BW": {  # Caribbean Airlines, hub POS
        "topDestinations": ["JFK", "MIA", "FLL", "YYZ", "BGI", "GEO", "KIN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "FA": {  # FlySafair, hub JNB (domestic-heavy)
        "topDestinations": ["CPT", "DUR", "PLZ", "ELS", "GRJ", "MRU"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
    "PX": {  # Air Niugini, hub POM
        "topDestinations": ["BNE", "SYD", "SIN", "HKG", "MNL", "NRT", "NAN"],
        "year": 2023,
        "source": "manual: common knowledge",
    },
}


def filter_destinations(iata: str, hub: str, candidates: list[str]) -> list[str]:
    """Apply: drop hub; keep only airports.json IATAs; preserve order; dedupe."""
    seen = set()
    out: list[str] = []
    for c in candidates:
        if c == hub:
            continue
        if c not in VALID_IATAS:
            continue
        if c in seen:
            continue
        seen.add(c)
        out.append(c)
    return out[:10]  # cap at 10


def maybe_load_airport_routes() -> dict | None:
    if AIRPORT_ROUTES_PATH.exists():
        try:
            return json.loads(AIRPORT_ROUTES_PATH.read_text())
        except Exception as e:
            print(f"warn: could not parse airport-routes.json: {e}", file=sys.stderr)
    return None


def fallback_from_airport_routes(iata: str, hub: str, ar: dict) -> list[str]:
    """For an airline with no curated entry: collect destinations from each
    airport whose topAirlines includes this carrier, weighted by rank.
    """
    if not ar:
        return []
    scored: dict[str, float] = {}
    for ap_iata, ap in ar.items():
        airlines_at = ap.get("topAirlines") or []
        if iata not in airlines_at:
            continue
        rank = airlines_at.index(iata)  # 0 = top
        # Weight: airline's prominence at this airport
        airline_weight = 1.0 / (rank + 1)
        for d_rank, d in enumerate(ap.get("topDestinations") or []):
            if d == hub or d not in VALID_IATAS:
                continue
            # Weight destination by its rank at the airport too
            dest_weight = 1.0 / (d_rank + 1)
            scored[d] = scored.get(d, 0.0) + airline_weight * dest_weight
    ranked = sorted(scored.items(), key=lambda x: -x[1])
    return [d for d, _ in ranked][:8]


def main() -> int:
    ar = maybe_load_airport_routes()
    if ar:
        print(f"airport-routes.json loaded ({len(ar)} airports) — used for fallback", file=sys.stderr)
    else:
        print("airport-routes.json not present — fallback unavailable", file=sys.stderr)

    out: dict[str, dict] = {}
    no_data: list[str] = []

    for airline in AIRLINES:
        iata = airline["iata"]
        hub = airline.get("hub")

        if iata in CURATED:
            entry = CURATED[iata]
            dests = filter_destinations(iata, hub, entry["topDestinations"])
            if len(dests) >= 3:
                out[iata] = {
                    "topDestinations": dests,
                    "year": entry["year"],
                    "source": entry["source"],
                }
                continue
            # too few survived filter -> try fallback before giving up
            print(f"note: {iata} curated list reduced to {len(dests)} after filter; trying fallback", file=sys.stderr)

        # Fallback: airport-routes
        fb = fallback_from_airport_routes(iata, hub, ar) if ar else []
        if len(fb) >= 3:
            out[iata] = {
                "topDestinations": fb,
                "year": 2023,
                "source": "derived: airport-routes cross-reference",
            }
        else:
            # Use whatever we have, but mark honestly
            # Strict spec: 3-10 entries. If we can't reach 3 valid destinations,
            # emit empty rather than half-baked.
            out[iata] = {
                "topDestinations": [],
                "year": 2023,
                "source": "no ranked data",
            }
            no_data.append(iata)

    # ---- Validation ----
    failures: list[str] = []

    def must_contain(iata: str, needed: list[str], at_least: int = 1):
        d = out.get(iata, {}).get("topDestinations") or []
        hits = [n for n in needed if n in d]
        if len(hits) < at_least:
            failures.append(f"{iata}: expected {needed} (>= {at_least}), got {d}")

    def must_not_contain(iata: str, banned: str):
        d = out.get(iata, {}).get("topDestinations") or []
        if banned in d:
            failures.append(f"{iata}: contains forbidden hub {banned}: {d}")

    must_not_contain("LH", "FRA")
    must_contain("LH", ["JFK", "ORD", "LAX"], 1)
    must_not_contain("BA", "LHR")
    must_contain("BA", ["JFK", "LAX"], 1)
    must_contain("DL", ["LHR", "CDG", "FRA", "HND", "ICN"], 3)
    must_contain("EK", ["LHR", "JFK", "BKK", "SIN", "SYD"], 3)
    must_contain("NH", ["LAX", "SFO", "JFK", "ORD", "FRA"], 3)

    # Universal: hub must never appear
    for airline in AIRLINES:
        iata, hub = airline["iata"], airline["hub"]
        d = out.get(iata, {}).get("topDestinations") or []
        if hub and hub in d:
            failures.append(f"{iata}: own hub {hub} present in topDestinations")

    # Universal: every destination must be in airports.json
    for iata, entry in out.items():
        for d in entry["topDestinations"]:
            if d not in VALID_IATAS:
                failures.append(f"{iata}: invalid IATA {d} not in airports.json")

    # ---- Write output ----
    OUT_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")

    # ---- Summary ----
    total = len(AIRLINES)
    with_data = sum(1 for v in out.values() if v["topDestinations"])
    avg_len = (sum(len(v["topDestinations"]) for v in out.values()) / max(with_data, 1))
    by_source: dict[str, int] = {}
    for v in out.values():
        s = v["source"].split(":", 1)[0]
        by_source[s] = by_source.get(s, 0) + 1

    print()
    print("=" * 60)
    print(f"Coverage: {with_data}/{total} airlines with ranked data ({with_data*100//total}%)")
    print(f"Average destinations per airline: {avg_len:.1f}")
    print(f"Sources: {by_source}")
    if no_data:
        print(f"No ranked data ({len(no_data)}): {', '.join(no_data)}")
    print()
    if failures:
        print(f"VALIDATION FAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("All validations passed.")
    print(f"Wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
