import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Sparkles, X, ArrowUpRight, Pencil, Trash2, Pin, PinOff, PictureInPicture2, ExternalLink, PanelRight } from "lucide-react";
import { useStore, tabs } from "../state/store";
import type { Insight } from "../insights/rules";
import { InsightEditor, useDocuments } from "./IntelligenceWorkspace";
import { fmt } from "../semantics/formats";
import { askAgent } from "./FloatingAgent";

type BriefingItem = { tone: "positive" | "negative"; title: string; detail: string; question: string };
/** Weekly briefing: the most unusual studio-level moves in the last complete week, computed on the server without AI. */
function Briefing() {
  const imports = useStore((s) => s.filters.imports);
  const [state, setState] = useState<{ items?: BriefingItem[]; at?: string; error?: string; loading?: boolean }>({ loading: true });
  const load = (refresh = false) => {
    setState((s) => ({ ...s, loading: true }));
    fetch("/api/intelligence/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imports, refresh }) })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setState({ items: d.items, at: d.generatedAt }); })
      .catch((e) => setState({ error: String(e.message || e) }));
  };
  useEffect(() => load(), [imports]);
  return (
    <details className="briefing" open>
      <summary>
        <span className="signal-section-label">This week’s briefing</span>
        <button className="briefing-refresh" onClick={(e) => { e.preventDefault(); load(true); }} disabled={state.loading} title="Recalculate">{state.loading ? "…" : "↻"}</button>
      </summary>
      {state.error ? <p className="muted small">Briefing unavailable: {state.error}</p>
        : state.loading && !state.items ? <p className="muted small">Scanning last week against recent weeks…</p>
        : !state.items?.length ? <p className="muted small">Nothing unusual last week — every studio stayed within its normal range.</p>
        : state.items.map((item, i) => (
          <article key={i} className={`briefing-item ${item.tone}`}>
            <h4>{item.title}</h4>
            <p>{item.detail}</p>
            <button className="insight-action" onClick={() => askAgent(item.question)}>Ask the agent why <ArrowUpRight size={12} /></button>
          </article>
        ))}
    </details>
  );
}

/** Drawer arrangement, remembered per device (deliberately not in the cloud-synced preferences). */
type DrawerLayout = { mode: "docked" | "floating" | "popout"; pinned: boolean; width: number; x: number; y: number; height: number };
const LAYOUT_KEY = "p57-insights-drawer";
const defaultLayout: DrawerLayout = { mode: "docked", pinned: true, width: 340, x: 0, y: 120, height: 620 };
function readLayout(): DrawerLayout {
  try { return { ...defaultLayout, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") }; } catch { return defaultLayout; }
}
const clampWidth = (w: number) => Math.max(260, Math.min(760, Math.round(w)));

function useRelevant(items: Insight[]) {
  const tab = useStore((s) => s.tab);
  const { docs } = useDocuments("insight");
  return (tab === 0 ? items : items.filter((i) => i.tab === tab))
    .filter((i) => !docs.some((d) => d.body.ruleKey === i.rule + ":" + i.entity))
    .slice(0, 7);
}

function InsightsBody({ items, onDismiss }: { items: Insight[]; onDismiss: (i: Insight) => void }) {
  const s = useStore();
  const [saveError, setSaveError] = useState("");
  const relevant = useRelevant(items);
  return (
          <div className="signal-body">
      <p className="signal-intro">
        Prioritised by rupee exposure. Explore the evidence behind each signal.
      </p>
      <InsightEditor />
      {saveError && <p role="alert">{saveError}</p>}
      <Briefing />
      <h3 className="signal-section-label">Scope signals</h3>
      {relevant.map((i) => (
        <article
          className={`insight ${i.severity}`}
          key={i.rule + i.entity}
        >
          <div className="insight-meta">
            <span className="insight-severity">
              {i.severity[0].toUpperCase() + i.severity.slice(1)}
            </span>
            <button
              aria-label={`Dismiss ${i.title} for 30 days`}
              onClick={() => onDismiss(i)}
            >
              <X size={11} />
            </button>
          </div>
          <h3>{i.title}</h3>
          <p>{i.template}</p>
          <div className="insight-meta insight-impact">
            <span>{fmt("revenue", i.impactINR)} exposure / value</span>
            <span>n = {i.n}</span>
          </div>
          <div className="insight-footer">
            <button
              className="insight-action"
              onClick={() =>
                s.set({ tab: i.tab, transient: i.linkFilters })
              }
            >
              Inspect the evidence <ArrowUpRight size={12} />
            </button>
            <span className="insight-icon-actions">
              <button
                className="ai-insight-btn"
                aria-label={`Edit ${i.title}`}
                title="Edit insight"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("p57-edit-insight", { detail: i }),
                  )
                }
              >
                <Pencil size={11} />
              </button>
              <button
                className="ai-insight-btn"
                aria-label={`Delete ${i.title}`}
                title="Delete insight"
                onClick={async () => {
                  try {
                    const response = await fetch(
                      "/api/intelligence/documents",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          kind: "insight",
                          title: i.title,
                          page: i.tab,
                          body: {
                            hidden: true,
                            ruleKey: i.rule + ":" + i.entity,
                          },
                        }),
                      },
                    );
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error);
                    window.dispatchEvent(new Event("p57-documents"));
                  } catch (error) {
                    setSaveError(String(error));
                  }
                }}
              >
                <Trash2 size={11} />
              </button>
            </span>
          </div>
        </article>
      ))}
      {!relevant.length && (
        <p className="muted">
          No rules meet their evidence thresholds in this scope. This is
          not a guarantee of business health.
        </p>
      )}
    </div>
  );
}

