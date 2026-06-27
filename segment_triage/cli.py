"""Command line interface: ``segment-triage scan|demo|write-demo-volpkg``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="segment-triage",
        description="Cross-segment review-status triage for Vesuvius VC3D .volpkg surfaces.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="cmd", required=True)

    scan = sub.add_parser("scan", help="Crawl a .volpkg (local path or http mirror) -> HTML report.")
    scan.add_argument("--root", required=True,
                      help="Path to a .volpkg (or its paths/ dir, or a single segment), or an http(s) mirror URL.")
    scan.add_argument("-o", "--out", default="segment-triage.report.html", help="Output HTML path.")
    scan.add_argument("--limit", type=int, default=None, help="Only crawl the first N segments.")
    scan.add_argument("--workers", type=int, default=8, help="Concurrent fetches for remote (http) crawls.")
    scan.add_argument("--strict", action="store_true", help="Fail on a malformed meta.json instead of warning.")
    scan.add_argument("--json", dest="json_out", default=None, help="Also write the raw manifest JSON here.")

    demo = sub.add_parser("demo", help="Render a report from seeded demo data (no data download).")
    demo.add_argument("-o", "--out", default="segment-triage.demo.html", help="Output HTML path.")

    wd = sub.add_parser("write-demo-volpkg", help="Write a real demo .volpkg/paths tree to inspect or crawl.")
    wd.add_argument("dest", help="Destination directory (a demo.volpkg/ is created inside).")
    return parser


def main(argv=None) -> int:
    args = _build_parser().parse_args(argv)

    # Imports deferred so `--help`/`--version` work even before the frontend is built.
    if args.cmd == "scan":
        from .crawl import crawl
        from .report import build_manifest, write_report

        try:
            records = crawl(args.root, strict=args.strict, limit=args.limit, workers=args.workers)
        except (FileNotFoundError, ValueError, RuntimeError, OSError) as exc:
            # OSError covers requests' network errors (RequestException subclasses it);
            # RuntimeError covers the missing-'remote'-extra message.
            print(f"error: {exc}", file=sys.stderr)
            return 2
        out = write_report(records, args.out, source=str(args.root), is_demo=False)
        print(f"Scanned {len(records)} segments from {args.root}")
        print(f"Report: {Path(out).resolve()}")
        if args.json_out:
            Path(args.json_out).write_text(
                json.dumps(build_manifest(records, source=str(args.root)), indent=2),
                encoding="utf-8",
            )
            print(f"Manifest: {Path(args.json_out).resolve()}")

    elif args.cmd == "demo":
        from .fixtures import build_demo_records
        from .report import write_report

        records = build_demo_records()
        out = write_report(records, args.out, source="DEMO (seeded data)", is_demo=True)
        print(f"Demo report ({len(records)} seeded segments): {Path(out).resolve()}")

    elif args.cmd == "write-demo-volpkg":
        from .fixtures import write_demo_volpkg

        volpkg = write_demo_volpkg(args.dest)
        print(f"Wrote demo volpkg: {Path(volpkg).resolve()}")
        print(f"Now run:  segment-triage scan --root '{Path(volpkg)}' -o demo-from-disk.html")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
