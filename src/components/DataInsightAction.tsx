import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { WandSparkles, X, Sparkles, ChevronDown, ChevronRight, Pin, PinOff, SlidersHorizontal, PencilLine, Move, AlignLeft, AlignCenter, AlignRight, AlignJustify, RotateCcw } from "lucide-react";
import { useStore, tabs } from "../state/store";
import { usePreferences, type InsightLayout } from "../state/preferences";
import { ChatAnswer } from "./ChatAnswer";
import { historicalFilters, historicalTransient } from "../data/periods";
import { today } from "../data/analytics";
import type { Row } from "../data/duckdb";

const OWNER = ".register,.pulse-wrapper,.insight,.intelligence-panel,.acq-shell,section";

/**
 * Read what this element is actually showing. Without it every insight on a
 * page is generated from the same tab-level scope and comes back saying the
 * same thing, whichever button was pressed.
 */
function captureElement(owner: HTMLElement | null): string {
  if (!owner) return "";
  const parts: string[] = [];
  const clone = owner.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".section-ai-summary,.section-ai-summary-host").forEach((n) => n.remove());
  const cards = [...clone.querySelectorAll(".metric-card")].map((card) => {
    const label = card.querySelector(".metric-label,h3,dt")?.textContent?.trim();
    const value = card.querySelector(".metric-value,.value,dd")?.textContent?.trim();
    const change = card.querySelector(".metric-delta")?.textContent?.trim();
    return label && value ? `${label}: ${value}${change ? ` (vs comparison: ${change})` : ""}` : "";
  }).filter(Boolean);
  if (cards.length) parts.push("Metric cards shown:\n" + cards.join("\n"));
  for (const table of [...clone.querySelectorAll("table")].slice(0, 2)) {
    const head = [...(table.tHead?.rows[table.tHead.rows.length - 1]?.cells || [])]
      .map((c) => c.textContent?.trim() || "");
    const body = [...table.tBodies].flatMap((b) => [...b.rows]).slice(0, 25)
      .map((r) => [...r.cells].map((c) => c.textContent?.trim() || ""));
    const foot = [...(table.tFoot?.rows || [])].map((r) => [...r.cells].map((c) => c.textContent?.trim() || ""));
    if (!head.length || !body.length) continue;
    parts.push(
      [
        "Table shown (" + [...table.tBodies].flatMap((b) => [...b.rows]).length + " rows, first " + body.length + " included):",
        head.join(" | "),
        ...body.map((r) => r.join(" | ")),
        ...foot.map((r) => "TOTAL: " + r.join(" | ")),
      ].join("\n"),
    );
  }
  return parts.join("\n\n").slice(0, 6000);
}

