import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { applyFilters } from "./filters";
import { loadManifest } from "./data";
import type { SegmentRecord, Summary } from "./types";

const MANIFEST = loadManifest();

// One desaturated dot + label per status (color reserved for meaning only) —
// far quieter than a wall of filled pastel pills. Dot carries the hue; text stays neutral.
const DOT: Record<string, string> = {
  approved: "bg-emerald-500",
  reviewed: "bg-sky-500",
  partial_review: "bg-indigo-500",
  inspect: "bg-amber-500",
  defective: "bg-rose-500",
  untagged: "bg-slate-300",
};
const ACCENT: Record<string, string> = {
  approved: "text-emerald-600",
  defective: "text-rose-600",
  reviewed: "text-sky-600",
};

function label(status: string): string {
  return (MANIFEST.config.labels && MANIFEST.config.labels[status]) ||
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusDot({ status, info }: { status: string; info?: string }) {
  return (
    <span title={info} className="mr-2 inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${DOT[status] || "bg-slate-300"}`} />
      {label(status)}
    </span>
  );
}

const fmtDate = (d: string | null) => (d ? d.slice(0, 10) : "—");
const segUrl = (r: SegmentRecord) => (/^https?:\/\//.test(r.source) ? r.source : null);
const latestReview = (r: SegmentRecord): string | null => {
  const ds = Object.values(r.tag_dates || {});
  return ds.length ? ds.slice().sort()[ds.length - 1] : null;
};
const badgeInfo = (r: SegmentRecord, s: string): string | undefined => {
  const u = r.tag_users?.[s];
  const d = r.tag_dates?.[s];
  if (!u && !d) return undefined;
  return `${label(s)}${u ? " · " + u : ""}${d ? " · " + d.slice(0, 10) : ""}`;
};

function computeSummary(list: SegmentRecord[]): Summary {
  const by: Record<string, number> = { approved: 0, defective: 0, reviewed: 0, inspect: 0, partial_review: 0, untagged: 0 };
  let area = 0, tagged = 0, rendered = 0, area_known = 0;
  for (const r of list) {
    for (const s of r.display_statuses) by[s] = (by[s] || 0) + 1;
    if (!r.is_untagged) tagged++;
    if (r.rendered) rendered++;
    if (r.area_cm2) { area += r.area_cm2; area_known++; }
  }
  const total = list.length;
  return {
    total, tagged, rendered, superseded: 0, by_status: by, area_known,
    total_area_cm2: Math.round(area * 100) / 100,
    pct_approved: total ? Math.round((1000 * by.approved) / total) / 10 : 0,
  };
}

type SortKey =
  | "id" | "status_count" | "area_cm2" | "layer_count" | "rendered"
  | "has_ink_prediction" | "author" | "created" | "last_review" | "meta_format";

function sortValue(r: SegmentRecord, key: SortKey): string | number | null {
  switch (key) {
    case "id": return r.id;
    case "status_count": return r.statuses.length;
    case "area_cm2": return r.area_cm2;
    case "layer_count": return r.layer_count;
    case "rendered": return r.rendered ? 1 : 0;
    case "has_ink_prediction": return r.has_ink_prediction ? 1 : 0;
    case "author": return r.author;
    case "created": return r.created;
    case "last_review": return latestReview(r);
    case "meta_format": return r.meta_format;
  }
}

function compare(a: SegmentRecord, b: SegmentRecord, key: SortKey, dir: 1 | -1): number {
  const va = sortValue(a, key), vb = sortValue(b, key);
  if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
  if (vb === null || vb === undefined) return -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
  return String(va).localeCompare(String(vb)) * dir;
}

function Caret({ active, dir }: { active: boolean; dir: 1 | -1 }) {
  if (!active) return <span className="inline-block w-3" aria-hidden />;
  return (
    <svg className="inline-block h-3 w-3 text-slate-500" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d={dir === 1 ? "M3 7.5L6 4.5L9 7.5" : "M3 4.5L6 7.5L9 4.5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label: l, value, accent, active, onClick }:
  { label: string; value: string | number; accent?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`rounded-lg px-3.5 py-2.5 text-left transition ${
        active ? "bg-slate-900 text-white" : "bg-slate-50 hover:bg-slate-100"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}>
      <div className={`text-xl font-semibold tabular-nums ${active ? "text-white" : accent || "text-slate-800"}`}>{value}</div>
      <div className={`mt-0.5 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{l}</div>
    </button>
  );
}

export default function App() {
  const { config, segments } = MANIFEST;
  const supersededCount = useMemo(() => segments.filter((s) => s.superseded).length, []);
  const [active, setActive] = useState<string[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [since, setSince] = useState("");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const base = useMemo(
    () => (showSuperseded ? segments : segments.filter((s) => !s.superseded)),
    [showSuperseded],
  );
  const summary = useMemo(() => computeSummary(base), [base]);

  const rows = useMemo(() => {
    let r = applyFilters(base, active, search);
    if (pick) r = r.filter((x) => x.display_statuses.includes(pick));
    if (since) r = r.filter((x) => x.created != null && x.created.slice(0, 10) >= since);
    return [...r].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [base, active, pick, search, since, sortKey, sortDir]);

  const shownArea = useMemo(() => Math.round(rows.reduce((s, r) => s + (r.area_cm2 || 0), 0) * 10) / 10, [rows]);

  function toggle(key: string) {
    setActive((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  const pickStatus = (s: string | null) => setPick((cur) => (cur === s ? null : s));
  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(key === "created" || key === "area_cm2" || key === "last_review" ? -1 : 1); }
  }
  const legend = [...config.statuses, config.untagged];
  const allUntagged = summary.tagged === 0 && !MANIFEST.is_demo && summary.total > 0;
  const hasFilters = active.length > 0 || pick || since;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-7xl px-5 py-6">
        <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Segment Triage</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Review status across VC3D <code className="rounded bg-slate-100 px-1 text-[13px]">.volpkg</code> surfaces ·
              source <span className="font-mono text-[13px] text-slate-600">{MANIFEST.source || "—"}</span>
            </p>
          </div>
          {MANIFEST.is_demo && (
            <div className="rounded-md bg-amber-50 px-2.5 py-1 text-xs text-amber-700 ring-1 ring-amber-200">
              Demo — tags synthesized; run on your own .volpkg for real tags
            </div>
          )}
        </header>

        {allUntagged && (
          <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            No review tags found — this looks like legacy/public data. Point <code>--root</code> at a local VC3D
            <code> .volpkg</code> to see approved / defective / reviewed tags. (Area, author, layers and created date still work.)
          </div>
        )}

        <section className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Segments" value={summary.total} active={pick === null} onClick={() => setPick(null)} />
          <Stat label="Approved" value={`${summary.pct_approved}%`} accent={ACCENT.approved} active={pick === "approved"} onClick={() => pickStatus("approved")} />
          <Stat label="Untagged · backlog" value={summary.by_status["untagged"] ?? 0} active={pick === "untagged"} onClick={() => pickStatus("untagged")} />
          <Stat label="Defective" value={summary.by_status["defective"] ?? 0} accent={ACCENT.defective} active={pick === "defective"} onClick={() => pickStatus("defective")} />
          <Stat label="Reviewed" value={summary.by_status["reviewed"] ?? 0} accent={ACCENT.reviewed} active={pick === "reviewed"} onClick={() => pickStatus("reviewed")} />
          <Stat label="Total area cm²" value={summary.total_area_cm2} />
        </section>

        <section className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {config.filters.map((f) => (
            <label key={f.key} title={f.help}
              className={`cursor-pointer select-none rounded-md border px-2.5 py-1 text-xs ${
                active.includes(f.key) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}>
              <input type="checkbox" className="mr-1 align-middle accent-slate-900" checked={active.includes(f.key)} onChange={() => toggle(f.key)} />
              {f.label}
            </label>
          ))}
        </section>

        <section className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <input type="search" placeholder="Search segment id…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100" />
            <label className="flex items-center gap-1 text-xs text-slate-500">created ≥
              <input type="date" value={since} onChange={(e) => setSince(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-slate-400 focus:outline-none" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-0.5">
            {legend.map((s) => (
              <button key={s} onClick={() => pickStatus(s)} title={`show only ${label(s)}`}
                className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs ${pick === s ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:bg-slate-100"}`}>
                <span className={`h-2 w-2 rounded-full ${DOT[s]}`} />{label(s)}
                <span className="tabular-nums text-slate-400">{summary.by_status[s] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {supersededCount > 0 && (
              <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" className="accent-slate-900" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
                show superseded ({supersededCount})
              </label>
            )}
            {hasFilters && (
              <button onClick={() => { setActive([]); setPick(null); setSince(""); }}
                className="text-xs text-slate-500 underline hover:text-slate-700">clear</button>
            )}
            <span className="tabular-nums font-medium text-slate-700">{rows.length} of {summary.total} · {shownArea} cm²</span>
          </div>
        </section>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-left text-xs font-medium text-slate-500 backdrop-blur [&_th]:border-b [&_th]:border-slate-200">
              <tr>
                <Th k="id" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>Segment</Th>
                <th className="px-3 py-2.5">Status</th>
                <Th k="area_cm2" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} numeric>Area cm²</Th>
                <Th k="layer_count" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} numeric>Layers</Th>
                <Th k="rendered" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>Mesh</Th>
                <Th k="has_ink_prediction" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>Ink</Th>
                <Th k="author" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>Author</Th>
                <Th k="created" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>Created</Th>
                <Th k="last_review" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>Last review</Th>
                <th className="px-3 py-2.5" title="meta.json format: tagged / legacy / missing">Format</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const url = segUrl(r);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">
                      {url
                        ? <a href={url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{r.id}<span className="text-slate-400"> ↗</span></a>
                        : <span className="text-slate-700">{r.id}</span>}
                      {r.superseded && <span className="ml-1 text-slate-400" title="superseded">·old</span>}
                      {r.warnings.length > 0 && <span title={r.warnings.join("; ")} className="ml-1 cursor-help text-amber-500">⚠</span>}
                    </td>
                    <td className="px-3 py-2"><div className="flex flex-wrap items-center">
                      {r.display_statuses.map((s) => <StatusDot key={s} status={s} info={badgeInfo(r, s)} />)}
                    </div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.area_cm2 == null ? <span className="text-slate-300">—</span> : r.area_cm2.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.layer_count ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">{r.rendered ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">{r.has_ink_prediction ? <span className="text-indigo-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.author || <span className="text-slate-300">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{fmtDate(r.created)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{fmtDate(latestReview(r))}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{r.meta_format}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="h-24 px-3 text-center text-slate-400">No segments match the active filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="mt-4 text-xs text-slate-400">
          Generated by {MANIFEST.tool} v{MANIFEST.version}. Reads VC3D meta.json review tags
          (approved / defective / reviewed / inspect / partial_review) and segment metadata — read-only, no scroll data is downloaded or redistributed.
        </footer>
      </div>
    </div>
  );
}

function Th({ k, children, sortKey, sortDir, onSort, numeric }:
  { k: SortKey; children: ReactNode; sortKey: SortKey; sortDir: 1 | -1; onSort: (k: SortKey) => void; numeric?: boolean }) {
  return (
    <th onClick={() => onSort(k)} className="cursor-pointer select-none px-3 py-2.5 hover:text-slate-700">
      <span className={`inline-flex items-center gap-1 ${numeric ? "flex-row-reverse" : ""}`}>
        {children}<Caret active={k === sortKey} dir={sortDir} />
      </span>
    </th>
  );
}
