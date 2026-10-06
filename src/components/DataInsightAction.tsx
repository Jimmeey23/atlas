import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { WandSparkles, X, Sparkles, ChevronDown, ChevronRight, Pin, PinOff } from "lucide-react";
import { useStore, tabs } from "../state/store";
import { usePreferences } from "../state/preferences";
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
  return <>
    <button ref={anchor} className={`ai-insight-btn ai-summary-btn ${compact ? "" : "with-label"} ${busy ? "is-thinking" : ""}`} aria-label={`Generate insights for ${subject}`} title={`Generate an AI summary for ${subject}`} disabled={busy} onClick={() => void run()}>
      <span className="ai-summary-mark" aria-hidden="true"><WandSparkles size={16} strokeWidth={1.8} /><span className="ai-summary-twinkle" /></span>{!compact && buttonLabel}
    </button>
    {target && (saved || busy || error) && createPortal(
      <article className="section-ai-summary" data-insight-key={key} data-pinned={saved?.pinned || undefined} aria-label={`AI content for ${subject}`}>
        <header>
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
        {busy && <p role="status">Reading this element with your filters…</p>}
        {error && <p role="alert" className="warn">{error}</p>}
        {saved && !collapsed && <><p className="small">Generated for {saved.scope} · {new Date(saved.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p><ChatAnswer text={saved.text} /></>}
        {saved && collapsed && <p className="small">Collapsed · generated {new Date(saved.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}
      </article>, target)}
  </>;
}
