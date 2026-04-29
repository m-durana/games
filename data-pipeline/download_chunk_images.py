"""Pre-download all chunk images so judging agents can Read them locally,
avoiding Wikimedia rate-limits that would compound across parallel agents.

Reads /srv/miro/games/judging/chunk_*.json, downloads each URL to
/srv/miro/games/judging/images/chunk_NNN/img_NN.<ext>, and writes a sibling
chunk_NNN.local.json with the local paths so agents don't need to fetch.
"""
import glob
import json
import os
import sys
import time
import urllib.request
from urllib.parse import urlparse

ROOT = "/srv/miro/games"
JUDGE_DIR = f"{ROOT}/judging"
IMG_DIR = f"{JUDGE_DIR}/images"
UA = "miro-games-photo-fetcher/1.0 (mdurana@ethz.ch)"

# Images smaller than this are almost certainly Wikimedia HTML error pages.
MIN_BYTES = 5_000


def ext_for(url: str) -> str:
    p = urlparse(url).path.lower()
    for e in (".jpg", ".jpeg", ".png", ".webp"):
        if p.endswith(e):
            return e
    return ".jpg"


def download(url: str, dest: str, max_retries: int = 4) -> tuple[bool, str]:
    delay = 2.0
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
            if len(data) < MIN_BYTES:
                return False, f"too_small_{len(data)}B"
            with open(dest, "wb") as f:
                f.write(data)
            time.sleep(0.15)
            return True, "ok"
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            return False, f"http_{e.code}"
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            return False, f"err_{type(e).__name__}"
    return False, "retries_exhausted"


def process_chunk(path: str) -> tuple[int, int]:
    chunk = json.load(open(path))
    idx = chunk["chunkIndex"]
    aid = chunk["aircraftId"]
    urls = chunk["urls"]
    out_dir = f"{IMG_DIR}/chunk_{idx:03d}"
    os.makedirs(out_dir, exist_ok=True)
    local_path = f"{JUDGE_DIR}/chunk_{idx:03d}.local.json"

    # Resume support: if local manifest exists, skip URLs already downloaded.
    prior = {}
    if os.path.exists(local_path):
        prior_data = json.load(open(local_path))
        for it in prior_data.get("items", []):
            if it.get("ok"):
                prior[it["url"]] = it["path"]

    items = []
    ok_count = 0
    for i, url in enumerate(urls):
        if url in prior and os.path.exists(prior[url]) and os.path.getsize(prior[url]) >= MIN_BYTES:
            items.append({"url": url, "path": prior[url], "ok": True, "status": "cached"})
            ok_count += 1
            continue
        dest = f"{out_dir}/img_{i:02d}{ext_for(url)}"
        ok, status = download(url, dest)
        items.append({"url": url, "path": dest if ok else None, "ok": ok, "status": status})
        if ok:
            ok_count += 1

    with open(local_path, "w") as f:
        json.dump({
            "chunkIndex": idx,
            "aircraftId": aid,
            "items": items,
        }, f, indent=2)
    return ok_count, len(urls)


def main():
    paths = sorted(glob.glob(f"{JUDGE_DIR}/chunk_*.json"))
    paths = [p for p in paths if not p.endswith(".local.json") and not p.endswith(".verdicts.json")]
    if len(sys.argv) > 1:
        # subset, e.g. python3 download_chunk_images.py 0 10  → chunks 0..9
        start = int(sys.argv[1])
        end = int(sys.argv[2]) if len(sys.argv) > 2 else start + 1
        paths = paths[start:end]
    print(f"Downloading images for {len(paths)} chunks...")
    t0 = time.time()
    total_ok = 0
    total = 0
    for i, p in enumerate(paths):
        ok, n = process_chunk(p)
        total_ok += ok
        total += n
        idx = os.path.basename(p).replace("chunk_", "").replace(".json", "")
        print(f"  chunk {idx}: {ok}/{n} ok  ({total_ok}/{total} cumulative, {time.time()-t0:.0f}s)")
    print(f"\nDone: {total_ok}/{total} downloaded in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
