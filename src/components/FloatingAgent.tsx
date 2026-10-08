import { useEffect, useRef, useState } from "react";
import { BotMessageSquare, Bot, X, Maximize2, Minimize2, PanelsTopLeft } from "lucide-react";
import { IntelligenceWorkspace } from "./IntelligenceWorkspace";
import { usePreferences } from "../state/preferences";
import { useStore, tabs } from "../state/store";

// Maximised by default; the choice is remembered on this device only.
const MAX_KEY = "p57-chat-maximized";
const readMax = () => { try { return localStorage.getItem(MAX_KEY) !== "false"; } catch { return true; } };
export function FloatingAgent() {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(readMax);
  const tab = useStore((s) => s.tab);
  const toggleMax = () => setMaximized((m) => { try { localStorage.setItem(MAX_KEY, String(!m)); } catch { /* session only */ } return !m; });
  const prefs = usePreferences((s) => s.preferences);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Ask studio intelligence"]',
      )
      ?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  return (
    <>
      <button
        className={"atlas-chat-launcher " + (open ? "active" : "")}
        aria-label="Ask GPT"
        aria-expanded={open}
        ref={button}
        onClick={() => setOpen(!open)}
      >
        <span className="atlas-chat-avatar" aria-hidden="true"><BotMessageSquare size={18} strokeWidth={1.9} /></span>
        <span>Ask GPT</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <section
          ref={panel}
          className={`atlas-floating-chat ${maximized ? "maximized" : ""}`}
          role="dialog"
          aria-label="Atlas GPT assistant"
          style={{ width: Math.min(prefs.chatWidth, window.innerWidth - 24) }}
        >
          <header>
            <span className="atlas-chat-title">
              <span className="atlas-chat-avatar" aria-hidden="true"><Bot size={18} strokeWidth={1.9} /></span>
              <span>
                <strong>Atlas AI agent</strong>
                <small><i className="dot positive" /> Ready · answering for {tabs[tab]}</small>
              </span>
            </span>
            <div>
              <button aria-label={maximized ? "Restore chat height" : "Full-height chat"} title={maximized ? "Restore height" : "Full height"} onClick={toggleMax}>
                {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                title="Open the full AI workspace tab"
                aria-label="Open full AI workspace"
                onClick={() => {
                  setOpen(false);
                  useStore.getState().set({ tab: 13 });
                }}
              >
                <PanelsTopLeft size={16} />
              </button>
              <button
                aria-label="Close GPT assistant"
                onClick={() => {
                  setOpen(false);
                  button.current?.focus();
                }}
              >
                <X size={18} />
              </button>
            </div>
          </header>
          <IntelligenceWorkspace compact />
        </section>
      )}
    </>
  );
}
