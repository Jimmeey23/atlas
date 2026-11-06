import { useEffect, useState } from 'react';

export type NavSection = { id: string; label: string };

/**
 * The report is long by nature. A slim sticky index keeps the reader oriented and
 * doubles as the only navigation on the page, with the active section tracking scroll.
 */
export function ReportNav({ sections, meta }: { sections: NavSection[]; meta: string }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const targets = sections.map((section) => document.getElementById(section.id)).filter((node): node is HTMLElement => !!node);
    if (!targets.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActive(visible.target.id);
    }, { rootMargin: '-96px 0px -55% 0px', threshold: [0.01, 0.2, 0.5] });
    targets.forEach((target) => observer.observe(target));
    const onScroll = () => setStuck(window.scrollY > 140);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, [sections]);

  return <nav className={`kra-report-nav ${stuck ? 'is-stuck' : ''}`} aria-label="Report sections">
    <div className="kra-report-nav-inner">
      <span className="kra-report-nav-meta">{meta}</span>
      <div className="kra-report-nav-links">
        {sections.map((section, index) => <a key={section.id} href={`#${section.id}`}
          aria-current={active === section.id ? 'true' : undefined}
          onClick={(event) => {
            event.preventDefault();
            const target = document.getElementById(section.id);
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', `#${section.id}`);
          }}>
          <i>{String(index + 1).padStart(2, '0')}</i>{section.label}
        </a>)}
      </div>
    </div>
  </nav>;
}
