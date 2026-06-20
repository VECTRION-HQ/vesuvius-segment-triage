"""vesuvius-segment-triage

A cross-segment review-status triage dashboard for Vesuvius Challenge VC3D
``.volpkg`` surfaces. Crawls each segment's ``meta.json`` review tags plus
auxiliary metrics and renders a single filterable/sortable web table.

Read-only: it never modifies or redistributes scroll data. Writing review tags
is the job of VC3D (volume-cartographer); this tool only reads and displays.
"""

__version__ = "0.1.0"

from .model import SegmentRecord  # noqa: E402,F401
