"""Seeded demo data.

The public data mirror's meta.json files are the *legacy* format and do not yet
carry review tags (those live in the team's local VC3D .volpkg working copies).
So the demo overlays synthesized, clearly-labeled tags on realistic segment
descriptors. Every meta.json written/produced here includes ``"DEMO_DATA": true``.

``build_demo_records`` returns records directly (fast, no disk). ``write_demo_volpkg``
writes a real on-disk .volpkg/paths tree (used by tests and the optional
``segment-triage write-demo-volpkg`` command) so the crawler can be exercised
against the genuine layout.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from .config import PRIMARY_STATUSES
from .model import SegmentRecord

_AUTHORS = ["team-bot", "segmenter-a", "segmenter-b", "community-1", "community-2"]
_STATUS_POOL = [
    [],  # untagged (review backlog)
    ["reviewed"],
    ["approved", "reviewed"],
    ["defective"],
    ["inspect"],
    ["partial_review"],
    ["reviewed", "approved"],
    ["inspect", "defective"],
]
_DEMO_DATE = "2026-06-15T12:00:00"


def _order(statuses) -> list[str]:
    present = [s for s in PRIMARY_STATUSES if s in statuses]
    return present + [s for s in statuses if s not in PRIMARY_STATUSES]


def _demo_specs(n: int = 40, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    specs = []
    for i in range(n):
        # Plausible 14-digit, timestamp-style IDs (clearly seeded demo values).
        sid = str(20230700000000 + i * 1830517)
        specs.append(
            {
                "id": sid,
                "statuses": _order(rng.choice(_STATUS_POOL)),
                "area_cm2": round(rng.uniform(0.5, 45.0), 2) if rng.random() > 0.1 else None,
                "author": rng.choice(_AUTHORS),
                "layer_count": rng.choice([0, 65, 65, 65, 33]),
                "has_ink_prediction": rng.random() > 0.6,
                "vc_gsfs_mode": rng.choice(["expansion", "tracing", None]),
                "format": "tagged",
            }
        )
    # Showcase tolerance: a legacy (tag-less) segment and a malformed one.
    specs[3].update(format="legacy", statuses=[])
    specs[7].update(format="malformed", statuses=[])
    return specs


def build_demo_records(n: int = 40, seed: int = 42) -> list[SegmentRecord]:
    records = []
    for spec in _demo_specs(n, seed):
        rec = SegmentRecord(id=spec["id"], source="DEMO (seeded)")
        if spec["format"] == "malformed":
            rec.meta_format = "missing"
            rec.warnings.append("malformed meta.json (demo)")
        elif spec["format"] == "legacy":
            rec.meta_format = "legacy"
        else:
            rec.meta_format = "tagged"
            rec.statuses = list(spec["statuses"])
            for status in rec.statuses:
                rec.tag_users[status] = spec["author"]
                rec.tag_dates[status] = _DEMO_DATE
            rec.date_last_modified = _DEMO_DATE
            rec.vc_gsfs_mode = spec["vc_gsfs_mode"]
        rec.area_cm2 = spec["area_cm2"]
        rec.author = spec["author"]
        rec.layer_count = spec["layer_count"]
        rec.has_ink_prediction = spec["has_ink_prediction"]
        records.append(rec)
    return records


def write_demo_volpkg(dest, n: int = 40, seed: int = 42) -> Path:
    """Write a real demo.volpkg/paths/<id>/ tree under ``dest``; return the .volpkg path."""
    volpkg = Path(dest) / "demo.volpkg"
    paths = volpkg / "paths"
    paths.mkdir(parents=True, exist_ok=True)
    for spec in _demo_specs(n, seed):
        seg = paths / spec["id"]
        seg.mkdir(exist_ok=True)
        if spec["format"] == "malformed":
            (seg / "meta.json").write_text("{ not valid json,,, ", encoding="utf-8")
        elif spec["format"] == "legacy":
            meta = {"DEMO_DATA": True, "name": spec["id"], "type": "seg",
                    "uuid": spec["id"], "vcps": "pointset.vcps", "volume": "00000000"}
            (seg / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
            if spec["area_cm2"] is not None:
                (seg / "area_cm2.txt").write_text(str(spec["area_cm2"]), encoding="utf-8")
        else:
            tags = {s: {"user": spec["author"], "date": _DEMO_DATE} for s in spec["statuses"]}
            meta = {"DEMO_DATA": True, "tags": tags, "author": spec["author"],
                    "date_last_modified": _DEMO_DATE}
            if spec["vc_gsfs_mode"]:
                meta["vc_gsfs_mode"] = spec["vc_gsfs_mode"]
            if spec["area_cm2"] is not None:
                meta["area_cm2"] = spec["area_cm2"]
            (seg / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        (seg / "author.txt").write_text(spec["author"] + "\n", encoding="utf-8")
        if spec["layer_count"]:
            layers = seg / "layers"
            layers.mkdir(exist_ok=True)
            for k in range(spec["layer_count"]):
                (layers / f"{k:02d}.tif").write_bytes(b"")
        if spec["has_ink_prediction"]:
            (seg / f"{spec['id']}_prediction.png").write_bytes(b"")
    return volpkg
