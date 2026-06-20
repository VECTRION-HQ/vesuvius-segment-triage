"""The triage filter presets, mirroring VC3D's surface-tree filters exactly.

Single source of truth for the filtering semantics. The frontend re-implements
the identical predicates in TypeScript (frontend/src/filters.ts) and a test
checks the two stay in agreement.

Each predicate returns True when a record should be KEPT while that filter is
active. Line references are to volume-cartographer/apps/VC3D/
SurfacePanelController.cpp::applyFiltersInternal() in ScrollPrize/villa.
"""

from __future__ import annotations

from typing import Callable, Iterable

from .model import SegmentRecord

# fmt: off
FILTERS: dict[str, Callable[[SegmentRecord], bool]] = {
    # cpp:1734  show = show && !tags.contains("reviewed")
    "unreviewed":          lambda r: "reviewed" not in r.statuses,
    # cpp:1773  show = show && tags.contains("approved")            (untagged -> hidden)
    "hide_unapproved":     lambda r: "approved" in r.statuses,
    # cpp:1748  show = show && !tags.contains("defective")
    "hide_defective":      lambda r: "defective" not in r.statuses,
    # cpp:1755  hasPartialReview = partial_review||reviewed; show && !hasPartialReview
    "hide_partial_review": lambda r: not ("partial_review" in r.statuses or "reviewed" in r.statuses),
    # cpp:1763  show = show && hasPartialReview                     (untagged -> hidden)
    "show_partial_review": lambda r: ("partial_review" in r.statuses or "reviewed" in r.statuses),
    # cpp:1782  show = show && tags.contains("inspect")             (untagged -> hidden)
    "inspect_only":        lambda r: "inspect" in r.statuses,
    # cpp:1741  show = show && (vc_gsfs_mode != "expansion")
    "hide_expansion":      lambda r: (r.vc_gsfs_mode or "") != "expansion",
}
# fmt: on


def apply_filters(
    records: Iterable[SegmentRecord],
    active: Iterable[str] = (),
    search_text: str = "",
) -> list[SegmentRecord]:
    """Return the records kept under the active filters + id substring search.

    Active filters are AND-ed together, exactly like VC3D (each checked filter
    further narrows the visible set). Unknown filter keys are ignored.
    """
    active_keys = list(active)
    needle = (search_text or "").strip().lower()
    kept: list[SegmentRecord] = []
    for rec in records:
        if needle and needle not in rec.id.lower():
            continue
        if all(FILTERS[k](rec) for k in active_keys if k in FILTERS):
            kept.append(rec)
    return kept
