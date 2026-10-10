import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import '../design/floating-review-tools.css';

/** Hide the controls, keeping sessions, audio and annotation state mounted. */
export function FloatingReviewTools({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const collapse = () => {
    if (root.current?.contains(document.activeElement)) trigger.current?.focus();
    setOpen(false);
  };
  const reset = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Never hide a form mid-edit; a focused input resumes the idle check.
      if (root.current?.querySelector('.presentation-panel') || root.current?.querySelector('input:focus, textarea:focus, select:focus')) reset();
      else collapse();
    }, 5000);
  };
  useEffect(() => { if (open) reset(); return () => clearTimeout(timer.current); }, [open]);
  return <div className="floating-review" data-open={open} data-export="omit" ref={root}
    onPointerMove={() => { if (open) reset(); }} onPointerDown={() => { if (open) reset(); }}
    onKeyDown={e => { if (e.key === 'Escape') { collapse(); e.stopPropagation(); } else if (open) reset(); }}>
    <button ref={trigger} className="floating-review-trigger" aria-label="Review tools" aria-expanded={open} aria-controls={id} title="Presenter, annotations, sound clips and notes" onClick={() => setOpen(!open)}>
      {open ? <X size={21}/> : <SlidersHorizontal size={21}/>}
    </button>
    <div id={id} className="floating-review-content" onFocus={() => { if (open) reset(); }}>
      <div className="floating-review-heading">Review toolkit <small>Collapses after 5 seconds idle</small></div>
      {children}
    </div>
  </div>;
}
