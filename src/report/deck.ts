import { chapters, type ChapterSpec } from "./chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "./definitions";
import { monthLabel } from "./period";
import type { ChapterData, InsightCard, ReportModel, SpeakerNotes } from "./model";
import { decisionOf, extremes, movers, questionBank, rankPerformers, scenariosFor, yearPosition } from "./brief";

/** The pages a report is presented as: an overview tab (cover + executive brief), then one tab per chapter. */
export type DeckSection = "cover" | "summary" | "insights" | "plan" | "performers" | "outlook" | "trends" | "tables" | "data";
export const SECTION_LABEL: Record<DeckSection, string> = {
  cover: "Cover", summary: "Executive pulse", insights: "AI discoveries", plan: "Decision centre", performers: "Leaders & laggards",
  outlook: "Forward view", trends: "Evidence over time", tables: "Working tables", data: "Source records",
};
/** The one question each page answers, so a reader always knows what they are being told. */
export const SECTION_QUESTION: Record<DeckSection, string> = {
  cover: "Where does the month stand, and what is in this report?",
  summary: "Are we performing well, and what is actually carrying the result?",
  insights: "What would we otherwise miss — and how much can we trust it?",
  plan: "What should we do, who owns it, and what would tell us it worked?",
  performers: "Who and what is carrying the month, and who is holding it back?",
  outlook: "What happens next under each version of the coming months?",
  trends: "How does this month compare with the year behind it?",
  tables: "What do the working numbers say, row by row?",
  data: "What do the underlying records show?",
};
/** The layer a page plays in chapters where a breakdown is about products, customers or delivery. */
const INTELLIGENCE: Record<string, Partial<Record<DeckSection, string>>> = {
  "revenue-performance": { performers: "Product intelligence" },
  "conversion-funnel": { performers: "Customer intelligence" },
  lapsed: { performers: "Member intelligence" },
  instructors: { performers: "Instructor intelligence" },
  "instructor-outcomes": { performers: "Instructor intelligence" },
  formats: { performers: "Format intelligence" },
  sessions: { performers: "Session intelligence" },
  "late-cancellations": { performers: "Booking discipline" },
};
/** A page's name in this chapter: the generic layer, or the chapter's own intelligence layer. */
export const sectionLabel = (section: DeckSection, chapter?: string) => (chapter && INTELLIGENCE[chapter]?.[section]) || SECTION_LABEL[section];
/** `chapter` is the narrative/figures key: the overview tab reads the executive brief. */
export interface DeckTab { id: string; label: string; title: string; chapter: string; spec?: ChapterSpec; sections: DeckSection[] }

const label = (id: string) => definition(id)?.label ?? id;
export const pageKey = (tab: string, section: DeckSection) => `${tab}:${section}`;
export const EXECUTIVE = "executive-summary";

/** Lead measures per chapter: the report's priority list, then the chapter's own. */
export const PRIORITY_METRICS: Record<string, string[]> = {
  'revenue-performance': ['gross_revenue', 'net_revenue', 'transactions', 'aov', 'membership_rev_share'],
  'conversion-funnel': ['new_clients', 'conversion_rate', 'retention_rate', 'zero_return_rate', 'avg_ltv'],
  leads: ['leads', 'converted_leads', 'lead_conversion_rate', 'untouched_leads', 'response_time_hours'],
  lapsed: ['memberships_count', 'utilisation', 'churn_rate', 'remaining_sessions', 'revenue_at_risk_30d'],
  instructors: ['sessions', 'avg_class_size_incl', 'fill_rate', 'revenue_per_session', 'draw_premium_pp'],
  'instructor-outcomes': ['new_handled', 'payroll_conversion', 'payroll_retention', 'payroll_revenue'],
  sessions: ['sessions', 'attendance', 'fill_rate', 'empty_session_rate', 'unsold_seats'],
  'late-cancellations': ['bookings', 'booking_late_cancelled', 'booking_late_rate', 'booking_no_shows', 'booking_no_show_rate'],
};
export function chapterMetrics(spec: ChapterSpec, data?: ChapterData) {
  return [...new Set([...(PRIORITY_METRICS[spec.id] ?? []), ...spec.metrics])].filter(id => definition(id) && data?.total[id] != null);
}
export const verdictOf = (model: ReportModel, id: string): InsightCard | undefined => {
  const cards = model.narratives[id]?.cards ?? [];
  return cards.find(c => c.focus === "kpis") ?? cards[0];
};

