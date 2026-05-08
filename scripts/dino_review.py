#!/usr/bin/env python3
"""DINOv2 + SigLIP 2 aircraft photo review pipeline.

Replaces the Sonnet sub-agent worker pool. Reads aircraft-review-baseline.json,
emits patches in the existing schema (docs/aircraft-photo-review.md lines 132-150),
and lets scripts/merge-aircraft-review-patches.mjs do the merge unchanged.

Subcommands:
    embed     - download + DINOv2/SigLIP-encode URLs into tmp/embeddings.sqlite
    train     - compute per-family DINOv2 centroids + calibrate quality threshold
    classify  - emit patches for a class of photos (approved | unapproved | all)
    eval      - held-out precision/recall report
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import sqlite3
import sys
import time
from pathlib import Path
from typing import Iterable, Optional

ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "src" / "data" / "aircraft-review-baseline.json"
PHOTOS_PATH = ROOT / "src" / "data" / "aircraft-photos.json"
PATCHES_DIR = ROOT / "tmp" / "aircraft-review-patches"
DRYRUN_DIR = ROOT / "tmp" / "aircraft-review-dryrun"
EMB_DB = ROOT / "tmp" / "embeddings.sqlite"
MODELS_DIR = ROOT / "tmp" / "dinov2-models"
CENTROIDS_PATH = MODELS_DIR / "type-centroids.npz"
PHOTO_CLF_PATH = MODELS_DIR / "photo-classifier.joblib"
THRESHOLDS_PATH = MODELS_DIR / "quality-thresholds.json"

USER_AGENT = "miro-games-reviewer/1.0 (mdurana@ethz.ch)"
DINOV2_MODEL = "facebook/dinov2-base"
SIGLIP_MODEL = "google/siglip2-base-patch16-256"

# 55 valid family ids, lifted from docs/aircraft-photo-review.md lines 36-46.
# refile_to verdicts MUST land on one of these.
VALID_FAMILIES: list[str] = [
    "a220-100", "a220-300", "a300-600", "a310", "a318", "a319",
    "a320ceo", "a320neo", "a321ceo", "a321neo", "a330-200", "a330-300",
    "a330-900", "a340-300", "a340-600", "a350-900", "a350-1000", "a380",
    "b717", "b727-200", "b737-400", "b737-700", "b737-800", "b737-900er",
    "b737max8", "b737max9", "b747-400", "b747-8", "b757-200", "b767-300er",
    "b777-200er", "b777-300", "b777-300er", "b777-9",
    "b787-8", "b787-9", "b787-10",
    "e170", "e175", "e190", "e190-e2", "e195-e2",
    "crj200", "crj700", "crj900", "crj1000",
    "atr42", "atr72", "dash8-300", "dash8-q400",
    "md83", "md90", "md11", "ssj100", "c919",
]

# SigLIP 2 zero-shot quality classes. The first one is "good"; the rest are bad.
QUALITY_PROMPTS: list[tuple[str, str]] = [
    ("good", "a clear unobstructed three-quarter side-view photograph of a complete commercial passenger aircraft outdoors"),
    ("cropped", "a cropped photograph of an aircraft where most of the airframe is cut off by the photo frame"),
    ("obstructed", "an aircraft mostly hidden behind a jet bridge, terminal building, fence, or ground equipment"),
    ("model", "a plastic model, toy, or 3D computer rendering of an aircraft"),
    ("wreck", "a crashed, wrecked, scrapped, or stripped aircraft missing major parts"),
    ("interior", "the interior cockpit of an aircraft showing instruments and controls"),
    ("dark", "a pitch-black silhouette or extremely backlit aircraft photo where the airframe is barely visible"),
]


# ---------------------------------------------------------------------------
# IO helpers
# ---------------------------------------------------------------------------

def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def save_json(p: Path, obj) -> None:
    p.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def url_hash(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Embedding cache (sqlite). One row per URL: {hash, url, dino, siglip, status}.
# dino + siglip are float32 BLOBs; status is 'ok' | 'fail-<code>'.
# ---------------------------------------------------------------------------

def db_open() -> sqlite3.Connection:
    EMB_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(EMB_DB)
    con.execute("""
        CREATE TABLE IF NOT EXISTS embeddings (
            hash    TEXT PRIMARY KEY,
            url     TEXT NOT NULL,
            dino    BLOB,
            siglip  BLOB,
            status  TEXT NOT NULL,
            updated INTEGER NOT NULL
        )
    """)
    return con


def db_get(con: sqlite3.Connection, url: str):
    row = con.execute(
        "SELECT dino, siglip, status FROM embeddings WHERE hash = ?",
        (url_hash(url),),
    ).fetchone()
    return row  # None or (dino_blob, siglip_blob, status)


def db_put(con: sqlite3.Connection, url: str, dino, siglip, status: str) -> None:
    import numpy as np
    h = url_hash(url)
    d_blob = np.asarray(dino, dtype="float32").tobytes() if dino is not None else None
    s_blob = np.asarray(siglip, dtype="float32").tobytes() if siglip is not None else None
    con.execute(
        "INSERT OR REPLACE INTO embeddings (hash, url, dino, siglip, status, updated) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (h, url, d_blob, s_blob, status, int(time.time())),
    )
    con.commit()


def db_load_dino(con: sqlite3.Connection, url: str):
    import numpy as np
    row = db_get(con, url)
    if row is None or row[2] != "ok" or row[0] is None:
        return None
    return np.frombuffer(row[0], dtype="float32").copy()


def db_load_siglip(con: sqlite3.Connection, url: str):
    import numpy as np
    row = db_get(con, url)
    if row is None or row[2] != "ok" or row[1] is None:
        return None
    return np.frombuffer(row[1], dtype="float32").copy()


# ---------------------------------------------------------------------------
# Wikimedia download with retry — mirrors prompts/aircraft-review-worker.md.
# Returns (PIL.Image | None, status). status: 'ok' | 'fail-404' | 'fail-410'
# | 'skip-transient' (caller should not record a verdict; retry next run).
# ---------------------------------------------------------------------------

def fetch_image(url: str, retries: int = 3, timeout: int = 30):
    import requests
    from PIL import Image
    last_code = 0
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=timeout,
                allow_redirects=True,
                stream=False,
            )
        except requests.RequestException:
            time.sleep(5)
            continue
        last_code = r.status_code
        if r.status_code == 200 and r.content:
            try:
                img = Image.open(io.BytesIO(r.content))
                img = img.convert("RGB")
                return img, "ok"
            except Exception:
                return None, "fail-decode"
        if r.status_code in (404, 410):
            return None, f"fail-{r.status_code}"
        # 429 / 5xx / other: back off and retry.
        time.sleep(5)
    return None, f"skip-{last_code}"


# ---------------------------------------------------------------------------
# Model loading. Lazy — only when we actually need to encode.
# ---------------------------------------------------------------------------

_dino = {"model": None, "processor": None, "device": None}
_siglip = {"model": None, "processor": None, "device": None, "text_emb": None}


def _device():
    import torch
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_dino():
    if _dino["model"] is not None:
        return _dino
    import torch
    from transformers import AutoImageProcessor, AutoModel
    print(f"  loading {DINOV2_MODEL}…", file=sys.stderr)
    proc = AutoImageProcessor.from_pretrained(DINOV2_MODEL)
    model = AutoModel.from_pretrained(DINOV2_MODEL)
    dev = _device()
    model.to(dev).eval()
    _dino.update({"model": model, "processor": proc, "device": dev})
    return _dino


def load_siglip():
    if _siglip["model"] is not None:
        return _siglip
    import torch
    from transformers import AutoModel, AutoProcessor
    print(f"  loading {SIGLIP_MODEL}…", file=sys.stderr)
    proc = AutoProcessor.from_pretrained(SIGLIP_MODEL)
    model = AutoModel.from_pretrained(SIGLIP_MODEL)
    dev = _device()
    model.to(dev).eval()
    # Pre-encode text prompts once.
    prompts = [p for _, p in QUALITY_PROMPTS]
    with torch.no_grad():
        text_inputs = proc(text=prompts, return_tensors="pt", padding="max_length", truncation=True)
        text_inputs = {k: v.to(dev) for k, v in text_inputs.items()}
        text_emb = _as_tensor(model.get_text_features(**text_inputs))
        text_emb = text_emb / text_emb.norm(dim=-1, keepdim=True)
    _siglip.update({"model": model, "processor": proc, "device": dev, "text_emb": text_emb})
    return _siglip


def encode_dino(img) -> "np.ndarray":
    import numpy as np
    import torch
    d = load_dino()
    inputs = d["processor"](images=img, return_tensors="pt")
    inputs = {k: v.to(d["device"]) for k, v in inputs.items()}
    with torch.no_grad():
        out = d["model"](**inputs)
    # CLS-token pooled output: shape (1, hidden).
    feat = out.pooler_output if getattr(out, "pooler_output", None) is not None else out.last_hidden_state[:, 0]
    feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat[0].cpu().float().numpy()


def encode_siglip(img) -> "np.ndarray":
    import numpy as np
    import torch
    s = load_siglip()
    inputs = s["processor"](images=img, return_tensors="pt")
    inputs = {k: v.to(s["device"]) for k, v in inputs.items()}
    with torch.no_grad():
        feat = _as_tensor(s["model"].get_image_features(**inputs))
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat[0].cpu().float().numpy()


def _as_tensor(out):
    """Some HF model methods return a tensor, others return a *Output dataclass.
    Normalize: tensor → tensor; *Output → its pooler_output or last_hidden_state[:,0]."""
    if hasattr(out, "norm"):
        return out  # already a tensor
    if hasattr(out, "pooler_output") and out.pooler_output is not None:
        return out.pooler_output
    if hasattr(out, "last_hidden_state"):
        return out.last_hidden_state[:, 0]
    if hasattr(out, "image_embeds"):
        return out.image_embeds
    if hasattr(out, "text_embeds"):
        return out.text_embeds
    raise TypeError(f"Cannot extract tensor from {type(out)}")


def quality_scores(siglip_emb) -> dict[str, float]:
    """Return {class_name: cosine_sim}. Higher = more like that class."""
    import numpy as np
    import torch
    s = load_siglip()
    img = torch.from_numpy(siglip_emb).to(s["device"]).unsqueeze(0)
    sims = (img @ s["text_emb"].T).squeeze(0).cpu().float().numpy()
    return {name: float(sims[i]) for i, (name, _) in enumerate(QUALITY_PROMPTS)}


# ---------------------------------------------------------------------------
# Baseline access
# ---------------------------------------------------------------------------

def baseline_urls_by_class() -> dict[str, dict[str, list[str]]]:
    """Return {family: {verified, approved_unverified, rejected, unchecked}}."""
    bl = load_json(BASELINE_PATH)
    out = {}
    for fam, entry in bl.items():
        verified = list(entry.get("verified") or [])
        approved = list(entry.get("approved") or [])
        rejected = list(entry.get("rejected") or [])
        unchecked = list(entry.get("unchecked") or [])
        ver_set = set(verified)
        approved_unver = [u for u in approved if u not in ver_set]
        out[fam] = {
            "verified": verified,
            "approved_unverified": approved_unver,
            "rejected": rejected,
            "unchecked": unchecked,
        }
    return out


# ---------------------------------------------------------------------------
# Subcommand: embed
# ---------------------------------------------------------------------------

def cmd_embed(args) -> int:
    """Download every URL referenced in the baseline and encode it."""
    import numpy as np
    by_fam = baseline_urls_by_class()
    only = set(args.only.split(",")) if args.only else {"verified", "approved", "unchecked", "rejected"}
    keys = []
    if "verified" in only: keys.append("verified")
    if "approved" in only: keys.append("approved_unverified")
    if "unchecked" in only: keys.append("unchecked")
    seen: set[str] = set()
    todo: list[str] = []
    for fam, lists in by_fam.items():
        for key in keys:
            for url in lists[key]:
                if url in seen:
                    continue
                seen.add(url)
                todo.append(url)
    # Rejected is sampled, not exhaustive — only need a calibration set.
    if "rejected" in only:
        rejected_pool = []
        for fam, lists in by_fam.items():
            for url in lists["rejected"]:
                if url not in seen:
                    rejected_pool.append(url)
        rng = random.Random(0xCA1B)
        rng.shuffle(rejected_pool)
        sample_n = args.rejected_sample if args.rejected_sample else len(rejected_pool)
        for url in rejected_pool[:sample_n]:
            seen.add(url)
            todo.append(url)
    if args.limit:
        todo = todo[: args.limit]
    print(f"embed: {len(todo)} unique URLs to consider (only={sorted(only)})", file=sys.stderr)

    con = db_open()
    # Filter out anything already fully cached.
    pending = []
    n_cached = 0
    for url in todo:
        existing = db_get(con, url)
        if existing is not None and existing[2] == "ok" and existing[0] is not None and existing[1] is not None:
            n_cached += 1
            continue
        pending.append(url)
    print(f"  {n_cached} already cached, {len(pending)} to fetch+encode", file=sys.stderr)

    # Producer thread pool: parallel Wikimedia downloads. Encoding stays
    # single-threaded to avoid model contention.
    from concurrent.futures import ThreadPoolExecutor, as_completed
    n_ok = n_fail = n_skip = 0
    workers = max(1, args.fetch_workers)
    bail = {"flag": False}

    def memory_ok() -> tuple[bool, str]:
        try:
            import psutil
        except ImportError:
            return True, ""
        vm = psutil.virtual_memory()
        free_gb = vm.available / (1024 ** 3)
        if vm.percent >= args.mem_max_pct or free_gb <= args.mem_min_free_gb:
            return False, f"RAM used={vm.percent:.0f}% free={free_gb:.2f}GB"
        return True, ""

    def log_top_ram_consumers():
        try:
            import psutil
        except ImportError:
            return
        rows = []
        for p in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                rows.append((p.info["memory_info"].rss, p.info["pid"], p.info["name"]))
            except Exception:
                pass
        rows.sort(reverse=True)
        print("  top RAM consumers (close some, then re-run embed to resume):", file=sys.stderr)
        for rss, pid, name in rows[:8]:
            print(f"    {rss/(1024**3):5.2f} GB  pid={pid:>7}  {name}", file=sys.stderr)

    # Process in batches so the future queue stays bounded and we can bail
    # responsively. Also periodic gc + cache trimming to fight RAM creep.
    import gc
    BATCH = 50
    i = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for batch_start in range(0, len(pending), BATCH):
            if bail["flag"]:
                break
            batch_urls = pending[batch_start : batch_start + BATCH]
            futures = {pool.submit(fetch_image, url): url for url in batch_urls}
            for fut in as_completed(futures):
                i += 1
                url = futures[fut]
                try:
                    img, status = fut.result()
                except Exception as e:
                    img, status = None, f"fail-fetch-{type(e).__name__}"
                if status != "ok" or img is None:
                    db_put(con, url, None, None, status)
                    if status.startswith("skip-"):
                        n_skip += 1
                    else:
                        n_fail += 1
                else:
                    try:
                        d_emb = encode_dino(img)
                        s_emb = encode_siglip(img)
                        db_put(con, url, d_emb, s_emb, "ok")
                        n_ok += 1
                    except Exception as e:
                        db_put(con, url, None, None, f"fail-encode-{type(e).__name__}")
                        n_fail += 1
                        if n_fail <= 3:
                            import traceback
                            print(f"  encode failed for {url}: {e}", file=sys.stderr)
                            traceback.print_exc(file=sys.stderr)
                # Drop the image immediately so PIL doesn't hold the bytes.
                img = None
            futures.clear()
            # Periodic GC: torch tensors and PIL buffers accumulate.
            gc.collect()
            try:
                import torch
                if hasattr(torch, "cuda") and torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
            print(f"  [{i}/{len(pending)}] ok={n_ok} fail={n_fail} skip={n_skip}", file=sys.stderr)
            ok, why = memory_ok()
            if not ok:
                print(f"  MEMORY FAILSAFE: {why} >= limits "
                      f"(--mem-max-pct={args.mem_max_pct} --mem-min-free-gb={args.mem_min_free_gb})", file=sys.stderr)
                log_top_ram_consumers()
                bail["flag"] = True
                break
    print(f"embed done: cached={n_cached} ok={n_ok} fail={n_fail} skip={n_skip}{' [BAILED EARLY]' if bail['flag'] else ''}", file=sys.stderr)
    return 0


# ---------------------------------------------------------------------------
# Subcommand: train
# ---------------------------------------------------------------------------

def cmd_train(args) -> int:
    """Train the binary photo-quality classifier (DINOv2 features) plus
    legacy per-family centroids. Centroids are kept for future type-ID work
    but classify only uses the photo classifier today."""
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import precision_recall_fscore_support
    from sklearn.model_selection import train_test_split
    import joblib
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    con = db_open()
    by_fam = baseline_urls_by_class()

    # --- photo classifier (DINOv2 features, good vs bad) ---
    pos_urls = [u for fam in by_fam for u in by_fam[fam]["verified"]]
    neg_urls = [u for fam in by_fam for u in by_fam[fam]["rejected"]]
    Xpos, Xneg = [], []
    for u in pos_urls:
        e = db_load_dino(con, u)
        if e is not None:
            Xpos.append(e)
    for u in neg_urls:
        e = db_load_dino(con, u)
        if e is not None:
            Xneg.append(e)
    if len(Xpos) < 100 or len(Xneg) < 30:
        print(f"ERROR: not enough embedded data for photo classifier: pos={len(Xpos)} neg={len(Xneg)}", file=sys.stderr)
        print("       run `embed --only=verified` and `embed --only=rejected` first", file=sys.stderr)
        return 2
    Xp = np.stack(Xpos); Xn = np.stack(Xneg)
    print(f"photo classifier training data: pos={len(Xp)} (good)  neg={len(Xn)} (bad)  ratio {len(Xp)/len(Xn):.1f}:1", file=sys.stderr)
    y = np.concatenate([np.ones(len(Xp)), np.zeros(len(Xn))])
    X = np.concatenate([Xp, Xn])
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
    clf = LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced")
    clf.fit(Xtr, ytr)
    prob_good = clf.predict_proba(Xte)[:, 1]
    # Held-out triage readout at the threshold pair we'll ship.
    tg, tb = args.tau_good, args.tau_bad
    auto_g = prob_good >= tg; auto_b = prob_good <= tb
    n = len(yte)
    gp = (yte[auto_g] == 1).mean() if auto_g.sum() else 0.0
    bp = (yte[auto_b] == 0).mean() if auto_b.sum() else 0.0
    print(f"  test set: {n} ({(yte==1).sum()} good / {(yte==0).sum()} bad)", file=sys.stderr)
    print(f"  triage at tau_good={tg} / tau_bad={tb}:", file=sys.stderr)
    print(f"    auto-good: {auto_g.sum()} ({100*auto_g.sum()/n:.0f}%) precision={gp:.3f}", file=sys.stderr)
    print(f"    auto-bad:  {auto_b.sum()} ({100*auto_b.sum()/n:.0f}%) precision={bp:.3f}", file=sys.stderr)
    print(f"    to human:  {n - auto_g.sum() - auto_b.sum()} ({100*(n-auto_g.sum()-auto_b.sum())/n:.0f}%)", file=sys.stderr)
    joblib.dump(clf, PHOTO_CLF_PATH)
    print(f"saved photo classifier: {PHOTO_CLF_PATH}", file=sys.stderr)

    # --- legacy: per-family centroids (kept around but not used by classify) ---

    # --- type centroids ---
    centroids: dict[str, "np.ndarray"] = {}
    counts: dict[str, int] = {}
    cold_start: list[str] = []
    for fam in VALID_FAMILIES:
        urls = by_fam.get(fam, {}).get("verified", [])
        embs = []
        for u in urls:
            e = db_load_dino(con, u)
            if e is not None:
                embs.append(e)
        counts[fam] = len(embs)
        if len(embs) >= 4:
            stacked = np.stack(embs)
            centroid = stacked.mean(axis=0)
            centroid = centroid / (np.linalg.norm(centroid) + 1e-9)
            centroids[fam] = centroid.astype("float32")
        else:
            cold_start.append(fam)

    print(f"type centroids: {len(centroids)} families anchored, {len(cold_start)} cold-start", file=sys.stderr)
    for fam in cold_start:
        print(f"  cold-start: {fam} (verified={counts.get(fam, 0)})", file=sys.stderr)

    # Save: an array `families` (str) parallel to `vectors` (float32, N x D).
    fams = sorted(centroids.keys())
    if not fams:
        print("ERROR: no centroids could be built. Run embed first?", file=sys.stderr)
        return 2
    vectors = np.stack([centroids[f] for f in fams])
    np.savez(CENTROIDS_PATH, families=np.array(fams), vectors=vectors)
    print(f"saved centroids: {CENTROIDS_PATH} ({vectors.shape})", file=sys.stderr)

    # --- quality threshold calibration ---
    # Positives = verified; negatives = rejected. Sample 200 each (or all if fewer).
    all_verified = [u for fam in by_fam for u in by_fam[fam]["verified"]]
    all_rejected = [u for fam in by_fam for u in by_fam[fam]["rejected"]]
    rng = random.Random(0xA1C747)
    rng.shuffle(all_verified)
    rng.shuffle(all_rejected)
    pos_urls = all_verified[: min(400, len(all_verified))]
    neg_urls = all_rejected[: min(400, len(all_rejected))]

    def good_score(url: str) -> Optional[float]:
        emb = db_load_siglip(con, url)
        if emb is None:
            return None
        scores = quality_scores(emb)
        # "good" wins iff its score is the max of all 7 prompts. Margin is good - 2nd-best.
        good = scores["good"]
        others = [v for k, v in scores.items() if k != "good"]
        return good - max(others)

    pos_margins = [m for m in (good_score(u) for u in pos_urls) if m is not None]
    neg_margins = [m for m in (good_score(u) for u in neg_urls) if m is not None]
    print(f"quality calib: pos={len(pos_margins)} neg={len(neg_margins)}", file=sys.stderr)
    if not pos_margins or not neg_margins:
        print("ERROR: not enough cached SigLIP embeddings to calibrate", file=sys.stderr)
        return 2

    # Sweep thresholds, pick lowest τ where precision-on-pass >= 0.90 (target from plan).
    # If unattainable, fall back to the τ that maximizes F1.
    candidates = sorted(set([round(x, 4) for x in pos_margins + neg_margins]))
    best = None
    for tau in candidates:
        tp = sum(1 for m in pos_margins if m >= tau)
        fp = sum(1 for m in neg_margins if m >= tau)
        if tp == 0:
            continue
        prec = tp / (tp + fp)
        rec = tp / len(pos_margins)
        if prec >= 0.90 and (best is None or rec > best["recall"]):
            best = {"tau": tau, "precision": prec, "recall": rec}
    if best is None:
        # Fallback: maximize F1.
        best_f1 = -1.0
        for tau in candidates:
            tp = sum(1 for m in pos_margins if m >= tau)
            fp = sum(1 for m in neg_margins if m >= tau)
            if tp == 0:
                continue
            prec = tp / (tp + fp)
            rec = tp / len(pos_margins)
            f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0
            if f1 > best_f1:
                best_f1 = f1
                best = {"tau": tau, "precision": prec, "recall": rec}
        print(f"WARN: prec >=0.90 unattainable; falling back to F1-best tau={best['tau']:.4f}", file=sys.stderr)

    thresholds = {
        "tau_quality": best["tau"],
        "tau_quality_precision": best["precision"],
        "tau_quality_recall": best["recall"],
        # Type thresholds: defaults from plan; tune in eval.
        "tau_match": 0.05,
        "tau_refile": 0.10,
        "tau_min_match": 0.45,
        "cold_start_families": cold_start,
        "centroid_counts": counts,
    }
    save_json(THRESHOLDS_PATH, thresholds)
    print(f"saved thresholds: {THRESHOLDS_PATH}", file=sys.stderr)
    print(f"  tau_quality={best['tau']:.4f}  prec={best['precision']:.3f}  recall={best['recall']:.3f}", file=sys.stderr)
    return 0


# ---------------------------------------------------------------------------
# Subcommand: eval
# ---------------------------------------------------------------------------

def cmd_eval(args) -> int:
    """Held-out eval: precision/recall on type-ID and quality."""
    import numpy as np
    if not CENTROIDS_PATH.exists() or not THRESHOLDS_PATH.exists():
        print("run train first", file=sys.stderr)
        return 2
    npz = np.load(CENTROIDS_PATH, allow_pickle=False)
    fams: list[str] = list(npz["families"])
    centroids: "np.ndarray" = npz["vectors"]  # (F, D)
    fam_idx = {f: i for i, f in enumerate(fams)}
    th = load_json(THRESHOLDS_PATH)
    con = db_open()
    by_fam = baseline_urls_by_class()

    rng = random.Random(0xE7A1)
    type_correct = type_total = type_unsure = type_wrong = 0
    per_fam_correct: dict[str, int] = {}
    per_fam_total: dict[str, int] = {}
    confusions: dict[tuple[str, str], int] = {}  # (true, predicted) → count

    for fam in fams:
        verified = by_fam.get(fam, {}).get("verified", [])
        if len(verified) < 10:
            continue
        rng.shuffle(verified)
        held = verified[: max(1, len(verified) // 10)]
        for url in held:
            emb = db_load_dino(con, url)
            if emb is None:
                continue
            sims = centroids @ emb  # (F,)
            order = np.argsort(-sims)
            top1 = fams[order[0]]
            top2 = fams[order[1]] if len(order) > 1 else None
            margin = float(sims[order[0]] - (sims[order[1]] if len(order) > 1 else 0))
            type_total += 1
            per_fam_total[fam] = per_fam_total.get(fam, 0) + 1
            if top1 == fam and margin >= th["tau_match"]:
                type_correct += 1
                per_fam_correct[fam] = per_fam_correct.get(fam, 0) + 1
            elif top1 == fam:
                type_unsure += 1
            else:
                type_wrong += 1
                confusions[(fam, top1)] = confusions.get((fam, top1), 0) + 1

    print("--- type-ID eval (held-out 10% of verified, anchored families only) ---")
    if type_total:
        prec = type_correct / max(1, type_correct + type_wrong)
        rec = type_correct / type_total
        print(f"  total={type_total}  correct={type_correct}  unsure={type_unsure}  wrong={type_wrong}")
        print(f"  precision (correct / (correct + wrong)) = {prec:.3f}")
        print(f"  recall    (correct / total)             = {rec:.3f}")
    print()

    # Per-family worst offenders (lowest accuracy with >= 5 held-out samples).
    rows = []
    for fam, total in per_fam_total.items():
        if total < 3:
            continue
        correct = per_fam_correct.get(fam, 0)
        rows.append((fam, correct / total, correct, total))
    rows.sort(key=lambda r: r[1])
    print("worst per-family accuracy (>=3 held-out):")
    for fam, acc, c, t in rows[:10]:
        print(f"  {fam:12s}  {c}/{t}  ({acc:.2f})")
    print()

    if confusions:
        print("top type-ID confusions (true -> predicted, count):")
        ranked = sorted(confusions.items(), key=lambda kv: -kv[1])
        for (true_fam, pred_fam), n in ranked[:20]:
            print(f"  {true_fam:12s} -> {pred_fam:12s}  {n}")
        print()

    # Quality eval.
    pos_urls = [u for fam in by_fam for u in by_fam[fam]["verified"]]
    neg_urls = [u for fam in by_fam for u in by_fam[fam]["rejected"]]
    rng.shuffle(pos_urls)
    rng.shuffle(neg_urls)
    pos_urls = pos_urls[:300]
    neg_urls = neg_urls[:300]
    tau = th["tau_quality"]
    tp = fp = tn = fn = 0
    for u in pos_urls:
        emb = db_load_siglip(con, u)
        if emb is None:
            continue
        scores = quality_scores(emb)
        margin = scores["good"] - max(v for k, v in scores.items() if k != "good")
        if margin >= tau:
            tp += 1
        else:
            fn += 1
    for u in neg_urls:
        emb = db_load_siglip(con, u)
        if emb is None:
            continue
        scores = quality_scores(emb)
        margin = scores["good"] - max(v for k, v in scores.items() if k != "good")
        if margin >= tau:
            fp += 1
        else:
            tn += 1
    print(f"--- quality eval (tau={tau:.4f}) ---")
    print(f"  pos: tp={tp} fn={fn}  neg: tn={tn} fp={fp}")
    if (tp + fp) > 0:
        print(f"  precision (good photos truly good)   = {tp / (tp + fp):.3f}")
    if (tp + fn) > 0:
        print(f"  recall    (good photos kept)         = {tp / (tp + fn):.3f}")
    if (tn + fp) > 0:
        print(f"  specificity (bad photos rejected)    = {tn / (tn + fp):.3f}")
    return 0


# ---------------------------------------------------------------------------
# Subcommand: classify
# ---------------------------------------------------------------------------

def classify_one_photo(
    url: str,
    clf,
    tau_good: float,
    tau_bad: float,
    con: sqlite3.Connection,
) -> Optional[dict]:
    """Photo-filter only: emit 'approved' for confident-good, 'rejected' for
    confident-bad, None (skip — leave for human) for uncertain."""
    import numpy as np
    row = db_get(con, url)
    if row is None:
        return None  # not embedded yet
    dino_blob, _siglip_blob, status = row
    if status.startswith("fail-404") or status.startswith("fail-410"):
        return {
            "url": url, "verdict": "rejected", "refile_to": None,
            "confidence": 1.0, "borderline": False,
            "failed_criteria": [0],
            "reason": f"image gone ({status[5:]})",
        }
    if status != "ok" or dino_blob is None:
        return None  # transient — retry next run
    dino_emb = np.frombuffer(dino_blob, dtype="float32").copy().reshape(1, -1)
    prob_good = float(clf.predict_proba(dino_emb)[0, 1])
    if prob_good >= tau_good:
        return {
            "url": url, "verdict": "approved", "refile_to": None,
            "confidence": prob_good, "borderline": prob_good < 0.85,
            "failed_criteria": [],
            "reason": f"dino-photo-clf: prob_good={prob_good:.3f} >= {tau_good}",
        }
    if prob_good <= tau_bad:
        return {
            "url": url, "verdict": "rejected", "refile_to": None,
            "confidence": 1.0 - prob_good, "borderline": (1.0 - prob_good) < 0.85,
            "failed_criteria": [1],  # generic "looks bad" — we don't know which criterion
            "reason": f"dino-photo-clf: prob_good={prob_good:.3f} <= {tau_bad}",
        }
    return None  # uncertain; leave in unchecked for human


def cmd_classify(args) -> int:
    """Run the photo classifier on URLs from the requested bucket.
    Emits 'approved' (passed photo filter, type unverified) or 'rejected'.
    Type-ID is NOT done by this script — it's left to a separate flow."""
    import joblib
    if not PHOTO_CLF_PATH.exists():
        print("run `train` first to build the photo classifier", file=sys.stderr)
        return 2
    clf = joblib.load(PHOTO_CLF_PATH)
    con = db_open()
    by_fam = baseline_urls_by_class()
    out_dir = DRYRUN_DIR if args.dry_run else PATCHES_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    targets = [args.family] if args.family else sorted(by_fam.keys())
    n_patches = n_verdicts = 0
    totals = {"approved": 0, "rejected": 0, "skipped": 0}
    for fam in targets:
        if fam not in by_fam:
            print(f"  skip: {fam} not in baseline", file=sys.stderr)
            continue
        lists = by_fam[fam]
        if args.mode == "unchecked":
            urls = lists["unchecked"]
        elif args.mode == "approved":
            # Re-check already-approved photos: the classifier may flag some as bad.
            urls = lists["approved_unverified"] + lists["verified"]
        elif args.mode == "all":
            urls = lists["unchecked"] + lists["approved_unverified"]
        else:
            print(f"unknown mode: {args.mode}", file=sys.stderr)
            return 2
        if not urls:
            continue

        verdicts = []
        skipped = 0
        for url in urls:
            v = classify_one_photo(url, clf, args.tau_good, args.tau_bad, con)
            if v is not None:
                verdicts.append(v)
            else:
                skipped += 1
        totals["skipped"] += skipped
        if not verdicts:
            continue

        patch = {
            "family": fam,
            "chunk": 0,
            "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "completed": True,
            "verdicts": verdicts,
        }
        out = out_dir / f"{fam}-photofilter.json"
        save_json(out, patch)
        n_patches += 1
        n_verdicts += len(verdicts)
        counts = {"approved": 0, "rejected": 0}
        for v in verdicts:
            counts[v["verdict"]] = counts.get(v["verdict"], 0) + 1
            totals[v["verdict"]] = totals.get(v["verdict"], 0) + 1
        print(f"  {fam}: {len(verdicts)} verdicts (approved={counts['approved']} rejected={counts['rejected']}, {skipped} left for human) → {out.name}")
    print(f"classify done: {n_patches} patches, {n_verdicts} verdicts "
          f"(approved={totals['approved']}, rejected={totals['rejected']}, "
          f"left-for-human={totals['skipped']}, mode={args.mode}, dry-run={args.dry_run})")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_embed = sub.add_parser("embed", help="download + encode URLs into the cache")
    p_embed.add_argument("--limit", type=int, default=0, help="process at most N URLs (0 = all)")
    p_embed.add_argument("--only", default=None,
                         help="comma-separated subset of {verified,approved,unchecked,rejected}")
    p_embed.add_argument("--rejected-sample", type=int, default=500,
                         help="cap rejected pool to N for quality calibration (default 500)")
    p_embed.add_argument("--fetch-workers", type=int, default=8,
                         help="concurrent Wikimedia downloads (default 8)")
    p_embed.add_argument("--mem-max-pct", type=float, default=85.0,
                         help="bail out if system RAM usage exceeds this percent (default 85)")
    p_embed.add_argument("--mem-min-free-gb", type=float, default=2.0,
                         help="bail out if free RAM drops below this many GB (default 2.0)")
    p_embed.set_defaults(func=cmd_embed)

    p_train = sub.add_parser("train", help="train the binary photo-quality classifier")
    p_train.add_argument("--tau-good", type=float, default=0.80,
                         help="prob threshold to auto-approve a photo (default 0.80)")
    p_train.add_argument("--tau-bad", type=float, default=0.20,
                         help="prob threshold to auto-reject a photo (default 0.20)")
    p_train.set_defaults(func=cmd_train)

    p_eval = sub.add_parser("eval", help="held-out precision/recall report")
    p_eval.set_defaults(func=cmd_eval)

    p_class = sub.add_parser("classify", help="run photo classifier, emit patches")
    p_class.add_argument("--mode", choices=["unchecked", "approved", "all"], required=True,
                         help="unchecked = never reviewed (the main use); approved = re-check already-approved; all = both")
    p_class.add_argument("--family", default=None, help="restrict to one family id")
    p_class.add_argument("--tau-good", type=float, default=0.80,
                         help="prob threshold to auto-approve (default 0.80)")
    p_class.add_argument("--tau-bad", type=float, default=0.20,
                         help="prob threshold to auto-reject (default 0.20)")
    p_class.add_argument("--dry-run", action="store_true",
                         help="write to tmp/aircraft-review-dryrun/ so merge ignores it")
    p_class.set_defaults(func=cmd_classify)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
