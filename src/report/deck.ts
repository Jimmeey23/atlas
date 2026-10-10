import { chapters, type ChapterSpec } from "./chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "./definitions";
import { monthLabel } from "./period";
import type { ChapterData, InsightCard, ReportModel, SpeakerNotes } from "./model";

/** The pages a report is presented as: an overview tab, then one tab per chapter with its own sections. */
export type DeckSection = "cover" | "glance" | "summary" | "insights" | "plan" | "trends" | "evidence" | "data";
export const SECTION_LABEL: Record<DeckSection, string> = {
  cover: "Cover", glance: "At a glance", summary: "Verdict & KPIs", insights: "Insights", plan: "Action plan",
  trends: "Month on month", evidence: "Breakdowns", data: "Explore data",
};
export interface DeckTab { id: string; label: string; title: string; spec?: ChapterSpec; sections: DeckSection[] }

const label = (id: string) => definition(id)?.label ?? id;
export const pageKey = (tab: string, section: DeckSection) => `${tab}:${section}`;

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
  return [
    { id: "overview", label: "Cover", title: model.customization?.title || `${model.scope.studio} monthly review`, sections: ["cover", "glance"] },
    ...available.map(spec => {
      const data = model.chapters[spec.id];
      const sections: DeckSection[] = spec.id === "recommendations" ? ["summary", "plan", "insights"] : ["summary", "insights"];
      if (data?.history.length) sections.push("trends");
      if (data?.groups.length) sections.push("evidence");
      if (!spec.derived && data) sections.push("data");
      return { id: spec.id, label: spec.nav, title: spec.title, spec, sections };
    }),
  ];
}

/** Linear order for presenting: every section of every tab. */
export const deckPages = (tabs: DeckTab[]) => tabs.flatMap(tab => tab.sections.map(section => ({ tab: tab.id, section })));

const sentence = (text?: string) => (text ?? "").split(/(?<=[.!?])\s+(?=[A-Z₹0-9])/)[0]?.trim() ?? "";
function topMovers(data: ChapterData | undefined, ids: string[], count = 3) {
  if (!data) return [];
  return ids.filter(id => data.total[id] != null && data.prior[id] != null && Number(data.prior[id]) !== 0)
    .map(id => ({ id, change: Math.abs(Number(data.total[id]) / Number(data.prior[id]) - 1) }))
    .sort((a, b) => b.change - a.change).slice(0, count).map(m => m.id);
}
const say = (id: string, data: ChapterData) => `${label(id)} ${fmt(id, data.total[id])} (MoM ${delta(id, data.total[id], data.prior[id])}, YoY ${delta(id, data.total[id], data.priorYear[id])})`;

/**
 * A talk track built from the frozen report: always available, no AI call.
 * AI-written notes saved on the report take precedence when present.
 */
