import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A grid that always ends on a complete row. It measures its width, picks a
 * column count, tops the last row up with optional filler tiles and stretches
 * the final tile across any gap that remains.
 */
export function FillGrid({ items, fillers = [], min = 260, max = 4, gap = 12, className = "" }: { items: ReactNode[]; fillers?: ReactNode[]; min?: number; max?: number; gap?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  useEffect(() => { const el = ref.current; if (!el) return; const o = new ResizeObserver(([e]) => setWidth(e.contentRect.width)); o.observe(el); return () => o.disconnect(); }, []);
  // Width decides the columns; filler tiles may top the count up, so a short list still fills a row.
  const columns = Math.max(1, Math.min(max, Math.floor((width + gap) / (min + gap)), items.length + fillers.length || 1));
  const slots = Math.ceil(items.length / columns) * columns;
  const fill = fillers.slice(0, slots - items.length);
  const all = [...items, ...fill];
  const spare = slots - all.length;
  return <div ref={ref} className={`dk-fill ${className}`} style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`, gap }}>
    {all.map((node, i) => i === all.length - 1 && spare > 0
      ? <div key={i} className="dk-fill-span" style={{ gridColumn: `span ${spare + 1}` }}>{node}</div>
      : <Fragment key={i}>{node}</Fragment>)}
  </div>;
}

/**
 * A continuously scrolling strip. The content is rendered twice so the loop is
 * seamless; it pauses on hover or focus and stands still for reduced motion.
 */
export function Marquee({ children, speed = 40, reverse = false, label }: { children: ReactNode; speed?: number; reverse?: boolean; label: string }) {
  return <div className="dk-marquee" data-reverse={reverse || undefined} style={{ "--marquee-speed": `${speed}s` } as React.CSSProperties} role="region" aria-label={label}>
    <div className="dk-marquee-track">
      <div className="dk-marquee-group">{children}</div>
      <div className="dk-marquee-group" aria-hidden="true">{children}</div>
    </div>
  </div>;
}

/** Numbers, rupees and percentages in a sentence carry the accent so the figure lands first. */
export function Emphasis({ text }: { text: string }) {
  const parts = text.split(/((?:[−+\-]?≈?₹\s?[\d.,]+\s?(?:L|Cr|k)?)|(?:[−+\-]?\d[\d.,]*\s?(?:%|pp|L|Cr|k)?))/g);
  // Calendar years read as context, not as figures.
  return <>{parts.map((part, i) => i % 2 && !/^(19|20)\d\d$/.test(part.trim()) ? <em key={i} className="dk-num">{part}</em> : part)}</>;
}
