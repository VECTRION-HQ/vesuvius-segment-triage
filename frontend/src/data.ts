import type { Manifest, SegmentRecord } from "./types";

const FILTERS = [
  { key: "unreviewed", label: "Unreviewed", help: "Show only segments NOT tagged 'reviewed'." },
  { key: "hide_unapproved", label: "Hide Unapproved", help: "Show only segments tagged 'approved'." },
  { key: "hide_defective", label: "Hide Defective", help: "Hide segments tagged 'defective'." },
  { key: "hide_partial_review", label: "Hide Partial Review", help: "Hide partial_review or reviewed." },
  { key: "show_partial_review", label: "Show Partial Review", help: "Show only partial_review or reviewed." },
  { key: "inspect_only", label: "Inspect Only", help: "Show only segments tagged 'inspect'." },
  { key: "hide_expansion", label: "Hide Expansion", help: "Hide vc_gsfs_mode == 'expansion'." },
];

function rec(partial: Partial<SegmentRecord> & { id: string }): SegmentRecord {
  return {
    statuses: [],
    display_statuses: partial.statuses && partial.statuses.length ? partial.statuses : ["untagged"],
    is_untagged: !(partial.statuses && partial.statuses.length),
    tag_users: {},
    tag_dates: {},
    area_cm2: null,
    author: null,
    layer_count: null,
    has_ink_prediction: false,
    date_last_modified: null,
    vc_gsfs_mode: null,
    avg_cost: null,
    uuid: null,
    meta_format: "tagged",
    source: "DEV sample",
    warnings: [],
    ...partial,
  };
}

// Tiny in-app sample so `npm run dev` shows a populated table without a backend.
const SAMPLE: Manifest = {
  tool: "vesuvius-segment-triage",
  version: "dev",
  source: "DEV sample (npm run dev)",
  is_demo: true,
  summary: {
    total: 4,
    tagged: 3,
    by_status: { approved: 1, defective: 1, reviewed: 1, inspect: 0, partial_review: 1, untagged: 1 },
    total_area_cm2: 41.7,
    area_known: 3,
    pct_approved: 25.0,
  },
  config: { statuses: ["approved", "defective", "reviewed", "inspect", "partial_review"], untagged: "untagged", labels: {}, filters: FILTERS },
  segments: [
    rec({ id: "20230702185753", statuses: ["approved", "reviewed"], area_cm2: 18.4, author: "segmenter-a", layer_count: 65, has_ink_prediction: true, vc_gsfs_mode: "tracing", date_last_modified: "2026-06-15T12:00:00" }),
    rec({ id: "20231012094417", statuses: ["defective"], area_cm2: 3.1, author: "community-1", layer_count: 65, vc_gsfs_mode: "expansion" }),
    rec({ id: "20241108111522", statuses: ["partial_review"], area_cm2: 20.2, author: "segmenter-b", layer_count: 33, has_ink_prediction: true }),
    rec({ id: "20250101000000", statuses: [], meta_format: "legacy", author: "community-2", layer_count: 0 }),
  ],
};

export function loadManifest(): Manifest {
  const el = document.getElementById("triage-data");
  const text = el?.textContent?.trim();
  if (text && text !== "null") {
    try {
      return JSON.parse(text) as Manifest;
    } catch (e) {
      console.error("Failed to parse #triage-data; falling back to sample.", e);
    }
  }
  return SAMPLE;
}
