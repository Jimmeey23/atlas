import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { WandSparkles, X, Sparkles } from "lucide-react";
import { useStore, tabs } from "../state/store";
import { usePreferences } from "../state/preferences";
import { ChatAnswer } from "./ChatAnswer";
import { historicalFilters, historicalTransient } from "../data/periods";
import { today } from "../data/analytics";

export function DataInsightAction({ subject, detail, buttonLabel = "Section insights", compact = false, dateIndependent = false }: {
  subject: string; detail?: string; buttonLabel?: string; compact?: boolean; dateIndependent?: boolean;
}) {
  const store = useStore();
  const key = JSON.stringify([store.tab, subject, detail || ""]);
  const saved = usePreferences(s => s.preferences.sectionInsights?.[key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController>();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const button = anchor.current;
    if (!button) return;
    const host = document.createElement("div");
    host.className = "section-ai-summary-host";
    const metricHeading = button.closest(".metric-strip-head");
    if (metricHeading) metricHeading.nextElementSibling?.after(host);
    else (button.closest(".register,.pulse-wrapper,.insight,.intelligence-panel,section") || button.parentElement)?.append(host);
    setTarget(host);
    setError("");
    setBusy(false);
    return () => { request.current?.abort(); host.remove(); };
  }, [key]);

  function save(text: string, scope: string) {
    const prefs = usePreferences.getState();
    prefs.update({ sectionInsights: { ...prefs.preferences.sectionInsights, [key]: { text, scope, generatedAt: new Date().toISOString() } } });
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
    try {
      const response = await fetch("/api/intelligence/ask", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: [
            `Write an evidence-backed summary for this dashboard element: ${subject}.`,
            detail ? `Displayed focus: ${detail}.` : "",
            `Scope: ${scope}.`,
            "Query the source data first. Do not invent figures.",
            // A fixed shape so the renderer can lay this out as sections,
            // a figure grid and a table rather than one block of prose.
            "Reply in Markdown using exactly these sections, in this order and with no others:",
            "## Summary — at most two sentences, leading with the single most important finding.",
            "## Key figures — a Markdown table with the columns Measure | Value | Basis. Four to six rows. Basis names the denominator or row count behind the value.",
            "## What stands out — exactly three numbered items. Start each with a bolded claim of at most six words, then one sentence of evidence citing a figure.",
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
  return <>
    <button ref={anchor} className={`ai-insight-btn ai-summary-btn ${compact ? "" : "with-label"} ${busy ? "is-thinking" : ""}`} aria-label={`Generate insights for ${subject}`} title={`Generate an AI summary for ${subject}`} disabled={busy} onClick={() => void run()}>
      <span className="ai-summary-mark" aria-hidden="true"><WandSparkles size={16} strokeWidth={1.8} /><span className="ai-summary-twinkle" /></span>{!compact && buttonLabel}
    </button>
    {target && (saved || busy || error) && createPortal(<article className="section-ai-summary" aria-label={`AI content for ${subject}`}>
      <header><span className="icon"><Sparkles size={14} />AI section insights</span><div>{saved && <button className="button" disabled={busy} onClick={() => void run()}>Regenerate</button>}<button className="icon-button" aria-label={`Remove AI content for ${subject}`} disabled={busy} onClick={remove}><X size={14} /></button></div></header>
      {busy && <p role="status">Reading this element with your filters…</p>}
      {error && <p role="alert" className="warn">{error}</p>}
      {saved && <><p className="small">Generated for {saved.scope} · {new Date(saved.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p><ChatAnswer text={saved.text} /></>}
    </article>, target)}
  </>;
}
