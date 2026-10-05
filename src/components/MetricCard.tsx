import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useId } from "react";
import { Info, TriangleAlert, X, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { comparisonDates } from "../data/periods";
import { currentSnapshotMetrics, metricNotes } from "../semantics/evidence";
import { health } from "../data/duckdb";
import { sheets } from "../data/sheets.config";
import { blueprints } from "../data/blueprints";
import { metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import type { Row } from "../data/duckdb";
export function Sparkline({
  values,
  color = "var(--accent)",
}: {
  values: (number | null)[];
  color?: string;
}) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v != null && Number.isFinite(p.v));
  if (points.length < 2)
    return (
      <svg className="metric-spark metric-spark-empty" viewBox="0 0 180 40" preserveAspectRatio="none" aria-hidden="true">
        <line
          x1="4"
          y1="20"
          x2="176"
          y2="20"
          stroke="var(--hairline)"
          strokeDasharray="3 3"
        />
      </svg>
    );
  const nums = points.map((p) => p.v!);
  const min = Math.min(...nums),
    max = Math.max(...nums),
    width = 172;
  const x = (i: number) => 4 + (i / (values.length - 1)) * width;
  const y = (v: number) => max === min ? 20 : 32 - ((v - min) / (max - min)) * 24;
  // Keep missing months as gaps rather than implying continuous evidence.
  const segments: typeof points[] = [];
  points.forEach((point, index) => {
    if (!index || point.i !== points[index - 1].i + 1) segments.push([]);
    segments.at(-1)!.push(point);
  });
  const last = points.at(-1)!;
  return (
    <svg
      className="metric-spark"
      viewBox="0 0 180 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".24" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {segments.map((segment) => {
        const coordinates = segment.map(({ v, i }) => `${x(i)},${y(v!)}`).join(" ");
        return <g key={segment[0].i}>
          {segment.length > 1 && <polygon className="metric-spark-area" points={`${x(segment[0].i)},40 ${coordinates} ${x(segment.at(-1)!.i)},40`} fill={`url(#${gradientId})`} />}
          <polyline className="metric-spark-line" points={coordinates} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pathLength="1" />
        </g>;
      })}
      <circle
        className="metric-spark-dot"
        cx={x(last.i)}
        cy={y(last.v!)}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}
