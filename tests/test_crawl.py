"""Crawler + parsing tests. Each test maps to a stated requirement (R1-R8)."""

import json
from pathlib import Path

import pytest

from segment_triage import crawl as crawlmod
from segment_triage.crawl import MalformedMetaError, apply_meta, crawl_local, parse_segment_dir
from segment_triage.fixtures import write_demo_volpkg
from segment_triage.model import SegmentRecord


def _seg(tmp_path, sid, *, meta=None, raw_meta=None, area_txt=None, author_txt=None,
         layers=0, ink=False):
    d = tmp_path / sid
    d.mkdir()
    if raw_meta is not None:
        (d / "meta.json").write_text(raw_meta)
    elif meta is not None:
        (d / "meta.json").write_text(json.dumps(meta))
    if area_txt is not None:
        (d / "area_cm2.txt").write_text(area_txt)
    if author_txt is not None:
        (d / "author.txt").write_text(author_txt)
    if layers:
        ld = d / "layers"
        ld.mkdir()
        for k in range(layers):
            (ld / f"{k:02d}.tif").write_bytes(b"")
    if ink:
        (d / f"{sid}_prediction.png").write_bytes(b"")
    return d


# R1: parse tags object -> ordered status set, with users/dates
def test_R1_tags_to_status_set(tmp_path):
    d = _seg(tmp_path, "s1", meta={"tags": {
        "reviewed": {"user": "u1", "date": "2026-01-01"},
        "approved": {"user": "u2", "date": "2026-01-02"},
    }})
    rec = parse_segment_dir(d)
    assert rec.meta_format == "tagged"
    # canonical order: approved before reviewed
    assert rec.statuses == ["approved", "reviewed"]
    assert rec.tag_users["approved"] == "u2"
    assert not rec.is_untagged


# R2: missing/empty tags -> untagged bucket, no error
def test_R2_untagged_bucket(tmp_path):
    d = _seg(tmp_path, "s2", meta={"tags": {}})
    rec = parse_segment_dir(d)
    assert rec.is_untagged
    assert rec.display_statuses() == ["untagged"]
    assert rec.meta_format == "legacy"  # empty tags treated as legacy

    d2 = tmp_path / "s2b"
    d2.mkdir()  # no meta.json at all
    rec2 = parse_segment_dir(d2)
    assert rec2.is_untagged
    assert "no meta.json" in rec2.warnings


# R3: legacy descriptor format parses without crashing
def test_R3_legacy_format(tmp_path):
    d = _seg(tmp_path, "s3", meta={
        "name": "s3", "type": "seg", "uuid": "abc", "vcps": "pointset.vcps", "volume": "000"
    })
    rec = parse_segment_dir(d)
    assert rec.meta_format == "legacy"
    assert rec.uuid == "abc"
    assert rec.is_untagged


# R4: area_cm2 from meta, else fallback to area_cm2.txt
def test_R4_area_fallback(tmp_path):
    from_meta = parse_segment_dir(_seg(tmp_path, "s4a", meta={"area_cm2": 12.5}))
    assert from_meta.area_cm2 == 12.5
    from_txt = parse_segment_dir(_seg(tmp_path, "s4b", meta={"tags": {}}, area_txt="7.25"))
    assert from_txt.area_cm2 == 7.25
    # meta wins over txt
    both = parse_segment_dir(_seg(tmp_path, "s4c", meta={"area_cm2": 3.0}, area_txt="9.9"))
    assert both.area_cm2 == 3.0


# R5: layer count from layers/*.tif
def test_R5_layer_count(tmp_path):
    rec = parse_segment_dir(_seg(tmp_path, "s5", meta={"tags": {}}, layers=65))
    assert rec.layer_count == 65
    rec0 = parse_segment_dir(_seg(tmp_path, "s5b", meta={"tags": {}}))
    assert rec0.layer_count is None


