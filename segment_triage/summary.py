"""Aggregate counts for the dashboard header ("at a glance" triage numbers)."""

from __future__ import annotations

from typing import Iterable

from .config import PRIMARY_STATUSES, UNTAGGED
from .model import SegmentRecord


def summarize(records: Iterable[SegmentRecord]) -> dict:
    records = list(records)
    total = len(records)
    by_status = {s: 0 for s in (*PRIMARY_STATUSES, UNTAGGED)}
    total_area = 0.0
    area_known = 0
    tagged = 0
    for rec in records:
        for status in rec.display_statuses():
            by_status[status] = by_status.get(status, 0) + 1
        if not rec.is_untagged:
            tagged += 1
        if rec.area_cm2:
            total_area += rec.area_cm2
            area_known += 1
    approved = by_status.get("approved", 0)
    return {
        # NOTE: a segment can carry several tags, so per-status counts may sum to
        # more than `total`. `untagged` counts segments with no tags at all.
        "total": total,
        "tagged": tagged,
        "by_status": by_status,
        "total_area_cm2": round(total_area, 2),
        "area_known": area_known,
        "pct_approved": round(100 * approved / total, 1) if total else 0.0,
    }
