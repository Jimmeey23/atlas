import { useState, useRef, useEffect, forwardRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { metrics, describeMetric } from "../../semantics/metrics";
import { simpleMetricDefinitions } from "../../semantics/metric-simple-definitions";
import { CUSTOM_METRIC_FORMULAS } from "../../semantics/metric-formula-overrides";
import { context } from "../../data/analytics";
import "./MetricInfoHint.css";

export interface MetricFormulaInfo {
  id: string;
  label: string;
  formula: string;
  calculation?: string;
  sources?: string[];
}



export function getMetricFormulaInfo(idOrName: string, labelOverride?: string): MetricFormulaInfo {
  const clean = idOrName?.trim() || "";
  
  // 1. Direct registry metric check
  if (metrics[clean]) {
    const m = metrics[clean];
    const simple = simpleMetricDefinitions[clean];
    return {
      id: clean,
      label: labelOverride || m.label,
      // Resolved with the operator's own rate and today's date. A raw registry template
      // would show `{cost_rate}`; a hard-coded stand-in rate would show a number nobody
      // configured, which is worse than either.
      formula: describeMetric(clean, context()),
      calculation: simple?.calculation || simple?.meaning,
      sources: m.sources,
    };
  }

  // 2. Custom metric dictionary check
  if (CUSTOM_METRIC_FORMULAS[clean]) {
    const c = CUSTOM_METRIC_FORMULAS[clean];
    return {
      id: clean,
      label: labelOverride || c.label,
      formula: c.formula,
      calculation: c.calculation,
      sources: c.sources,
    };
  }

  // 3. Search registry by label match (case-insensitive)
  const byLabel = Object.values(metrics).find(
    (m) => m.label.toLowerCase() === clean.toLowerCase() || m.id.toLowerCase() === clean.toLowerCase()
  );
  if (byLabel) {
    const simple = simpleMetricDefinitions[byLabel.id];
    return {
      id: byLabel.id,
      label: labelOverride || byLabel.label,
      formula: describeMetric(byLabel.id, context()),
      calculation: simple?.calculation || simple?.meaning,
      sources: byLabel.sources,
    };
  }

  // 4. Default fallback
  const formatted = labelOverride || clean.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: clean,
    label: formatted,
    formula: `SUM(${clean})`,
    calculation: `Aggregated metric for ${formatted}.`,
  };
}

export interface MetricInfoHintProps {
  id: string;
  label?: string;
  className?: string;
  warning?: string;
  onClick?: (e: MouseEvent) => void;
}

export const MetricInfoHint = forwardRef<HTMLSpanElement, MetricInfoHintProps>(function MetricInfoHint(
  { id, label, className = "", warning, onClick },
  forwardedRef,
) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, placeAbove: true });
  const internalRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iconRef = (node: HTMLSpanElement | null) => {
    internalRef.current = node;
    if (typeof forwardedRef === "function") {
      forwardedRef(node);
    } else if (forwardedRef) {
      (forwardedRef as React.MutableRefObject<HTMLSpanElement | null>).current = node;
    }
  };

  const info = getMetricFormulaInfo(id, label);

  const updatePosition = () => {
    if (!internalRef.current) return;
    const rect = internalRef.current.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 110;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));

    const spaceAbove = rect.top;
    const placeAbove = spaceAbove >= tooltipHeight + 14;

    const top = placeAbove
      ? Math.max(8, rect.top - tooltipHeight - 6)
      : Math.min(window.innerHeight - tooltipHeight - 8, rect.bottom + 6);

    setPos({ left, top, placeAbove });
  };

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    updatePosition();
    setVisible(true);
  };

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 80);
  };

  useEffect(() => {
    if (!visible) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [visible]);

  return (
    <>
      <span
        ref={iconRef}
        className={`metric-info-hint ${warning ? "has-warning" : ""} ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          if (onClick) {
            onClick(e);
          } else {
            setVisible((v) => !v);
            updatePosition();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Formula and details for ${info.label}: ${info.formula}`}
        title={`Formula: ${info.formula}${info.calculation ? `\n${info.calculation}` : ""}${warning ? `\nNote: ${warning}` : ""}`}
      >
        <Info size={11} strokeWidth={2.2} aria-hidden="true" />
        {warning && <span className="metric-info-warning-dot" aria-hidden="true" />}
      </span>

      {visible &&
        createPortal(
          <div
            className="metric-formula-tooltip"
            style={{
              left: pos.left,
              top: pos.top,
            }}
            role="tooltip"
          >
            <div className="metric-formula-tooltip-head">
              <span className="metric-formula-tooltip-badge">Formula</span>
              <strong className="metric-formula-tooltip-title">{info.label}</strong>
            </div>
            <code className="metric-formula-tooltip-code">{info.formula}</code>
            {info.calculation && (
              <p className="metric-formula-tooltip-calc">{info.calculation}</p>
            )}
            {info.sources && info.sources.length > 0 && (
              <span className="metric-formula-tooltip-source">
                Source: {info.sources.join(", ")}
              </span>
            )}
          </div>,
          document.body
        )}
    </>
  );
});
