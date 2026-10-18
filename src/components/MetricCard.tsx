import { MetricFlip } from "./MetricFlip";
import { metricFlipStore } from "../state/metric-flip";
import { MetricInfoHint } from "./ui/MetricInfoHint";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { X, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { comparisonDates, comparisonLabel } from "../data/periods";
import { simpleMetricDefinitions } from "../semantics/metric-simple-definitions";
import { businessDefinitions } from "../semantics/metric-business-definitions";
import { currentSnapshotMetrics, metricNotes } from "../semantics/evidence";
import { health } from "../data/duckdb";
import { sheets } from "../data/sheets.config";
import { blueprints } from "../data/blueprints";
import { metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import type { Row } from "../data/duckdb";
// Snapshot measures with no reconstructable history show their share of a base instead.
const snapshotShare: Record<string, [base: string, label: string]> = {
  dormant_actives: ["active_memberships", "of running"],
  active_base: ["active_records", "of members"],
};
function ShareMeter({ value, base, label, color }: { value: number; base: number; label: string; color: string }) {
  const share = Math.max(0, Math.min(1, value / base));
  return (
    <span className="metric-spark metric-share" aria-hidden="true" style={{ "--share-color": color } as React.CSSProperties}>
      <span className="metric-share-value">{Math.round(share * 100)}%<small>{label}</small></span>
      <span className="metric-share-track"><i style={{ width: `${share * 100}%` }} /></span>
    </span>
  );
}
export {Sparkline} from "./Sparkline";
import {Sparkline} from "./Sparkline";
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
  const priorDates = comparisonDates(scope.filters.from, scope.filters.to, comparisonMode === "none" ? "prior" : comparisonMode);
  const note = metricNotes[id];
  const sourceKeys = [...new Set(m.sources.map((column) => column.split(/[. →]/)[0].toLowerCase()))];
  const sourceInfo = sourceKeys.map((key) => ({ definition: sheets.find((sheet) => sheet.key === key), status: health[key] })).filter((item) => item.definition);
  const trendValues = trend.map((row) => row[id] == null ? null : Number(row[id])).filter((v): v is number => v != null && Number.isFinite(v));
  const canCompare = compare && comparisonMode !== "none" && !isSnapshot && value != null && previous != null;
  const comparisonReason = isSnapshot
    ? "Current snapshot only; historical values are not recorded."
      : !scope.filters.from || !scope.filters.to
        ? "Select a start and end date to define the comparison period."
        : previous == null
          ? "No comparable source value exists for this period and these filters."
          : "";
  const numerator = evidence?.[`${id}__numerator`];
  const denominator = evidence?.[`${id}__denominator`];

  const flipKey = useId();
  const [info, setInfo] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
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
    <MetricFlip label={m.label} flipKey={flipKey} front={<article
      data-note-anchor={`metric-${id}`}
      className="metric-card"
      style={{ "--card-accent": `var(--accent, var(--${m.domain}))` } as React.CSSProperties}
    >
      <div className="metric-label">
        <span title={m.label}>{m.label}</span>
        <MetricInfoHint
          ref={anchor}
          id={id}
          warning={warning}
          onClick={() => setInfo(true)}
        />
      </div>
      <div className="metric-reading">
      <button
        className="metric-value number"
        style={{
          display: "block",
          padding: 0,
          textAlign: "left",
        }}
        onClick={() => metricFlipStore.set(flipKey, true)}
        aria-label={`Show related metrics for ${m.label}: ${fmt(id, value)}`}
      >
        {fmt(id, value)}
      </button>
      {snapshotShare[id] && Number(evidence?.[snapshotShare[id][0]]) > 0 && value != null ? (
        <ShareMeter
          value={Number(value)}
          base={Number(evidence![snapshotShare[id][0]])}
          label={snapshotShare[id][1]}
          color={`var(--accent, var(--${m.domain}))`}
        />
      ) : (
        <Sparkline
          color={`var(--accent, var(--${m.domain}))`}
          values={trend.map((t) => (t[id] == null ? null : Number(t[id])))}
        />
      )}
      </div>
      <div
        className={`metric-delta ${!canCompare || unchanged ? "muted" : positive ? "positive" : "negative"}`}
      >
        {canCompare && !unchanged && (Number(value) >= Number(previous) ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
        {canCompare ? delta(id, value, previous) : isSnapshot ? "Current snapshot" : comparisonMode === "none" ? "" : "No comparison"}

      </div>
      <div className="metric-footer">
        <span>
          {canCompare
            ? comparisonLabel(comparisonMode)
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
              <p className="metric-explanation">{simpleMetricDefinitions[id]?.meaning || note?.definition || businessDefinitions[id] || `${m.label} is calculated from the source fields below using ${m.aggregation} aggregation.`}</p>
              <div className="metric-tooltip-values"><div><small>Selected scope</small><strong>{fmt(id, value, true)}</strong></div><div><small>{comparisonLabel(comparisonMode).replace(/^vs /, "Comparison: ")}</small><strong>{!isSnapshot && scope.filters.from && scope.filters.to && previous != null ? fmt(id, previous, true) : "Unavailable"}</strong></div></div>
              {comparisonReason && <p className="small">{comparisonReason}</p>}
              {numerator != null && denominator != null && <div className="metric-calculation"><span>{note?.numerator}: <b>{id === "revenue_per_checkin" ? fmt("revenue", numerator, true) : Number(numerator).toLocaleString("en-IN", {maximumFractionDigits: 1})}</b></span><span>{note?.denominator}: <b>{Number(denominator).toLocaleString("en-IN", {maximumFractionDigits: 1})}</b></span></div>}
              <dl className="metric-facts"><div><dt>Period</dt><dd>{isSnapshot ? "All dates · latest snapshot" : `${scope.filters.from || "All dates"} → ${scope.filters.to || "Present"}`}</dd></div>{!isSnapshot && scope.filters.from && scope.filters.to && <div><dt>Comparison</dt><dd>{priorDates.from || "All dates"} → {priorDates.to || "Present"}</dd></div>}<div><dt>Studios</dt><dd>{scope.filters.location.join(", ") || "All studios"}</dd></div><div><dt>Evidence sample</dt><dd>{Number(n).toLocaleString("en-IN")}</dd></div></dl>
              {trendValues.length > 1 && !isSnapshot && <div className="metric-history"><span className="metric-eyebrow">{trendValues.length} completed months · same non-date filters</span><div><span>Low <b>{fmt(id, Math.min(...trendValues))}</b></span><span>High <b>{fmt(id, Math.max(...trendValues))}</b></span><span>Latest <b>{fmt(id, trendValues.at(-1))}</b></span></div></div>}
              {(warning || note?.caveat || blueprints[scope.tab].source === "payroll") && <p className="metric-caveat">{warning || note?.caveat || "Payroll is reported by month; partial-month date ranges cannot represent daily payroll."}</p>}
              <p className="small">{simpleMetricDefinitions[id]?.calculation}</p><details className="metric-method"><summary>Calculation & source evidence</summary><p>{note?.definition || businessDefinitions[id]}</p><code>{m.description}</code>{sourceInfo.map(({definition, status}) => <p key={definition!.key}><a href={`https://docs.google.com/spreadsheets/d/${definition!.id}/edit`} target="_blank" rel="noreferrer">{definition!.title} ↗</a> · {status?.fetchedAt ? `Snapshot ${new Date(status.fetchedAt).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})}` : "Source not loaded"}</p>)}<ul>{m.sources.map((source) => <li key={source}>{source}</li>)}</ul><p>Uses the full eligible filtered dataset. Rates use aggregate numerators and denominators.</p></details>
              <button className="button" onClick={() => setInfo(false)}>
                Close definition
              </button>
            </div>
          </div>,
          document.body,
        )}
    </article>} back={<article className="metric-card">
      <div className="metric-label"><span>{m.label} · details</span></div>
      <dl className="metric-related">
        <div><dt>Selected scope</dt><dd>{fmt(id, value)}</dd></div>
        <div><dt>{comparisonLabel(comparisonMode)}</dt><dd>{canCompare ? fmt(id, previous) : "Unavailable"}</dd></div>
        <div><dt>Contributing records</dt><dd>{Number.isFinite(n) ? n.toLocaleString("en-IN") : "Unavailable"}</dd></div>
        {numerator != null && <div><dt>{note?.numerator || "Numerator"}</dt><dd>{Number(numerator).toLocaleString("en-IN")}</dd></div>}
        {denominator != null && <div><dt>{note?.denominator || "Denominator"}</dt><dd>{Number(denominator).toLocaleString("en-IN")}</dd></div>}
        {trendValues.length > 1 && !isSnapshot && <><div><dt>History low</dt><dd>{fmt(id, Math.min(...trendValues))}</dd></div><div><dt>History high</dt><dd>{fmt(id, Math.max(...trendValues))}</dd></div></>}
        {Object.keys(evidence ?? {}).filter(key => key !== id && metrics[key]?.domain === m.domain && evidence?.[key] != null && !key.includes("__")).slice(0, 3).map(key => <div key={key}><dt>{metrics[key].label}</dt><dd>{fmt(key, evidence![key])}</dd></div>)}
      </dl>
      {comparisonReason && <p className="metric-explanation">{comparisonReason}</p>}
      {onDrill && <button className="button" onClick={onDrill}>Explore source records ↗</button>}
    </article>} />
  );
}
