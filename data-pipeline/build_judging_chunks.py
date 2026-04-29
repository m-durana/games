"""Diff the freshly fetched URL pool against the user's aircraft-review export
and emit per-chunk JSON files for Sonnet sub-agents to judge.

Inputs:
  /srv/miro/games/aircraft-photo-pool.json     — output of fetch_aircraft_photos.py
  /srv/miro/games/aircraft-review-current.json — user's localStorage export

Outputs:
  /srv/miro/games/judging/chunk_NNN.json       — { aircraftId, chunkIndex, urls: [...] }
  /srv/miro/games/judging/manifest.json        — overall plan
"""
import json
import os
import re

ROOT = "/srv/miro/games"
POOL = f"{ROOT}/aircraft-photo-pool.json"
REVIEW = f"{ROOT}/aircraft-review-current.json"
BASELINE = f"{ROOT}/src/data/aircraft-review-baseline.json"
OUT_DIR = f"{ROOT}/judging"

CHUNK_SIZE = 40  # URLs per agent — keeps each agent's image-Read load manageable

THUMB_RE = re.compile(r"/\d{1,5}px-[^/]+$")


def canon(u: str) -> str:
    if not u:
        return ""
    s = THUMB_RE.sub("", u)
    last = s.rsplit("/", 1)[-1]
    try:
        from urllib.parse import unquote
        return unquote(last).lower()
    except Exception:
        return last.lower()


def main():
    pool = json.load(open(POOL))
    # Prefer a fresh export from the browser; fall back to the committed baseline.
    review_src = REVIEW if os.path.exists(REVIEW) else BASELINE
    review = json.load(open(review_src))
    print(f"Loading review from {review_src}")
    os.makedirs(OUT_DIR, exist_ok=True)
    # Wipe any stale chunks from a prior run.
    for fn in os.listdir(OUT_DIR):
        if fn.startswith("chunk_") or fn == "manifest.json":
            os.remove(os.path.join(OUT_DIR, fn))

    chunks = []
    chunk_idx = 0
    per_aircraft_unjudged = {}
    total_pool = 0
    total_judged = 0
    total_unjudged = 0

    for aid, urls in pool.items():
        total_pool += len(urls)
        entry = review.get(aid) or {}
        judged = set()
        for u in entry.get("approved", []) + entry.get("rejected", []):
            judged.add(canon(u))
        total_judged += len(judged)

        # Dedupe within pool by canon, in original order.
        seen_pool = set()
        unjudged = []
        for u in urls:
            c = canon(u)
            if c in seen_pool or c in judged:
                continue
            seen_pool.add(c)
            unjudged.append(u)
        total_unjudged += len(unjudged)
        per_aircraft_unjudged[aid] = len(unjudged)

        # Split into chunks.
        for i in range(0, len(unjudged), CHUNK_SIZE):
            chunk_urls = unjudged[i:i + CHUNK_SIZE]
            chunk = {
                "chunkIndex": chunk_idx,
                "aircraftId": aid,
                "urls": chunk_urls,
            }
            with open(f"{OUT_DIR}/chunk_{chunk_idx:03d}.json", "w") as f:
                json.dump(chunk, f, indent=2)
            chunks.append({
                "chunkIndex": chunk_idx,
                "aircraftId": aid,
                "count": len(chunk_urls),
            })
            chunk_idx += 1

    manifest = {
        "totals": {
            "pool": total_pool,
            "alreadyJudged": total_judged,
            "unjudged": total_unjudged,
            "chunks": len(chunks),
            "chunkSize": CHUNK_SIZE,
        },
        "perAircraftUnjudged": per_aircraft_unjudged,
        "chunks": chunks,
    }
    with open(f"{OUT_DIR}/manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Pool URLs: {total_pool}")
    print(f"Already judged: {total_judged}")
    print(f"Unjudged → to dispatch: {total_unjudged}")
    print(f"Chunks: {len(chunks)} × ~{CHUNK_SIZE} URLs each")
    print(f"\nManifest: {OUT_DIR}/manifest.json")


if __name__ == "__main__":
    main()
