import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { fmt } from '../../semantics/formats';
import { statusTone, type PillTone } from './types';

export function Pill({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: PillTone; dot?: boolean }) {
  return <span className={`kra-pill is-${tone}`}>{dot && <i className="kra-pill-dot" aria-hidden="true" />}{children}</span>;
}

export function StatusPill({ state }: { state: string }) {
  return <Pill tone={statusTone(state)} dot>{state}</Pill>;
}

/** Percent movement, signed and coloured by which direction is favourable. */
export function Delta({ value, inverse = false, label }: { value: number | null | undefined; inverse?: boolean; label?: string }) {
  if (value == null || !Number.isFinite(Number(value))) return <span className="kra-delta is-muted">{label ?? 'No comparison'}</span>;
  const amount = Number(value);
  const favourable = inverse ? amount <= 0 : amount >= 0;
  const flat = Math.abs(amount) < 0.0005;
  return <span className={`kra-delta ${flat ? 'is-flat' : favourable ? 'is-up' : 'is-down'}`}>
    {!flat && <svg viewBox="0 0 12 12" aria-hidden="true" width="9" height="9"><path d={amount > 0 ? 'M6 2.2 10 8.4H2Z' : 'M6 9.8 2 3.6h8Z'} fill="currentColor" /></svg>}
    {amount > 0 ? '+' : ''}{fmt('conversion_rate', amount)}
  </span>;
}

export function Panel({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={`kra-panel ${className}`.trim()}>{children}</Tag>;
}

export function PanelHead({ eyebrow, title, note, actions, id }: { eyebrow?: ReactNode; title: ReactNode; note?: ReactNode; actions?: ReactNode; id?: string }) {
  return <header className="kra-panel-head">
    <div className="kra-panel-head-copy">
      {eyebrow && <span className="kra-eyebrow">{eyebrow}</span>}
      <h2 id={id}>{title}</h2>
      {note && <p>{note}</p>}
    </div>
    {actions && <div className="kra-panel-head-actions">{actions}</div>}
  </header>;
}

/** A single headline figure with its own context line. */
export function Stat({ label, value, detail, tone, trailing }: { label: ReactNode; value: ReactNode; detail?: ReactNode; tone?: string; trailing?: ReactNode }) {
  return <div className={`kra-stat ${tone ? 'is-' + tone : ''}`}>
    <span className="kra-stat-label">{label}</span>
    <strong className="kra-stat-value">{value}</strong>
    {detail && <span className="kra-stat-detail">{detail}</span>}
    {trailing}
  </div>;
}

/** Sparkline: nulls are gaps, not zeros, so a missing month never reads as a collapse. */
export function Sparkline({ values, label, positive = true, height = 34 }: { values: (number | null)[]; label: string; positive?: boolean; height?: number }) {
  const points = values.map((value, index) => ({ value, index })).filter((point): point is { value: number; index: number } => point.value != null && Number.isFinite(point.value));
  if (points.length < 2) return <div className="kra-spark-empty" style={{ height }} aria-hidden="true" />;
  const width = 120;
  const pad = 3;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const span = max - min || Math.abs(max) || 1;
  const coords = points.map((point) => [pad + point.index * ((width - pad * 2) / Math.max(1, values.length - 1)), height - pad - ((point.value - min) / span) * (height - pad * 2)] as const);
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)![0].toFixed(1)} ${height} L${coords[0][0].toFixed(1)} ${height} Z`;
  const stroke = positive ? 'var(--kra-positive)' : 'var(--kra-negative)';
  return <div className="kra-spark" style={{ height }}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`kra-spark-${positive ? 'pos' : 'neg'}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#kra-spark-${positive ? 'pos' : 'neg'})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={coords.at(-1)![0]} cy={coords.at(-1)![1]} r="2.1" fill={stroke} />
    </svg>
  </div>;
}

export function Progress({ value, max = 1, tone = 'positive', label }: { value: number; max?: number; tone?: 'positive' | 'progress' | 'neutral'; label: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return <div className={`kra-progress is-${tone}`} role="img" aria-label={`${label}: ${Math.round(ratio * 100)}%`}>
    <span style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%` }} />
  </div>;
}

/** Wide, centred dialog. Native `dialog` gives us the focus trap and Escape handling. */
export function Modal({ title, subtitle, onClose, children, footer, size = 'm', labelledBy }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 's' | 'm' | 'l'; labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.showModal();
    return () => { if (node.open) node.close(); };
  }, []);
  return <dialog
    ref={ref}
    className={`kra-dialog kra-dialog-${size}`}
    aria-labelledby={labelledBy ?? 'kra-dialog-title'}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === ref.current) onClose(); }}
  >
    <div className="kra-dialog-shell">
      <header className="kra-dialog-head">
        <div>
          <h2 id="kra-dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="kra-icon-button" aria-label="Close dialog" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="kra-dialog-body">{children}</div>
      {footer && <footer className="kra-dialog-foot">{footer}</footer>}
    </div>
  </dialog>;
}

/** Tabs that behave like tabs: arrow keys move, only the active panel is rendered. */
export function TabList<T extends string>({ items, value, onChange, label }: { items: { value: T; label: ReactNode; hint?: string }[]; value: T; onChange: (next: T) => void; label: string }) {
  return <div className="kra-tabs" role="tablist" aria-label={label}>
    {items.map((item) => <button
      key={item.value}
      role="tab"
      type="button"
      aria-selected={item.value === value}
      title={item.hint}
      tabIndex={item.value === value ? 0 : -1}
      onClick={() => onChange(item.value)}
      onKeyDown={(event) => {
        const index = items.findIndex((candidate) => candidate.value === value);
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const next = items[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
          onChange(next.value);
          (event.currentTarget.parentElement?.children[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length] as HTMLElement | undefined)?.focus();
        }
      }}
    >{item.label}</button>)}
  </div>;
}

/** Section-level disclosure that keeps the deep detail off the first screen. */
export function Disclosure({ summary, meta, defaultOpen = false, children, className = '' }: { summary: ReactNode; meta?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`kra-disclosure ${open ? 'is-open' : ''} ${className}`.trim()}>
    <button type="button" className="kra-disclosure-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="kra-disclosure-label">{summary}</span>
      {meta && <span className="kra-disclosure-meta">{meta}</span>}
      <svg className="kra-disclosure-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div className="kra-disclosure-body">{children}</div>}
  </section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="kra-empty">{children}</p>;
}

/** Measures an element's width so SVG bar rows can stay responsive without a chart library. */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