export function deckTabs(model: ReportModel): DeckTab[] {
  const ordered = model.customization ? model.customization.chapterIds.flatMap(id => chapters.find(c => c.id === id) ?? []) : chapters;
  const available = ordered.filter(spec => model.chapters[spec.id] || model.narratives[spec.id]);
  const exec = available.find(spec => spec.id === EXECUTIVE);
  const execCards = (model.narratives[EXECUTIVE]?.cards.length ?? 0) > 1;
  return [
    { id: "overview", label: "Overview", chapter: exec ? EXECUTIVE : "overview", spec: exec, title: model.customization?.title || `${model.scope.studio} monthly review`, sections: exec && execCards ? ["cover", "insights"] : ["cover"] },
    ...available.filter(spec => spec !== exec).map(spec => {
      const data = model.chapters[spec.id];
      const sections: DeckSection[] = spec.id === "recommendations" ? ["summary", "plan", "insights"] : ["summary", "insights"];
      if (data?.groups.length) sections.push("performers");
      if (data?.history.length && !spec.derived) sections.push("outlook");
      if (data?.history.length) sections.push("trends");
      if (data?.groups.length) sections.push("tables");
      if (!spec.derived && data) sections.push("data");
      return { id: spec.id, label: spec.nav, title: spec.title, chapter: spec.id, spec, sections };
    }),
  ];
}

/** Linear order for presenting: every section of every tab. */
export const deckPages = (tabs: DeckTab[]) => tabs.flatMap(tab => tab.sections.map(section => ({ tab: tab.id, section })));

/** A figure as a presenter would say it. */
const spoken = (id: string, data: ChapterData) => {
  const mom = data.prior[id] != null ? delta(id, data.total[id], data.prior[id]) : "";
  const yoy = data.priorYear[id] != null ? delta(id, data.total[id], data.priorYear[id]) : "";
  return `${label(id)} landed at ${fmt(id, data.total[id])}${mom ? ` — ${mom} on last month` : ""}${yoy ? `${mom ? " and" : " —"} ${yoy} on last year` : ""}.`;
};
const direction = (id: string, change: number) => (change >= 0) === (definition(id)?.higherIsBetter ?? true) ? "in our favour" : "against us";

/**
 * The presenter's private script for a page: framing, stage directions, numbers
 * phrased for speech and a bank of likely questions with answers. It never
 * repeats the on-screen briefing or card text. AI-written notes saved on the
 * report take precedence and are topped up from the question bank.
 */
