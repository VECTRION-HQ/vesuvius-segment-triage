"""R9: filter presets match VC3D semantics.

Cases live in tests/filter_cases.json and are shared verbatim with the
TypeScript test (frontend/src/filters.test.ts), so the Python and browser
filtering can never silently diverge.
"""

import json
from pathlib import Path

import pytest

from segment_triage.filters import FILTERS, apply_filters
from segment_triage.model import SegmentRecord

CASES = json.loads((Path(__file__).parent / "filter_cases.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_filter_case(case):
    rec = SegmentRecord(id="s", statuses=list(case["statuses"]), vc_gsfs_mode=case["vc_gsfs_mode"])
    assert FILTERS[case["filter"]](rec) is case["keep"]


def test_apply_filters_are_anded():
    recs = [
        SegmentRecord(id="a", statuses=["approved", "reviewed"]),
        SegmentRecord(id="b", statuses=["approved"]),          # not reviewed
        SegmentRecord(id="c", statuses=["reviewed"]),          # not approved
        SegmentRecord(id="d", statuses=[]),                    # untagged
    ]
    # hide_unapproved AND unreviewed: must be approved AND not reviewed -> only "b"
    kept = apply_filters(recs, active=["hide_unapproved", "unreviewed"])
    assert [r.id for r in kept] == ["b"]


def test_apply_filters_search_is_case_insensitive_substring():
    recs = [SegmentRecord(id="20230702185753"), SegmentRecord(id="20241108111522")]
    assert [r.id for r in apply_filters(recs, search_text="1108")] == ["20241108111522"]
    assert len(apply_filters(recs, search_text="2023")) == 1


def test_unknown_filter_key_is_ignored():
    recs = [SegmentRecord(id="a", statuses=["approved"])]
    assert apply_filters(recs, active=["not_a_real_filter"]) == recs
