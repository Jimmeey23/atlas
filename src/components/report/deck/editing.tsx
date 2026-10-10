import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles, Loader2, Undo2, Check, X, Wand2 } from "lucide-react";
import type { ReportComponentSpec, ReportModel } from "../../../report/model";
import { generateComponent } from "../../../report/storage";
import { sectionContext, type DeckSection } from "../../../report/deck";
import { ComponentRenderer } from "./ComponentRenderer";

type Path = (string | number)[];
export interface DeckEdit {
  model: ReportModel;
  admin: boolean;
  editing: boolean;
  /** Writes one value into the model at `path`; the page marks itself unsaved. */
  set: (path: Path, value: unknown) => void;
  replace: (slot: string, spec: ReportComponentSpec | null) => void;
}
export const EditContext = createContext<DeckEdit | null>(null);
export const useEdit = () => useContext(EditContext);

export function setIn<T>(target: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const source = (target ?? (typeof head === "number" ? [] : {})) as Record<string | number, unknown>;
  const copy = (Array.isArray(source) ? [...source] : { ...source }) as Record<string | number, unknown>;
  copy[head] = setIn(source[head], rest, value);
  return copy as T;
}

/** Report prose that an unlocked admin can rewrite in place. */
export function EditableText({ path, value, as: Tag = "span", className, multiline = true, placeholder }: { path: Path; value: string | undefined; as?: "span" | "p" | "h2" | "h3" | "strong" | "div"; className?: string; multiline?: boolean; placeholder?: string }) {
  const edit = useEdit();
  const ref = useRef<HTMLElement>(null);
  const editing = !!edit?.editing;
  useEffect(() => { if (ref.current && ref.current.textContent !== (value ?? "")) ref.current.textContent = value ?? ""; }, [value, editing]);
  if (!editing) return value ? <Tag className={className}>{value}</Tag> : null;
  return <Tag ref={ref as never} className={`${className ?? ""} deck-editable`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline={multiline}
    aria-label={placeholder ?? "Edit text"} data-placeholder={placeholder ?? "Add text…"}
    onKeyDown={e => { if (!multiline && e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
    onBlur={e => { const text = (e.currentTarget.textContent ?? "").trim(); if (text !== (value ?? "")) edit!.set(path, text); }} />;
}

const SUGGESTIONS: Record<string, string[]> = {
  metrics: ["Show the 4 measures that matter most with deltas", "Compare against same month last year"],
  verdict: ["Turn this into a 4-bullet decision brief", "One bold callout with the single takeaway"],
  insights: ["Wins vs risks side-by-side comparison", "Prioritised bullet list with icons"],
  trends: ["Line chart of the lead measure over 14 months", "Table of the best and worst 3 months"],
  evidence: ["Horizontal bar chart of the top groups", "Table of gainers and decliners"],
  plan: ["Action table: move, owner, horizon, at stake", "Three decisions as a callout"],
  glance: ["Scorecard of every area's headline measure", "Wins vs risks comparison"],
};

/**
 * One replaceable component. Admins get an AI button that rewrites only this
 * component from its own section's figures; the rest of the report is untouched.
 */
export function Slot({ id, tab, section, kind, describe, children }: { id: string; tab: string; section: DeckSection; kind: keyof typeof SUGGESTIONS; describe: string; children: ReactNode }) {
  const edit = useEdit();
  const replacement = edit?.model.replacements?.[id];
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ReportComponentSpec | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function run(request = prompt) {
    if (!edit) return;
    abort.current?.abort(); abort.current = new AbortController();
    setBusy(true); setError(""); setDraft(null);
    try {
      const { component } = await generateComponent(sectionContext(edit.model, tab, section, { id, describe }), request.trim() || `Design a better ${describe} for this section.`, abort.current.signal);
      setDraft(component);
    } catch (e) { if (!abort.current.signal.aborted) setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="deck-slot" data-slot={id} data-replaced={!!replacement}>
    {edit?.admin && <div className="deck-slot-tools" data-export="omit">
      {replacement && edit.editing && <button type="button" className="deck-slot-button" title="Restore the original component" aria-label="Restore original component" onClick={() => edit.replace(id, null)}><Undo2 size={13}/></button>}
      <button type="button" className="deck-slot-button deck-ai" title={`Replace this ${describe} with AI`} aria-label={`Replace ${describe} with AI`} aria-expanded={open} onClick={() => setOpen(!open)}><Sparkles size={13}/></button>
    </div>}
    {replacement ? <ComponentRenderer spec={replacement} /> : children}
    {open && <div className="deck-ai-panel" role="dialog" aria-label={`AI replacement for ${describe}`}>
      <header><Wand2 size={15}/><div><b>Replace this {describe}</b><small>Only this component changes. The AI reads this section’s frozen figures.</small></div>
        <button className="icon-button" aria-label="Close" onClick={() => { abort.current?.abort(); setOpen(false); }}><X size={15}/></button></header>
      <div className="deck-ai-suggestions">{(SUGGESTIONS[kind] ?? []).map(s => <button type="button" key={s} disabled={busy} onClick={() => { setPrompt(s); void run(s); }}>{s}</button>)}</div>
      <textarea rows={3} maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the component you want, or leave blank for the AI's best alternative…"/>
      <div className="deck-ai-actions">
        <button className="button primary" disabled={busy} onClick={() => void run()}>{busy ? <Loader2 size={14} className="rb2-spin"/> : <Sparkles size={14}/>}{busy ? "Designing…" : draft ? "Try again" : "Generate"}</button>
        {draft && <button className="button" onClick={() => { edit?.replace(id, draft); setDraft(null); setOpen(false); }}><Check size={14}/>Use this</button>}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {draft && <div className="deck-ai-preview"><span className="deck-eyebrow">Preview</span><ComponentRenderer spec={draft} /></div>}
    </div>}
  </div>;
}
