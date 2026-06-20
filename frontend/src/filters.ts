// Filter predicates — the TypeScript mirror of segment_triage/filters.py.
// Each returns true when a record should be KEPT while that filter is active.
// Kept in sync with VC3D's applyFiltersInternal(); verified by filters.test.ts
// against the shared tests/filter_cases.json.
import type { SegmentRecord } from "./types";

export type FilterFn = (r: Pick<SegmentRecord, "statuses" | "vc_gsfs_mode">) => boolean;

const has = (r: { statuses: string[] }, s: string) => r.statuses.includes(s);

export const FILTERS: Record<string, FilterFn> = {
  unreviewed: (r) => !has(r, "reviewed"),
  hide_unapproved: (r) => has(r, "approved"),
  hide_defective: (r) => !has(r, "defective"),
  hide_partial_review: (r) => !(has(r, "partial_review") || has(r, "reviewed")),
  show_partial_review: (r) => has(r, "partial_review") || has(r, "reviewed"),
  inspect_only: (r) => has(r, "inspect"),
  hide_expansion: (r) => (r.vc_gsfs_mode || "") !== "expansion",
};

export function applyFilters(
  records: SegmentRecord[],
  active: string[],
  search: string,
): SegmentRecord[] {
  const needle = (search || "").trim().toLowerCase();
  return records.filter((r) => {
    if (needle && !r.id.toLowerCase().includes(needle)) return false;
    return active.every((k) => !(k in FILTERS) || FILTERS[k](r));
  });
}
