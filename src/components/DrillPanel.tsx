import { InstructorAvatar, InstructorName } from "./InstructorAvatar";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { TreeRow } from "./NestedTable";
import { query, quote, type Row } from "../data/duckdb";
import { blueprints } from "../data/blueprints";
import { where, context, metricFacts } from "../data/analytics";
import { useStore } from "../state/store";
import { sheets } from "../data/sheets.config";
import { metricSQL, metrics } from "../semantics/metrics";
import { MetricCard } from "./MetricCard";
import { currentSnapshotMetrics } from "../semantics/evidence";
import { fmt, formatField } from "../semantics/formats";
import { exportCSV } from "./exports";
import { sourceRows } from "../data/raw";
import { Sparkline } from "./MetricCard";
export function DrillPanel({
  entry,
  tab,
  onClose,
}: {
  entry: TreeRow | null;
  tab: number;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sourceData, setSourceData] = useState<Record<string, unknown>[]>([]);
  const pageSize = 50;
  // A browser download of a sheet export stops being useful well before this.
  const EXPORT_LIMIT = 20000;

  const [records, setRecords] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [trend, setTrend] = useState<Row[]>([]);
  const [record, setRecord] = useState<Row | null>(null);
  const [original, setOriginal] = useState<Record<string, unknown> | null>(
    null,
  );
  useEffect(() => {
    let current = true;
    setOriginal(null);
    if (record)
      sourceRows(entry?.source || blueprints[tab].source, [record])
        .then((r) => {
          if (current) setOriginal(r[0]);
        })
        .catch((e) => {
          if (current) setErr(String(e));
        });
    return () => {
      current = false;
    };
  }, [record, tab, entry?.source]);
  const [err, setErr] = useState("");
  // The exact SQL scope behind this panel, for the explanation and the export.
  const [scope, setScope] = useState<{ where: string; path: string }>({ where: "", path: "" });
  const [exporting, setExporting] = useState(false);
  const s = useStore();
  useEffect(() => { setPage(0); }, [entry, tab, s.filters, s.transient]);
  const panel = useRef<HTMLDivElement>(null);
  const source = entry?.source || blueprints[tab].source;
  const filters = entry?.filters || s.filters;
  const metricIds = entry?.metrics || blueprints[tab].columns;
  const definition = sheets.find((s) => s.key === source)!;
  useEffect(() => {
    if (!entry) return;
    const old = document.activeElement as HTMLElement;
    panel.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = panel.current?.querySelectorAll<HTMLElement>(
          'button,a,input,select,[tabindex="0"]',
        );
        if (nodes?.length) {
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      old?.focus();
    };
  }, [entry, onClose]);
  useEffect(() => {
    if (!entry) return;
    let current = true;
    setRecord(null);
    setLoading(true);
    setTotal(0);
    setTrend([]);
    setRecords([]);
    setSourceData([]);
    setSummary({});
    setErr("");
    const groupingPath = entry.path
      .map((p) =>
        p.value === "Unspecified"
          ? `"${p.field}" IS NULL`
          : `"${p.field}"=${quote(p.value)}`,
      )
      .join(" AND ");
    const path = [groupingPath, entry.predicate].filter(Boolean).join(" AND ");
    const w = where(filters, source);
    setScope({ where: w, path });
    Promise.all([
      query(
        `SELECT * FROM "${source}"${w}${path ? (w ? " AND " : " WHERE ") + path : ""} ORDER BY date DESC, source_row DESC LIMIT ${pageSize} OFFSET ${page * pageSize}`,
      ),
      query(
        `SELECT month,${metricSQL(
          entry.metrics || [...new Set([...blueprints[tab].kpis, ...blueprints[tab].columns])].filter((id) => !["new_clients", "conversion_rate", "active_base"].includes(id) || tab !== 0),
          context(),
        )} FROM ${metricFacts(filters, source)}${path ? (!["sessions", "sales", "checkins"].includes(source) && w ? " AND " : " WHERE ") + path : ""} GROUP BY month ORDER BY month DESC LIMIT 14`,
      ),
      query(`SELECT COUNT(*) AS n FROM "${source}"${w}${path ? (w ? " AND " : " WHERE ") + path : ""}`),
      query(`SELECT ${metricSQL(metricIds, context(filters))}, COUNT(*) AS n FROM ${metricFacts(filters, source)}${path ? (!["sessions", "sales", "checkins"].includes(source) && w ? " AND " : " WHERE ") + path : ""}`),
    ])
      .then(async ([raw, t, count, aggregate]) => {
        if (!current) return;
        setRecords(raw);
        setTotal(Number(count[0]?.n || 0));
        setSummary(aggregate[0] || {});
        setTrend([...t].reverse());
        const originals = await sourceRows(source, raw);
        if (current) {
          setSourceData(originals);
          setLoading(false);
          setErr("");
        }
      })
      .catch((e) => { if (current) { setErr(String(e)); setLoading(false); } });
    return () => {
      current = false;
    };
  }, [entry, tab, s.filters, s.transient, page]);
  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Drill into ${entry.label}`}
            className="drill"
            initial={{ x: 640 }}
            animate={{ x: 0 }}
            exit={{ x: 640 }}
            transition={{
              duration: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? 0
                : 0.34,
            }}
          >
            <div className="panel-head">
              <div>
                <div className="breadcrumbs">
                  {entry.path.map((p, i) => (
                    <span key={p.field}>
                      {i > 0 && " / "}
                      {p.value}
                    </span>
                  ))}
                </div>
                <div className="trainer-profile-heading">{entry.path.at(-1)?.field === "trainer" && <InstructorAvatar key={entry.label} name={entry.label} large />}<h2>{entry.label}</h2></div>
                <p className="small">
                  {total.toLocaleString("en-IN")} contributing records / {definition.title}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close drill panel"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
            <div className="metric-strip">
              {metricIds.slice(0, 4).map((id) => (
                <MetricCard
                  key={id}
                  id={id}
                  value={summary[id]}
                  trend={trend}
                  evidence={summary}
                  n={Number(summary.n || 0)}
                  compare={false}
                />
              ))}
            </div>
            {currentSnapshotMetrics.has(metricIds[0]) ? <p className="small">Current snapshot across all dates. Historical comparisons are unavailable.</p> : <>
            <h3>Performance over time</h3>
            <Sparkline
              values={trend.map((t) =>
                t[metricIds[0]] == null
                  ? null
                  : Number(t[metricIds[0]]),
              )}
            />
            <div className="chart-labels">
              <span>{trend[0]?.month}</span>
              <span>{trend.at(-1)?.month}</span>
            </div>
            </>}
            <details className="drill-provenance">
              <summary>How this number is built</summary>
              {metricIds.slice(0, 4).map((id) => (
                <div key={id} className="drill-formula">
                  <strong>{metrics[id].label}</strong>
                  <code>{metrics[id].description}</code>
                  <p className="small">
                    Source columns: {metrics[id].sources.join(", ")}. Ranking
                    minimum {metrics[id].minSample} records
                    {Number(summary.n || 0) < metrics[id].minSample
                      ? ` · this scope has ${Number(summary.n || 0)}, so read it as a hint rather than a result`
                      : ""}
                    .
                  </p>
                </div>
              ))}
              <div className="drill-formula">
                <strong>Records selected</strong>
                <code>
                  {`SELECT * FROM "${source}"${scope.where}${scope.path ? (scope.where ? " AND " : " WHERE ") + scope.path : ""}`}
                </code>
                <p className="small">
                  {definition.title} · snapshot of the sheet currently loaded.
                  Every figure above is computed over exactly these rows.
                </p>
              </div>
            </details>
            <div className="register-head" style={{ marginTop: 24 }}>
              <h3>Contributing source rows</h3>
              <div className="drill-export">
                <button
                  className="button"
                  onClick={() => {
                    sourceRows(source, records).then((r) =>
                      exportCSV("floor-source-rows", r),
                    );
                  }}
                >
                  <Download size={12} />
                  Export page
                </button>
                <button
                  className="button"
                  disabled={exporting || !total}
                  // The whole scope, not just the page on screen: a drill-down
                  // export should match the number that was clicked.
                  onClick={async () => {
                    setExporting(true);
                    try {
                      const all = await query(
                        `SELECT * FROM "${source}"${scope.where}${scope.path ? (scope.where ? " AND " : " WHERE ") + scope.path : ""} ORDER BY date DESC, source_row DESC LIMIT ${EXPORT_LIMIT}`,
                      );
                      exportCSV(
                        `floor-${(entry?.label || "scope").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                        await sourceRows(source, all),
                      );
                      if (total > EXPORT_LIMIT)
                        setErr(
                          `Exported the first ${EXPORT_LIMIT.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} records. Narrow the scope to export the rest.`,
                        );
                    } catch (e) {
                      setErr(String(e));
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  <Download size={12} />
                  {exporting
                    ? "Preparing…"
                    : `Export all ${total.toLocaleString("en-IN")}`}
                </button>
              </div>
            </div>
            {err && <p className="warn">{err}</p>}
            <p className="small">
              {total ? `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${total.toLocaleString("en-IN")} records` : "No contributing records"}. All original columns are included; source row references retain workbook positions.
            </p>
            {loading && <p role="status">Loading source rows…</p>}
            {!loading && sourceData.length > 0 && (
              <div className="source-detail-table" tabIndex={0} aria-label="Original item-level sheet rows">
                <table>
                  <thead><tr><th scope="col">Sheet row</th>{Object.keys(sourceData[0]).filter((k) => !/token/i.test(k)).map((k) => <th scope="col" key={k}>{k}</th>)}</tr></thead>
                  <tbody>{sourceData.map((row, i) => <tr key={String(records[i]?.source_row)}>
                    <td><a target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${definition.id}/edit#range=${encodeURIComponent("'" + definition.title + "'!A" + records[i]?.source_row)}`}>{String(records[i]?.source_row)} ↗</a></td>
                    {Object.entries(row).filter(([k]) => !/token/i.test(k)).map(([k,v]) => <td key={k}>{formatField(k, v)}</td>)}
                  </tr>)}</tbody>
                </table>
              </div>
            )}
            <div className="source-pagination">
              <button className="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Previous page</button>
              <span>Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span>
              <button className="button" disabled={(page + 1) * pageSize >= total || loading} onClick={() => setPage(page + 1)}>Next page <ChevronRight size={14} /></button>
            </div>
            {records.map((r, i) => (
              <div className="drill-record" key={i}>
                <button
                  style={{ textAlign: "left" }}
                  onClick={() => setRecord(record === r ? null : r)}
                >
                  <span className="record-name">
                    {r.member || (r.trainer ? <InstructorName name={String(r.trainer)}/> : r.format || "Source record")}
                  </span>
                  <p>
                    {r.date} / {r.time} / {r.location}
                    {String(r.product || r.package || r.category || "")}
                  </p>
                </button>
                <span className="number">{fmt("revenue", r.revenue)}</span>
                <a
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open source row ${r.source_row}`}
                  href={`https://docs.google.com/spreadsheets/d/${definition.id}/edit#range=${encodeURIComponent("'" + definition.title + "'!A" + r.source_row)}`}
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            ))}
            {original && (
              <div className="detail-fields">
                {Object.entries(original)
                  .filter(([k]) => !k.includes("Token"))
                  .map(([k, v]) => (
                    <div className="detail-field" key={k}>
                      <small>{k}</small>
                      <span>{formatField(k, v)}</span>
                    </div>
                  ))}
              </div>
            )}
            <div className="settings-row">
              <button
                className="button"
                onClick={() => {
                  const index = records.indexOf(record!);
                  setRecord(records[Math.max(0, index - 1)] || null);
                }}
                disabled={!record}
              >
                <ChevronLeft size={12} />
                Previous record
              </button>
              <button
                className="button"
                onClick={() => {
                  const index = records.indexOf(record!);
                  setRecord(
                    records[Math.min(records.length - 1, index + 1)] || null,
                  );
                }}
                disabled={!record}
              >
                Next record
                <ChevronRight size={12} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
