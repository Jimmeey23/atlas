import type { ReactNode } from 'react';

/**
 * Numbered report section. The ordinal in the eyebrow is what makes a long page feel
 * like a document you can navigate; the heading itself lives in the panel below it so
 * the page never repeats the same sentence twice.
 */
export function Section({ id, eyebrow, title, note, children, actions }: {
  id: string;
  eyebrow: ReactNode;
  title?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return <section className={`kra-section ${title ? 'has-head' : 'is-titled'}`} id={id} aria-label={typeof eyebrow === 'string' ? eyebrow : undefined}>
    <div className="kra-section-head">
      <div className="kra-section-head-copy">
        <span className="kra-eyebrow">{eyebrow}</span>
        {title && <h2>{title}</h2>}
        {note && <p>{note}</p>}
      </div>
      {actions && <div className="kra-panel-head-actions">{actions}</div>}
    </div>
    {children}
  </section>;
}
