import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Lock, LockOpen, PencilLine, Save, Undo2, Pin, PinOff, Download, Printer, Maximize, Minimize, Palette, Loader2, KeyRound, X, TriangleAlert, LayoutDashboard, Gauge, Lightbulb, ChartLine, Layers, Database, ListChecks, BookOpen, CircleDot } from "lucide-react";
import logo from "../../../assets/report/logo.png";
import { ReferenceHero } from "../ReportChrome";
import { AtAGlance, ActionPlan } from "../Glance";
import { EvidenceBlock, CriterionEvidence } from "../ReportEvidence";
import { ReportDocument } from "../ReportDocument";
import { ReportViewControls } from "../ReportViewControls";
import { FloatingReviewTools } from "../../FloatingReviewTools";
import { PresentationTools } from "../../PresentationTools";
import { StickyNotes } from "../../StickyNotes";
import { chapters } from "../../../report/chapters";
import { definition } from "../../../report/definitions";
import { findingsFor, ledger } from "../../../report/findings";
import { monthLabel } from "../../../report/period";
import { reportOptions } from "../../../report/options";
import { chapterMetrics, deckPages, deckTabs, SECTION_LABEL, verdictOf, type DeckSection } from "../../../report/deck";
import { downloadReport, printReport } from "../../../report/export";
import { adminStatus, adminToken, lockAdmin, pinReport, saveReport, unlockAdmin, updateReport } from "../../../report/storage";
import type { ReportComponentSpec, ReportModel } from "../../../report/model";
import { EditContext, setIn, Slot, type DeckEdit } from "./editing";
import { FlipMetricCard } from "./FlipMetricCard";
import { VerdictPanel } from "./Verdict";
import { InsightsSection } from "./Insights";
import { DeckRegister, ReportMoMTable, TrendChartPanel } from "./ReportTrends";
import { DataExplorer } from "./DataExplorer";
import { SpeakerDrawer } from "./SpeakerDrawer";
import "../../../design/report-deck.css";

const SECTION_ICON: Record<DeckSection, typeof Gauge> = { cover: BookOpen, glance: LayoutDashboard, summary: Gauge, insights: Lightbulb, plan: ListChecks, trends: ChartLine, evidence: Layers, data: Database };

