#!/usr/bin/env python3
"""Full fine-tune DINOv2 on our verified aircraft photos for type-ID.

Why this exists: frozen-backbone linear probe topped out at 30% precision.
DINOv2 paper itself notes linear probes underperform on fine-grained tasks.
Unfreezing the backbone (with layer-wise LR decay) is the standard recipe.

Designed to run on Colab/Kaggle T4 (~30 min) or local CPU (slow but works).

Subcommands:
    download   - cache verified URLs to tmp/img-cache/<family>/<hash>.jpg
    train      - fine-tune; saves tmp/dinov2-models/finetuned-typeid.pt
    classify   - emit type-ID patches using the fine-tuned checkpoint

Outputs a checkpoint that scripts/dino_review.py classify reads to add type
verdicts (verified/refile/unsure) to the existing photo-filter patches.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import random
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "src" / "data" / "aircraft-review-baseline.json"
IMG_CACHE = ROOT / "tmp" / "img-cache"
MODELS_DIR = ROOT / "tmp" / "dinov2-models"
CKPT_PATH = MODELS_DIR / "finetuned-typeid.pt"
PATCHES_DIR = ROOT / "tmp" / "aircraft-review-patches"

USER_AGENT = "miro-games-reviewer/1.0 (mdurana@ethz.ch)"
DINOV2_MODEL = "facebook/dinov2-base"  # 86M params, 768-dim
MIN_VERIFIED = 4  # families with fewer = cold-start, skipped


def url_hash(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def load_baseline():
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 1. Download verified images to local cache
# ---------------------------------------------------------------------------

def cache_path(family: str, url: str) -> Path:
    return IMG_CACHE / family / f"{url_hash(url)}.jpg"


def fetch_one(url: str, family: str, session) -> tuple[str, str]:
    p = cache_path(family, url)
    if p.exists() and p.stat().st_size > 0:
        return ("cached", url)
    p.parent.mkdir(parents=True, exist_ok=True)
    last_status = "err-unknown"
    for attempt in range(4):
        try:
            r = session.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
            if r.status_code == 200:
                from PIL import Image
                try:
                    Image.open(io.BytesIO(r.content)).verify()
                except Exception:
                    return ("fail-corrupt", url)
                p.write_bytes(r.content)
                return ("ok", url)
            if r.status_code == 429 or 500 <= r.status_code < 600:
                # Honor Retry-After if present, else exponential backoff.
                ra = r.headers.get("Retry-After")
                wait = int(ra) if ra and ra.isdigit() else (2 ** attempt) * 5
                last_status = f"fail-{r.status_code}"
                time.sleep(min(wait, 60))
                continue
            return (f"fail-{r.status_code}", url)
        except Exception as e:
            last_status = f"err-{type(e).__name__}"
            time.sleep(2 ** attempt)
    return (last_status, url)


def cmd_download(args) -> None:
    import requests
    baseline = load_baseline()
    targets: list[tuple[str, str]] = []  # (family, url)
    for fam, e in baseline.items():
        urls = list(e.get("verified", []))
        if args.include_approved:
            verified_set = set(e.get("verified", []))
            for u in e.get("approved", []):
                if u not in verified_set:
                    urls.append(u)
        for url in urls:
            targets.append((fam, url))
    print(f"URLs to fetch: {len(targets)}  (include_approved={args.include_approved})")
    session = requests.Session()
    counts = Counter()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(fetch_one, url, fam, session) for fam, url in targets]
        for i, fut in enumerate(as_completed(futures), 1):
            status, url = fut.result()
            counts[status] += 1
            if i % 50 == 0 or i == len(futures):
                top = dict(counts.most_common(6))
                print(f"  {i}/{len(futures)} {top}")
    print(f"done: {dict(counts)}")


# ---------------------------------------------------------------------------
# 2. Dataset
# ---------------------------------------------------------------------------

def build_index(baseline) -> tuple[list[tuple[Path, int]], list[str]]:
    """Returns (samples, classes). Samples are (img_path, class_idx)."""
    families = sorted(
        f for f, e in baseline.items()
        if len(e.get("verified", [])) >= MIN_VERIFIED
    )
    print(f"well-anchored families: {len(families)} (min {MIN_VERIFIED} verified)")
    skipped = [f for f, e in baseline.items() if 0 < len(e.get("verified", [])) < MIN_VERIFIED]
    if skipped:
        print(f"  skipping cold-start: {skipped}")
    samples: list[tuple[Path, int]] = []
    for idx, fam in enumerate(families):
        for url in baseline[fam].get("verified", []):
            p = cache_path(fam, url)
            if p.exists() and p.stat().st_size > 0:
                samples.append((p, idx))
    print(f"usable samples: {len(samples)} / {sum(len(baseline[f]['verified']) for f in families)} verified")
    return samples, families


class AircraftDataset:
    def __init__(self, samples, transform):
        self.samples = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, i):
        from PIL import Image
        path, label = self.samples[i]
        img = Image.open(path).convert("RGB")
        return self.transform(img), label


def make_transforms(img_size: int):
    from torchvision import transforms as T
    train = T.Compose([
        T.Resize(int(img_size * 1.15)),
        T.RandomCrop(img_size),
        T.RandomHorizontalFlip(),
        T.RandAugment(num_ops=2, magnitude=9),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    val = T.Compose([
        T.Resize(int(img_size * 1.15)),
        T.CenterCrop(img_size),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return train, val


# ---------------------------------------------------------------------------
# 3. Model: DINOv2 backbone + classification head
# ---------------------------------------------------------------------------

def build_model(num_classes: int, device: str):
    import torch.nn as nn
    from transformers import AutoModel
    backbone = AutoModel.from_pretrained(DINOV2_MODEL)
    hidden = backbone.config.hidden_size  # 768

    class DinoClassifier(nn.Module):
        def __init__(self, backbone, hidden, num_classes):
            super().__init__()
            self.backbone = backbone
            self.head = nn.Linear(hidden, num_classes)

        def forward(self, x):
            out = self.backbone(pixel_values=x)
            # CLS token from last_hidden_state, position 0.
            cls = out.last_hidden_state[:, 0]
            return self.head(cls)

    return DinoClassifier(backbone, hidden, num_classes).to(device)


def layerwise_lr_groups(model, base_lr: float, decay: float = 0.7):
    """Layer-wise LR decay: head gets base_lr; deeper layers get progressively less.

    DINOv2-base has 12 transformer blocks. We assign group 0 to embeddings,
    1..12 to blocks, 13 to layernorm, 14 to head. Higher group = higher LR.
    """
    import torch
    groups = {}
    n_blocks = len(model.backbone.encoder.layer)
    head_group = n_blocks + 2

    def assign(name) -> int:
        if name.startswith("head"):
            return head_group
        if "embeddings" in name:
            return 0
        if "encoder.layer." in name:
            try:
                bidx = int(name.split("encoder.layer.")[1].split(".")[0])
                return bidx + 1
            except ValueError:
                return n_blocks + 1
        return n_blocks + 1  # layernorm, etc.

    for name, p in model.named_parameters():
        if not p.requires_grad:
            continue
        g = assign(name)
        groups.setdefault(g, []).append(p)

    param_groups = []
    for g, params in sorted(groups.items()):
        lr = base_lr * (decay ** (head_group - g))
        param_groups.append({"params": params, "lr": lr})
    return param_groups


# ---------------------------------------------------------------------------
# 4. Train
# ---------------------------------------------------------------------------

def cmd_train(args) -> None:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, Subset

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    baseline = load_baseline()
    samples, families = build_index(baseline)
    if not samples:
        sys.exit("no samples — run download first")

    random.Random(42).shuffle(samples)
    n_val = max(int(len(samples) * 0.1), len(families))
    val_samples = samples[:n_val]
    train_samples = samples[n_val:]
    print(f"train: {len(train_samples)}  val: {len(val_samples)}")

    train_tf, val_tf = make_transforms(args.img_size)
    train_ds = AircraftDataset(train_samples, train_tf)
    val_ds = AircraftDataset(val_samples, val_tf)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=args.workers, pin_memory=(device == "cuda"))
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False,
                            num_workers=args.workers, pin_memory=(device == "cuda"))

    model = build_model(len(families), device)
    param_groups = layerwise_lr_groups(model, base_lr=args.lr, decay=args.lr_decay)
    optimizer = torch.optim.AdamW(param_groups, weight_decay=0.05)
    # Linear warmup for first warmup_epochs, then cosine decay over the rest.
    warmup = max(args.warmup_epochs, 1)
    warmup_sched = torch.optim.lr_scheduler.LinearLR(
        optimizer, start_factor=1e-3, end_factor=1.0, total_iters=warmup
    )
    cosine_sched = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=max(args.epochs - warmup, 1)
    )
    scheduler = torch.optim.lr_scheduler.SequentialLR(
        optimizer, schedulers=[warmup_sched, cosine_sched], milestones=[warmup]
    )
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    use_amp = (device == "cuda")
    scaler = torch.cuda.amp.GradScaler(enabled=use_amp)

    best_acc = 0.0
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0 = time.time()
        running = 0.0
        n = 0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad()
            with torch.cuda.amp.autocast(enabled=use_amp):
                logits = model(x)
                loss = criterion(logits, y)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            running += loss.item() * x.size(0)
            n += x.size(0)
        scheduler.step()
        train_loss = running / max(n, 1)
        cur_lr = optimizer.param_groups[-1]["lr"]

        # Validate.
        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device, non_blocking=True)
                y = y.to(device, non_blocking=True)
                with torch.cuda.amp.autocast(enabled=use_amp):
                    logits = model(x)
                pred = logits.argmax(dim=1)
                correct += (pred == y).sum().item()
                total += x.size(0)
        acc = correct / max(total, 1)
        dt = time.time() - t0
        print(f"epoch {epoch}/{args.epochs}  loss {train_loss:.3f}  val-acc {acc:.3f}  lr {cur_lr:.2e}  ({dt:.0f}s)")

        if acc > best_acc:
            best_acc = acc
            torch.save({
                "model_state": model.state_dict(),
                "families": families,
                "img_size": args.img_size,
                "val_acc": acc,
                "epoch": epoch,
            }, CKPT_PATH)
            print(f"  saved checkpoint (val-acc {acc:.3f})")

    print(f"done. best val-acc: {best_acc:.3f}  -> {CKPT_PATH}")


# ---------------------------------------------------------------------------
# 5. Classify (type-ID patches)
# ---------------------------------------------------------------------------

def cmd_classify(args) -> None:
    """Use the fine-tuned model to add type verdicts on approved-but-unverified."""
    import numpy as np
    import torch
    from PIL import Image

    if not CKPT_PATH.exists():
        sys.exit(f"no checkpoint at {CKPT_PATH} — run train first")
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(CKPT_PATH, map_location=device, weights_only=False)
    families = ckpt["families"]
    img_size = ckpt["img_size"]
    model = build_model(len(families), device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    fam_to_idx = {f: i for i, f in enumerate(families)}
    _, val_tf = make_transforms(img_size)

    baseline = load_baseline()
    # Load canonical aircraft IDs (so we can distinguish legacy buckets from
    # canonical-but-undertrained variants).
    canon_ids: set = set()
    canon_path = ROOT / "src" / "data" / "aircraft.json"
    if canon_path.exists():
        canon_data = json.loads(canon_path.read_text(encoding="utf-8"))
        canon_ids = {a["id"] for a in canon_data if isinstance(a, dict) and "id" in a}
    # Refile suppression rules:
    # - cold_start: canonical family the model never saw enough of. Don't refile
    #   AWAY from these — the photo might genuinely belong there.
    # - legacy buckets (in baseline but NOT canonical): we WANT to refile away
    #   (cleanup). Allow even though model has no centroid for them.
    cold_start = {f for f in baseline if f in canon_ids and f not in fam_to_idx}
    legacy = {f for f in baseline if canon_ids and f not in canon_ids}
    print(f"cold-start canonical (refile away suppressed): {sorted(cold_start)}")
    print(f"legacy buckets (refile away ALLOWED for cleanup): {sorted(legacy)}")
    PATCHES_DIR.mkdir(parents=True, exist_ok=True)
    out: dict[str, dict] = {}

    targets: list[tuple[str, str]] = []
    for fam, e in baseline.items():
        if args.family and fam != args.family:
            continue
        approved = set(e.get("approved", []))
        verified = set(e.get("verified", []))
        for url in approved - verified:
            targets.append((fam, url))
    print(f"approved-but-unverified: {len(targets)}")

    import requests
    session = requests.Session()
    n_verified = n_refile = n_unsure = n_skip = 0
    for i, (fam, url) in enumerate(targets, 1):
        # Try local cache first; cache successful fetches so reruns are free.
        p = cache_path(fam, url)
        img = None
        try:
            if p.exists() and p.stat().st_size > 0:
                img = Image.open(p).convert("RGB")
            else:
                # Use the same retry/backoff policy as fetch_one().
                status, _ = fetch_one(url, fam, session)
                if status == "ok" or status == "cached":
                    img = Image.open(p).convert("RGB")
                else:
                    n_skip += 1
                    if i % 50 == 0:
                        print(f"  {i}/{len(targets)}  verified={n_verified} refile={n_refile} unsure={n_unsure} skip={n_skip}")
                    continue
        except Exception:
            n_skip += 1
            continue

        x = val_tf(img).unsqueeze(0).to(device)
        with torch.no_grad():
            logits = model(x)[0]
            probs = torch.softmax(logits, dim=0).cpu().numpy()
        order = np.argsort(-probs)
        top1 = families[order[0]]
        top1_p = float(probs[order[0]])
        top2_p = float(probs[order[1]])
        margin = top1_p - top2_p

        out.setdefault(fam, {"family": fam, "completed": True, "verdicts": []})
        if fam in fam_to_idx:
            filed_idx = fam_to_idx[fam]
            filed_p = float(probs[filed_idx])
        else:
            filed_p = 0.0

        verdict = None
        if top1 == fam and top1_p >= args.tau_match and margin >= args.tau_margin:
            verdict = {"verdict": "verified", "confidence": top1_p,
                       "reason": f"finetuned: top1={top1}@{top1_p:.2f} margin={margin:.2f}"}
            n_verified += 1
        elif (top1 != fam and top1_p >= args.tau_refile and margin >= args.tau_margin
              and top1 in fam_to_idx and fam not in cold_start):
            verdict = {"verdict": "refile", "confidence": top1_p, "refile_to": top1,
                       "reason": f"finetuned: top1={top1}@{top1_p:.2f} filed={fam}@{filed_p:.2f}"}
            n_refile += 1
        else:
            verdict = {"verdict": "unsure", "confidence": top1_p,
                       "reason": f"finetuned: top1={top1}@{top1_p:.2f} margin={margin:.2f} filed={fam}@{filed_p:.2f}"}
            n_unsure += 1
        verdict["url"] = url
        verdict["borderline"] = top1_p < 0.7
        out[fam]["verdicts"].append(verdict)

        if i % 50 == 0:
            print(f"  {i}/{len(targets)}  verified={n_verified} refile={n_refile} unsure={n_unsure} skip={n_skip}")

    out_dir = PATCHES_DIR if not args.dry_run else (ROOT / "tmp" / "aircraft-review-dryrun")
    out_dir.mkdir(parents=True, exist_ok=True)
    for fam, patch in out.items():
        (out_dir / f"{fam}-typeid.json").write_text(json.dumps(patch, indent=2) + "\n")
    print(f"wrote {len(out)} patches to {out_dir}")
    print(f"final: verified={n_verified} refile={n_refile} unsure={n_unsure} skip={n_skip}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("download", help="cache verified images to tmp/img-cache")
    d.add_argument("--workers", type=int, default=2)
    d.add_argument("--include-approved", action="store_true",
                   help="also cache approved-but-unverified URLs (for classify)")
    d.set_defaults(func=cmd_download)

    t = sub.add_parser("train", help="fine-tune DINOv2 on cached images")
    t.add_argument("--device", default=None)
    t.add_argument("--epochs", type=int, default=30)
    t.add_argument("--warmup-epochs", type=int, default=3)
    t.add_argument("--batch-size", type=int, default=32)
    t.add_argument("--lr", type=float, default=1e-4)
    t.add_argument("--lr-decay", type=float, default=0.7, help="layer-wise LR decay factor")
    t.add_argument("--img-size", type=int, default=224)
    t.add_argument("--workers", type=int, default=2)
    t.set_defaults(func=cmd_train)

    c = sub.add_parser("classify", help="emit type-ID patches")
    c.add_argument("--device", default=None)
    c.add_argument("--family", default=None, help="restrict to one family")
    c.add_argument("--tau-match", type=float, default=0.6, help="prob to call verified")
    c.add_argument("--tau-refile", type=float, default=0.7, help="prob to call refile (stricter)")
    c.add_argument("--tau-margin", type=float, default=0.15)
    c.add_argument("--dry-run", action="store_true")
    c.set_defaults(func=cmd_classify)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
