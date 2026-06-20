"""Render a self-contained HTML report by injecting the manifest into the
bundled single-file frontend.

The frontend ships as ``segment_triage/web/template.html`` (a single file built
by Vite). It contains a placeholder data island:

    <script id="triage-data" type="application/json">null</script>

We replace its contents with the manifest JSON. The result is one portable HTML
file (no server, no network) that a segmenter can open or share.
"""

from __future__ import annotations

import json
from importlib import resources
from pathlib import Path
from typing import Iterable, Optional

from . import __version__
from .config import FILTER_PRESETS, PRIMARY_STATUSES, STATUS_LABELS, UNTAGGED
from .model import SegmentRecord
from .summary import summarize

_DATA_OPEN = '<script id="triage-data" type="application/json">'
_DATA_CLOSE = "</script>"


def build_manifest(records: Iterable[SegmentRecord], *, source: str = "", is_demo: bool = False) -> dict:
    records = list(records)
    return {
        "tool": "vesuvius-segment-triage",
        "version": __version__,
        "source": source,
        "is_demo": is_demo,
        "summary": summarize(records),
        "config": {
            "statuses": list(PRIMARY_STATUSES),
            "untagged": UNTAGGED,
            "labels": STATUS_LABELS,
            "filters": [dict(f) for f in FILTER_PRESETS],
        },
        "segments": [r.to_dict() for r in records],
    }


def _load_template() -> str:
    web = resources.files("segment_triage") / "web" / "template.html"
    if web.is_file():
        return web.read_text(encoding="utf-8")
    raise FileNotFoundError(
        "Frontend template not built. From the repo run:\n"
        "  npm --prefix frontend ci && npm --prefix frontend run build\n"
        "(this writes segment_triage/web/template.html). Installed wheels include it."
    )


def render_html(
    records: Iterable[SegmentRecord],
    *,
    source: str = "",
    is_demo: bool = False,
    template: Optional[str] = None,
) -> str:
    manifest = build_manifest(records, source=source, is_demo=is_demo)
    # Escape "</" so an embedded "</script>" can't break out of the data island.
    payload = json.dumps(manifest, ensure_ascii=False).replace("</", "<\\/")
    tpl = template if template is not None else _load_template()
    start = tpl.find(_DATA_OPEN)
    if start == -1:
        raise ValueError("Frontend template is missing the #triage-data placeholder.")
    inner = start + len(_DATA_OPEN)
    end = tpl.find(_DATA_CLOSE, inner)
    if end == -1:
        raise ValueError("Frontend template data island is not closed.")
    return tpl[:inner] + payload + tpl[end:]


def write_report(records, out_path, *, source: str = "", is_demo: bool = False) -> str:
    html = render_html(records, source=source, is_demo=is_demo)
    Path(out_path).write_text(html, encoding="utf-8")
    return out_path
