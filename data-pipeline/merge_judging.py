"""Merge per-chunk verdict files (chunk_NNN.verdicts.json) back into the user's
aircraft-review JSON, then emit aircraft-photos.json (curated approved-only,
mirroring military-photos.json).

Inputs:
  /srv/miro/games/aircraft-review-current.json — user's localStorage export
                                                  (falls back to baseline if absent)
  /srv/miro/games/judging/chunk_NNN.verdicts.json — one per chunk, written by agents

Outputs:
  /srv/miro/games/src/data/aircraft-review-baseline.json — committed baseline, importable
  /srv/miro/games/src/data/aircraft-photos.json — { id: [approved url, ...] }
"""
import glob
import json
import os
import re

ROOT = "/srv/miro/games"
REVIEW_IN = f"{ROOT}/aircraft-review-current.json"
REVIEW_OUT = f"{ROOT}/src/data/aircraft-review-baseline.json"
PHOTOS_OUT = f"{ROOT}/src/data/aircraft-photos.json"
VERDICTS_GLOB = f"{ROOT}/judging/chunk_*.verdicts.json"

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
    # Prefer a fresh export from the browser; fall back to the committed baseline
    # so re-runs work even if the user hasn't re-exported localStorage.
    review_src = REVIEW_IN if os.path.exists(REVIEW_IN) else REVIEW_OUT
    review = json.load(open(review_src))
    print(f"Loading review from {review_src}")

    files = sorted(glob.glob(VERDICTS_GLOB))
    if not files:
        print(f"No verdicts found at {VERDICTS_GLOB}")
        return
    print(f"Merging {len(files)} verdict files...")

    added_approved = 0
    added_rejected = 0
    missing_aircraft = 0

    for path in files:
        data = json.load(open(path))
        aid = data["aircraftId"]
        verdicts = data["verdicts"]  # [{url, verdict: 'good'|'not_good', reason?}]
        entry = review.setdefault(aid, {
            "approved": [], "rejected": [], "verified": [], "fetchedCount": 0,
        })
        existing_canon = {canon(u) for u in entry.get("approved", []) + entry.get("rejected", [])}
        for v in verdicts:
            url = v["url"]
            c = canon(url)
            if c in existing_canon:
                continue
            existing_canon.add(c)
            if v["verdict"] == "good":
                entry.setdefault("approved", []).append(url)
                added_approved += 1
            else:
                entry.setdefault("rejected", []).append(url)
                added_rejected += 1

    with open(REVIEW_OUT, "w") as f:
        json.dump(review, f, indent=2)
    print(f"Added {added_approved} approved, {added_rejected} rejected")
    print(f"Wrote {REVIEW_OUT}")

    # Curated photos = all approved URLs per aircraft.
    photos = {aid: list(entry.get("approved", [])) for aid, entry in review.items()
              if entry.get("approved")}
    with open(PHOTOS_OUT, "w") as f:
        json.dump(photos, f, indent=2)
    total = sum(len(v) for v in photos.values())
    print(f"Wrote {PHOTOS_OUT}: {len(photos)} aircraft, {total} curated URLs")


if __name__ == "__main__":
    main()
