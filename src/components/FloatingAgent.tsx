import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BotMessageSquare, Sparkles, X, Maximize2, Minimize2, PanelsTopLeft } from "lucide-react";
import { IntelligenceWorkspace } from "./IntelligenceWorkspace";
import { usePreferences } from "../state/preferences";
import { useStore, tabs } from "../state/store";
import "../design/agent-workspace.css";

const MAX_KEY = "p57-chat-maximized";
/** Anything in the app can ask a question with a p57-ask-agent custom event. */
export const askAgent = (question: string) => window.dispatchEvent(new CustomEvent("p57-ask-agent", { detail: question }));
const readMax = () => { try { return localStorage.getItem(MAX_KEY) !== "false"; } catch { return true; } };
export function FloatingAgent() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [maximized, setMaximized] = useState(readMax);
  const [autoAsk, setAutoAsk] = useState<{ text: string; id: number }>();
  const tab = useStore((s) => s.tab);
  const prefs = usePreferences((s) => s.preferences);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const show = () => { setMounted(true); setOpen(true); };
  const close = () => setOpen(false);
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = String((e as CustomEvent).detail || "").trim();
      if (!text) return;
      setMounted(true);
      setOpen(true);
      setAutoAsk({ text, id: Date.now() });
    };
    window.addEventListener("p57-ask-agent", onAsk);
    return () => window.removeEventListener("p57-ask-agent", onAsk);
  }, []);
  const toggleMax = () => setMaximized((m) => { try { localStorage.setItem(MAX_KEY, String(!m)); } catch { /* session only */ } return !m; });
  useEffect(() => {
    if (!open) return;
    const origin = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    const wasInert = root?.inert;
    const oldOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask studio intelligence"]')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
      if (e.key === "Tab") {
        const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input:not([type="hidden"]), select, a[href], summary') || [])].filter(n => n.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (root) root.inert = wasInert ?? false;
      document.body.style.overflow = oldOverflow;
      if (origin?.isConnected && !origin.closest('[inert]')) origin.focus();
      else button.current?.focus();
    };
  }, [open]);
  return createPortal(
    <div className="atlas-agent-surface" data-open={open} data-export="omit">
      <button className={"atlas-chat-launcher " + (open ? "active" : "")} aria-label="Ask GPT" aria-expanded={open} aria-controls="atlas-agent-dialog" ref={button} onClick={show} tabIndex={open ? -1 : 0}>
        <span className="atlas-chat-avatar" aria-hidden="true"><BotMessageSquare size={20} strokeWidth={1.8} /></span>
        <span>Atlas AI</span>
      </button>
      {open && <div className="atlas-agent-backdrop" onClick={close} aria-hidden="true" />}
      {mounted && <section ref={panel} id="atlas-agent-dialog" hidden={!open} className={`atlas-floating-chat ${maximized ? "maximized" : ""}`} role="dialog" aria-modal="true" aria-labelledby="atlas-agent-title" style={{ width: maximized ? "min(1040px, calc(100vw - 48px))" : `min(${Math.max(640, prefs.chatWidth)}px, calc(100vw - 48px))` }}>
        <header>
          <span className="atlas-chat-title">
            <span className="atlas-chat-avatar" aria-hidden="true"><Sparkles size={22} strokeWidth={1.6} /></span>
            <span><span className="atlas-agent-eyebrow">PHYSIQUE 57 · INTELLIGENCE</span><strong id="atlas-agent-title">Your analytical partner</strong><small>Studio context · {tabs[tab]}</small></span>
          </span>
          <div>
            <button aria-label={maximized ? "Restore chat size" : "Expand assistant"} title={maximized ? "Restore size" : "Expand"} onClick={toggleMax}>{maximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
            <button title="Open the full AI workspace" aria-label="Open full AI workspace" onClick={() => { close(); useStore.getState().set({ tab: 13 }); }}><PanelsTopLeft size={17} /></button>
            <button aria-label="Close GPT assistant" onClick={close}><X size={20} /></button>
          </div>
        </header>
        <IntelligenceWorkspace compact autoAsk={autoAsk} />
      </section>}
    </div>, document.body,
  );
}
