import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Maximize2 } from "lucide-react";
import { IntelligenceWorkspace } from "./IntelligenceWorkspace";
import { usePreferences } from "../state/preferences";
import { useStore } from "../state/store";
export function FloatingAgent() {
  const [open, setOpen] = useState(false);
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
        <MessageSquare size={21} />
        <span>Ask GPT</span>
        <i />
      </button>
      {open && (
        <section
          ref={panel}
          className="atlas-floating-chat"
          role="dialog"
          aria-label="Atlas GPT assistant"
          style={{ width: Math.min(prefs.chatWidth, window.innerWidth - 24) }}
        >
          <header>
            <span>
              <i className="dot positive" /> Atlas assistant
            </span>
            <div>
              <button
                aria-label="Open full AI workspace"
                onClick={() => {
                  setOpen(false);
                  useStore.getState().set({ tab: 13 });
                }}
              >
                <Maximize2 size={16} />
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
