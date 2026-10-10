import { useEffect, useRef, useState, type ReactNode } from 'react';
import { completeMetricGrid } from '../../../report/presentation-follow';
export function CompleteMetricGrid({ items, render, className = 'deck-metric-grid' }: { items: string[]; render: (id: string) => ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => { const el = ref.current; if (!el) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(el); return () => observer.disconnect(); }, []);
  const { count, columns } = completeMetricGrid(items.length, width);
  return <div ref={ref} className={className} style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}>{items.slice(0, count).map(render)}</div>;
}
