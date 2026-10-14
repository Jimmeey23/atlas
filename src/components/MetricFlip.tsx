import { useState, type ReactNode } from "react";
import "./MetricFlip.css";

/** Shared flip interaction; nested actions keep their own behavior. */
export function MetricFlip({ label, front, back, flipped: controlled, onToggle }: { label: string; front: ReactNode; back: ReactNode; flipped?: boolean; onToggle?: () => void }) {
  const [localFlipped, setFlipped] = useState(false);
  const flipped = controlled ?? localFlipped;
  const toggle = onToggle ?? (() => setFlipped(value => !value));
  return <div className="metric-flip" data-flipped={flipped}>
    <div className="metric-flip-inner" onClick={event => {
      if ((event.target as HTMLElement).closest("button, a, input, select, textarea, summary, details")) return;
      toggle();
    }}>
      <div className="metric-flip-face metric-flip-front" aria-hidden={flipped} style={{ visibility: flipped ? "hidden" : "visible" }}>{!flipped && front}</div>
      <div className="metric-flip-face metric-flip-back" aria-hidden={!flipped} style={{ visibility: flipped ? "visible" : "hidden" }}>{flipped && back}</div>
    </div>
    <button className="metric-flip-toggle" aria-label={`${flipped ? "Flip back" : "Show related metrics"}: ${label}`} aria-pressed={flipped} onClick={toggle}>{flipped ? "↶ Back" : "↻ Details"}</button>
  </div>;
}