function tone(model: ReportModel, tab: string) {
  const data = model.chapters[tab];
  const spec = chapters.find(c => c.id === tab);
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

/** A saved report presented as tabbed pages with live speaker notes, admin editing and AI component replacement. */
export function ReportDeck({ initial, storageError }: { initial: ReportModel; storageError?: string }) {
  const [model, setModel] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const tabs = useMemo(() => deckTabs(model), [model.chapters, model.narratives, model.customization?.chapterIds]);
  const pages = deckPages(tabs);
  const fromHash = () => { const [t, s] = decodeURIComponent(location.hash.slice(1)).split("/"); const found = tabs.find(x => x.id === t); return found ? { tab: found.id, section: (found.sections.includes(s as DeckSection) ? s : found.sections[0]) as DeckSection } : { tab: tabs[0].id, section: tabs[0].sections[0] }; };
  const [page, setPage] = useState(fromHash);
  const [drawer, setDrawer] = useState(() => { try { return innerWidth > 820 && localStorage.getItem("atlas-deck-drawer") !== "closed"; } catch { return innerWidth > 820; } });
  const [admin, setAdmin] = useState(!!adminToken());
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(""), [message, setMessage] = useState(storageError ? `Opened locally. ${storageError}` : "");
  const [selectedMonth, setSelectedMonth] = useState(model.scope.month);
  const [full, setFull] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [exportMounted, setExportMounted] = useState(false);
  const exportRef = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const dirty = JSON.stringify([model.narratives, model.replacements ?? {}]) !== JSON.stringify([saved.narratives, saved.replacements ?? {}]);
  const tab = tabs.find(t => t.id === page.tab) ?? tabs[0];
  const index = pages.findIndex(p => p.tab === page.tab && p.section === page.section);

  useEffect(() => { void adminStatus().then(s => { setAdminConfigured(s.configured); if (!s.unlocked && adminToken()) { lockAdmin(); setAdmin(false); } }).catch(() => undefined); }, []);
  useEffect(() => { history.replaceState(null, "", `#${page.tab}/${page.section}`); main.current?.scrollTo({ top: 0 }); }, [page.tab, page.section]);
  // Shared review sessions: the presenter toolkit follows and drives the chapter tab.
  useEffect(() => { window.dispatchEvent(new CustomEvent("p57-report-navigate", { detail: page.tab === "overview" ? "" : page.tab })); }, [page.tab]);
  useEffect(() => {
    const follow = (event: Event) => { const id = (event as CustomEvent<string>).detail || "overview"; setPage(current => current.tab === id ? current : (() => { const t = tabs.find(x => x.id === id); return t ? { tab: t.id, section: t.sections[0] } : current; })()); };
    window.addEventListener("p57-report-chapter", follow); return () => window.removeEventListener("p57-report-chapter", follow);
  }, [tabs]);
  useEffect(() => { if (innerWidth > 820) try { localStorage.setItem("atlas-deck-drawer", drawer ? "open" : "closed"); } catch { /* per session */ } }, [drawer]);
  useEffect(() => { const handler = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", handler); return () => document.removeEventListener("fullscreenchange", handler); }, []);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  useEffect(() => { document.title = `${model.customization?.title || "Monthly report"} · ${model.scope.studio} · ${monthLabel(model.scope.month)}`; }, [model.customization?.title, model.scope]);

  const go = useCallback((step: number) => { const next = pages[Math.max(0, Math.min(pages.length - 1, index + step))]; if (next) setPage(next); }, [pages, index]);
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
    try { if (!exportRef.current) throw new Error("The export view is not ready. Retry."); await (print ? printReport : downloadReport)(exportRef.current, model); } catch (e) { setMessage((e as Error).message); } finally { setBusy(""); }
  }

  const options = reportOptions(model.customization);
  const findings = useMemo(() => findingsFor(model), [model.chapters]);
  const ranked = useMemo(() => ledger(findings), [findings]);
  const specs = tabs.flatMap(t => t.spec ? [t.spec] : []);
  const data = model.chapters[tab.id];
  const ids = tab.spec ? chapterMetrics(tab.spec, data) : [];
  const slot = (name: string) => `${tab.id}:${page.section}:${name}`;

  function body() {
    const s = page.section;
    if (s === "cover") return <ReferenceHero studio={model.scope.studio} period={monthLabel(model.scope.month)} built={new Date(model.builtAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
      aiCount={Object.values(model.narratives).filter(n => n.generated).length} total={specs.length} title={model.customization?.title} subtitle={model.customization?.subtitle} preparedFor={model.customization?.preparedFor} preparedBy={model.customization?.preparedBy} />;
    if (s === "glance") return <Slot id={slot("glance")} tab={tab.id} section={s} kind="glance" describe="month-at-a-glance scorecard"><AtAGlance model={model} specs={specs} ranked={ranked} targets={model.customization?.targets} /></Slot>;
    if (s === "summary") return <>
      <Slot id={slot("verdict")} tab={tab.id} section={s} kind="verdict" describe="chapter verdict"><VerdictPanel model={model} tab={tab.id} ids={ids} /></Slot>
      {!!ids.length && data && <Slot id={slot("metrics")} tab={tab.id} section={s} kind="metrics" describe="key metric cards">
        <div className="deck-metrics-head"><span className="deck-eyebrow"><Gauge size={12}/>Key measures</span><small>Click any card to flip it to 14 months of history</small></div>
        <div className="deck-metric-grid">{ids.slice(0, 8).map(id => <FlipMetricCard key={id} id={id} data={data} target={model.customization?.targets?.[id]} />)}</div>
      </Slot>}
    </>;
    if (s === "insights") return <Slot id={slot("insights")} tab={tab.id} section={s} kind="insights" describe="insight list"><InsightsSection model={model} tab={tab.id} plan={tab.id === "recommendations"} /></Slot>;
    if (s === "plan") return <Slot id={slot("plan")} tab={tab.id} section={s} kind="plan" describe="action plan"><ActionPlan cards={model.narratives[tab.id]?.cards ?? []} /></Slot>;
    if (s === "trends" && data) {
      const historyIds = [...new Set([...(tab.spec?.history ?? []), ...ids])];
      return <DeckRegister index="MoM" title="Month by month" subtitle={`${data.history.length} months frozen at report build · ${tab.label}`}>
        <Slot id={slot("chart")} tab={tab.id} section={s} kind="trends" describe="monthly trend chart"><TrendChartPanel history={data.history.slice(-14)} ids={historyIds} selected={selectedMonth} onSelect={setSelectedMonth} title={`${tab.label} trend`} /></Slot>
        <Slot id={slot("table")} tab={tab.id} section={s} kind="trends" describe="month-on-month table"><ReportMoMTable history={data.history.slice(-14)} ids={historyIds} selected={selectedMonth} onSelect={setSelectedMonth} title={tab.label} /></Slot>
      </DeckRegister>;
    }
    if (s === "evidence" && data) {
      const ranking = tab.id === "instructors" ? data.groups.filter(g => g.id?.startsWith("trainer-")) : [];
      return <div className="deck-evidence">
        {data.groups.filter(g => !ranking.includes(g)).map((g, i) => <Slot key={`${g.id ?? g.field}-${i}`} id={slot(`group-${g.id ?? g.field}`)} tab={tab.id} section={s} kind="evidence" describe={`${g.title} breakdown`}>
          <EvidenceBlock table={g} showCharts={options.showCharts} initialView={options.evidenceView === "auto" ? undefined : options.evidenceView} /></Slot>)}
        {!!ranking.length && <Slot id={slot("ranking")} tab={tab.id} section={s} kind="evidence" describe="instructor ranking"><CriterionEvidence tables={ranking} showCharts={options.showCharts} /></Slot>}
      </div>;
    }
    if (s === "data" && tab.spec) return <DeckRegister index="Data" title="Explore underlying data" subtitle="Live source records for this studio and month"><DataExplorer model={model} spec={tab.spec} /></DeckRegister>;
    return <p className="empty-state">Nothing recorded for this page.</p>;
  }

  return <EditContext.Provider value={edit}>
    <div className="report-page deck" data-report-id={model.id || ""} data-drawer={drawer} data-editing={edit.editing} data-full={full}>
      <header className="deck-nav" data-export="omit">
        <div className="deck-nav-top">
          <a className="deck-brand" href="#overview/cover" onClick={e => { e.preventDefault(); setPage({ tab: "overview", section: "cover" }); }}><img src={logo} alt="Physique 57"/><span><b>{model.customization?.title || "Monthly performance report"}</b><small>{model.scope.studio} · {monthLabel(model.scope.month)}{model.editedAt ? " · edited" : ""}</small></span></a>
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
        </div>
        <nav className="deck-tabs" aria-label="Report chapters">
          {tabs.map(t => <button key={t.id} type="button" aria-current={t.id === tab.id ? "page" : undefined} data-tone={tone(model, t.id)} onClick={() => setPage({ tab: t.id, section: t.sections[0] })} title={verdictOf(model, t.id)?.headline ?? t.title}>
            <i aria-hidden="true"/>{t.label}</button>)}
        </nav>
      </header>
      <div className="deck-body">
        <main className="deck-main" ref={main} id="main">
          <div className="deck-page-head" data-export="omit">
            <div><span className="deck-eyebrow">{tab.spec?.eyebrow ?? "Report overview"}</span><h1>{tab.title}</h1>{tab.spec?.deck && <p>{tab.spec.deck}</p>}</div>
            <div className="deck-sections segmented" role="tablist" aria-label="Sections">
              {tab.sections.map(s => { const Icon = SECTION_ICON[s]; return <button key={s} role="tab" aria-selected={s === page.section} className={s === page.section ? "active" : ""} onClick={() => setPage({ tab: tab.id, section: s })}><Icon size={13}/>{SECTION_LABEL[s]}</button>; })}
            </div>
          </div>
          {message && <p className="deck-message" role="status">{message}<button className="icon-button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={13}/></button></p>}
          {edit.editing && <p className="deck-edit-banner"><PencilLine size={14}/>Editing — click any text to rewrite it. Use <b>✦</b> on a component to replace just that component with AI. Save writes to the database.</p>}
          <article className="report-doc r2 deck-doc" data-report-theme={model.customization?.theme || "light"} data-accent={options.accent} data-surface={options.surface} data-typography={options.typography} data-card-style={options.cardStyle} data-density={options.density} data-section={page.section} key={`${page.tab}:${page.section}`}>
            {body()}
          </article>
          <div className="deck-chapter-markers" hidden>{tabs.filter(t => t.spec).map(t => <section key={t.id} className="r-section" id={t.id}><span className="r-section-topic">{t.label}</span></section>)}</div>
          <footer className="deck-pager-bar" data-export="omit">
            <button className="button" disabled={index <= 0} onClick={() => go(-1)}><ChevronLeft size={15}/>Previous</button>
            <span>{index + 1} / {pages.length} · ← → to move · N for notes</span>
            <button className="button" disabled={index >= pages.length - 1} onClick={() => go(1)}>Next<ChevronRight size={15}/></button>
          </footer>
        </main>
        <SpeakerDrawer model={model} tabs={tabs} tab={tab.id} section={page.section} open={drawer} onClose={() => setDrawer(false)}
          onNotes={patch => { setModel(m => ({ ...m, ...patch })); setSaved(s => ({ ...s, ...patch })); }} />
      </div>
      <FloatingReviewTools><PresentationTools standalone beforeHost={async () => { if (!model.id) throw new Error(storageError || "Save the report before hosting a shared review."); }} />
        <StickyNotes key={model.id ?? model.figuresHash} reportId={model.id ?? `draft-${model.figuresHash}`} /></FloatingReviewTools>
      {unlocking && <AdminDialog onClose={() => setUnlocking(false)} onUnlocked={() => { setAdmin(true); setUnlocking(false); setEditing(true); setMessage("Admin editing unlocked for 12 hours on this browser."); }} />}
      {exportMounted && <div className="deck-export-source" aria-hidden="true"><ReportDocument ref={exportRef} model={model} theme={model.customization?.theme || "light"} /></div>}
      {busy === "export" && <div className="deck-toast" role="status"><Loader2 size={14} className="rb2-spin"/>Preparing export…</div>}
    </div>
  </EditContext.Provider>;
}
