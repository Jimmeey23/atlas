import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Lock, LockOpen, PencilLine, Save, Undo2, Pin, PinOff, Download, Printer, Maximize, Minimize, Palette, Loader2, KeyRound, X, TriangleAlert, CircleDot } from "lucide-react";
import logo from "../../../assets/report/logo.png";
import { ChapterExport } from "./ChapterExport";
import { ReportViewControls } from "../ReportViewControls";
import { FloatingReviewTools } from "../../FloatingReviewTools";
import { PresentationTools } from "../../PresentationTools";
import { StickyNotes } from "../../StickyNotes";
import { definition } from "../../../report/definitions";
import { findingsFor, ledger } from "../../../report/findings";
import { monthLabel } from "../../../report/period";
import { reportOptions } from "../../../report/options";
import { chapterMetrics, deckTabs, verdictOf, type DeckSection, type DeckTab } from "../../../report/deck";
import { downloadReport, printReport } from "../../../report/export";
import { adminStatus, adminToken, lockAdmin, pinReport, saveReport, unlockAdmin, updateReport } from "../../../report/storage";
import type { ReportComponentSpec, ReportModel } from "../../../report/model";
import { EditContext, setIn, Slot, type DeckEdit } from "./editing";
import { CoverPage } from "./CoverPage";
import { ChapterReport } from "./ChapterReport";
import { RecordDrilldownProvider } from "./RecordDrilldown";
import { SpeakerDrawer } from "./SpeakerDrawer";
import "../../../design/report-deck.css";
import "../../../design/report-chapter.css";

const DRAWER_KEY = "atlas-deck-drawer-v2";

function tone(model: ReportModel, tab: DeckTab) {
  if (tab.id === "overview") return undefined;
  const data = model.chapters[tab.chapter];
  const spec = tab.spec;
  if (!data || !spec) return undefined;
  const ids = chapterMetrics(spec, data).slice(0, 3).filter(id => data.prior[id] != null);
  if (!ids.length) return undefined;
  const good = ids.filter(id => (Number(data.total[id]) >= Number(data.prior[id])) === (definition(id)?.higherIsBetter ?? true)).length;
  return good === ids.length ? "up" : good === 0 ? "down" : "mixed";
}

function AdminDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className="deck-modal-scrim" onClick={onClose}>
    <form className="deck-modal" onClick={e => e.stopPropagation()} onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await unlockAdmin(passcode); onUnlocked(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
      <header><KeyRound size={18}/><div><h3>Unlock admin editing</h3><p>Edit any text, replace components with AI and save changes to the database.</p></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></header>
      <input type="password" autoFocus autoComplete="current-password" aria-label="Admin passcode" placeholder="Admin passcode" value={passcode} onChange={e => setPasscode(e.target.value)} />
      {error && <p className="notice" role="alert"><TriangleAlert size={13}/>{error}</p>}
      <button className="button primary" disabled={busy || !passcode}>{busy ? <Loader2 size={14} className="rb2-spin"/> : <LockOpen size={14}/>}Unlock</button>
    </form>
  </div>;
}