export function SignalRail({
  items,
  onDismiss,
}: {
  items: Insight[];
  onDismiss: (i: Insight) => void;
}) {
  const s = useStore();
  const relevant = useRelevant(items);
  const [layout, setLayoutState] = useState<DrawerLayout>(readLayout);
  const rail = useRef<HTMLElement>(null);
  const setLayout = (patch: Partial<DrawerLayout>) =>
    setLayoutState((current) => {
      const next = { ...current, ...patch };
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* layout applies for this session */ }
      return next;
    });

  // Pop-out: a separate window that shares this app's state, styled with the same sheets.
  const popup = useRef<{ win: Window; root: Root } | null>(null);
  useEffect(() => {
    if (!(s.signalOpen && layout.mode === "popout")) return;
    const win = window.open("", "atlas-insights", `width=${layout.width + 40},height=${layout.height},left=${window.screenX + window.outerWidth - layout.width - 80},top=${window.screenY + 80}`);
    if (!win) { setLayout({ mode: "floating" }); return; }
    win.document.title = "Atlas · Insights";
    win.document.head.innerHTML = "";
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => win.document.head.appendChild(node.cloneNode(true)));
    const host = win.document.createElement("div");
    host.className = "signal-popout";
    win.document.body.replaceChildren(host);
    const root = createRoot(host);
    popup.current = { win, root };
    const back = () => { setLayout({ mode: "docked" }); };
    win.addEventListener("beforeunload", back);
    return () => {
      win.removeEventListener("beforeunload", back);
      root.unmount();
      popup.current = null;
      if (!win.closed) win.close();
    };
  }, [s.signalOpen, layout.mode]);
  // Keep the pop-out's theme, accent and content in step with the main window.
  useEffect(() => {
    const p = popup.current;
    if (!p) return;
    const target = p.win.document.documentElement;
    for (const attr of document.documentElement.getAttributeNames()) target.setAttribute(attr, document.documentElement.getAttribute(attr) || "");
    p.root.render(
      <div className="signal-rail open popout-window">
        <div className="signal-header"><div><h2 className="icon"><Sparkles size={16} />Insights <span className="pill">{relevant.length}</span></h2><p className="signal-scope">{tabs[s.tab]}</p></div>
          <button className="icon-button" aria-label="Return insights to the page" title="Return to page" onClick={() => setLayout({ mode: "docked" })}><PanelRight size={15} /></button>
        </div>
        <InsightsBody items={items} onDismiss={onDismiss} />
      </div>,
    );
  });

  // Unpinned: the drawer overlays the page and closes when you click elsewhere.
  useEffect(() => {
    if (!s.signalOpen || layout.pinned || layout.mode !== "docked") return;
    const close = (e: PointerEvent) => { if (rail.current && !rail.current.contains(e.target as Node)) s.set({ signalOpen: false }); };
    const id = window.setTimeout(() => document.addEventListener("pointerdown", close));
    return () => { window.clearTimeout(id); document.removeEventListener("pointerdown", close); };
  }, [s.signalOpen, layout.pinned, layout.mode]);

  function resizeFrom(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX, startW = layout.width;
    const move = (ev: PointerEvent) => { if (rail.current) rail.current.style.width = `${clampWidth(startW + (startX - ev.clientX))}px`; };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLayout({ width: clampWidth(startW + (startX - ev.clientX)) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function dragFrom(e: React.PointerEvent) {
    if (layout.mode !== "floating" || (e.target as HTMLElement).closest("button")) return;
    const box = rail.current!.getBoundingClientRect();
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    const move = (ev: PointerEvent) => {
      rail.current!.style.left = `${Math.max(0, Math.min(window.innerWidth - 160, ev.clientX - dx))}px`;
      rail.current!.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dy))}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const b = rail.current?.getBoundingClientRect();
      if (b) setLayout({ x: Math.round(b.left), y: Math.round(b.top) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  // The floating panel's corner handle sets inline px sizes; keep them.
  function saveFloatingSize() {
    const el = rail.current;
    if (layout.mode !== "floating" || !el) return;
    const width = clampWidth(el.offsetWidth), height = Math.round(el.offsetHeight);
    if (width !== layout.width || height !== layout.height) setLayout({ width, height });
  }

  const open = s.signalOpen;
  const floating = open && layout.mode === "floating";
  const popped = open && layout.mode === "popout";
  const style: React.CSSProperties | undefined = !open ? undefined
    : floating ? { left: layout.x || Math.max(16, window.innerWidth - layout.width - 40), top: layout.y, width: layout.width, height: layout.height }
    : popped ? undefined
    : { width: layout.width };
  return (
    <aside
      ref={rail}
      className={`signal-rail ${open ? "open" : ""} ${floating ? "floating" : ""} ${open && layout.mode === "docked" && !layout.pinned ? "overlay" : ""} ${popped ? "popped" : ""}`}
      style={style}
      onPointerUp={saveFloatingSize}
      aria-label="Operational insights"
    >
      {!open ? (
        <button
          className="signal-toggle"
          onClick={() => s.set({ signalOpen: true })}
          aria-label={`Open ${relevant.length} insights`}
        >
          <Sparkles size={15} />
          <span>Insights</span>
          <span>{relevant.length}</span>
          <span className="dot warn" />
          <span className="dot negative" />
          <span className="dot positive" />
        </button>
      ) : popped ? (
        <button className="signal-toggle" onClick={() => setLayout({ mode: "docked" })} aria-label="Insights are in a separate window. Bring them back to the page." title="Bring insights back to the page">
          <ExternalLink size={15} />
          <span>Insights open in a window</span>
        </button>
      ) : (
        <>
          {layout.mode === "docked" && <div className="signal-resize" role="separator" aria-orientation="vertical" aria-label="Resize insights drawer" title="Drag to resize" onPointerDown={resizeFrom} />}
          <div className="signal-header" onPointerDown={dragFrom}>
            <div><h2 className="icon">
              <Sparkles size={16} />
              Insights <span className="pill">{relevant.length}</span>
            </h2><p className="signal-scope">{tabs[s.tab]}</p></div>
            <div className="signal-actions">
              {layout.mode === "docked" && (
                <button className={`icon-button ${layout.pinned ? "is-active" : ""}`} aria-pressed={layout.pinned} aria-label={layout.pinned ? "Unpin drawer" : "Pin drawer"} title={layout.pinned ? "Unpin: overlay the page and close on outside click" : "Pin: keep the drawer docked beside the page"} onClick={() => setLayout({ pinned: !layout.pinned })}>
                  {layout.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                </button>
              )}
              <button className={`icon-button ${floating ? "is-active" : ""}`} aria-pressed={floating} aria-label={floating ? "Dock drawer" : "Float drawer"} title={floating ? "Dock to the side" : "Float: drag anywhere and resize from the corner"} onClick={() => setLayout({ mode: floating ? "docked" : "floating" })}>
                {floating ? <PanelRight size={14} /> : <PictureInPicture2 size={14} />}
              </button>
              <button className="icon-button" aria-label="Pop out insights" title="Open in a separate window" onClick={() => setLayout({ mode: "popout" })}>
                <ExternalLink size={14} />
              </button>
              <button
                className="icon-button"
                aria-label="Collapse insights"
                onClick={() => s.set({ signalOpen: false })}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <InsightsBody items={items} onDismiss={onDismiss} />
        </>
      )}
    </aside>
  );
}