export function DataInsightAction({ subject, detail, buttonLabel = "Section insights", compact = false, dateIndependent = false, rows }: {
  subject: string; detail?: string; buttonLabel?: string; compact?: boolean; dateIndependent?: boolean; rows?: Row[];
}) {
  const store = useStore();
  const key = JSON.stringify([store.tab, subject, detail || ""]);
  const saved = usePreferences(s => s.preferences.sectionInsights?.[key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const owner = useRef<HTMLElement | null>(null);
  const request = useRef<AbortController>();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const button = anchor.current;
    if (!button) return;
    const host = document.createElement("div");
    host.className = "section-ai-summary-host";
    const metricHeading = button.closest(".metric-strip-head");
    owner.current = (metricHeading?.parentElement || button.closest(OWNER) || button.parentElement) as HTMLElement;
    if (metricHeading) metricHeading.nextElementSibling?.after(host);
    else (button.closest(OWNER) || button.parentElement)?.append(host);
    setTarget(host);
    setError("");
    setBusy(false);
    return () => { request.current?.abort(); host.remove(); };
  }, [key]);

  function patch(next: Partial<NonNullable<typeof saved>>) {
    const prefs = usePreferences.getState();
    const current = prefs.preferences.sectionInsights?.[key];
    if (!current) return;
    prefs.update({ sectionInsights: { ...prefs.preferences.sectionInsights, [key]: { ...current, ...next } } });
  }
  function save(text: string, scope: string) {
    const prefs = usePreferences.getState();
    const current = prefs.preferences.sectionInsights?.[key];
    prefs.update({ sectionInsights: { ...prefs.preferences.sectionInsights, [key]: { text, scope, generatedAt: new Date().toISOString(), subject, tab: store.tab, pinned: current?.pinned, collapsed: false } } });
  }
  function remove() {
    const prefs = usePreferences.getState();
    const next = { ...prefs.preferences.sectionInsights };
    delete next[key];
    prefs.update({ sectionInsights: next });
    setError("");
  }
  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const filters = dateIndependent ? historicalFilters(store.filters, today()) : store.filters;
    const cross = dateIndependent ? historicalTransient(store.transient) : store.transient;
    const dimensions = ["trainer", "format", "source", "category", "day", "time"] as const;
    const filterLabels = dimensions.filter(field => filters[field].length).map(field => `${field}: ${filters[field].join(", ")}`);
    if (filters.memberType !== "all") filterLabels.push(`Member type: ${filters.memberType}`);
    if (filters.sessionType !== "all") filterLabels.push(`Session type: ${filters.sessionType}`);
    if (filters.capacityBand !== "all") filterLabels.push(`Capacity: ${filters.capacityBand}`);
    filterLabels.push(filters.imports ? "Imports included" : "Imports excluded");
    const scope = `${tabs[store.tab]} · ${filters.location.join(", ") || "All studios"} · ${filters.from || "all dates"}${filters.to ? ` to ${filters.to}` : ""} · ${filterLabels.join(" · ")}`;
    const shown = captureElement(owner.current);
    const supplied = rows?.length
      ? "Underlying rows for this element:\n" + [Object.keys(rows[0]).join(" | "), ...rows.slice(0, 40).map(r => Object.values(r).map(v => v ?? "").join(" | "))].join("\n").slice(0, 6000)
      : "";
    try {
      const response = await fetch("/api/intelligence/ask", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: [
            `Write an evidence-backed summary for this dashboard element: ${subject}.`,
            detail ? `Displayed focus: ${detail}.` : "",
            `Scope: ${scope}.`,
            // The element's own content, so the answer is about this element
            // and not a restatement of the page it happens to sit on.
            shown ? `This is exactly what the element displays. Explain THIS content; do not summarise the wider page.\n${shown}` : "",
            supplied ? supplied : "",
            shown || supplied
              ? "Treat the displayed figures as authoritative and reconcile to them. Query the source only to add a denominator, a comparison period or a coverage caveat the element does not already show. Never restate a number that contradicts the element."
              : "Query the source data first.",
            "Do not invent figures.",
            "Reply in Markdown using exactly these sections, in this order and with no others:",
            "## Summary — at most two sentences, leading with the single most important finding in this element.",
            "## Key figures — a Markdown table with the columns Measure | Value | Basis. Four to six rows, taken from what the element displays. Basis names the denominator or row count behind the value.",
            "## What stands out — exactly three numbered items. Start each with a bolded claim of at most six words, then one sentence of evidence citing a figure from this element.",
            "## Do next — exactly two numbered actions, each naming who acts and on what.",
            "## Caveats — bullets covering denominators, coverage gaps and data freshness. Omit the section entirely if there are none.",
            "Keep prose tight. Put every number in the table or inside a sentence that names its basis.",
          ].filter(Boolean).join("\n"),
          page: store.tab, filters: { ...filters, cross }, saveHistory: false, history: [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate.");
      const answer = String(data.answer || "").trim();
      if (!answer) throw new Error("No content returned. Please retry.");
      if (!controller.signal.aborted) save(answer, `${scope}${cross.length ? ' · ' + cross.map(t => `${t.field}: ${t.value}`).join(', ') : ''}`);
    } catch (e) {
      if (!controller.signal.aborted) setError(String(e));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const collapsed = !!saved?.collapsed;
  const layout: InsightLayout = saved?.layout || {};
  const [editingLayout, setEditingLayout] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const setLayout = (next: Partial<InsightLayout> | null) => patch({ layout: next ? { ...layout, ...next } : undefined });

  // Drag a floating panel by its header; the position is saved on release.
  function startDrag(e: React.PointerEvent) {
    if (!layout.floating || (e.target as HTMLElement).closest("button,input,select,textarea,label")) return;
    const box = panel.current!.getBoundingClientRect();
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    const move = (ev: PointerEvent) => {
      panel.current!.style.left = `${Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - dx))}px`;
      panel.current!.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dy))}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const b = panel.current?.getBoundingClientRect();
      if (b) setLayout({ x: Math.round(b.left), y: Math.round(b.top) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  // The corner handle (CSS resize) writes inline px sizes; persist them once the pointer is released.
  function saveSize() {
    const el = panel.current;
    if (!el) return;
    const px = (v: string) => (v.endsWith("px") ? Math.round(parseFloat(v)) : undefined);
    const width = px(el.style.width), height = px(el.style.height);
    if ((width ?? layout.width) !== layout.width || (height ?? layout.height) !== layout.height)
      setLayout({ width: width ?? layout.width, height: height ?? layout.height });
  }
  // The resize handle writes an inline height React does not track; clear it so a collapsed panel shrinks.
  useEffect(() => {
    if (collapsed && panel.current) panel.current.style.height = "";
    if (collapsed) setEditingLayout(false);
  }, [collapsed]);
  const panelStyle = {
    "--ai-font": layout.fontSize ? `${layout.fontSize}px` : undefined,
    textAlign: layout.align,
    width: layout.width ? `${layout.width}px` : undefined,
    height: layout.height && !collapsed ? `${layout.height}px` : undefined,
    ...(layout.floating ? { left: `${layout.x ?? Math.max(16, window.innerWidth - (layout.width ?? 520) - 40)}px`, top: `${layout.y ?? 120}px`, maxHeight: `calc(100vh - ${(layout.y ?? 120) + 16}px)` } : {}),
  } as React.CSSProperties;
  return <>
    <button ref={anchor} className={`ai-insight-btn ai-summary-btn ${compact ? "" : "with-label"} ${busy ? "is-thinking" : ""}`} aria-label={`Generate insights for ${subject}`} title={`Generate an AI summary for ${subject}`} disabled={busy} onClick={() => void run()}>
      <span className="ai-summary-mark" aria-hidden="true"><WandSparkles size={16} strokeWidth={1.8} /><span className="ai-summary-twinkle" /></span>{!compact && buttonLabel}
    </button>
    {target && (saved || busy || error) && createPortal(
      <article
        ref={panel}
        className="section-ai-summary"
        data-insight-key={key}
        data-pinned={saved?.pinned || undefined}
        data-floating={layout.floating || undefined}
        data-collapsed={collapsed || undefined}
        data-nowrap={layout.wrap === false || undefined}
        data-columns={layout.columns === 2 ? "2" : undefined}
        data-sized={layout.width || layout.height ? "" : undefined}
        style={panelStyle}
        onPointerUp={saveSize}
        aria-label={`AI content for ${subject}`}
      >
        <header onPointerDown={startDrag}>
          <button
            className="ai-summary-toggle"
            aria-expanded={!collapsed}
            disabled={!saved}
            onClick={() => patch({ collapsed: !collapsed })}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            <span className="icon"><Sparkles size={14} />AI section insights</span>
          </button>
          <div>
            {layout.floating && <Move size={14} className="ai-summary-grip" aria-hidden="true" />}
            {saved && (
              <button className={`icon-button ${editingLayout ? "is-active" : ""}`} aria-pressed={editingLayout} aria-label="Adjust layout" title="Adjust size, position, wrapping and alignment" onClick={() => setEditingLayout(!editingLayout)}>
                <SlidersHorizontal size={14} />
              </button>
            )}
            {saved && (
              <button className={`icon-button ${draft != null ? "is-active" : ""}`} aria-pressed={draft != null} aria-label="Edit text" title="Edit the text of this insight" onClick={() => setDraft(draft == null ? saved.text : null)}>
                <PencilLine size={14} />
              </button>
            )}
            {saved && (
              <button
                className={`icon-button ${saved.pinned ? "is-pinned" : ""}`}
                aria-pressed={!!saved.pinned}
                aria-label={saved.pinned ? `Unpin AI content for ${subject}` : `Pin AI content for ${subject}`}
                title={saved.pinned ? "Unpin from the top of this page" : "Pin to the top of this page"}
                onClick={() => patch({ pinned: !saved.pinned, collapsed: false })}
              >
                {saved.pinned ? <Pin size={14} /> : <PinOff size={14} />}
              </button>
            )}
            {saved && <button className="button" disabled={busy} onClick={() => void run()}>Regenerate</button>}
            <button className="icon-button" aria-label={`Remove AI content for ${subject}`} disabled={busy} onClick={remove}><X size={14} /></button>
          </div>
        </header>
        {saved && editingLayout && (
          <div className="ai-layout-bar" role="group" aria-label="Insight layout">
            <label>Width
              <input type="range" min={280} max={1600} step={10} value={layout.width ?? panel.current?.offsetWidth ?? 800} onChange={(e) => setLayout({ width: +e.target.value })} />
              <button className="link-button" onClick={() => setLayout({ width: undefined })}>Auto</button>
            </label>
            <label>Height
              <input type="range" min={140} max={1000} step={10} value={layout.height ?? panel.current?.offsetHeight ?? 400} onChange={(e) => setLayout({ height: +e.target.value })} />
              <button className="link-button" onClick={() => setLayout({ height: undefined })}>Auto</button>
            </label>
            <label>Text
              <input type="range" min={11} max={20} step={1} value={layout.fontSize ?? 13} onChange={(e) => setLayout({ fontSize: +e.target.value })} />
              <span className="small">{layout.fontSize ?? 13}px</span>
            </label>
            <div className="ai-layout-segment" role="radiogroup" aria-label="Alignment">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight], ["justify", AlignJustify]] as const).map(([value, Icon]) => (
                <button key={value} role="radio" aria-checked={(layout.align ?? "left") === value} aria-label={`Align ${value}`} onClick={() => setLayout({ align: value })}><Icon size={13} /></button>
              ))}
            </div>
            <label className="ai-layout-check"><input type="checkbox" checked={layout.wrap !== false} onChange={(e) => setLayout({ wrap: e.target.checked })} /> Wrap text</label>
            <label className="ai-layout-check"><input type="checkbox" checked={layout.columns === 2} onChange={(e) => setLayout({ columns: e.target.checked ? 2 : 1 })} /> Two columns</label>
            <button className="button" onClick={() => setLayout({ floating: !layout.floating })}>{layout.floating ? "Dock in page" : "Float & drag"}</button>
            <button className="button" onClick={() => setLayout(null)}><RotateCcw size={12} /> Reset</button>
          </div>
        )}
        {busy && <p role="status">Reading this element with your filters…</p>}
        {error && <p role="alert" className="warn">{error}</p>}
        {saved && !collapsed && draft != null && (
          <div className="ai-summary-editor">
            <textarea aria-label="Insight text (Markdown)" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div>
              <button className="button" onClick={() => { patch({ text: draft }); setDraft(null); }}>Save text</button>
              <button className="button" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        )}
        {saved && !collapsed && draft == null && <><p className="small ai-summary-scope">Generated for {saved.scope} · {new Date(saved.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p><div className="ai-summary-body"><ChatAnswer text={saved.text} /></div></>}
        {saved && collapsed && <p className="small">Collapsed · generated {new Date(saved.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}
      </article>, layout.floating ? document.body : target)}
  </>;
}
