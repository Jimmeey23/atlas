import { useState } from "react";
import { Pin, ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import { usePreferences } from "../state/preferences";
import { ChatAnswer } from "./ChatAnswer";

// Pinned insights stay with their element, but an operator wants the ones they
// kept in one place at the top of the page rather than scrolling to find them.
export function PinnedInsights({ page }: { page: number }) {
  const insights = usePreferences((s) => s.preferences.sectionInsights);
  const [open, setOpen] = useState<string | null>(null);
  const pinned = Object.entries(insights || {}).filter(
    ([, value]) => value.pinned && value.tab === page,
  );
  if (!pinned.length) return null;
  function unpin(key: string) {
    const prefs = usePreferences.getState();
    const current = prefs.preferences.sectionInsights[key];
    prefs.update({ sectionInsights: { ...prefs.preferences.sectionInsights, [key]: { ...current, pinned: false } } });
  }
  function reveal(key: string) {
    const element = document.querySelector(`[data-insight-key='${CSS.escape(key)}']`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return (
    <section className="pinned-insights" aria-label="Pinned AI insights">
      <header>
        <span className="icon"><Pin size={13} />Pinned insights</span>
        <span className="small">{pinned.length} kept on this page</span>
      </header>
      <div className="pinned-insight-list">
        {pinned.map(([key, value]) => (
          <article key={key}>
            <div className="pinned-insight-head">
              <button
                className="ai-summary-toggle"
                aria-expanded={open === key}
                onClick={() => setOpen(open === key ? null : key)}
              >
                {open === key ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <strong>{value.subject || "Section insight"}</strong>
              </button>
              <div>
                <button className="icon-button" aria-label={`Scroll to ${value.subject}`} title="Go to the section" onClick={() => reveal(key)}>
                  <CornerDownRight size={14} />
                </button>
                <button className="icon-button is-pinned" aria-label={`Unpin ${value.subject}`} title="Unpin" onClick={() => unpin(key)}>
                  <Pin size={14} />
                </button>
              </div>
            </div>
            {open === key && (
              <>
                <p className="small">{value.scope}</p>
                <ChatAnswer text={value.text} />
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
