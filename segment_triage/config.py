"""Canonical review-status vocabulary and filter presets.

Everything here is verified against the VC3D (volume-cartographer) source so the
dashboard mirrors exactly what segmenters see in the desktop app:

  - volume-cartographer/apps/VC3D/SurfacePanelController.hpp
        enum class Tag { Approved, Defective, Reviewed, Inspect }   (line ~70)
        struct FilterUiRefs { unreviewed, noDefective, partialReview,
                              showPartialReview, hideUnapproved, inspectOnly }  (~42)
  - volume-cartographer/apps/VC3D/SurfacePanelController.cpp
        applyFiltersInternal()                                       (~1558-1796)
        sync_tag() writes tags[name] = {user, date}                 (~62-90)

The values are intentionally data-driven (not hardcoded in the UI logic) so a
new status key can be added here without touching the crawler or the table.
"""

from __future__ import annotations

# Tag keys as they appear inside meta.json's nested "tags" object. The first
# four are the VC3D Tag enum; "partial_review" appears only in the filter logic
# (SurfacePanelController.cpp:1755). Presence of a key means the status applies.
PRIMARY_STATUSES: tuple[str, ...] = (
    "approved",
    "defective",
    "reviewed",
    "inspect",
    "partial_review",
)

# Human-facing label + a stable color hint per status (consumed by the frontend).
STATUS_LABELS: dict[str, str] = {
    "approved": "Approved",
    "defective": "Defective",
    "reviewed": "Reviewed",
    "inspect": "Inspect",
    "partial_review": "Partial review",
    "untagged": "Untagged",
}

# A segment with an empty/absent tags object is bucketed here (mirrors VC3D's
# vc::json::tags_or_empty tolerance: missing tags never errors).
UNTAGGED = "untagged"

# Filter presets, mirroring VC3D's checkboxes one-for-one. Each entry documents
# the exact predicate from applyFiltersInternal(). The predicate logic lives in
# filters.py (single source of truth); this list drives the UI labels/order.
FILTER_PRESETS: tuple[dict[str, str], ...] = (
    {"key": "unreviewed", "label": "Unreviewed",
     "help": "Show only segments NOT tagged 'reviewed' (the review backlog)."},
    {"key": "hide_unapproved", "label": "Hide Unapproved",
     "help": "Show only segments tagged 'approved'."},
    {"key": "hide_defective", "label": "Hide Defective",
     "help": "Hide segments tagged 'defective'."},
    {"key": "hide_partial_review", "label": "Hide Partial Review",
     "help": "Hide segments tagged 'partial_review' or 'reviewed'."},
    {"key": "show_partial_review", "label": "Show Partial Review",
     "help": "Show only segments tagged 'partial_review' or 'reviewed'."},
    {"key": "inspect_only", "label": "Inspect Only",
     "help": "Show only segments tagged 'inspect'."},
    {"key": "hide_expansion", "label": "Hide Expansion",
     "help": "Hide segments whose vc_gsfs_mode is 'expansion'."},
)
