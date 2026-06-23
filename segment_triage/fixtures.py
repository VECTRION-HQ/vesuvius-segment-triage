"""Seeded demo data, shaped like REAL Vesuvius segments (verified against
https://dl.ash2txt.org/full-scrolls/Scroll1/PHercParis4.volpkg/paths/).

Real public meta.json is the legacy format {name,type,uuid,vcps,volume} with no
review tags (tags live only in the team's local VC3D .volpkg working copies), so
the demo overlays synthesized, clearly-labeled tags on realistic descriptors.
Every generated meta.json includes ``"DEMO_DATA": true`` and all authors/ids are
synthesized — never real contributor names.

``build_demo_records`` returns records directly (fast). ``write_demo_volpkg``
writes a real on-disk .volpkg/paths tree (used by tests / the optional
``segment-triage write-demo-volpkg`` command).
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

from .crawl import _apply_id_metadata
from .model import SegmentRecord

_AUTHORS = ["team-bot", "segmenter-a", "segmenter-b", "community-1", "community-2"]
_VOLUMES = ["20230205180739", "20230206082907"]
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
_BASE = datetime(2023, 5, 3, 22, 52, 34)
_DEMO_DATE = "2026-06-15T12:00:00"


def _order(statuses) -> list[str]:
    from .config import PRIMARY_STATUSES

    present = [s for s in PRIMARY_STATUSES if s in statuses]
    return present + [s for s in statuses if s not in PRIMARY_STATUSES]


def _demo_specs(n: int = 40, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    specs = []
    for i in range(n):
        # Valid YYYYMMDDHHMMSS ids spanning a few months (so created-dates vary).
        sid = (_BASE + timedelta(hours=i * 9, minutes=i * 17)).strftime("%Y%m%d%H%M%S")
        specs.append(
            {
                "id": sid,
                "statuses": _order(rng.choice(_STATUS_POOL)),
                "area_cm2": round(rng.uniform(0.05, 45.0), 4) if rng.random() > 0.1 else None,
                "author": rng.choice(_AUTHORS),
                "layer_count": rng.choice([0, 65, 65, 65, 33]),
                "rendered": rng.random() > 0.2,
                "has_ink_prediction": rng.random() > 0.7,
                "volume": rng.choice(_VOLUMES),
                "vc_gsfs_mode": rng.choice(["expansion", "tracing", None]),
                "format": "tagged",
            }
        )
    # Tolerance showcase: a legacy (public-style) segment, a malformed one,
    # and a superseded version that the UI hides by default.
    if n > 3:
        specs[3].update(format="legacy", statuses=[])
    if n > 7:
        specs[7].update(format="malformed", statuses=[])
    if n > 11:
        specs[11]["id"] = specs[11]["id"] + "_superseded"
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
        rec.rendered = spec["rendered"]
        rec.has_ink_prediction = spec["has_ink_prediction"]
        rec.volume = spec["volume"]
        _apply_id_metadata(rec)  # created (from id) + superseded
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
            meta = {"name": spec["id"], "type": "seg", "uuid": spec["id"],
                    "vcps": "pointset.vcps", "volume": spec["volume"]}
            (seg / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
            if spec["area_cm2"] is not None:
                (seg / "area_cm2.txt").write_text(str(spec["area_cm2"]), encoding="utf-8")
        else:
            tags = {s: {"user": spec["author"], "date": _DEMO_DATE} for s in spec["statuses"]}
            meta = {"DEMO_DATA": True, "tags": tags, "author": spec["author"],
                    "volume": spec["volume"], "date_last_modified": _DEMO_DATE}
            if spec["vc_gsfs_mode"]:
                meta["vc_gsfs_mode"] = spec["vc_gsfs_mode"]
            if spec["area_cm2"] is not None:
                meta["area_cm2"] = spec["area_cm2"]
            (seg / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        (seg / "author.txt").write_text(spec["author"] + "\n", encoding="utf-8")
        if spec["rendered"]:
            (seg / (spec["id"].split("_")[0] + ".obj")).write_bytes(b"")
        if spec["layer_count"]:
            layers = seg / "layers"
            layers.mkdir(exist_ok=True)
            for k in range(spec["layer_count"]):
                (layers / f"{k:02d}.tif").write_bytes(b"")
        if spec["has_ink_prediction"]:
            (seg / (spec["id"].split("_")[0] + "_prediction.png")).write_bytes(b"")
    return volpkg