export function liveNotes(model: ReportModel, tabs: DeckTab[], tabId: string, section: DeckSection): SpeakerNotes {
  const saved = model.speakerNotes?.[pageKey(tabId, section)];
  if (saved) return saved;
  const pages = deckPages(tabs);
  const index = pages.findIndex(p => p.tab === tabId && p.section === section);
  const next = pages[index + 1];
  const nextTab = next && tabs.find(t => t.id === next.tab);
  const transition = next ? `Next, ${next.tab === tabId ? SECTION_LABEL[next.section].toLowerCase() : `${nextTab?.label} — ${nextTab?.title.toLowerCase()}`}.` : "That closes the review; open the floor for decisions.";
  const period = `${model.scope.studio}, ${monthLabel(model.scope.month)}`;
  if (tabId === "overview") {
    const brief = verdictOf(model, "executive-summary");
    const areas = tabs.filter(t => t.spec && !t.spec.derived && model.chapters[t.id]?.n);
    const moves = (model.narratives.recommendations?.cards ?? []).slice(0, 3);
    return {
      opener: section === "cover" ? `This is the ${period} performance review.` : brief?.headline ?? `Here is the month at a glance for ${period}.`,
      points: section === "cover"
        ? [`${areas.length} areas reviewed, each with a verdict, its evidence and the move it suggests.`, brief?.headline ?? "", sentence(model.narratives["executive-summary"]?.summary)].filter(Boolean)
        : [sentence(model.narratives["executive-summary"]?.summary), ...moves.map(c => `Decision: ${c.action || c.headline}`)].filter(Boolean),
      numbers: areas.slice(0, 4).flatMap(t => { const data = model.chapters[t.id]; const id = chapterMetrics(t.spec!, data)[0]; return id ? [say(id, data)] : []; }),
      questions: [{ q: "What is the single biggest issue this month?", a: brief?.driver || brief?.meaning || "See the risks column on the scorecard." }],
      transition,
    };
  }
  const tab = tabs.find(t => t.id === tabId);
  const data = model.chapters[tabId];
  const verdict = verdictOf(model, tabId);
  const cards = (model.narratives[tabId]?.cards ?? []).filter(c => c !== verdict);
  const ids = tab?.spec ? chapterMetrics(tab.spec, data) : [];
  const numbers = data ? topMovers(data, ids).map(id => say(id, data)) : [];
  const questions = [
    verdict?.driver && { q: "What drove this?", a: verdict.driver },
    verdict?.trend && { q: "Is it going to last?", a: verdict.trend },
    verdict?.impact && { q: "What is it worth?", a: verdict.impact },
    verdict?.action && { q: "What are we doing about it?", a: verdict.action },
  ].filter(Boolean) as { q: string; a: string }[];
  const base = { numbers, questions: questions.slice(0, 3), transition };
  switch (section) {
    case "summary": return { ...base, opener: verdict?.headline ?? tab?.title ?? "", points: [sentence(model.narratives[tabId]?.summary), verdict?.driver && `Driver: ${sentence(verdict.driver)}`, verdict?.concentration && `Concentrated in: ${sentence(verdict.concentration)}`, verdict?.offset && `Holding up: ${sentence(verdict.offset)}`, verdict?.impact && `At stake: ${verdict.impact}`].filter(Boolean) as string[] };
    case "insights": case "plan": return { ...base, opener: `${cards.length} ${section === "plan" ? "moves" : "insights"} for ${tab?.label.toLowerCase()} — the headline first, then the evidence beside it.`, points: cards.slice(0, 5).map(c => c.action ? `${c.headline} → ${c.action}` : c.headline) };
    case "trends": {
      const history = data?.history ?? [];
      const lead = tab?.spec?.history.find(id => history.filter(r => r[id] != null).length > 2);
      const values = lead ? history.filter(r => r[lead] != null).map(r => ({ month: String(r.month), v: Number(r[lead]) })) : [];
      const best = values.reduce<typeof values[number] | undefined>((a, b) => !a || b.v > a.v ? b : a, undefined);
      const worst = values.reduce<typeof values[number] | undefined>((a, b) => !a || b.v < a.v ? b : a, undefined);
      return { ...base, opener: `Fourteen months of ${tab?.label.toLowerCase()} — read the shape, not just the last point.`, points: [
        lead && best && `${label(lead)} peaked in ${monthLabel(best.month)} at ${fmt(lead, best.v)}.`,
        lead && worst && `Its low was ${monthLabel(worst.month)} at ${fmt(lead, worst.v)}.`,
        verdict?.trend && `Durability: ${sentence(verdict.trend)}`,
        "Switch MoM / YoY on the table to show the direction of each month.",
      ].filter(Boolean) as string[] };
    }
    case "evidence": {
      const analysis = data?.groups.find(g => g.analysis?.decliners?.length || g.analysis?.gainers?.length)?.analysis;
      return { ...base, opener: "Where the movement sits — the breakdowns behind the verdict.", points: [
        ...(analysis?.decliners ?? []).slice(0, 2).map(m => `${m.g} fell by ${fmt(analysis!.metric ?? "", Math.abs(m.change))} on ${label(analysis!.metric ?? "")}.`),
        ...(analysis?.gainers ?? []).slice(0, 2).map(m => `${m.g} added ${fmt(analysis!.metric ?? "", m.change)}.`),
        verdict?.concentration ?? "",
      ].filter(Boolean) };
    }
    default: return { ...base, opener: "Open the underlying records to answer questions live.", points: ["Search or filter the source rows for this studio and month.", "Export the filtered view if a follow-up is needed.", `${data?.n.toLocaleString("en-IN") ?? 0} contributing records sit behind this chapter.`] };
  }
}

/** Compact JSON of one section, for AI component replacement and talk tracks. */
export function sectionContext(model: ReportModel, tabId: string, section: DeckSection, component?: { id: string; describe: string }) {
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
    narrative: narrative && { summary: narrative.summary, cards: narrative.cards.slice(0, 8).map(c => ({ headline: c.headline, meaning: c.meaning, driver: c.driver, trend: c.trend, impact: c.impact, action: c.action, evidence: c.evidence })) },
    overview: tabId === "overview" ? Object.entries(model.narratives).map(([id, n]) => ({ chapter: chapters.find(c => c.id === id)?.title ?? id, verdict: verdictOf(model, id)?.headline, summary: n.summary })) : undefined,
  }).slice(0, 58000);
}