/** A saved report presented chapter by chapter, each chapter one long document, with live speaker notes, admin editing and AI component replacement. */
export function ReportDeck({ initial, storageError }: { initial: ReportModel; storageError?: string }) {
  const [model, setModel] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const tabs = useMemo(() => deckTabs(model), [model.chapters, model.narratives, model.customization?.chapterIds]);
  const fromHash = () => { const [t, s] = decodeURIComponent(location.hash.slice(1)).split("/"); const found = tabs.find(x => x.id === t); return found ? { tab: found.id, section: (found.sections.includes(s as DeckSection) ? s : found.sections[0]) as DeckSection } : { tab: tabs[0].id, section: tabs[0].sections[0] }; };
  const [page, setPage] = useState(fromHash);
  // Notes stay closed until the presenter asks for them, so the report gets the full width.
  const [drawer, setDrawer] = useState(() => { try { return innerWidth > 820 && localStorage.getItem(DRAWER_KEY) === "open"; } catch { return false; } });
  const [admin, setAdmin] = useState(!!adminToken());
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(""), [message, setMessage] = useState(storageError ? `Opened locally. ${storageError}` : "");
  const [full, setFull] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [exportMounted, setExportMounted] = useState(false);
  // A section to bring into view once the chapter has rendered (contents, notes drawer, deep link).
  const pendingScroll = useRef<DeckSection | null>(page.section !== tabs.find(t => t.id === page.tab)?.sections[0] ? page.section : null);
  const exportRef = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const dirty = JSON.stringify([model.narratives, model.replacements ?? {}]) !== JSON.stringify([saved.narratives, saved.replacements ?? {}]);
  const tab = tabs.find(t => t.id === page.tab) ?? tabs[0];
  const index = tabs.findIndex(t => t.id === tab.id);

  useEffect(() => { void adminStatus().then(s => { setAdminConfigured(s.configured); if (!s.unlocked && adminToken()) { lockAdmin(); setAdmin(false); } }).catch(() => undefined); }, []);
  useEffect(() => { history.replaceState(null, "", `#${page.tab}/${page.section}`); }, [page.tab, page.section]);
  useEffect(() => {
    const target = pendingScroll.current;
    pendingScroll.current = null;
    const el = target && main.current?.querySelector(`[data-deck-section="${target}"]`);
    if (el) el.scrollIntoView({ block: "start" }); else main.current?.scrollTo({ top: 0 });
  }, [page.tab]);
  // Shared review sessions: the presenter toolkit follows and drives the chapter tab.
  useEffect(() => { window.dispatchEvent(new CustomEvent("p57-report-navigate", { detail: page.tab === "overview" ? "" : page.tab })); }, [page.tab]);
  useEffect(() => {
    const follow = (event: Event) => { const id = (event as CustomEvent<string>).detail || "overview"; setPage(current => current.tab === id ? current : (() => { const t = tabs.find(x => x.id === id); return t ? { tab: t.id, section: t.sections[0] } : current; })()); };
    window.addEventListener("p57-report-chapter", follow); return () => window.removeEventListener("p57-report-chapter", follow);
  }, [tabs]);
  useEffect(() => { if (innerWidth > 820) try { localStorage.setItem(DRAWER_KEY, drawer ? "open" : "closed"); } catch { /* per session */ } }, [drawer]);
  useEffect(() => { const handler = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", handler); return () => document.removeEventListener("fullscreenchange", handler); }, []);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  useEffect(() => { document.title = `${model.customization?.title || "Monthly report"} · ${model.scope.studio} · ${monthLabel(model.scope.month)}`; }, [model.customization?.title, model.scope]);

  /** Move to a chapter, and optionally to one of its sections. */
  const navigate = useCallback((next: { tab: string; section: DeckSection }) => {
    // A chapter's first section is its top: open there rather than below the header.
    pendingScroll.current = tabs.find(t => t.id === next.tab)?.sections[0] === next.section ? null : next.section;
    if (next.tab === page.tab) {
      const el = pendingScroll.current && main.current?.querySelector(`[data-deck-section="${next.section}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); else main.current?.scrollTo({ top: 0, behavior: "smooth" });
      pendingScroll.current = null;
    }
    setPage(next);
  }, [page.tab, tabs]);
  // The section scrolled into view; it moves the notes and the address bar, never the scroll position.
  const onSection = useCallback((section: DeckSection) => setPage(current => current.section === section ? current : { ...current, section }), []);
  const go = useCallback((step: number) => { const next = tabs[Math.max(0, Math.min(tabs.length - 1, index + step))]; if (next && next.id !== tab.id) { pendingScroll.current = null; setPage({ tab: next.id, section: next.sections[0] }); } }, [tabs, index, tab.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); go(1); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key.toLowerCase() === "n") setDrawer(d => !d);
      else if (e.key.toLowerCase() === "f") void toggleFull();
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [go]);
  async function toggleFull() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* fullscreen unsupported */ } }

  const edit: DeckEdit = useMemo(() => ({
    model, admin, editing: admin && editing,
    set: (path, value) => setModel(m => setIn(m, path, value)),
    replace: (slot: string, spec: ReportComponentSpec | null) => setModel(m => { const next = { ...(m.replacements ?? {}) }; if (spec) next[slot] = spec; else delete next[slot]; return { ...m, replacements: next }; }),
  }), [model, admin, editing]);

  async function save() {
    setBusy("save"); setMessage("");
    try {
      const stored = model.id ? await updateReport(model) : await saveReport(model);
      setModel(m => ({ ...m, id: stored.id, savedAt: stored.savedAt, editedAt: stored.editedAt, pinned: stored.pinned }));
      setSaved(stored); setMessage("Changes saved to the database.");
      if (!model.id && stored.id) { const url = new URL(location.href); url.searchParams.delete("draft"); url.searchParams.set("id", stored.id); history.replaceState(null, "", url); }
    } catch (e) { setMessage((e as Error).message); if (/Unlock admin/.test((e as Error).message)) { lockAdmin(); setAdmin(false); } }
    finally { setBusy(""); }
  }
  async function togglePin() {
    if (!model.id) return;
    setBusy("pin");
    try { const { pinned } = await pinReport(model.id, !model.pinned); setModel(m => ({ ...m, pinned })); setSaved(s => ({ ...s, pinned })); setMessage(pinned ? "Pinned — kept beyond the latest five reports." : "Unpinned."); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(""); }
  }
  async function exportReport(print: boolean) {
    setBusy("export");
    setExportMounted(true);
    // The full document mounts only for export; wait for it to commit and paint.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try { if (!exportRef.current) throw new Error("The export view is not ready. Retry."); await (print ? printReport : downloadReport)(exportRef.current, model); } catch (e) { setMessage((e as Error).message); } finally { setBusy(""); setExportMounted(false); }
  }

  const options = reportOptions(model.customization);
  const findings = useMemo(() => findingsFor(model), [model.chapters]);
  const ranked = useMemo(() => ledger(findings), [findings]);
  const cid = tab.chapter;
  const open = (id: string) => { const t = tabs.find(x => x.id === id || x.chapter === id); if (t) navigate({ tab: t.id, section: t.sections[0] }); };

  function body() {
    if (tab.id === "overview") return <>
      <div data-deck-section="cover"><Slot id={`${tab.id}:cover:cover`} tab={tab.id} section="cover" kind="glance" describe="cover scorecard"><CoverPage model={model} tabs={tabs} ranked={ranked} onNavigate={open} /></Slot></div>
      {tab.spec && model.narratives[tab.chapter] && <ChapterReport model={model} tab={tab} tabs={tabs} headless onSection={onSection} />}
    </>;
    return <ChapterReport key={tab.id} model={model} tab={tab} tabs={tabs} onSection={onSection} />;
  }

  return <EditContext.Provider value={edit}><RecordDrilldownProvider model={model} chapterId={cid}>
    <div className="report-page deck" data-report-id={model.id || ""} data-drawer={drawer} data-editing={edit.editing} data-full={full}>
      <header className="deck-nav" data-export="omit">
          <a className="deck-brand" href="#overview/cover" onClick={e => { e.preventDefault(); navigate({ tab: "overview", section: "cover" }); }}><img src={logo} alt="Physique 57"/><span><b>{model.customization?.title || "Monthly performance report"}</b><small>{model.scope.studio} · {monthLabel(model.scope.month)}{model.editedAt ? " · edited" : ""}</small></span></a>
          <div className="deck-nav-actions">
            {dirty && <span className="deck-unsaved"><CircleDot size={11}/>Unsaved changes</span>}
            {admin && dirty && <button className="button" onClick={() => setModel(saved)} disabled={!!busy}><Undo2 size={14}/>Discard</button>}
            {admin && <button className="button primary" onClick={() => void save()} disabled={!dirty || !!busy}>{busy === "save" ? <Loader2 size={14} className="rb2-spin"/> : <Save size={14}/>}Save</button>}
            {admin && <button className="button" aria-pressed={editing} onClick={() => setEditing(e => !e)}><PencilLine size={14}/>{editing ? "Done editing" : "Edit"}</button>}
            <button className="icon-button" title={admin ? "Lock admin editing" : adminConfigured ? "Unlock admin editing" : "Admin editing is not configured on the server"} aria-label={admin ? "Lock admin editing" : "Unlock admin editing"} disabled={!admin && !adminConfigured}
              onClick={() => { if (admin) { lockAdmin(); setAdmin(false); setEditing(false); } else setUnlocking(true); }}>{admin ? <LockOpen size={16}/> : <Lock size={16}/>}</button>
            <button className="icon-button" title={model.pinned ? "Unpin report" : "Pin report (kept beyond the latest five)"} aria-label={model.pinned ? "Unpin report" : "Pin report"} aria-pressed={!!model.pinned} disabled={!model.id || !!busy} onClick={() => void togglePin()}>{model.pinned ? <PinOff size={16}/> : <Pin size={16}/>}</button>
            <div className="deck-menu"><button className="icon-button" aria-label="Appearance" aria-expanded={appearance} onClick={() => setAppearance(a => !a)}><Palette size={16}/></button>
              {appearance && <div className="deck-menu-panel"><ReportViewControls model={model} onChange={next => { setModel(next); setSaved(s => ({ ...s, customization: next.customization })); }} /></div>}</div>
            <button className="icon-button" title="Download HTML" aria-label="Download HTML" disabled={!!busy} onClick={() => void exportReport(false)}><Download size={16}/></button>
            <button className="icon-button" title="Print or save PDF" aria-label="Print or save PDF" disabled={!!busy} onClick={() => void exportReport(true)}><Printer size={16}/></button>
            <button className="icon-button" title="Fullscreen (F)" aria-label="Toggle fullscreen" onClick={() => void toggleFull()}>{full ? <Minimize size={16}/> : <Maximize size={16}/>}</button>
            <button className="button deck-notes-toggle" aria-pressed={drawer} title="Speaker notes (N)" onClick={() => setDrawer(d => !d)}><Mic size={14}/>Notes</button>
          </div>
        <nav className="deck-tabs" aria-label="Report chapters">
          {tabs.map(t => <button key={t.id} type="button" aria-current={t.id === tab.id ? "page" : undefined} data-tone={tone(model, t)} onClick={() => navigate({ tab: t.id, section: t.sections[0] })} title={verdictOf(model, t.chapter)?.headline ?? t.title}>
            <i aria-hidden="true"/>{t.label}</button>)}
        </nav>
      </header>
      <div className="deck-body">
        <main className="deck-main" ref={main} id="main">
          {message && <p className="deck-message" role="status">{message}<button className="icon-button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={13}/></button></p>}
          {edit.editing && <p className="deck-edit-banner"><PencilLine size={14}/>Editing — click any text to rewrite it. Use <b>✦</b> on a component to replace just that component with AI. Save writes to the database.</p>}
          <article className="report-doc r2 deck-doc" data-report-theme={model.customization?.theme || "light"} data-accent={options.accent} data-surface={options.surface} data-typography={options.typography} data-card-style={options.cardStyle} data-density={options.density} data-section="chapter" key={page.tab}>
            {body()}
          </article>
          <div className="deck-chapter-markers" hidden>{tabs.filter(t => t.spec).map(t => <section key={t.id} className="r-section" id={t.id}><span className="r-section-topic">{t.label}</span></section>)}</div>
          <footer className="deck-pager-bar" data-export="omit">
            <button className="button" disabled={index <= 0} onClick={() => go(-1)}><ChevronLeft size={15}/>{index > 0 ? tabs[index - 1].label : "Previous"}</button>
            <span className="deck-progress" title="← → to change chapter · N for notes · F for fullscreen"><b>{index + 1}</b> of {tabs.length}<i aria-hidden="true"><i style={{ width: `${(index + 1) / tabs.length * 100}%` }}/></i></span>
            <button className="button" disabled={index >= tabs.length - 1} onClick={() => go(1)}>{index < tabs.length - 1 ? tabs[index + 1].label : "Next"}<ChevronRight size={15}/></button>
          </footer>
        </main>
        <SpeakerDrawer model={model} tabs={tabs} tab={tab.id} section={page.section} open={drawer} onNavigate={navigate} onClose={() => setDrawer(false)}
          onNotes={patch => { setModel(m => ({ ...m, ...patch })); setSaved(s => ({ ...s, ...patch })); }} />
      </div>
      <FloatingReviewTools><PresentationTools standalone beforeHost={async () => { if (!model.id) throw new Error(storageError || "Save the report before hosting a shared review."); }} />
        <StickyNotes key={model.id ?? model.figuresHash} reportId={model.id ?? `draft-${model.figuresHash}`} /></FloatingReviewTools>
      {unlocking && <AdminDialog onClose={() => setUnlocking(false)} onUnlocked={() => { setAdmin(true); setUnlocking(false); setEditing(true); setMessage("Admin editing unlocked for 12 hours on this browser."); }} />}
      {exportMounted && <div className="deck-export-source" aria-hidden="true"><ChapterExport ref={exportRef} model={model} /></div>}
      {busy === "export" && <div className="deck-toast" role="status"><Loader2 size={14} className="rb2-spin"/>Preparing export…</div>}
    </div>
  </RecordDrilldownProvider></EditContext.Provider>;
}
