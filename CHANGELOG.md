# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Per-tag provenance in the table: **Last review** column and badge tooltips (who tagged it, when).
- **Ink** column (ink-prediction present, boolean only — never renders prediction imagery).
- Click-to-filter summary cards and status legend; `created ≥` date filter.
- "All untagged" info banner for real public-mirror runs (legacy, tag-less data).
- `remote` optional extra; the base install is now zero third-party dependencies.
- `py.typed` marker (PEP 561) + `Typing :: Typed`; CONTRIBUTING and this CHANGELOG.

### Changed
- Summary stats recompute over the visible (non-superseded) set so they match the table.
- CI now tests the full supported Python range (3.10–3.13).
- Standardized the data-server host references on `dl.ash2txt.org`.

### Fixed
- `_superseded`/`_test` detection anchored to a trailing token (was a substring match that could silently hide rows).
- `created` date validated via `strptime` (no bogus dates from impossible timestamps).
- Remote crawl restricted to same-origin links from the autoindex (SSRF hardening); cleaner CLI errors.

## [0.1.0]

### Added
- Initial release: crawl a VC3D `.volpkg` and render a self-contained, filterable/sortable
  review-status table. Seven filters mirroring VC3D's surface-tree filters, parity-tested in
  Python + TypeScript. Local and remote (http mirror) modes. MIT licensed.
