# Contributing

Thanks for taking a look. This is a small, focused tool for the Vesuvius Challenge
community — issues, bug reports, and "this would make it useful for my workflow"
feedback are all very welcome.

## Dev setup

```bash
# Python (zero third-party deps for local mode; remote mode needs the extra)
pip install -e ".[dev]"
pytest

# Frontend (React + TypeScript + Tailwind, bundled to a single file)
cd frontend
npm install
npm test          # filter-parity tests (shared with the Python suite)
npm run build     # builds + copies the bundle into segment_triage/web/template.html
```

`pip install -e .` (no extra) installs **zero** third-party packages and runs the
local/demo path. `pip install -e ".[remote]"` adds `requests` for the http-mirror mode.

## Design invariants (please keep these)

- **Read-only.** The tool reads `meta.json` metadata; it never writes review tags back — that is VC3D's job.
- **Tag-tolerant.** Unknown status keys are tolerated, never errors. Status keys + filter presets are config-driven (`segment_triage/config.py`).
- **Filter parity.** The filter predicates mirror VC3D's `SurfacePanelController.cpp` exactly and are parity-tested in Python and TypeScript from one shared fixture (`tests/filter_cases.json`). If you touch a filter, update both and the fixture.
- **No real data.** Fixtures/demo/screenshots use synthesized identities only — never real contributor usernames, local `.volpkg` paths, or rendered scroll/prediction imagery.

## Submitting changes

1. Branch from `main` (`feature/...`).
2. `pytest` and `npm test` green; run `npm run build` if you changed the frontend.
3. Open a PR with a short description of the change and why.
