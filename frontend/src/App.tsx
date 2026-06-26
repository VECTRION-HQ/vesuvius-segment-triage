import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { applyFilters } from "./filters";
import { loadManifest } from "./data";
import type { SegmentRecord, Summary } from "./types";

const MANIFEST = loadManifest();

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20",
  reviewed: "bg-sky-100 text-sky-800 ring-1 ring-sky-600/20",
  partial_review: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-600/20",
  inspect: "bg-amber-100 text-amber-800 ring-1 ring-amber-600/20",
  defective: "bg-rose-100 text-rose-800 ring-1 ring-rose-600/20",
  untagged: "bg-slate-100 text-slate-500 ring-1 ring-slate-400/20",
};

function label(status: string): string {
  return (MANIFEST.config.labels && MANIFEST.config.labels[status]) ||
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusBadge({ status, info }: { status: string; info?: string }) {
  const cls = STATUS_STYLE[status] || "bg-slate-100 text-slate-700 ring-1 ring-slate-400/20";
  return <span title={info} className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label(status)}</span>;
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
  return `${s}${u ? " · " + u : ""}${d ? " · " + d.slice(0, 10) : ""}`;
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

function Stat({ label: l, value, tone, active, onClick }:
  { label: string; value: string | number; tone?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`rounded-lg border bg-white px-4 py-3 text-left transition ${
        active ? "border-slate-800 ring-1 ring-slate-800" : "border-slate-200"
      } ${onClick ? "cursor-pointer hover:border-slate-400" : "cursor-default"}`}>
      <div className="text-2xl font-semibold tabular-nums text-slate-800">{value}</div>
      <div className={`text-xs font-medium ${tone || "text-slate-500"}`}>{l}</div>
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
  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === 1 ? " ▲" : " ▼") : "");
  const legend = [...config.statuses, config.untagged];
  const allUntagged = summary.tagged === 0 && !MANIFEST.is_demo && summary.total > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Segment Triage</h1>
            <p className="text-sm text-slate-500">
              Review status across VC3D <code className="rounded bg-slate-200 px-1">.volpkg</code> surfaces ·
              source <span className="font-mono text-slate-600">{MANIFEST.source || "—"}</span>
            </p>
          </div>
          {MANIFEST.is_demo && (
            <div className="rounded-md bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20">
              Demo data — these tags are synthesized (no real scroll data). Run on your own .volpkg to see real tags.
            </div>
          )}
        </header>

        {allUntagged && (
          <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            No review tags found — this looks like legacy/public data. Point <code>--root</code> at a local VC3D
            <code> .volpkg</code> to see approved / defective / reviewed tags. (Area, author, layers and created date still work.)
          </div>
        )}

        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Segments" value={summary.total} active={pick === null} onClick={() => setPick(null)} />
          <Stat label="Approved" value={`${summary.pct_approved}%`} tone="text-emerald-600" active={pick === "approved"} onClick={() => pickStatus("approved")} />
          <Stat label="Untagged (backlog)" value={summary.by_status["untagged"] ?? 0} active={pick === "untagged"} onClick={() => pickStatus("untagged")} />
          <Stat label="Defective" value={summary.by_status["defective"] ?? 0} tone="text-rose-600" active={pick === "defective"} onClick={() => pickStatus("defective")} />
          <Stat label="Reviewed" value={summary.by_status["reviewed"] ?? 0} tone="text-sky-600" active={pick === "reviewed"} onClick={() => pickStatus("reviewed")} />
          <Stat label="Total area cm²" value={summary.total_area_cm2} />
        </section>

        <section className="mb-3 flex flex-wrap items-center gap-2">
          {config.filters.map((f) => (
            <label key={f.key} title={f.help}
              className={`cursor-pointer select-none rounded-md border px-2.5 py-1 text-xs font-medium ${
                active.includes(f.key) ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}>
              <input type="checkbox" className="mr-1 align-middle" checked={active.includes(f.key)} onChange={() => toggle(f.key)} />
              {f.label}
            </label>
          ))}
          {(active.length > 0 || pick || since) && (
            <button onClick={() => { setActive([]); setPick(null); setSince(""); }}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 underline hover:text-slate-700">clear</button>
          )}
        </section>

        <section className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input type="search" placeholder="Search segment id…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none" />
            <label className="flex items-center gap-1 text-xs text-slate-500">created ≥
              <input type="date" value={since} onChange={(e) => setSince(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {legend.map((s) => (
              <button key={s} onClick={() => pickStatus(s)} title={`show only ${label(s)}`}
                className={`mr-1 rounded px-1 ${pick === s ? "ring-1 ring-slate-800" : "hover:bg-slate-100"}`}>
                <StatusBadge status={s} /> {summary.by_status[s] ?? 0}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {supersededCount > 0 && (
              <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
                show superseded ({supersededCount})
              </label>
            )}
            <span className="font-medium text-slate-600">{rows.length} of {summary.total} · {shownArea} cm²</span>
          </div>
        </section>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th onClick={() => sortBy("id")}>Segment{arrow("id")}</Th>
                <th className="px-3 py-2">Status</th>
                <Th onClick={() => sortBy("area_cm2")} numeric>Area cm²{arrow("area_cm2")}</Th>
                <Th onClick={() => sortBy("layer_count")} numeric>Layers{arrow("layer_count")}</Th>
                <Th onClick={() => sortBy("rendered")}>Mesh{arrow("rendered")}</Th>
                <Th onClick={() => sortBy("has_ink_prediction")}>Ink{arrow("has_ink_prediction")}</Th>
                <Th onClick={() => sortBy("author")}>Author{arrow("author")}</Th>
                <Th onClick={() => sortBy("created")}>Created{arrow("created")}</Th>
                <Th onClick={() => sortBy("last_review")}>Last review{arrow("last_review")}</Th>
                <th className="px-3 py-2" title="meta.json format: tagged / legacy / missing">format</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const url = segUrl(r);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {url
                        ? <a href={url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{r.id}↗</a>
                        : <span className="text-slate-700">{r.id}</span>}
                      {r.superseded && <span className="ml-1 text-slate-400" title="superseded">·old</span>}
                      {r.warnings.length > 0 && <span title={r.warnings.join("; ")} className="ml-1 cursor-help text-amber-500">⚠</span>}
                    </td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1">
                      {r.display_statuses.map((s) => <StatusBadge key={s} status={s} info={badgeInfo(r, s)} />)}
                    </div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.area_cm2 == null ? "—" : r.area_cm2.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.layer_count ?? "—"}</td>
                    <td className="px-3 py-2 text-center">{r.rendered ? <span className="text-emerald-600">✓</span> : "—"}</td>
                    <td className="px-3 py-2 text-center">{r.has_ink_prediction ? <span className="text-indigo-600">✓</span> : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.author || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(r.created)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(latestReview(r))}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.meta_format}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">No segments match the active filters.</td></tr>
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

function Th({ children, onClick, numeric }: { children: ReactNode; onClick: () => void; numeric?: boolean }) {
  return (
    <th onClick={onClick} className={`cursor-pointer select-none px-3 py-2 hover:text-slate-700 ${numeric ? "text-right" : ""}`}>
      {children}
    </th>
  );
}
