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
import { where, context, sessionFacts } from "../data/analytics";
import { useStore } from "../state/store";
import { sheets } from "../data/sheets.config";
import { metricSQL } from "../semantics/metrics";
import { MetricCard } from "./MetricCard";
import { fmt } from "../semantics/formats";
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
  const [records, setRecords] = useState<Row[]>([]);
  const [trend, setTrend] = useState<Row[]>([]);
  const [record, setRecord] = useState<Row | null>(null);
  const [original, setOriginal] = useState<Record<string, unknown> | null>(
    null,
  );
  useEffect(() => {
    let current = true;
    setOriginal(null);
    if (record)
      sourceRows(blueprints[tab].source, [record])
        .then((r) => {
          if (current) setOriginal(r[0]);
        })
        .catch((e) => {
          if (current) setErr(String(e));
        });
    return () => {
      current = false;
    };
  }, [record, tab]);
  const [err, setErr] = useState("");
  const s = useStore();
  const panel = useRef<HTMLDivElement>(null);
  const source = blueprints[tab].source;
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
    const path = entry.path
      .map((p) =>
        p.value === "Unspecified"
          ? `"${p.field}" IS NULL`
          : `"${p.field}"=${quote(p.value)}`,
      )
      .join(" AND ");
    const w = where(s.filters, source);
    Promise.all([
      query(
        `SELECT * FROM "${source}"${w}${path ? (w ? " AND " : " WHERE ") + path : ""} ORDER BY date DESC LIMIT 500`,
      ),
      query(
        `SELECT month,${metricSQL(
          [
            ...new Set([...blueprints[tab].kpis, ...blueprints[tab].columns]),
          ].filter(
            (id) =>
              !["new_clients", "conversion_rate", "active_base"].includes(id) ||
              tab !== 0,
          ),
          context(),
        )} FROM ${source === "sessions" ? sessionFacts(s.filters) : `"${source}"${w}`}${path ? (source !== "sessions" && w ? " AND " : " WHERE ") + path : ""} GROUP BY month ORDER BY month DESC LIMIT 14`,
      ),
    ])
      .then(([raw, t]) => {
        if (current) {
          setRecords(raw);
          setTrend([...t].reverse());
          setErr("");
        }
      })
      .catch((e) => setErr(String(e)));
    return () => {
      current = false;
    };
  }, [entry, tab, s.filters]);
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
                <h2>{entry.label}</h2>
                <p className="small">
                  {entry.values.n} contributing records / {definition.title}
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
              {blueprints[tab].columns.slice(0, 4).map((id) => (
                <MetricCard
                  key={id}
                  id={id}
                  value={entry.values[id]}
                  trend={trend}
                  n={Number(entry.values.n)}
                  compare={false}
                />
              ))}
            </div>
            <h3>Performance over time</h3>
            <Sparkline
              values={trend.map((t) =>
                t[blueprints[tab].columns[0]] == null
                  ? null
                  : Number(t[blueprints[tab].columns[0]]),
              )}
            />
            <div className="chart-labels">
              <span>{trend[0]?.month}</span>
              <span>{trend.at(-1)?.month}</span>
            </div>
            <div className="register-head" style={{ marginTop: 24 }}>
              <h3>Contributing source rows</h3>
              <button
                className="button"
                onClick={() => {
                  sourceRows(source, records).then((r) =>
                    exportCSV("floor-source-rows", r),
                  );
                }}
              >
                <Download size={12} />
                CSV
              </button>
            </div>
            {err && <p className="warn">{err}</p>}
            <p className="small">
              Showing up to 500 records. Source row references retain original
              workbook positions.
            </p>
            {records.map((r, i) => (
              <div className="drill-record" key={i}>
                <button
                  style={{ textAlign: "left" }}
                  onClick={() => setRecord(record === r ? null : r)}
                >
                  <span className="record-name">
                    {r.member || r.trainer || r.format || "Source record"}
                  </span>
                  <p>
                    {r.date} / {r.time} / {r.location}
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
                      <span>{v == null ? "—" : String(v)}</span>
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
