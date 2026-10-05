import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { WandSparkles, X, Sparkles } from "lucide-react";
import { useStore, tabs } from "../state/store";
import { ChatAnswer } from "./ChatAnswer";

function buildPrompt(subject: string, detail?: string, scope?: string) {
  return [
    `Write an executive-quality, context-aware summary for this dashboard section: ${subject}.`,
    detail ? `Displayed data focus: ${detail}.` : "",
    scope ? `Current scope and filters: ${scope}.` : "",
    "Return:",
    "1) A clear summary in 2-3 sentences.",
    "2) Three evidence-backed insights with metric context and denominators where relevant.",
    "3) Two concrete recommendations with priority and expected operational impact.",
    "4) A short caution on data coverage/freshness assumptions.",
    "Keep the writing polished, practical and decision-oriented.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function DataInsightAction({
  subject,
  detail,
  buttonLabel = "Section insights",
  compact = false,
}: {
  subject: string;
  detail?: string;
  buttonLabel?: string;
  compact?: boolean;
}) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ left: 16, top: 80, below: true });

  const updatePosition = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(460, window.innerWidth - 32);
    const estHeight = 420;
    const below = rect.bottom + 10 + estHeight < window.innerHeight;
    setPos({
      left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
      top: below ? rect.bottom + 10 : Math.max(16, rect.top - 10 - estHeight),
      below,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        anchor.current?.focus();
      }
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  const run = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (answer) return;
    setBusy(true);
    setError("");
    const scope = `${tabs[store.tab]} · ${store.filters.location?.join(", ") || "All studios"} · ${store.filters.from || "all dates"}${store.filters.to ? ` to ${store.filters.to}` : ""}`;
    try {
      const response = await fetch("/api/intelligence/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: buildPrompt(subject, detail, scope),
          page: store.tab,
          filters: { ...store.filters, cross: store.transient },
          saveHistory: false,
          history: [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate.");
      setAnswer(String(data.answer || ""));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={anchor}
        className={compact ? "ai-insight-btn" : "ai-insight-btn with-label"}
        aria-label={`Generate insights for ${subject}`}
        aria-expanded={open}
        title={`Generate an AI summary for ${subject}`}
        onClick={() => void run()}
      >
        <WandSparkles size={compact ? 13 : 14} strokeWidth={1.9} />
        {!compact && buttonLabel}
      </button>
      {open &&
        createPortal(
          <div
            className="insight-popover"
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: Math.min(460, window.innerWidth - 32),
              maxHeight: Math.min(560, window.innerHeight - 32),
            }}
            role="dialog"
            aria-label={`AI insights for ${subject}`}
          >
            <header>
              <div>
                <span className="insight-popover-eyebrow">
                  <Sparkles size={11} /> AI section summary
                </span>
                <h3>{subject}</h3>
                {detail && <p className="small">{detail}</p>}
              </div>
              <button
                className="ai-insight-btn"
                aria-label="Close insights"
                onClick={() => setOpen(false)}
              >
                <X size={13} />
              </button>
            </header>
            <div className="insight-popover-body">
              {busy ? (
                <div className="insight-loading" role="status">
                  <span className="loader-ring small" aria-hidden="true" />
                  Reading this view with your filters…
                </div>
              ) : error ? (
                <p className="warn">{error}</p>
              ) : answer ? (
                <ChatAnswer text={answer} />
              ) : (
                <p className="small">No response available yet.</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
