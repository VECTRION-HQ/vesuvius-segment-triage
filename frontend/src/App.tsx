import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { applyFilters } from "./filters";
import { loadManifest } from "./data";
import type { SegmentRecord } from "./types";

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

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] || "bg-slate-100 text-slate-700 ring-1 ring-slate-400/20";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label(status)}</span>;
}

type SortKey =
  | "id" | "status_count" | "area_cm2" | "layer_count"
  | "has_ink_prediction" | "author" | "date_last_modified" | "meta_format";

function sortValue(r: SegmentRecord, key: SortKey): string | number | null {
  switch (key) {
    case "id": return r.id;
    case "status_count": return r.statuses.length;
    case "area_cm2": return r.area_cm2;
    case "layer_count": return r.layer_count;
    case "has_ink_prediction": return r.has_ink_prediction ? 1 : 0;
    case "author": return r.author;
    case "date_last_modified": return r.date_last_modified;
    case "meta_format": return r.meta_format;
  }
}

function compare(a: SegmentRecord, b: SegmentRecord, key: SortKey, dir: 1 | -1): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1; // nulls last
  if (vb === null || vb === undefined) return -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
  return String(va).localeCompare(String(vb)) * dir;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return d.length >= 10 ? d.slice(0, 10) : d;
}

function Stat({ label: l, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-slate-800">{value}</div>
      <div className={`text-xs font-medium ${tone || "text-slate-500"}`}>{l}</div>
    </div>
  );
}

export default function App() {
  const { summary, config, segments } = MANIFEST;
  const [active, setActive] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const rows = useMemo(() => {
    const filtered = applyFilters(segments, active, search);
    return [...filtered].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [active, search, sortKey, sortDir]);

  function toggle(key: string) {
    setActive((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }
  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === 1 ? " ▲" : " ▼") : "");

  const legend = [...config.statuses, config.untagged];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-5">
          <h1 className="text-xl font-bold text-slate-800">Segment Triage</h1>
          <p className="text-sm text-slate-500">
            Cross-segment review status for Vesuvius VC3D <code className="rounded bg-slate-200 px-1">.volpkg</code> surfaces ·
            source: <span className="font-mono">{MANIFEST.source || "—"}</span>
          </p>
          {MANIFEST.is_demo && (
            <div className="mt-2 inline-block rounded-md bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20">
              Demo data — review tags are synthesized (the public mirror's meta.json has no tags yet). Point <code>--root</code> at a local .volpkg for real tags.
            </div>
          )}
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Segments" value={summary.total} />
          <Stat label="Approved" value={`${summary.pct_approved}%`} tone="text-emerald-600" />
          <Stat label="Untagged (backlog)" value={summary.by_status["untagged"] ?? 0} tone="text-slate-500" />
          <Stat label="Defective" value={summary.by_status["defective"] ?? 0} tone="text-rose-600" />
          <Stat label="Reviewed" value={summary.by_status["reviewed"] ?? 0} tone="text-sky-600" />
          <Stat label="Total area cm²" value={summary.total_area_cm2} />
        </section>

        <section className="mb-3 flex flex-wrap items-center gap-2">
          {config.filters.map((f) => (
            <label key={f.key} title={f.help}
              className={`cursor-pointer select-none rounded-md border px-2.5 py-1 text-xs font-medium ${
                active.includes(f.key)
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}>
              <input type="checkbox" className="mr-1 align-middle"
                checked={active.includes(f.key)} onChange={() => toggle(f.key)} />
              {f.label}
            </label>
          ))}
          {active.length > 0 && (
            <button onClick={() => setActive([])}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 underline hover:text-slate-700">
              clear
            </button>
          )}
        </section>

        <section className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input type="search" placeholder="Search segment id…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none" />
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {legend.map((s) => (
              <span key={s} className="mr-1">
                <StatusBadge status={s} /> {summary.by_status[s] ?? 0}
              </span>
            ))}
          </div>
          <div className="text-sm font-medium text-slate-600">
            Showing {rows.length} of {summary.total}
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
                <Th onClick={() => sortBy("has_ink_prediction")}>Ink{arrow("has_ink_prediction")}</Th>
                <Th onClick={() => sortBy("author")}>Author{arrow("author")}</Th>
                <Th onClick={() => sortBy("date_last_modified")}>Modified{arrow("date_last_modified")}</Th>
                <Th onClick={() => sortBy("meta_format")}>meta{arrow("meta_format")}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">
                    {r.id}
                    {r.warnings.length > 0 && (
                      <span title={r.warnings.join("; ")} className="ml-1 cursor-help text-amber-500">⚠</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.display_statuses.map((s) => <StatusBadge key={s} status={s} />)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {r.area_cm2 == null ? "—" : r.area_cm2.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.layer_count ?? "—"}</td>
                  <td className="px-3 py-2 text-center">{r.has_ink_prediction ? "✓" : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.author || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(r.date_last_modified)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.meta_format}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                    No segments match the active filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="mt-4 text-xs text-slate-400">
          Generated by {MANIFEST.tool} v{MANIFEST.version}. Reads VC3D meta.json review tags
          (approved / defective / reviewed / inspect / partial_review) — metadata only, no scroll data is downloaded or redistributed.
        </footer>
      </div>
    </div>
  );
}

function Th({ children, onClick, numeric }: { children: ReactNode; onClick: () => void; numeric?: boolean }) {
  return (
    <th onClick={onClick}
      className={`cursor-pointer select-none px-3 py-2 hover:text-slate-700 ${numeric ? "text-right" : ""}`}>
      {children}
    </th>
  );
}
