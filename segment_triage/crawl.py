"""Crawl a VC3D ``.volpkg`` tree (local) or public HTTP mirror into records.

Tolerant by design: a missing or legacy (tag-less) ``meta.json`` never errors —
the segment still appears, bucketed as "untagged". Only when ``strict=True`` is a
malformed ``meta.json`` raised instead of warned. This mirrors VC3D's own
``vc::json::tags_or_empty`` tolerance.

Reads metadata only (small JSON / text files and directory listings). It never
downloads the large ``layers/*.tif`` volumes — it only counts them.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

from .config import PRIMARY_STATUSES
from .model import SegmentRecord

LAYER_RE = re.compile(r"^\d+\.tiff?$", re.IGNORECASE)
INK_PRED_RE = re.compile(r"(_prediction|inklabel).*\.png$", re.IGNORECASE)
OBJ_RE = re.compile(r"\.obj$", re.IGNORECASE)
_CREATED_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})")
_HREF_RE = re.compile(r'href="([^"?#]+)"', re.IGNORECASE)


def _derive_created(seg_id: str) -> Optional[str]:
    """Segment ids are YYYYMMDDHHMMSS timestamps -> derive an ISO created date."""
    m = _CREATED_RE.match(seg_id)
    if not m:
        return None
    y, mo, d, h, mi, s = m.groups()
    if not ("2015" <= y <= "2035" and "01" <= mo <= "12" and "01" <= d <= "31"):
        return None
    return f"{y}-{mo}-{d}T{h}:{mi}:{s}"


def _apply_id_metadata(rec: SegmentRecord) -> None:
    low = rec.id.lower()
    rec.superseded = "_superseded" in low or "_test" in low
    rec.created = _derive_created(rec.id)


class MalformedMetaError(ValueError):
    """Raised in strict mode when a meta.json cannot be parsed."""


# --------------------------------------------------------------------------- #
# Pure helpers (transport-independent)
# --------------------------------------------------------------------------- #
def _to_float(value) -> Optional[float]:
    try:
        return float(str(value).strip()) if value is not None else None
    except (TypeError, ValueError):
        return None


def _ordered_statuses(tags: dict) -> list[str]:
    """Canonical statuses first (config order), then any unknown keys (tolerated)."""
    present = [s for s in PRIMARY_STATUSES if s in tags]
    extra = [k for k in tags if k not in PRIMARY_STATUSES]
    return present + extra


def apply_meta(rec: SegmentRecord, meta: dict) -> None:
    """Fill a record from a parsed meta.json dict. Safe on legacy/odd shapes."""
    if not isinstance(meta, dict):
        rec.warnings.append("meta.json is not a JSON object")
        return
    tags = meta.get("tags")
    if isinstance(tags, dict) and tags:
        rec.meta_format = "tagged"
        rec.statuses = _ordered_statuses(tags)
        for key, val in tags.items():
            if isinstance(val, dict):
                if val.get("user"):
                    rec.tag_users[key] = str(val["user"])
                if val.get("date"):
                    rec.tag_dates[key] = str(val["date"])
    else:
        rec.meta_format = "legacy"
    if rec.area_cm2 is None:
        rec.area_cm2 = _to_float(meta.get("area_cm2"))
    if not rec.author and meta.get("author"):
        rec.author = str(meta["author"])
    rec.vc_gsfs_mode = meta.get("vc_gsfs_mode") or rec.vc_gsfs_mode
    if rec.avg_cost is None:
        rec.avg_cost = _to_float(meta.get("avg_cost"))
    if meta.get("date_last_modified"):
        rec.date_last_modified = str(meta["date_last_modified"])
    if meta.get("uuid"):
        rec.uuid = str(meta["uuid"])
    if meta.get("volume"):
        rec.volume = str(meta["volume"])


def _parse_meta_text(rec: SegmentRecord, raw: Optional[str], *, strict: bool) -> None:
    if raw is None:
        rec.warnings.append("no meta.json")
        return
    try:
        meta = json.loads(raw)
    except json.JSONDecodeError as exc:
        msg = f"{rec.id}: malformed meta.json ({exc})"
        if strict:
            raise MalformedMetaError(msg) from exc
        print(f"WARNING: {msg}", file=sys.stderr)
        rec.warnings.append("malformed meta.json")
        return
    apply_meta(rec, meta)


# --------------------------------------------------------------------------- #
# Local filesystem
# --------------------------------------------------------------------------- #
def _read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _looks_like_segment(d: Path) -> bool:
    return (d / "meta.json").is_file() or (d / "layers").is_dir() or (d / "area_cm2.txt").is_file()


def parse_segment_dir(seg_dir: Path, *, strict: bool = False) -> SegmentRecord:
    rec = SegmentRecord(id=seg_dir.name, source=str(seg_dir))
    meta_path = seg_dir / "meta.json"
    _parse_meta_text(rec, _read_text(meta_path) if meta_path.is_file() else None, strict=strict)

    if rec.area_cm2 is None:
        rec.area_cm2 = _to_float(_read_text(seg_dir / "area_cm2.txt"))
    if not rec.author:
        author_txt = _read_text(seg_dir / "author.txt")
        if author_txt and author_txt.strip():
            rec.author = author_txt.strip().splitlines()[0].strip()

    layers_dir = seg_dir / "layers"
    if layers_dir.is_dir():
        try:
            rec.layer_count = sum(1 for p in layers_dir.iterdir() if LAYER_RE.match(p.name))
        except OSError:
            pass
    try:
        files = [p.name for p in seg_dir.iterdir() if p.is_file()]
    except OSError:
        files = []
    rec.has_ink_prediction = any(INK_PRED_RE.search(n) for n in files)
    rec.rendered = any(OBJ_RE.search(n) for n in files)
    _apply_id_metadata(rec)
    return rec


def crawl_local(root, *, strict: bool = False, limit: Optional[int] = None) -> list[SegmentRecord]:
    root = Path(root).expanduser()
    if not root.exists():
        raise FileNotFoundError(f"root not found: {root}")

    if _looks_like_segment(root):
        return [parse_segment_dir(root, strict=strict)]

    base = root / "paths" if (root / "paths").is_dir() else root
    seg_dirs = [c for c in sorted(base.iterdir()) if c.is_dir() and _looks_like_segment(c)]
    if limit:
        seg_dirs = seg_dirs[:limit]
    if not seg_dirs:
        raise ValueError(
            f"No segments found under {base}. Point --root at a .volpkg directory "
            f"or its paths/ subdirectory (each segment needs a meta.json or layers/)."
        )
    return [parse_segment_dir(c, strict=strict) for c in seg_dirs]


# --------------------------------------------------------------------------- #
# Remote HTTP mirror (Apache-style autoindex, e.g. data.aws.ash2txt.org)
# --------------------------------------------------------------------------- #
def _http_get(url: str, *, timeout: int = 30) -> str:
    import requests

    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.text


def _list_links(html: str) -> list[str]:
    out = []
    for match in _HREF_RE.finditer(html):
        href = match.group(1)
        if href in ("../", "/", "./") or href.startswith(("?", "/")):
            continue
        out.append(href)
    return out


def _basename(link: str) -> str:
    return link.strip("/").split("/")[-1]


def parse_segment_remote(seg_url: str, seg_id: str, *, strict: bool = False, timeout: int = 30) -> SegmentRecord:
    import requests

    rec = SegmentRecord(id=seg_id, source=seg_url)
    try:
        names = [_basename(h) for h in _list_links(_http_get(seg_url, timeout=timeout))]
    except requests.RequestException:
        names = []
    name_set = {n.lower() for n in names}

    if "meta.json" in name_set:
        try:
            _parse_meta_text(rec, _http_get(urljoin(seg_url, "meta.json"), timeout=timeout), strict=strict)
        except requests.RequestException:
            rec.warnings.append("meta.json fetch failed")
    else:
        rec.warnings.append("no meta.json")

    if rec.area_cm2 is None and "area_cm2.txt" in name_set:
        try:
            rec.area_cm2 = _to_float(_http_get(urljoin(seg_url, "area_cm2.txt"), timeout=timeout))
        except requests.RequestException:
            pass
    if not rec.author and "author.txt" in name_set:
        try:
            txt = _http_get(urljoin(seg_url, "author.txt"), timeout=timeout).strip()
            rec.author = txt.splitlines()[0].strip() if txt else None
        except requests.RequestException:
            pass

    rec.has_ink_prediction = any(INK_PRED_RE.search(n) for n in names)
    rec.rendered = any(OBJ_RE.search(n) for n in names)
    if "layers" in name_set:
        try:
            layer_names = [_basename(h) for h in _list_links(_http_get(urljoin(seg_url, "layers/"), timeout=timeout))]
            rec.layer_count = sum(1 for n in layer_names if LAYER_RE.match(n))
        except requests.RequestException:
            pass
    _apply_id_metadata(rec)
    return rec


def crawl_remote(url: str, *, strict: bool = False, limit: Optional[int] = None,
                 timeout: int = 30, workers: int = 8) -> list[SegmentRecord]:
    import requests
    from concurrent.futures import ThreadPoolExecutor

    if not url.endswith("/"):
        url += "/"
    base = url if url.rstrip("/").endswith("paths") else urljoin(url, "paths/")
    try:
        html = _http_get(base, timeout=timeout)
    except requests.RequestException:
        base, html = url, _http_get(url, timeout=timeout)

    seg_links = [h for h in _list_links(html) if h.endswith("/")]
    if limit:
        seg_links = seg_links[:limit]
    if not seg_links:
        raise ValueError(f"No segments found at {base}")

    def fetch(link):
        return parse_segment_remote(urljoin(base, link), _basename(link), strict=strict, timeout=timeout)

    # Remote fetches are latency-bound (several small requests per segment) -> fan out.
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return list(pool.map(fetch, seg_links))


def crawl(root, *, strict: bool = False, limit: Optional[int] = None, workers: int = 8) -> list[SegmentRecord]:
    """Crawl ``root`` (a local path or an http(s) mirror URL) into records."""
    if isinstance(root, str) and root.lower().startswith(("http://", "https://")):
        return crawl_remote(root, strict=strict, limit=limit, workers=workers)
    return crawl_local(root, strict=strict, limit=limit)
