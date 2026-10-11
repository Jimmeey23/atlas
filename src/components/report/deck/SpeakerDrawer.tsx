import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Sparkles, Loader2, Timer, Play, Pause, RotateCcw, X, ExternalLink, AArrowUp, AArrowDown, MessageCircleQuestion, Hash, ArrowRight, NotebookPen, ScrollText, ChevronRight, Quote } from "lucide-react";
import type { ReportModel, SpeakerNotes } from "../../../report/model";
import { deckPages, deckTabs, liveNotes, pageKey, sectionContext, sectionLabel, type DeckSection, type DeckTab } from "../../../report/deck";
import { generateSpeakerNotes, saveNotes } from "../../../report/storage";

import { useSpeechFollow } from "./useSpeechFollow";
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const FONT_KEY = "atlas-speaker-font";

/** The presenter's script for whatever page is on screen; follows navigation automatically. */
export function SpeakerNotesView({ notes, fontScale, teleprompter, speed = 20, activeLine = -1, voice = false }: { notes: SpeakerNotes; fontScale: number; teleprompter: boolean; speed?: number; activeLine?: number; voice?: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!teleprompter || voice || !body.current) return;
    const el = body.current; el.scrollTop = 0;
    const id = setInterval(() => { el.scrollTop += speed / 20; }, 50);
    return () => clearInterval(id);
  }, [teleprompter, notes, speed, voice]);
  useEffect(() => { if (voice && activeLine >= 0) body.current?.querySelector(`[data-script-line="${activeLine}"]`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [activeLine, voice]);
  return <div className="deck-notes-body" data-prompter={teleprompter} ref={body} style={{ "--notes-scale": fontScale } as React.CSSProperties}>
    <p className="deck-notes-opener" data-script-line={0} data-active={activeLine === 0}><Quote size={14}/>{notes.opener}</p>
    {!!notes.points.length && <section><h4><ScrollText size={13}/>Talking points</h4><ol className="deck-notes-points">{notes.points.map((p, i) => <li key={i} data-script-line={i + 1} data-active={activeLine === i + 1}><span>{i + 1}</span>{p}</li>)}</ol></section>}
    {!!notes.numbers.length && <section><h4><Hash size={13}/>Numbers to say aloud</h4><ul className="deck-notes-numbers">{notes.numbers.map((n, i) => <li key={i} data-script-line={notes.points.length + i + 1} data-active={activeLine === notes.points.length + i + 1}>{n}</li>)}</ul></section>}
    {!!notes.questions.length && <section><h4><MessageCircleQuestion size={13}/>Likely questions</h4>{notes.questions.map((q, i) => <details key={i} className="deck-notes-qa"><summary><ChevronRight size={13}/>{q.q}</summary><p>{q.a}</p></details>)}</section>}
    {notes.transition && <p className="deck-notes-transition" data-script-line={notes.points.length + notes.numbers.length + 1} data-active={activeLine === notes.points.length + notes.numbers.length + 1}><ArrowRight size={13}/>{notes.transition}</p>}
  </div>;
}

export function SpeakerDrawer({ model, tabs, tab, section, open, onClose, onNotes, onNavigate }: {
  model: ReportModel; tabs: DeckTab[]; tab: string; section: DeckSection; open: boolean; onClose: () => void;
  onNavigate: (page: { tab: string; section: DeckSection }) => void;
  onNotes: (patch: Pick<ReportModel, "presenterNotes" | "speakerNotes">) => void;
}) {
  const key = pageKey(tab, section);
  const notes = useMemo(() => liveNotes(model, tabs, tab, section), [model, tabs, tab, section]);
  const pages = deckPages(tabs);
  const position = pages.findIndex(p => p.tab === tab && p.section === section);
  const next = pages[position + 1];
  const [view, setView] = useState<"script" | "mine">("script");
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem(FONT_KEY)) || 1);
  const [teleprompter, setTeleprompter] = useState(false);
  const [speed, setSpeed] = useState(20), [autoFollow, setAutoFollow] = useState(true);
  const candidates = useMemo(() => deckPages(tabs).map(p => { const script = liveNotes(model, tabs, p.tab, p.section); return { key: pageKey(p.tab, p.section), text: `${tabs.find(t => t.id === p.tab)?.label} ${sectionLabel(p.section, tabs.find(t => t.id === p.tab)?.chapter)} ${script.opener} ${script.points.join(' ')} ${script.numbers.join(' ')}` }; }), [model, tabs]);
  const speech = useSpeechFollow({ candidates, current: key, lines: [notes.opener, ...notes.points, ...notes.numbers, notes.transition], enabled: open,
    onMatch: matched => { if (!autoFollow) return; const page = pages.find(p => pageKey(p.tab, p.section) === matched); if (page) { onNavigate(page); setView('script'); } } });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
  const [mine, setMine] = useState(model.presenterNotes?.[key] ?? "");
  // Timer: whole session plus time spent on this page, against a target length.
  const [running, setRunning] = useState(false), [elapsed, setElapsed] = useState(0), [onPage, setOnPage] = useState(0), [target, setTarget] = useState(30);
  useEffect(() => { setMine(model.presenterNotes?.[key] ?? ""); setOnPage(0); setError(""); }, [key]);
  useEffect(() => { if (!running) return; const id = setInterval(() => { setElapsed(n => n + 1); setOnPage(n => n + 1); }, 1000); return () => clearInterval(id); }, [running]);
  useEffect(() => { try { localStorage.setItem(FONT_KEY, String(fontScale)); } catch { /* per session */ } }, [fontScale]);
  // A popped-out notes window follows this page.
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => { if (!model.id || typeof BroadcastChannel === "undefined") return; channel.current = new BroadcastChannel(`atlas-deck:${model.id}`); return () => channel.current?.close(); }, [model.id]);
  useEffect(() => {
    const broadcast = () => channel.current?.postMessage({ type: "page", tab, section, notes, elapsed });
    broadcast();
    const connection = channel.current;
    if (connection) connection.onmessage = event => { if (event.data?.type === "request-page") broadcast(); };
    return () => { if (connection) connection.onmessage = null; };
  }, [tab, section, notes, elapsed]);
  // Presenter notes save themselves a moment after typing stops.
  const timer = useRef<ReturnType<typeof setTimeout>>();
  function typeMine(text: string) {
    setMine(text); setSaved("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const presenterNotes = { ...(model.presenterNotes ?? {}), [key]: text };
      onNotes({ presenterNotes, speakerNotes: model.speakerNotes });
      if (model.id) void saveNotes(model.id, { presenterNotes: { [key]: text } }).then(() => setSaved("Saved")).catch(e => setSaved(`Not saved: ${(e as Error).message}`));
    }, 800);
  }
  async function writeWithAI() {
    setBusy(true); setError("");
    try {
      const { notes: written } = await generateSpeakerNotes(sectionContext(model, tab, section));
      const speakerNotes = { ...(model.speakerNotes ?? {}), [key]: written };
      onNotes({ presenterNotes: model.presenterNotes, speakerNotes });
      if (model.id) await saveNotes(model.id, { speakerNotes: { [key]: written } });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function resetAI() {
    const { [key]: _removed, ...rest } = model.speakerNotes ?? {};
    onNotes({ presenterNotes: model.presenterNotes, speakerNotes: rest });
    if (model.id) void saveNotes(model.id, { speakerNotes: { [key]: null } }).catch(e => setError((e as Error).message));
  }
  const budget = Math.max(1, Math.round(target * 60 / Math.max(1, pages.length)));
  const pace = elapsed / Math.max(1, target * 60) - (position + 1) / Math.max(1, pages.length);
  const tabLabel = tabs.find(t => t.id === tab)?.label ?? "";
  return <aside className="deck-drawer" data-open={open} aria-label="Speaker notes" aria-hidden={!open} data-export="omit">
    <header className="deck-drawer-head">
      <div><span className="deck-eyebrow"><Mic size={12}/>Speaker notes · live</span><h3>{tabLabel} <ChevronRight size={13}/> {sectionLabel(section, tab)}</h3><small>Page {position + 1} of {pages.length}{model.speakerNotes?.[key] ? " · AI talk track" : " · from the report"}</small></div>
      <button className="icon-button" aria-label="Close speaker notes" onClick={onClose}><X size={16}/></button>
    </header>
    <div className="deck-drawer-timer" data-pace={pace > .05 ? "behind" : pace < -.05 ? "ahead" : "on"}>
      <Timer size={14}/><strong>{clock(elapsed)}</strong><span>page {clock(onPage)} / {clock(budget)}</span>
      <button className="icon-button" aria-label={running ? "Pause timer" : "Start timer"} onClick={() => setRunning(!running)}>{running ? <Pause size={14}/> : <Play size={14}/>}</button>
      <button className="icon-button" aria-label="Reset timer" onClick={() => { setElapsed(0); setOnPage(0); setRunning(false); }}><RotateCcw size={13}/></button>
      <label>Target <input type="number" min={5} max={180} value={target} onChange={e => setTarget(Math.max(5, Number(e.target.value) || 30))}/>m</label>
      <i style={{ width: `${Math.min(100, elapsed / (target * 60) * 100)}%` }}/>
    </div>
    <div className="deck-drawer-tabs segmented" role="group" aria-label="Notes view">
      <button className={view === "script" ? "active" : ""} aria-pressed={view === "script"} onClick={() => setView("script")}><ScrollText size={13}/>Talk track</button>
      <button className={view === "mine" ? "active" : ""} aria-pressed={view === "mine"} onClick={() => setView("mine")}><NotebookPen size={13}/>My notes{mine ? " •" : ""}</button>
    </div>
    <details className="deck-presenter-tools">
      <summary><ChevronRight size={13}/>Presenter tools<small>{speech.listening ? "Listening" : teleprompter ? "Teleprompter on" : "Text size, teleprompter, voice follow"}</small></summary>
    <div className="deck-drawer-tools">
      <button className="icon-button" aria-label="Smaller text" onClick={() => setFontScale(s => Math.max(.8, +(s - .1).toFixed(1)))}><AArrowDown size={15}/></button>
      <button className="icon-button" aria-label="Larger text" onClick={() => setFontScale(s => Math.min(1.8, +(s + .1).toFixed(1)))}><AArrowUp size={15}/></button>
      <button className="button" aria-pressed={teleprompter} onClick={() => setTeleprompter(t => !t)}>Teleprompter</button>
      {model.id && <button className="icon-button" aria-label="Pop out notes window" title="Pop out notes to another screen" onClick={() => window.open(`/report?id=${model.id}&notes=1`, `atlas-notes-${model.id}`, "width=460,height=760")}><ExternalLink size={14}/></button>}
    </div>
    <section className="deck-listener" aria-label="Voice-follow listener">
      <div><button className="button" disabled={!speech.supported} aria-pressed={speech.listening} onClick={speech.toggle}><Mic size={14}/>{speech.listening ? 'Stop listening' : 'Start listener'}</button><span role="status">{speech.supported ? speech.status : 'Speech capture unavailable in this browser'}</span></div>
      <label><input type="checkbox" checked={autoFollow} onChange={e => setAutoFollow(e.target.checked)}/>Follow spoken section automatically</label>
      <label>Scroll speed <input type="range" aria-label="Teleprompter speed" min={5} max={60} value={speed} onChange={e => setSpeed(Number(e.target.value))}/>{speed}px/s</label>
      <small>{speech.listening ? 'Script follows matching speech; automatic scrolling pauses.' : 'Start the microphone to follow your speech. Browser recognition may use its speech service. Transcript stays in this window.'}</small>
      {(speech.transcript || speech.interim) && <details className="deck-transcript"><summary>Captured speaker voice</summary><p>{speech.transcript}<em>{speech.interim}</em></p><button className="button" disabled={!speech.sectionTranscript} onClick={() => { typeMine([mine, `Speaker voice · ${tabLabel} / ${sectionLabel(section, tab)}\n${speech.sectionTranscript}`].filter(Boolean).join("\n\n")); setView("mine"); }}>Save this section’s voice to my notes</button><button className="button" onClick={speech.clear}>Clear transcript</button></details>}
    </section>
    </details>
    {view === "script" ? <>
      <SpeakerNotesView notes={notes} fontScale={fontScale} teleprompter={teleprompter} speed={speed} voice={speech.listening} activeLine={speech.activeLine} />
      <div className="deck-drawer-ai">
        <button className="button" disabled={busy} onClick={() => void writeWithAI()}>{busy ? <Loader2 size={14} className="rb2-spin"/> : <Sparkles size={14}/>}{model.speakerNotes?.[key] ? "Rewrite talk track" : "Write talk track with AI"}</button>
        {model.speakerNotes?.[key] && <button className="button" onClick={resetAI}>Use report pointers</button>}
        {error && <p className="notice" role="alert">{error}</p>}
      </div>
    </> : <div className="deck-mine">
      <textarea aria-label="My presenter notes for this page" value={mine} onChange={e => typeMine(e.target.value)} placeholder="Your own points for this page. Saved with the report." style={{ fontSize: `${13 * fontScale}px` }}/>
      <small role="status">{saved || (model.id ? "Saves automatically" : "Save the report to keep notes")}</small>
    </div>}
    {next && <footer className="deck-drawer-next"><span>Up next</span><b>{tabs.find(t => t.id === next.tab)?.label} · {sectionLabel(next.section, tabs.find(t => t.id === next.tab)?.chapter)}</b></footer>}
  </aside>;
}

/** Notes-only window for a second screen, following the presenting tab. */
export function PoppedNotes({ model }: { model: ReportModel }) {
  const [state, setState] = useState<{ tab: string; section: DeckSection; notes: SpeakerNotes; elapsed: number } | null>(null);
  const tabs = useMemo(() => deckTabs(model), [model]);
  const [scale, setScale] = useState(1.2);
  useEffect(() => {
    if (!model.id || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`atlas-deck:${model.id}`);
    channel.onmessage = e => { if (e.data?.type === "page") setState(e.data); };
    channel.postMessage({ type: "request-page" });
    return () => channel.close();
  }, [model.id]);
  return <div className="deck-popped">
    <header><Mic size={16}/><b>{model.scope.studio} · speaker notes</b>{state && <span>{clock(state.elapsed)}</span>}
      <button className="icon-button" aria-label="Smaller text" onClick={() => setScale(s => Math.max(.8, s - .1))}><AArrowDown size={15}/></button>
      <button className="icon-button" aria-label="Larger text" onClick={() => setScale(s => Math.min(2.2, s + .1))}><AArrowUp size={15}/></button></header>
    {state ? <><h2>{sectionLabel(state.section, tabs.find(t => t.id === state.tab)?.chapter)}</h2><SpeakerNotesView notes={state.notes} fontScale={scale} teleprompter={false} /></> : <p className="deck-loading">Waiting for the presenting window… navigate a page there to sync.</p>}
  </div>;
}
