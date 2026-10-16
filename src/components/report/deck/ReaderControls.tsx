import { createContext, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ReportModel } from '../../../report/model';
import type { DeckTab } from '../../../report/deck';
import { READER_DEFAULTS, readerIdentity, readerPreferences, type ReaderPreferences } from '../../../report/reader';

export const ReaderContext = createContext<{ command: { expand: boolean; revision: number } | null }>({ command: null });
export const useReaderContext = () => useContext(ReaderContext);
const PREFS_KEY = 'atlas-report-reader:v1';

export function useReaderPreferences() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(() => {
    try { return readerPreferences(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')); } catch { return READER_DEFAULTS; }
  });
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)); } catch { /* Optional browser preference. */ }
  }, [preferences]);
  function update(patch: Partial<ReaderPreferences>) {
    setPreferences(current => readerPreferences({ ...current, ...patch }));
  }
  return { preferences, update };
}

export function ReaderControls({ model, tabs, root, preferences, onPreferences, onEvidence }: {
  model: ReportModel; tabs: DeckTab[]; root: RefObject<HTMLDivElement>; preferences: ReaderPreferences;
  onPreferences: (patch: Partial<ReaderPreferences>) => void; onEvidence: (expand: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('overview');
  const [progress, setProgress] = useState(0);
  const [resume, setResume] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const currentSection = useRef('overview');
  const key = `atlas-report-position:v1:${readerIdentity(model)}`;
  const sections = useMemo(() => [{ id: 'overview', label: 'Executive overview' }, ...tabs.filter(tab => tab.id !== 'overview').map(tab => ({ id: tab.id, label: tab.label }))], [tabs]);
  const entries = useMemo(() => tabs.flatMap(tab => {
    const narrative = model.narratives[tab.chapter];
    return [{ id: `chapter-${tab.id}`, label: tab.id === 'overview' ? 'Executive overview' : tab.title, text: narrative?.summary ?? '' }, ...(narrative?.cards ?? []).map((card, index) => ({ id: `finding-${tab.chapter}-${index}`, label: card.headline, text: [card.meaning, card.evidence, card.driver, card.action, card.recommendation].filter(Boolean).join(' '), fallback: `chapter-${tab.id}` }))];
  }), [model, tabs]);
  const needle = query.trim().toLocaleLowerCase();
  const matches = needle ? entries.filter(entry => `${entry.label} ${entry.text}`.toLocaleLowerCase().includes(needle)) : [];
  function go(id: string, fallback?: string) {
    const target = root.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ?? (fallback ? root.current?.querySelector<HTMLElement>(`[id="${CSS.escape(fallback)}"]`) : null);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
    setSearchOpen(false);
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key) || '';
      setResume(sections.some(section => section.id === saved) ? saved : '');
    } catch { setResume(''); }
    const element = root.current;
    if (!element) return;
    const scroller = element.closest<HTMLElement>('.deck-main');
    const surface: HTMLElement | Window = scroller ?? window;
    let frame = 0;
    function measure() {
      frame = 0;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const height = scroller?.clientHeight ?? innerHeight;
      const bounds = element!.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (top - bounds.top) / Math.max(1, bounds.height - height)));
      setProgress(Math.round(ratio * 100));
      const chapterElements = Array.from(element!.querySelectorAll<HTMLElement>('[data-reader-chapter]'));
      const current = chapterElements.filter(chapter => chapter.getBoundingClientRect().top <= top + 150).at(-1)?.dataset.readerChapter || 'overview';
      setActive(current);
      if (currentSection.current !== current) {
        currentSection.current = current;
        try { localStorage.setItem(key, current); } catch { /* Optional resume only. */ }
      }
    }
    const request = () => { if (!frame) frame = requestAnimationFrame(measure); };
    surface.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    const observer = new ResizeObserver(request); observer.observe(element);
    request();
    return () => { surface.removeEventListener('scroll', request); window.removeEventListener('resize', request); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [key, root, sections]); // Scroll never rewrites report data.
  return <aside className="p57-reader-tools" aria-label="Report reading tools" data-export="omit">
    <div className="p57-reader-main">
      <label>Chapter<select aria-label="Jump to report chapter" value={active} onChange={event => go(`chapter-${event.target.value}`)}>{sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}</select></label>
      <div className="p57-reader-search"><label>Search report<input type="search" aria-label="Search report analysis" value={query} placeholder="Find a finding or phrase…" onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false); }}/></label>
      {needle && searchOpen && <div className="p57-reader-results" role="region" aria-label="Report search results"><p role="status">{matches.length} matching sections / findings</p>{matches.slice(0, 12).map((match, index) => <button type="button" key={`${match.id}:${index}`} onClick={() => go(match.id, 'fallback' in match ? match.fallback : undefined)}><b>{match.label}</b><small>{match.text.slice(0, 140)}{match.text.length > 140 ? '…' : ''}</small></button>)}{matches.length > 12 && <p>Refine the search to see more specific results.</p>}</div>}</div>
      {resume && resume !== 'overview' && <button type="button" className="p57-reader-button" onClick={() => go(`chapter-${resume}`)}>Resume reading</button>}
      <span className="p57-reader-progress" role="progressbar" aria-label="Report reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>{progress}% read</span>
      <details className="p57-reader-settings"><summary>Reading settings</summary><div>
        <label>Layout<select aria-label="Reading layout" value={preferences.layout} onChange={event => onPreferences({ layout: event.target.value as ReaderPreferences['layout'] })}><option value="adaptive">Adaptive · 1 or 2 per row</option><option value="single">Single column</option></select></label>
        <label>Text size<select aria-label="Reading text size" value={preferences.textSize} onChange={event => onPreferences({ textSize: event.target.value as ReaderPreferences['textSize'] })}><option value="small">Small</option><option value="standard">Standard</option><option value="large">Large</option></select></label>
        <label>Spacing<select aria-label="Reading spacing" value={preferences.spacing} onChange={event => onPreferences({ spacing: event.target.value as ReaderPreferences['spacing'] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
        <div className="p57-reader-actions"><button type="button" onClick={() => onEvidence(true)}>Expand supporting evidence</button><button type="button" onClick={() => onEvidence(false)}>Collapse supporting evidence</button><button type="button" onClick={() => onPreferences(READER_DEFAULTS)}>Reset reading settings</button></div>
      </div></details>
    </div>
    <div className="p57-reader-progress-track" aria-hidden="true"><i style={{ width: `${progress}%` }}/></div>
  </aside>;
}