export function liveNotes(model: ReportModel, tabs: DeckTab[], tabId: string, section: DeckSection): SpeakerNotes {
  const tab = tabs.find(t => t.id === tabId);
  const cid = tab?.chapter ?? tabId;
  const spec = tab?.spec ?? chapters.find(c => c.id === cid);
  const data = model.chapters[cid];
  const ids = spec ? chapterMetrics(spec, data) : [];
  const bank = questionBank(model, cid, ids).map(({ q, a }) => ({ q, a }));
  const saved = model.speakerNotes?.[pageKey(tabId, section)];
  if (saved) return { ...saved, questions: [...saved.questions, ...bank.filter(b => !saved.questions.some(q => q.q === b.q))].slice(0, 10) };
  const pages = deckPages(tabs);
  const index = pages.findIndex(p => p.tab === tabId && p.section === section);
  const next = pages[index + 1];
  const nextTab = next && tabs.find(t => t.id === next.tab);
  const transition = next ? (next.tab === tabId ? `"Let's look at ${SECTION_LABEL[next.section].toLowerCase()} for ${tab?.label.toLowerCase()}."` : `"That's ${tab?.label.toLowerCase()}. Moving to ${nextTab?.label.toLowerCase()}."`) : `"That's the review. Let's take the decisions one by one."`;
  const moving = data ? movers(data, ids, 3) : [];
  const numbers = data ? [...new Set([ids[0], ...moving.map(m => m.id)].filter(Boolean))].slice(0, 4).map(id => spoken(id, data)) : [];
  const base = { numbers, questions: bank.slice(0, 10), transition };
  const lead = ids[0];
  const pos = lead && data ? yearPosition(lead, data, model.scope.month) : null;
  if (tabId === "overview" && section === "cover") {
    const areas = tabs.filter(t => t.id !== "overview" && t.spec && !t.spec.derived && model.chapters[t.id]?.n);
    const decisions = (model.narratives.recommendations?.cards ?? []).length;
    return { ...base, opener: `"Thank you for the time. This is ${model.scope.studio}'s ${monthLabel(model.scope.month)} review — one month, one studio, every figure frozen when the report was built."`,
      points: [
        `"We'll cover ${areas.length} areas. Each one gets a briefing, the evidence behind it and one decision we need from this room."`,
        "[Point to the scorecard] Green means the lead measures improved on last month; red means they slipped. We will spend our time on the reds.",
        "[Pause on the headline verdict] Let it land before you add anything — the room will read it.",
        decisions ? `"There are ${decisions} recommendations at the end; the decision panel below previews the most important one."` : "",
        "Ask the room to hold detailed questions for the chapter pages — the drill-downs answer most of them live.",
      ].filter(Boolean), transition };
  }
  switch (section) {
    case "summary": case "cover": {
      const decision = decisionOf(model, cid);
      return { ...base, opener: `"${tab?.label}: here's where we stand and what we need from you."`, points: [
        lead && data ? `[Point to the first card] Anchor on ${label(lead).toLowerCase()} before anything else — it frames the rest of the page.` : "",
        moving[0] && data ? `Call out ${label(moving[0].id).toLowerCase()} as the biggest move: ${delta(moving[0].id, data.total[moving[0].id], data.prior[moving[0].id])} on last month, ${direction(moving[0].id, moving[0].change)}.` : "",
        pos ? `"By this year's standards that's month ${pos.rank} of ${pos.of}" — say it, it pre-empts the 'is this normal?' question.` : "",
        "[Walk the briefing left to right] Spend the most time on 'Why it moved' — that's where challenge will come.",
        decision ? "[Stop at the decision panel] Read the call aloud, then point to the evidence row. Ask for agreement or objections before moving on." : "",
        decision?.alternative ? "If someone proposes another route, the alternative we considered is on the panel — acknowledge it, then return to the evidence." : "",
      ].filter(Boolean) };
    }
    case "insights": case "plan": {
      const cards = (model.narratives[cid]?.cards ?? []).filter(c => c.focus !== "kpis");
      const high = cards.filter(c => c.priority === "high").length;
      return { ...base, opener: section === "plan" ? `"These are the moves, in priority order. Let's agree owners as we go."` : `"${cards.length} findings sit behind that briefing. I'll take the ${high || "most important"} ${high === 1 ? "one" : "ones"} first."`, points: [
        "[Select each item in the left rail] Read only the headline; let the evidence column on the right do the convincing.",
        high ? `Prioritise the ${high} high-priority ${high === 1 ? "item" : "items"}; offer to skip the low-priority ones if time is short.` : "",
        "When someone challenges a number, open 'Explore records' on the item — it pulls the source rows live.",
        section === "plan" ? "For each move, confirm the owner area and the review month before going to the next one." : "Close the section by asking which finding the room wants owned this month.",
      ].filter(Boolean) };
    }
    case "performers": {
      const table = data?.groups[0];
      const metric = table?.compare ?? table?.columns[0];
      const ranked = table && metric ? rankPerformers(table, metric) : [];
      return { ...base, opener: `"Who's carrying the month, and who needs support."`, points: [
        table && metric ? `[Point to the criterion chips] The default ranking is ${label(metric).toLowerCase()} — switch criteria if the room asks.` : "",
        ranked.length > 1 && metric ? `"${ranked[0].g} leads at ${fmt(metric, ranked[0].value)}; ${ranked.at(-1)!.g} trails at ${fmt(metric, ranked.at(-1)!.value)}."` : "",
        "Remind the room that thin samples are flagged — don't judge a row on a handful of records.",
        "If asked 'which ones exactly?', use the row's records button to open the source items.",
      ].filter(Boolean) };
    }
    case "outlook": {
      const sc = spec && data ? scenariosFor(spec, data, model.scope.month)[0] : undefined;
      return { ...base, opener: `"A word on next month — and these are scenarios, not forecasts."`, points: [
        "Say 'conditional' before showing any number on this page; it protects the conversation.",
        sc?.run != null ? `"If the three-month pace holds, ${label(sc.id).toLowerCase()} sits around ${fmt(sc.id, sc.run)}."` : "",
        sc?.seasonal != null ? `"Last year's seasonality alone would put it near ${fmt(sc.id, sc.seasonal)}."` : "",
        "Agree the one signal we'll check at next month's review before leaving the page.",
      ].filter(Boolean) };
    }
    case "trends": {
      const ex = lead && data ? extremes(lead, data) : null;
      return { ...base, opener: `"Step back — fourteen months, so we read the shape, not just the last point."`, points: [
        ex && lead ? `"The high was ${monthLabel(ex.hi.month)} at ${fmt(lead, ex.hi.v)}; the low ${monthLabel(ex.lo.month)} at ${fmt(lead, ex.lo.v)}."` : "",
        "[Tick 'Last year'] Show the overlay before anyone asks whether this is seasonal.",
        "[Click any month] It pins on the chart and opens that month's source records.",
      ].filter(Boolean) };
    }
    case "tables": return { ...base, opener: `"The working tables, if we need to settle a detail."`, points: [
      "Sort any column to answer a ranking question on the spot.",
      "The totals row reconciles to the cards on the briefing page.",
      "Expand a table only when asked — keep the room on the decision.",
    ] };
    default: return { ...base, opener: `"If we need to check a specific item, the source rows are here."`, points: [
      "Use this page only to answer a concrete question.",
      "Group by a column to show sub-totals, then expand a group to see its rows.",
      `${data?.n.toLocaleString("en-IN") ?? 0} records sit behind this chapter; the live source may have moved since the report was frozen.`,
    ] };
  }
}