export function MetricCard({
  id,
  value,
  previous,
  trend = [],
  n,
  onDrill,
  warning,
  compare = true,
  evidence,
}: {
  id: string;
  value: unknown;
  previous?: unknown;
  trend?: Row[];
  n: number;
  onDrill?: () => void;
  warning?: string;
  compare?: boolean;
  evidence?: Row;
}) {
  const m = metrics[id];
  const scope = useStore();
  const comparisonMode = scope.compare;
  const isSnapshot = currentSnapshotMetrics.has(id);
  const tooltipId = useId();
  const priorDates = comparisonDates(scope.filters.from, scope.filters.to, comparisonMode);
  const note = metricNotes[id];
  const sourceKeys = [...new Set(m.sources.map((column) => column.split(/[. →]/)[0].toLowerCase()))];
  const sourceInfo = sourceKeys.map((key) => ({ definition: sheets.find((sheet) => sheet.key === key), status: health[key] })).filter((item) => item.definition);
  const trendValues = trend.map((row) => row[id] == null ? null : Number(row[id])).filter((v): v is number => v != null && Number.isFinite(v));
  const canCompare = compare && comparisonMode !== "none" && !isSnapshot && value != null && previous != null;
  const numerator = evidence?.[`${id}__numerator`];
  const denominator = evidence?.[`${id}__denominator`];

  const [info, setInfo] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 70 });
  useEffect(() => {
    if (!info) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          left: Math.max(16, Math.min(rect.left, window.innerWidth - 406)),
          top: Math.max(
            16,
            Math.min(rect.bottom + 8, window.innerHeight - 570),
          ),
        });
    };
    update();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInfo(false);
        anchor.current?.focus();
      }
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", key);
    };
  }, [info]);
  const positive = (Number(value) >= Number(previous)) === m.higherIsBetter;
  const unchanged = Number(value) === Number(previous);
  return (
    <article
      className="metric-card"
      style={{ "--card-accent": `var(--${m.domain})` } as React.CSSProperties}
    >
      <div className="metric-label">
        <span title={m.label}>{m.label}</span>
        <button
          ref={anchor}
          aria-label={`Definition of ${m.label}`}
          aria-expanded={info}
          aria-controls={info ? tooltipId : undefined}
          onClick={() => setInfo(true)}
        >
          {warning ? <TriangleAlert size={12} /> : <Info size={14} />}
        </button>
      </div>
      <div className="metric-reading">
      <button
        className="metric-value number"
        style={{
          display: "block",
          padding: 0,
          textAlign: "left",
          color: warning ? "var(--warn)" : undefined,
        }}
        onClick={onDrill}
        aria-label={`Drill into ${m.label}: ${fmt(id, value)}`}
      >
        {fmt(id, value)}
      </button>
      <Sparkline
        color={`var(--${m.domain})`}
        values={trend.map((t) => (t[id] == null ? null : Number(t[id])))}
      />
      </div>
      <div
        className={`metric-delta ${!canCompare || unchanged ? "muted" : positive ? "positive" : "negative"}`}
      >
        {canCompare && !unchanged && (Number(value) >= Number(previous) ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
        {canCompare ? delta(id, value, previous) : isSnapshot ? "Current snapshot" : "No comparison"}
        {n < m.minSample && <span className="small">n = {n}</span>}
      </div>
      <div className="metric-footer">
        <span>
          {canCompare
            ? comparisonMode === "year"
              ? "vs last year"
              : "vs prior period"
            : isSnapshot ? "All dates · snapshot" : "Source-backed"}
        </span>
        <span>
          {m.aggregation === "weighted"
            ? "Weighted"
            : m.aggregation === "sum"
              ? "Total"
              : m.aggregation === "median" ? "Median" : m.aggregation === "avg" ? "Average" : "Snapshot"}
        </span>
      </div>
      {info &&
        createPortal(
          <div className="metric-popover-scrim" onClick={() => setInfo(false)}>
            <div
              className="metric-info"
              style={{
                position: "fixed",
                left: position.left,
                top: position.top,
                width: Math.min(390, window.innerWidth - 32),
                maxHeight: window.innerHeight - position.top - 16,
              }}
              onClick={(e) => e.stopPropagation()}
              id={tooltipId}
              role="dialog"
              aria-label={m.label}
            >
              <div className="metric-tooltip-head"><div><span className="metric-eyebrow">Metric intelligence</span><strong>{m.label}</strong></div><button className="icon-button" aria-label="Close metric details" onClick={() => setInfo(false)}><X size={16} /></button></div>
              <p className="metric-explanation">{note?.definition || `${m.label} is calculated from the source fields below using ${m.aggregation} aggregation.`}</p>
              <div className="metric-tooltip-values"><div><small>Selected scope</small><strong>{fmt(id, value, true)}</strong></div><div><small>{comparisonMode === "year" ? "Same period last year" : "Previous period"}</small><strong>{canCompare ? fmt(id, previous, true) : "Unavailable"}</strong></div></div>
              {numerator != null && denominator != null && <div className="metric-calculation"><span>{note?.numerator}: <b>{id === "revenue_per_checkin" ? fmt("revenue", numerator, true) : Number(numerator).toLocaleString("en-IN", {maximumFractionDigits: 1})}</b></span><span>{note?.denominator}: <b>{Number(denominator).toLocaleString("en-IN", {maximumFractionDigits: 1})}</b></span></div>}
              <dl className="metric-facts"><div><dt>Period</dt><dd>{isSnapshot ? "All dates · latest snapshot" : `${scope.filters.from || "All dates"} → ${scope.filters.to || "Present"}`}</dd></div>{canCompare && <div><dt>Comparison</dt><dd>{priorDates.from || "All dates"} → {priorDates.to || "Present"}</dd></div>}<div><dt>Studios</dt><dd>{scope.filters.location.join(", ") || "All studios"}</dd></div><div><dt>Evidence sample</dt><dd>{Number(n).toLocaleString("en-IN")}{n < m.minSample ? " · below ranking minimum" : ""}</dd></div></dl>
              {trendValues.length > 1 && !isSnapshot && <div className="metric-history"><span className="metric-eyebrow">{trendValues.length} completed months · same non-date filters</span><div><span>Low <b>{fmt(id, Math.min(...trendValues))}</b></span><span>High <b>{fmt(id, Math.max(...trendValues))}</b></span><span>Latest <b>{fmt(id, trendValues.at(-1))}</b></span></div></div>}
              {(warning || note?.caveat || blueprints[scope.tab].source === "payroll") && <p className="metric-caveat">{warning || note?.caveat || "Payroll is reported by month; partial-month date ranges cannot represent daily payroll."}</p>}
              <details className="metric-method"><summary>Calculation & source evidence</summary><code>{m.description}</code>{sourceInfo.map(({definition, status}) => <p key={definition!.key}><a href={`https://docs.google.com/spreadsheets/d/${definition!.id}/edit`} target="_blank" rel="noreferrer">{definition!.title} ↗</a> · {status?.fetchedAt ? `Snapshot ${new Date(status.fetchedAt).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})}` : "Source not loaded"}</p>)}<ul>{m.sources.map((source) => <li key={source}>{source}</li>)}</ul><p>Ranking minimum: {m.minSample}. Rates use aggregate numerators and denominators.</p></details>
              <button className="button" onClick={() => setInfo(false)}>
                Close definition
              </button>
            </div>
          </div>,
          document.body,
        )}
    </article>
  );
}
