"""The normalized record produced for each segment/surface."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Optional

from .config import UNTAGGED


@dataclass
class SegmentRecord:
    """One row of the triage table.

    ``statuses`` holds the review-tag keys present in meta.json's ``tags`` object
    (a subset of config.PRIMARY_STATUSES, plus any unknown keys, preserved so the
    table degrades gracefully). An empty ``statuses`` means the segment is
    untagged -> it lands in the "Untagged" bucket rather than being dropped.
    """

    id: str
    statuses: list[str] = field(default_factory=list)
    tag_users: dict[str, str] = field(default_factory=dict)
    tag_dates: dict[str, str] = field(default_factory=dict)
    area_cm2: Optional[float] = None
    author: Optional[str] = None
    layer_count: Optional[int] = None
    has_ink_prediction: bool = False
    rendered: bool = False  # a rendered surface mesh (.obj) is present
    volume: Optional[str] = None  # source volume id (meta.json "volume")
    created: Optional[str] = None  # ISO date derived from the YYYYMMDDHHMMSS id
    superseded: bool = False  # id marked _superseded / _test (hidden by default)
    date_last_modified: Optional[str] = None
    vc_gsfs_mode: Optional[str] = None
    avg_cost: Optional[float] = None
    uuid: Optional[str] = None
    # "tagged"  -> meta.json had a tags object
    # "legacy"  -> meta.json existed but had no tags object (public mirror format)
    # "missing" -> no readable meta.json
    meta_format: str = "missing"
    source: str = ""
    warnings: list[str] = field(default_factory=list)

    @property
    def is_untagged(self) -> bool:
        return not self.statuses

    def status_set(self) -> set[str]:
        return set(self.statuses)

    def display_statuses(self) -> list[str]:
        """Statuses for display: the untagged bucket label when there are none."""
        return list(self.statuses) if self.statuses else [UNTAGGED]

    def to_dict(self) -> dict:
        d = asdict(self)
        d["is_untagged"] = self.is_untagged
        d["display_statuses"] = self.display_statuses()
        return d
