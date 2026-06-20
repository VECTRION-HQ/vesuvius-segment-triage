"""Report manifest + HTML injection tests (no built frontend required)."""

import json

from segment_triage.fixtures import build_demo_records
from segment_triage.model import SegmentRecord
from segment_triage.report import build_manifest, render_html
from segment_triage.summary import summarize

TEMPLATE = (
    '<!doctype html><html><body>'
    '<script id="triage-data" type="application/json">null</script>'
    '</body></html>'
)


def _extract(html):
    open_tag = '<script id="triage-data" type="application/json">'
    start = html.index(open_tag) + len(open_tag)
    end = html.index("</script>", start)
    return html[start:end]


def test_manifest_shape():
    recs = build_demo_records(n=10)
    m = build_manifest(recs, source="DEMO", is_demo=True)
    assert m["tool"] == "vesuvius-segment-triage"
    assert m["is_demo"] is True
    assert len(m["segments"]) == 10
    assert "by_status" in m["summary"]
    assert m["config"]["filters"][0]["key"] == "unreviewed"


def test_render_injects_parseable_json():
    recs = build_demo_records(n=8)
    html = render_html(recs, source="DEMO", is_demo=True, template=TEMPLATE)
    payload = _extract(html).replace("<\\/", "</")  # undo the </ escaping
    data = json.loads(payload)
    assert len(data["segments"]) == 8


def test_render_escapes_script_close():
    rec = SegmentRecord(id="evil</script><b>x")
    html = render_html([rec], template=TEMPLATE)
    # The only literal </script> must be the real closing tag of the data island.
    assert html.count("</script>") == 1


def test_summary_counts_untagged_and_multitag():
    recs = [
        SegmentRecord(id="a", statuses=["approved", "reviewed"], area_cm2=10.0),
        SegmentRecord(id="b", statuses=[]),
        SegmentRecord(id="c", statuses=["approved"], area_cm2=5.0),
    ]
    s = summarize(recs)
    assert s["total"] == 3
    assert s["by_status"]["approved"] == 2
    assert s["by_status"]["untagged"] == 1
    assert s["total_area_cm2"] == 15.0
    assert s["pct_approved"] == round(100 * 2 / 3, 1)
