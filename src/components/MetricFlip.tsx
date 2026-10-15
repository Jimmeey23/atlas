import { useCallback, useId, useSyncExternalStore, type ReactNode } from "react";
import { metricFlipStore } from "../state/metric-flip";

export function useMetricFlipState(id: string): [boolean, (value?: boolean) => void] {
  const subscribe = useCallback((callback: () => void) => metricFlipStore.subscribe(id, callback), [id]);
  const snapshot = useCallback(() => metricFlipStore.isActive(id), [id]);
  const flipped = useSyncExternalStore(subscribe, snapshot);
  const setFlipped = useCallback((value?: boolean) => metricFlipStore.set(id, value), [id]);
  return [flipped, setFlipped];
}

/** One open card across the app; the front always reserves its original footprint. */
export function MetricFlip({ label, front, back, flipKey }: { label: string; front: ReactNode; back: ReactNode; flipKey?: string }) {
  const generated = useId();
  const [flipped, setFlipped] = useMetricFlipState(flipKey ?? generated);
  const toggle = () => setFlipped();
  return <div className="metric-flip" data-flipped={flipped}>
    <div className="metric-flip-inner" onClick={event => {
      if ((event.target as HTMLElement).closest("button, a, input, select, textarea, summary, details")) return;
      toggle();
    }}>
      <div className="metric-flip-face metric-flip-front" aria-hidden={flipped} {...(flipped ? { inert: "" } : {})} style={{ visibility: flipped ? "hidden" : "visible" }}>{front}</div>
      <div className="metric-flip-face metric-flip-back" aria-hidden={!flipped} style={{ visibility: flipped ? "visible" : "hidden" }}>{flipped && back}</div>
    </div>
    <button className="metric-flip-toggle" aria-label={`${flipped ? "Flip back" : "Show related metrics"}: ${label}`} aria-pressed={flipped} onClick={toggle}>{flipped ? "↶ Back" : "↻ Details"}</button>
  </div>;
}
