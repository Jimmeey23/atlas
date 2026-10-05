import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Info, TriangleAlert } from "lucide-react";
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
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v != null && Number.isFinite(p.v));
  if (points.length < 2)
    return (
      <svg className="metric-spark" aria-hidden="true">
        <line
          x1="0"
          y1="20"
          x2="100%"
          y2="20"
          stroke="var(--hairline)"
          strokeDasharray="3 3"
        />
      </svg>
    );
  const nums = points.map((p) => p.v!);
  const min = Math.min(...nums),
    max = Math.max(...nums),
    width = 180;
  const p = points
    .map(
      ({ v, i }) =>
        `${(i / (values.length - 1)) * width},${24 - ((v! - min) / (max - min || 1)) * 20}`,
    )
    .join(" ");
  return (
    <svg
      className="metric-spark"
      viewBox="0 0 180 28"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={p}
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        strokeDasharray="1000"
        style={{ animation: "draw var(--m-data) var(--ease)" }}
      />
      <circle
        cx={(points.at(-1)!.i / (values.length - 1)) * width}
        cy={24 - ((points.at(-1)!.v! - min) / (max - min || 1)) * 20}
        r="2"
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
}: {
  id: string;
  value: unknown;
  previous?: unknown;
  trend?: Row[];
  n: number;
  onDrill?: () => void;
  warning?: string;
  compare?: boolean;
}) {
  const m = metrics[id];
  const comparisonMode = useStore((s) => s.compare);
  const [info, setInfo] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 70 });
  useEffect(() => {
    if (!info) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          left: Math.max(16, Math.min(rect.left, window.innerWidth - 376)),
          top: Math.max(
            16,
            Math.min(rect.bottom + 8, window.innerHeight - 350),
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
  const [display, setDisplay] = useState<number | null>(
    value == null ? null : Number(value),
  );
  const frame = useRef(0);
  useEffect(() => {
    if (value == null) {
      setDisplay(null);
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(Number(value));
      return;
    }
    const begin = performance.now();
    function tick(t: number) {
      const progress = Math.min((t - begin) / 480, 1);
      setDisplay(Number(value) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  const positive = Number(value) >= Number(previous) === m.higherIsBetter;
  return (
    <article
      className="metric-card"
      style={{ "--card-accent": `var(--${m.domain})` } as React.CSSProperties}
    >
      <div className="metric-label">
        <span>{m.label}</span>
        <button
          ref={anchor}
          aria-label={`Definition of ${m.label}`}
          aria-expanded={info}
          onClick={() => setInfo(!info)}
        >
          {warning ? <TriangleAlert size={12} /> : <Info size={12} />}
        </button>
      </div>
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
        {fmt(id, display)}
      </button>
      <div
        className={`metric-delta ${previous == null ? "muted" : positive ? "positive" : "negative"}`}
      >
        {compare ? delta(id, value, previous) : "Current period"}
        {n < m.minSample && <span className="small">n = {n}</span>}
      </div>
      <Sparkline
        color={`var(--${m.domain})`}
        values={trend.map((t) => (t[id] == null ? null : Number(t[id])))}
      />
      <div className="metric-footer">
        <span>
          {compare
            ? comparisonMode === "year"
              ? "vs last year"
              : "vs prior period"
            : "Source-backed"}
        </span>
        <span>
          {m.aggregation === "weighted"
            ? "Weighted"
            : m.aggregation === "sum"
              ? "Total"
              : "Per record"}
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
                width: Math.min(360, window.innerWidth - 32),
                maxHeight: window.innerHeight - position.top - 16,
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={m.label}
            >
              <strong>{m.label}</strong>
              <code>{m.description}</code>
              {warning && <p className="warn">{warning}</p>}
              <p className="small">Source columns</p>
              <ul>
                {m.sources.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="small">
                Minimum ranking sample: {m.minSample}. {m.aggregation}{" "}
                aggregation.
              </p>
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