# R6: ink-prediction presence
def test_R6_ink_prediction_flag(tmp_path):
    assert parse_segment_dir(_seg(tmp_path, "s6", meta={"tags": {}}, ink=True)).has_ink_prediction
    assert not parse_segment_dir(_seg(tmp_path, "s6b", meta={"tags": {}})).has_ink_prediction


# R7: malformed meta.json -> warn+continue (default) or raise (strict)
def test_R7_malformed_json(tmp_path):
    d = _seg(tmp_path, "s7", raw_meta="{ not: valid json,,, ")
    rec = parse_segment_dir(d)  # default non-strict
    assert "malformed meta.json" in rec.warnings
    assert rec.is_untagged  # didn't crash; still produced a row
    with pytest.raises(MalformedMetaError):
        parse_segment_dir(d, strict=True)


# R8: unknown/new tag key is tolerated (config-driven, no hardcode)
def test_R8_unknown_tag_tolerated(tmp_path):
    rec = SegmentRecord(id="s8")
    apply_meta(rec, {"tags": {"approved": {}, "brand_new_status": {}}})
    assert "approved" in rec.statuses
    assert "brand_new_status" in rec.statuses  # preserved, appended after canonical
    assert rec.statuses[0] == "approved"


# Real-data fields: created derived from id, superseded flag, volume, rendered mesh
def test_created_and_superseded_from_id(tmp_path):
    rec = parse_segment_dir(_seg(tmp_path, "20230503225234", meta={"tags": {}}))
    assert rec.created == "2023-05-03T22:52:34"
    assert rec.superseded is False
    sup = parse_segment_dir(_seg(tmp_path, "20230503225234_superseded", meta={"tags": {}}))
    assert sup.superseded is True
    assert sup.created == "2023-05-03T22:52:34"  # leading timestamp still parsed
    assert parse_segment_dir(_seg(tmp_path, "not-a-timestamp", meta={"tags": {}})).created is None


def test_volume_and_rendered(tmp_path):
    d = _seg(tmp_path, "20230601000000", meta={"tags": {}, "volume": "20230205180739"})
    (d / "20230601000000.obj").write_bytes(b"")
    rec = parse_segment_dir(d)
    assert rec.volume == "20230205180739"
    assert rec.rendered is True
    assert parse_segment_dir(_seg(tmp_path, "20230602000000", meta={"tags": {}})).rendered is False


def test_remote_parse_legacy_segment(monkeypatch):
    sid = "20240101120000"
    listing = ('<a href="meta.json">m</a><a href="area_cm2.txt">a</a>'
               '<a href="author.txt">au</a><a href="layers/">l</a><a href="' + sid + '.obj">o</a>')
    layers = "".join('<a href="%02d.tif">x</a>' % i for i in range(65))

    def fake_get(url, timeout=30):
        if url.endswith("/meta.json"):
            return '{"name":"%s","type":"seg","uuid":"%s","vcps":"pointset.vcps","volume":"20230205180739"}' % (sid, sid)
        if url.endswith("/area_cm2.txt"):
            return "7.25"
        if url.endswith("/author.txt"):
            return "alice\n"
        if url.endswith("/layers/"):
            return layers
        return listing

    monkeypatch.setattr(crawlmod, "_http_get", fake_get)
    rec = crawlmod.parse_segment_remote("http://x/paths/%s/" % sid, sid)
    assert rec.meta_format == "legacy"
    assert rec.area_cm2 == 7.25
    assert rec.author == "alice"
    assert rec.layer_count == 65
    assert rec.rendered is True
    assert rec.volume == "20230205180739"
    assert rec.created == "2024-01-01T12:00:00"


# Integration: crawl a real on-disk demo .volpkg tree
def test_crawl_local_over_demo_volpkg(tmp_path):
    volpkg = write_demo_volpkg(tmp_path, n=12)
    records = crawl_local(volpkg)
    assert len(records) == 12
    assert any(not r.is_untagged for r in records)
    # points-at-paths-dir form also works
    records2 = crawl_local(volpkg / "paths")
    assert len(records2) == 12


def test_crawl_local_empty_dir_errors(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError):
        crawl_local(empty)
