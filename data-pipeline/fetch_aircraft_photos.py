"""Materialize the civilian aircraft photo pool by replaying aircraft.ts logic
against the live Wikimedia APIs. Output: aircraft-photo-pool.json — same shape
as military-photos.json: { [aircraftId]: string[] }.

Mirrors fetchFromCommonsCategory + fetchFromWikiMediaList in src/lib/aircraft.ts.
Per-aircraft cap: 250 (matches line 312).
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import os as _os
ROOT = _os.environ.get("GAMES_ROOT") or _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
AIRCRAFT_JSON = f"{ROOT}/src/data/aircraft.json"
# Write directly into the canonical photos file so newly-fetched ids land in
# the right place. Existing keys with non-empty lists are skipped (resume).
OUT = f"{ROOT}/src/data/aircraft-photos.json"

SKIP_PATTERNS = [
    'cockpit', 'flight_deck', 'flightdeck', 'interior', 'cabin', 'seat',
    'galley', 'lavatory', 'cargo_hold', 'cutaway', 'cross_section', 'crosssection',
    'diagram', 'schematic', 'drawing', 'blueprint', 'plan_view', 'planview',
    'three_view', 'threeview', '3-view', '3view', 'silhouette',
    'engine_test', 'rollout', 'assembly', 'factory', 'production_line',
    'logo', 'emblem', 'patch', 'insignia',
    'route_map', 'orders', 'delivery_chart', 'orderchart', 'deliveries',
    'wing_root', 'landing_gear_close',
]
USEFUL_EXT = re.compile(r'\.(jpe?g|png|webp)$', re.I)
UA = "miro-games-photo-fetcher/1.0 (mdurana@ethz.ch)"


def looks_useful(filename: str) -> bool:
    f = filename.lower()
    if not USEFUL_EXT.search(f):
        return False
    return not any(p in f for p in SKIP_PATTERNS)


def http_get(url: str, timeout: int = 20, max_retries: int = 5) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    delay = 2.0
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                time.sleep(0.4)  # polite baseline
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                print(f"  . 429, sleeping {delay:.1f}s", file=sys.stderr)
                time.sleep(delay)
                delay *= 2
                continue
            print(f"  ! GET failed {url[:80]}... — {e}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"  ! GET failed {url[:80]}... — {e}", file=sys.stderr)
            return None
    return None


def fetch_category_files(category: str, limit: int = 50) -> list[str]:
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&format=json"
        f"&generator=categorymembers&gcmtitle={urllib.parse.quote('Category:' + category)}"
        f"&gcmtype=file&gcmlimit={limit}"
        "&prop=imageinfo&iiprop=url&iiurlwidth=800"
    )
    j = http_get(url)
    if not j:
        return []
    pages = (j.get("query") or {}).get("pages") or {}
    out = []
    for p in pages.values():
        title = p.get("title", "")
        if not looks_useful(title):
            continue
        info = (p.get("imageinfo") or [{}])[0]
        src = info.get("thumburl") or info.get("url")
        if src:
            out.append(src)
    return out


def fetch_subcategory_names(category: str, limit: int = 25) -> list[str]:
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&format=json"
        f"&list=categorymembers&cmtitle={urllib.parse.quote('Category:' + category)}"
        f"&cmtype=subcat&cmlimit={limit}"
    )
    j = http_get(url)
    if not j:
        return []
    items = (j.get("query") or {}).get("categorymembers") or []
    return [i["title"].replace("Category:", "", 1) for i in items if i.get("title")]


def fetch_from_commons_category(category: str, cap: int = 250) -> list[str]:
    direct = fetch_category_files(category, 50)
    subs = fetch_subcategory_names(category, 25)
    seen = set(direct)
    out = list(direct)
    # Sequential subcat crawl — Wikimedia has aggressive per-IP limits and
    # slamming with threads here gets us 429s.
    for sc in subs:
        if len(out) >= cap:
            break
        for u in fetch_category_files(sc, 20):
            if u not in seen:
                seen.add(u)
                out.append(u)
                if len(out) >= cap:
                    break
    return out


def fetch_from_wiki_media_list(wiki_title: str) -> list[str]:
    url = f"https://en.wikipedia.org/api/rest_v1/page/media-list/{urllib.parse.quote(wiki_title)}"
    j = http_get(url)
    if not j:
        return []
    items = j.get("items") or []
    out = []
    thumb_re = re.compile(r"/\d{3,4}px-")
    for it in items:
        if it.get("type") != "image":
            continue
        if not looks_useful(it.get("title", "")):
            continue
        srcset = it.get("srcset") or []
        if not srcset:
            continue
        chosen = next((s for s in srcset if s.get("scale") == "1x"), srcset[0])
        raw = chosen["src"]
        full = f"https:{raw}" if raw.startswith("//") else raw
        out.append(thumb_re.sub("/800px-", full))
    return out


def fetch_aircraft_images(plane: dict) -> tuple[str, list[str]]:
    aid = plane["id"]
    category = plane.get("commonsCategory") or plane.get("wikipedia") or ""
    wiki = plane.get("wikipedia") or ""
    from_cat = fetch_from_commons_category(category) if category else []
    from_art = fetch_from_wiki_media_list(wiki) if wiki else []
    seen = set()
    combined = []
    for u in from_cat + from_art:
        if u not in seen:
            seen.add(u)
            combined.append(u)
    print(f"  {aid}: {len(combined)} URLs (cat={len(from_cat)}, art={len(from_art)})")
    return aid, combined


def main():
    aircraft = json.load(open(AIRCRAFT_JSON))
    print(f"Fetching photo pool for {len(aircraft)} civilian aircraft...")
    # Try to resume from prior partial output so re-runs are cheap.
    try:
        results = json.load(open(OUT))
    except Exception:
        results = {}
    # Sequential — Wikimedia rate-limits aggressively per IP. The polite delay
    # plus 429 retry inside http_get means a full pass takes a few minutes,
    # but we get all 44 aircraft instead of 6.
    for plane in aircraft:
        aid = plane["id"]
        if results.get(aid):  # skip aircraft we already have non-empty results for
            print(f"  {aid}: cached ({len(results[aid])})")
            continue
        aid, urls = fetch_aircraft_images(plane)
        results[aid] = urls
        # Persist after each aircraft so a crash mid-run doesn't lose progress.
        with open(OUT, "w") as f:
            json.dump(results, f, indent=2)
    total = sum(len(v) for v in results.values())
    print(f"\nTotal URLs: {total}")
    with open(OUT, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"Done in {time.time() - t0:.1f}s")