/** Compact JSON of one section, for AI component replacement and talk tracks. */
export function sectionContext(model: ReportModel, tabId: string, section: DeckSection, component?: { id: string; describe: string }) {
  const overview = tabId === "overview";
  if (overview && model.narratives[EXECUTIVE]) tabId = EXECUTIVE;
  const spec = chapters.find(c => c.id === tabId);
  const data = model.chapters[tabId];
  const ids = spec ? chapterMetrics(spec, data).slice(0, 14) : [];
  const metric = (id: string) => ({ id, label: label(id), format: definition(id)?.format, value: data?.total[id] ?? null, previousMonth: data?.prior[id] ?? null, sameMonthLastYear: data?.priorYear[id] ?? null, higherIsBetter: definition(id)?.higherIsBetter ?? true });
  const narrative = model.narratives[tabId];
  return JSON.stringify({
    report: { studio: model.scope.studio, month: model.scope.month, monthLabel: monthLabel(model.scope.month) },
    page: { chapter: spec?.title ?? "Overview", section: SECTION_LABEL[section] },
    component,
    metrics: ids.map(metric),
    history: data?.history.slice(-14).map(row => ({ month: row.month, ...Object.fromEntries((spec?.history.length ? spec.history : ids.slice(0, 4)).map(id => [label(id), row[id] ?? null])) })),
    breakdowns: data?.groups.slice(0, 4).map(g => ({ title: g.title, columns: g.columns.map(label), rows: g.rows.slice(0, 12).map(r => [String(r.g ?? ""), ...g.columns.map(c => r[c] == null ? null : fmt(c, r[c]))]) })),
    onScreen: "Everything under narrative is already visible on the page. Speaker notes must not repeat it.",
    narrative: narrative && { summary: narrative.summary, briefing: narrative.briefing, decision: narrative.decision, cards: narrative.cards.slice(0, 8).map(c => ({ headline: c.headline, meaning: c.meaning, driver: c.driver, trend: c.trend, impact: c.impact, action: c.action, evidence: c.evidence })) },
    overview: overview ? Object.entries(model.narratives).map(([id, n]) => ({ chapter: chapters.find(c => c.id === id)?.title ?? id, verdict: verdictOf(model, id)?.headline, summary: n.summary })) : undefined,
  }).slice(0, 58000);
}
