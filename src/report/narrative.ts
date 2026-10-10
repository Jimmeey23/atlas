import { reportFmt as fmt, reportDelta as delta, definition } from "./definitions";
import { metricNotes } from "../semantics/evidence";
import { chapters, type ChapterSpec } from "./chapters";
import { monthLabel, shiftMonth } from "./period";
import { findingsFor, findingsPayload, ledger, seasonalScenario, type Finding } from "./findings";
import { INSIGHT_LENSES, type ChapterData, type ChapterNarrative, type InsightCard, type ReportModel } from "./model";
import { reportOptions } from "./options";
import { addCall, type CallUsage, type ChapterUsage } from "./usage";

const CACHE_PREFIX = "atlas-report-narrative:v12:";
/** Exact evidence and request identity, independent of presentation settings. */
async function analysisKey(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function readCache(key: string): ChapterNarrative | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ChapterNarrative) : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, value: ChapterNarrative) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a full or blocked store costs a cache hit, not the report */
  }
}
/**
 * What the model is shown for one chapter: exactly the figures the reader
 * sees, so a card can be checked against the page rather than taken on trust.
 */
export function chapterPayload(spec: ChapterSpec, data: ChapterData, model: ReportModel, findings: Finding[] = []) {
  const parts = [
    findingsPayload(findings),
    `Chapter: ${spec.title}. Scope: ${spec.network ? "account / network; not studio-attributed" : model.scope.studio}. Month: ${monthLabel(model.scope.month)}.`,
    `Comparisons are against ${monthLabel(shiftMonth(model.scope.month, -1))} and ${monthLabel(shiftMonth(model.scope.month, -12))}.`,
    `Contributing records: ${data.n.toLocaleString("en-IN")}.`,
    ...data.diagnostics ?? [],
    ...data.notes ?? [],
    "Definitions: " + [...new Set([...spec.metrics, ...spec.history, ...data.groups.flatMap(g => g.columns)])].map(id => `${id}: ${definition(id)?.label ?? id}. Format: ${definition(id)?.format ?? "unavailable"}. ${metricNotes[id]?.definition ?? ""} Governed calculation: ${definition(id)?.description ?? "unavailable"}. ${metricNotes[id]?.caveat ?? ""}`).join("; "),
    "Membership revenue share is a share of gross collected payments, not net revenue. Newcomer lifetime value and return counts are observed to the source snapshot date: recent cohorts have less time to mature, so lower observed values do not prove weaker eventual outcomes. Churn outcomes can mature as renewals are recorded. Current-snapshot metrics cannot reconstruct historical member counts. Ranked tables omit groups below three contributing records and may be truncated; totals include all groups. Earned revenue is attendance attribution, not cash sales.",
  ];
  parts.push("Headline figures (raw values; percent format uses a 0–1 ratio):\n" + JSON.stringify({
    columns: ['metric', 'selectedMonth', 'priorMonth', 'sameMonthLastYear', 'YTD', 'priorYTD', 'MoM', 'YoY'],
    figures: spec.metrics.map(id => [id, ...[data.total, data.prior, data.priorYear, data.yearToDate, data.priorYearToDate].map(row => row?.[id] ?? null), delta(id, data.total[id], data.prior[id]), delta(id, data.total[id], data.priorYear[id])]),
  }) + "\nCalendar-year context:\n" + yearContextPayload(spec,data,model.scope.month));
  for (const group of data.groups) {
    const head = ["Group", ...group.columns.map((id) => definition(id)?.label ?? id)].join(" | ");
    const body = group.rows
      .map((row) =>
        JSON.stringify([row.g, ...group.columns.map((id) => row[id] ?? null), group.compare ? `MoM ${delta(group.compare,row[group.compare],group.prior?.[String(row.g)]?.[group.compare])}; YoY ${delta(group.compare,row[group.compare],group.priorYear?.[String(row.g)]?.[group.compare])}` : '']),
      );
    parts.push(`Focus ID: ${group.id ?? group.field}. ${group.title} (${group.minimum}; ${group.omitted ?? 0} eligible rows omitted). Diagnostics: ${group.diagnostics?.join(" ") ?? ""}. By ${group.fields?.join(" + ") ?? group.field}:\n${head}\n${body.join("\n")}`);
  }
  if (data.history.length) {
    const ids = spec.history.filter((id) => data.history.some((row) => row[id] != null));
    if (ids.length)
      parts.push(
        "Trailing months:\n" +
          ["Month", ...ids.map((id) => definition(id)?.label ?? id)].join(" | ") +
          "\n" +
          data.history
            .map((row) => JSON.stringify([row.month, ...ids.map((id) => row[id] ?? null)]))
            .join("\n"),
      );
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Observed calendar-year position; no zero-filling and no synthetic annual rates. */
export function yearContextPayload(spec: ChapterSpec, data: ChapterData, month: string) {
  const year=month.slice(0,4);
  return spec.metrics.filter(id=>data.total[id]!=null).map(id=>{
    const observed=data.history.filter(r=>String(r.month).startsWith(year) && String(r.month)<=month && r[id]!=null && Number.isFinite(Number(r[id])));
    const value=Number(data.total[id]);
    const rank=1+observed.filter(r=>Number(r[id])>value).length;
    const mean=observed.length ? observed.reduce((sum,r)=>sum+Number(r[id]),0)/observed.length : null;
    return `${definition(id)?.label}: ${observed.length ? `selected month ranks ${rank} by numeric value (higher rank is not necessarily better) among ${observed.length} observed ${year} months; mean of monthly values ${fmt(id,mean)} (not an aggregated year-to-date rate).` : 'No observed calendar-year series.'} ${Number(data.yearToDate?.n)>0 ? `Governed year-to-date value ${fmt(id,data.yearToDate?.[id])}; same elapsed months last year ${Number(data.priorYearToDate?.n)>0 ? fmt(id,data.priorYearToDate?.[id]) : 'unavailable'}; change ${Number(data.priorYearToDate?.n)>0 ? delta(id,data.yearToDate?.[id],data.priorYearToDate?.[id]) : 'unavailable'}.` : 'Governed YTD comparison unavailable.'}`;
  }).join('\n');
}

/** What the brief and the plan reason over: the ranked cross-report findings plus every chapter's headline movement. */
export function portfolioPayload(model: ReportModel, findings: Record<string, Finding[]> = findingsFor(model), chapter?: ChapterSpec) {
  const ranked = ledger(findings);
  const valued = ranked.filter((f) => f.inr);
  const own = chapter && !chapter.derived ? (findings[chapter.id] ?? []).slice(0, 14) : [];
  // Keep the original top-30 selection; remove only findings supplied in full above.
  const contextFindings = ranked.slice(0, 30).filter(f => !own.includes(f));
  return [
    findingsPayload(contextFindings, 30),
    valued.length ? "Valued items above are indicative and can overlap; never add them up." : "",
    chapter && !chapter.derived ? `The ${chapter.id} headline figures, definitions, full history and breakdowns are supplied in Figures; use those for this chapter.` : "",
    "Chapter headline figures (all tabs, including chapters omitted from display):\n" + headlinePayload(model, chapter && !chapter.derived ? chapter.id : undefined),
    "Additional connected context:\n" + JSON.stringify(model.additionalContext ?? []),
    "Different source populations must not be added or joined without verified keys; Meta and KRA are network/account context. n=0 indicates no contributing records, not demonstrated zero performance.\nSource freshness and coverage:\n" + JSON.stringify(model.sources ?? []),
  ].filter(Boolean).join("\n\n");
}

function headlinePayload(model: ReportModel, exclude?: string) {
  return chapters.filter(spec=>!spec.derived && spec.id !== exclude).map(spec=>{
    const data=model.chapters[spec.id];
    if(!data) return `${spec.title}: source snapshot unavailable.`;
    const ids=spec.metrics.filter(id=>definition(id));
    return JSON.stringify({chapter:spec.id,title:spec.title,scope:spec.network?'account / network; not studio-attributed':model.scope.studio,n:data.n,notes:data.notes,
      columns:['metric','selectedMonth','priorMonth','sameMonthLastYear','YTD','priorYTD'],
      figures:ids.map(id=>[id,...[data.total,data.prior,data.priorYear,data.yearToDate,data.priorYearToDate].map(row=>row?.[id]??null)]),
      definitions:ids.map(id=>[id,definition(id)?.label,definition(id)?.format]),
      historyColumns:['month',...spec.history.slice(0,3)],history:data.history.map(row=>[row.month,...spec.history.slice(0,3).map(id=>row[id]??null)]),
      segments:data.groups.slice(0,3).map(g=>({id:g.id??g.field,omitted:g.omitted,rows:g.rows.slice(0,2).map(row=>[String(row.g).slice(0,120),...g.columns.slice(0,3).map(id=>row[id]??null)])}))});
  }).join('\n');
}

/** Transparent what-if values, not a fitted forecast or confidence interval. */
export function forwardScenarios(model: ReportModel) {
  return chapters.filter(spec => !spec.derived).flatMap(spec => {
    const data = model.chapters[spec.id];
    if (!data) return [];
    return spec.history.flatMap(id => {
      const current = data.total[id], prior = data.prior[id];
      if (current == null || prior == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(prior))) return [];
      const base = Number(current), previous = Number(prior);
      if (definition(id)!.format !== "percent" && previous === 0) return [];
      const projected = definition(id)!.format === "percent"
        ? Math.min(1, Math.max(0, base + (base - previous)))
        : Math.max(0, base * (base / previous));
      const season = seasonalScenario(id, data, model.scope.month);
      const extra = [
        season?.run != null ? `three-month run-rate scenario ${fmt(id, season.run)} (average of the last three months)` : "",
        season?.seasonal != null ? `seasonal scenario ${fmt(id, season.seasonal)} (this month moved by last year's ${monthLabel(shiftMonth(model.scope.month, -12))} → ${monthLabel(shiftMonth(model.scope.month, -11))} change, ${fmt(id, season.thisLY)} → ${fmt(id, season.nextLY)})` : "",
      ].filter(Boolean).join("; ");
      return [`${definition(id)!.label}: flat scenario ${fmt(id, base)}; repeat-last-month-movement scenario ${fmt(id, projected)}${extra ? `; ${extra}` : ""}. Arithmetic: ${definition(id)!.format === "percent" ? `${base} + (${base} - ${previous}), clipped to [0,1]` : `${base} × (${base} / ${previous}), floored at zero`}. These are conditional scenarios, not estimates of likelihood.`];
    });
  }).join("\n");
}

const ANALYST_ROLE = [
  'You are the head of strategy and analytics briefing the CEO, COO and studio leadership of a premium boutique fitness business (Physique 57 India).',
  'Leaders have already seen every table and chart. They do not need figures read back to them. They need a clear reading of this month, the evidence behind its drivers, how it fits the year, and which interpretations or recommendations the evidence supports.',
].join(' ');

/** Metric ids a chapter's cards may cite; the page renders each cited id as evidence beside the card. */
export function citableMetrics(model: ReportModel, spec: ChapterSpec): string[] {
  const own = (s: ChapterSpec) => {
    const data = model.chapters[s.id];
    if (!data) return [];
    const ids = [...s.metrics, ...s.history, ...data.groups.flatMap(g => g.columns)];
    return ids.filter(id => definition(id) && (data.total[id] != null || data.history.some(row => row[id] != null)));
  };
  const ids = spec.derived ? chapters.filter(c => !c.derived).flatMap(own) : own(spec);
  return [...new Set(ids)];
}

const COMPARISON_FOCUS: Record<string, string> = {
  balanced: "Weigh the previous month, the same month last year and YTD equally; use whichever changes the reading.",
  mom: "Lead with the change against the previous month; use YoY and YTD only to test whether it is seasonal or durable.",
  yoy: "Lead with the same month last year to strip out seasonality; use MoM only to show momentum.",
  ytd: "Lead with the governed year-to-date position against the same elapsed period last year; treat the single month as one observation in that run.",
};

/** The v2 editorial contract: each card answers one leadership question and names the evidence that proves it. */
function insightRules(model: ReportModel, spec: ChapterSpec) {
  const o = reportOptions(model.customization);
  const recs = spec.id === "recommendations";
  const lenses = INSIGHT_LENSES.filter(l => recs ? l.id === "next_step" : l.id !== "next_step" && o.lenses.includes(l.id));
  return [
    "Return JSON with summary and cards. Every card has headline, meaning, evidence, driver, trend, impact, action, watch, recommendation, lens, focus, metrics, highlight, priority, ownerArea, horizon and confidence.",
    "PURPOSE: a practical, decision-led review of the SELECTED MONTH. Every card answers exactly one leadership question, named by its lens. Do not repeat the same movement across cards, and do not write cards that merely restate a table.",
    "Lenses allowed in this chapter:\n" + lenses.map(l => `- ${l.id} (${l.label}): ${l.question}`).join("\n"),
    recs ? "Every card uses lens next_step." : "Use a mix of lenses where the evidence supports it; skip a lens rather than force it. The kpis verdict card may use any lens.",
    "headline: the verdict in at most 16 words, including the key number.",
    "meaning (shown as 'Why it matters'): 45–80 words on the business consequence for members, revenue, capacity or the brand. Do not restate the figure.",
    "evidence: at most 40 words of exact supplied figures with their comparison periods.",
    "driver (shown as 'What drove it'): 30–60 words decomposing the movement: which breakdown rows or mix shifts contributed how much, and the offsetting force. Decompositions are arithmetic; label a causal idea as a hypothesis and name the check that would confirm it.",
    `trend (shown as 'Is it durable?'): at most 35 words giving one verdict — new, persistent for n months, reversing, seasonal or one-off. ${COMPARISON_FOCUS[o.comparisonFocus]}`,
    o.quantifyImpact
      ? "impact (shown as 'At stake'): at most 30 words quantifying rupees, members, seats or sessions at stake with the arithmetic shown, labelled indicative where it rests on an average. Empty string when the evidence cannot be valued."
      : "impact: empty string.",
    o.includeActions || recs
      ? "action (shown as 'Recommended move'): at most 40 words — one concrete, practical move that follows from this evidence: what to change, where and for whom. No invented deadlines, named people, policies or promised uplift. watch (shown as 'Signal to watch'): at most 25 words naming the leading indicator and the threshold that would confirm or reject the reading next month."
      : "action and watch: empty strings.",
    recs
      ? "recommendation: 40–70 words — why this move is preferred to the obvious alternative, the trade-off, and the guardrail that limits it."
      : "recommendation: empty string.",
    `metrics: 1–4 ids from AVAILABLE METRIC IDS that prove the claim. The page shows each one's value, MoM, YoY and monthly trend beside the card, so choose the ids a sceptical reader would check.`,
    "focus: kpis for the single chapter verdict card, trend when the claim rests on the monthly history, cross for cross-chapter context, otherwise the breakdown ID whose chart proves the claim.",
    "highlight: up to 4 exact group labels, copied character-for-character from the focus breakdown table, that the claim names. Empty array when none.",
    "priority: high when the item is material to the month's result or its value at stake; medium otherwise; low for context. ownerArea: the team best placed to act. horizon: when to act or review.",
    "confidence: high, medium or low, justified by source coverage, sample size and consistency across comparisons.",
    "summary: 90–140 words — the chapter's verdict: what happened, the largest quantified driver, the offset, whether it is durable, and the one thing leadership should take from it.",
    "Exactly one card has focus kpis: the chapter verdict.",
  ].join("\n");
}

const ACCURACY_RULES = [
  'Accuracy rules (these override style):',
  'Use only supplied figures, findings and diagnostics. Use percentage points for rate changes. Do not say doubled or halved unless the ratio supports it. Proposed targets and timings must be labelled as proposals.',
  'Separate additive contributions, changes within groups and changes in mix. Never add overlapping distinct transaction or member counts from groups, and never sum ledger items that can overlap.',
  'Gross collections per transaction is an observed average, not a price index. Volume/yield bridges decompose totals arithmetically; they cannot establish causal effects.',
  'Higher AOV alone does not establish a price increase. Do not claim a price change caused demand or conversion changes without evidence. Missing-ID warnings must use the supplied coverage counts.',
  'Cash sales and earned (attendance-attributed) revenue are different populations. Membership revenue share is based on gross payments. Payroll costs are estimates at the configured rate, not actual salaries.',
  'Newcomer LTV is cumulative observed spend to the source date; recent cohorts have had less time. Recorded lead stages are current cohort positions, not transitions in the month. Renewal lapses are recorded Churned Dates and recent cohorts can still change. Do not compare historical active snapshots or sum recurring and Sessions totals.',
  'Do not invent causes, policy thresholds, uplift promises or certainty from small samples. Every causal idea is a hypothesis paired with the check that would confirm or reject it. Valuations are indicative and must say so where the basis is an average.',
  'Future figures may use only the supplied conditional scenario arithmetic. Never call scenarios likely outcomes or add probabilities or ranges.',
].join('\n');

const cardCount = (model: ReportModel, derived = false) => {
  const n = reportOptions(model.customization).insightsPerChapter;
  return derived ? `${n}–${n + 2}` : `${Math.max(2, n - 1)}–${n + 1}`;
};

const DERIVED_RULES: Record<string, (model: ReportModel) => string> = {
  'executive-summary': model => `Write the executive brief across all tabs. Return one kpis verdict card and ${cardCount(model,true)} cross-report insights, ranked by materiality: the biggest wins, the biggest risks, the movement that best explains the month and the largest opportunity. Connect chapters (cash versus attendance, acquisition quality versus volume, member continuity, instructor and schedule mix) where the evidence supports it. Do not treat historical LTV as future revenue at risk.`,
  recommendations: model => `Return ${cardCount(model,true)} evidence-led recommendations, ordered by priority. Each must follow from a material selected-month finding and its year context. action is the move; recommendation explains why it beats the alternative, the trade-off and its guardrail; watch is how leadership will know it is working. ownerArea is a team, never a person. Do not promise uplift. Keep valuations conditional and distinct from actual cash.`,
  predictions: () => 'Explain only the supplied conditional scenarios, assumptions and their connection to selected-month performance. These are not forecasts. No probabilities, deadlines or task lists.',
};

function parseJson(answer: string): { summary?: string; cards?: InsightCard[] } | null {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function findingCard(f: Finding): InsightCard {
  const [headline, ...rest] = f.text.split(/(?<=[.:])\s+/);
  return { headline: headline.replace(/[.:]$/, ''), meaning: rest.join(' ') || f.text, evidence: f.text,
    action:'',watch:'',impact:'',focus:f.focus,reasoning:'The finding follows recorded figures and a transparent calculation; causal mechanisms remain unverified.',
    category:f.tone==='risk'?'red_flag':f.tone==='opportunity'?'worked':'meaning',
    lens:f.tone==='risk'?'risk':f.tone==='opportunity'?'opportunity':f.kind==='driver'||f.kind==='mix'?'driver':'watch' };
}

/**
 * Rule-based cards, used when no provider answers. They are returned with
 * `generated: false` and the document labels them, so deterministic copy is
 * never mistaken for analysis.
 */
export function fallbackNarrative(spec: ChapterSpec, data: ChapterData | undefined, findings: Finding[] = [], model?: ReportModel): ChapterNarrative {
  if (spec.derived) {
    const ranked = (model ? ledger(findingsFor(model)) : findings).filter(f=>!['gap','benchmark'].includes(f.kind)).slice(0,5);
    if (!ranked.length) return { summary: '', cards: [], generated: false };
    if (spec.id === 'predictions') return { summary: 'Conditional scenarios use recorded baselines; they are not forecasts or probabilities.', cards: [], generated: false };
    return { summary: ranked.length ? 'Proposed priorities from calculated signals. Confirm causes and feasibility before committing; indicative values may overlap and must not be added.' : 'Available evidence does not support a ranked operating plan.',
      cards: ranked.map((f, i) => ({ ...findingCard(f), recommendation:`Consider the cited ${f.chapter} finding in the selected-month review; validate the cause and feasibility before choosing an intervention.`, reasoning:'This priority follows the calculated signal and its materiality; the calculation does not prove a recoverable cash gain or establish a cause.', focus: i === 0 ? 'kpis' : 'cross', category: 'next_step', lens: 'next_step' })), generated: false };
  }
  if (!data) return { summary: '', cards: [], generated: false };
  // Explain the selected month before current-snapshot follow-up signals.
  const contextFor = (f?: Finding, metricId?: string) => {
    const sourceSpec = chapters.find(c=>c.id === f?.chapter) ?? spec;
    const source = model?.chapters[sourceSpec.id] ?? data;
    const primary = (metricId ? [metricId] : sourceSpec.metrics).filter(id=>source.total[id]!=null && source.prior[id]!=null).slice(0,1);
    return {
      monthContext: primary.map(id=>`${definition(id)?.label}: ${fmt(id,source.total[id])}, ${delta(id,source.total[id],source.prior[id])} versus the previous month.`).join(' '),
      yearContext: primary.map(id=>{
        const label=definition(id)?.label ?? id;
        const year=(model?.scope.month ?? String(source.history.at(-1)?.month ?? '')).slice(0,4);
        const observed=source.history.filter(row=>year && String(row.month).startsWith(year) && row[id]!=null);
        const rank=observed.filter(row=>Number(row[id])>Number(source.total[id])).length+1;
        const position=observed.length>1 ? ` Its value ranks ${rank} of ${observed.length} observed months this calendar year (highest value first).` : '';
        const ytd=Number(source.yearToDate?.n)>0 && source.yearToDate?.[id]!=null ? ` YTD ${label}: ${fmt(id,source.yearToDate[id])}; ${delta(id,source.yearToDate[id],source.priorYearToDate?.[id])} versus the equivalent prior-year period.` : '';
        return `${label}: ${delta(id,source.total[id],source.priorYear[id])} versus the same month last year.${position}${ytd}`;
      }).join(' '),
    };
  };
  const performanceOrder: Record<string,number> = {driver:0,mix:1,cross:2,anomaly:3,streak:4,concentration:5,tension:6,target:7,gap:8,signal:9,benchmark:10};
  const flagged = findings.filter(f=>!['signal','benchmark'].includes(f.kind) && !(spec.id==='executive-summary' && f.kind==='gap')).sort((a,b)=>performanceOrder[a.kind]-performanceOrder[b.kind]).slice(0,4).map((f,index)=>({...findingCard(f),focus:index===0 ? "kpis" : f.focus==="kpis" ? "cross" : f.focus,...contextFor(f),reasoning:'The interpretation follows the recorded comparison and calculated driver; the source does not by itself establish a causal explanation.'}));
  const moves = spec.metrics
    .filter((id) => data.total[id] != null && data.prior[id] != null && Number(data.prior[id]) !== 0)
    .map((id) => {
      const change = Number(data.total[id]) / Number(data.prior[id]) - 1;
      const good = (change >= 0) === (definition(id)?.higherIsBetter ?? true);
      return { id, change, good };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, Math.max(0, 4 - flagged.length));
  return {
    summary: flagged.length ? flagged.slice(0,2).map(f=>f.meaning).join(" ") : "Available comparisons describe movement; the evidence does not yet establish a cause.",
    cards: [...flagged, ...moves.map(({ id, good }) => ({
      headline: `${definition(id)?.label ?? id} is ${fmt(id, data.total[id])}, ${delta(id, data.total[id], data.prior[id])} on the prior month.`,
      meaning: good
        ? "Moving in the intended direction for this measure."
        : "Moving against the intended direction for this measure.",
      evidence: `${fmt(id, data.total[id])} this month, ${fmt(id, data.prior[id])} prior month`,
      action: "", ...contextFor(undefined,id), reasoning: "Direction describes this measure alone; corroborating source breakdowns are needed to explain the cause.",
    }))],
    generated: false,
  };
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/**
 * A rate-limited chapter is worth waiting for rather than silently demoting to
 * rule-based copy, so a 429 is retried with a widening gap. Every other error
 * fails straight through to the fallback.
 */
const RETRY_DELAYS_MS = [5000, 15000, 30000];

async function askModel(message: string, focusIds: string[], signal?: AbortSignal, onUsage?: (usage: CallUsage) => void, extra: Record<string, unknown> = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("/api/reports/narrative", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, focusIds, editorial: true, ...extra }),
    });
    const payload = await response.json();
    // Billed calls report usage even when their answer is rejected.
    if (payload?.usage) onUsage?.(payload.usage as CallUsage);
    if (response.ok) return String(payload.answer || "").trim();
    if (response.status !== 429 || payload.retryable === false || attempt >= RETRY_DELAYS_MS.length)
      throw new Error(payload.error || "Unable to generate.");
    await wait(Math.min(60000,Math.max(RETRY_DELAYS_MS[attempt],Number(payload.retryAfterMs)||0)), signal);
  }
}

/**
 * One call per chapter. Cached on the prompt, so re-running a month whose
 * numbers have not moved costs nothing; a chapter falls back to labelled
 * rule-based copy rather than being faked when a call fails.
 *
 * Chapters are written one at a time. Running them concurrently is faster on
 * paper and worse in practice: the endpoint rate-limits, and a 429 costs a
 * chapter its analysis. One in flight plus the retry above gets every chapter
 * written.
 */
const CONCURRENCY = 1;

/** Match the API's limit for the entire message, including rules and separators. */
const MAX_CHAPTER_PROMPT = 90000;

/** Keep complete evidence lines; never send a cut-off figure or JSON record. */
function boundedEvidence(text: string, budget: number) {
  if (text.length <= budget) return text;
  const notice = "[Evidence omitted to fit the chapter prompt limit. Use only complete supplied records; omitted evidence is unavailable, not zero.]";
  const kept: string[] = [];
  let remaining = Math.max(0, budget - notice.length - 1);
  for (const line of text.split("\n")) {
    if (line.length + 1 > remaining) continue;
    kept.push(line);
    remaining -= line.length + 1;
  }
  return [...kept, notice].join("\n");
}

function chapterPrompt(rules: string[], sections: { label: string; text: string }[]) {
  const active = sections.filter(section => section.text);
  const fixed = rules.filter(Boolean).join("\n\n");
  // Reserve every heading and separator before allocating evidence space.
  let remaining = MAX_CHAPTER_PROMPT - fixed.length
    - active.reduce((sum, section) => sum + section.label.length + 4, 0);
  return [fixed, ...active.map((section, index) => {
    const budget = Math.floor(remaining / (active.length - index));
    const text = boundedEvidence(section.text, budget);
    remaining -= text.length;
    return `${section.label}\n\n${text}`;
  })].join("\n\n");
}

export async function generateNarratives(
  model: ReportModel,
  onProgress?: (done: number, total: number, label: string) => void,
  signal?: AbortSignal,
  /** Each chapter as it lands, so the page can fill in while the rest are written. */
  onChapter?: (id: string, narrative: ChapterNarrative) => void,
): Promise<Record<string, ChapterNarrative>> {
  const out: Record<string, ChapterNarrative> = {};
  const findings = findingsFor(model);
  // Verify the configured model before reusing browser or saved-report prose.
  // If status is unavailable, the server can still safely reuse its exact-request cache.
  let providerModel = "";
  let providerPolicy = "";
  try {
    const response = await fetch("/api/intelligence/status", { signal });
    const status = await response.json();
    if (response.ok && status.openai && typeof status.model === "string" && typeof status.reportNarrativeVersion === "string") {
      providerModel = status.model;
      providerPolicy = status.reportNarrativeVersion;
    }
  } catch (error) { if (signal?.aborted) throw error; }
  let done = 0;
  const finish = (spec: ChapterSpec, narrative: ChapterNarrative) => {
    out[spec.id] = narrative;
    onChapter?.(spec.id, narrative);
    done++;
    onProgress?.(done, model.customization?.chapterIds.length ?? chapters.length, spec.title);
  };
  const selected = model.customization ? model.customization.chapterIds.map(id => chapters.find(c => c.id === id)).filter((c): c is ChapterSpec => !!c) : chapters;
  const pending = [...selected];
  onProgress?.(0, selected.length, selected[0]?.title ?? "Report");
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
      while (pending.length) {
        if (signal?.aborted) return;
        const spec = pending.shift()!;
        const data = model.chapters[spec.id];
        const own = findings[spec.id] ?? [];
        const portfolio = portfolioPayload(model, findings, spec);
        const figures = spec.derived ? portfolio : data ? chapterPayload(spec,data,model,own) : "";
        if (!figures) {
          finish(spec, fallbackNarrative(spec, data, own, model));
          continue;
        }
        const focusIds = data?.groups.map(g => g.id ?? g.field) ?? [];
        const metricIds = citableMetrics(model, spec);
        const o = reportOptions(model.customization);
        const preferences = model.customization
          ? `Audience: ${model.customization.audience}. Tone: ${model.customization.tone}. Focus areas: ${(model.customization.focusAreas ?? []).join(", ") || "balanced"}. Detail: ${model.customization.detail}. Requested priorities: ${model.customization.instructions || "none"}.`
          : "";
        const message = chapterPrompt([
          ANALYST_ROLE,
          ACCURACY_RULES,
          insightRules(model, spec),
          `You are writing the "${spec.title}" chapter of the monthly management report for ${model.scope.studio}, ${monthLabel(model.scope.month)}.`,
          DERIVED_RULES[spec.id]?.(model) ?? `Return ${cardCount(model)} cards: one "kpis" verdict card, ${data?.history.length ? "at most one \"trend\" card if the history shows something the findings do not, " : ""}and the rest as ranked insights built from the analyst findings. Breakdown IDs available for focus: ${focusIds.join(", ") || "none"}. Most breakdowns should not get their own card.`,
          "AVAILABLE METRIC IDS (id: label): " + metricIds.map(id => `${id}: ${definition(id)?.label ?? id}`).join("; "),
          preferences ? `Editorial preferences (subject to the evidence and accuracy rules above): ${preferences.slice(0, 8000)}${preferences.length > 8000 ? " [Long editorial preferences shortened.]" : ""} Do not invent figures or change metric definitions to satisfy preferences.` : "",
        ], [
          ...(spec.id === "predictions" ? [{ label: "Use only the following numeric what-if scenarios for future values. Do not invent forecast ranges, confidence bands, probabilities or additional numeric forecasts.", text: forwardScenarios(model) }] : []),
          // Derived chapters already reason over the portfolio; send it once.
          ...(!spec.derived ? [{ label: "Figures:", text: figures }] : []),
          { label: "All-tab performance context (independent of visible chapter selection):", text: portfolio },
        ]);
        const extra = { insightVersion: 2, metricIds, lenses: spec.id === "recommendations" ? ["next_step"] : o.lenses.filter(l => l !== "next_step") };
        // Include complete pre-budget evidence: changes to omitted records must invalidate reuse too.
        const fingerprint = await analysisKey({ version: 12, providerModel, providerPolicy, message, focusIds, extra,
          figures, portfolio, preferences, scenarios: spec.id === "predictions" ? forwardScenarios(model) : "" });
        const key = `${CACHE_PREFIX}${model.scope.studio}:${model.scope.month}:${spec.id}:${fingerprint}`;
        const previous = model.narratives[spec.id];
        const cached = providerModel ? (previous?.analysisKey === fingerprint ? previous : readCache(key)) : null;
        if (cached?.generated && !cached.error && cached.analysisKey === fingerprint) {
          finish(spec, { ...cached, usage: cached.usage ? { ...cached.usage, fromCache: true } : { model: "", calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, durationMs: 0, costUsd: 0, fromCache: true } });
          continue;
        }
        let usage: ChapterUsage | undefined;
        try {
          const parsed = parseJson(await askModel(message, focusIds, signal, (call) => { usage = addCall(usage, call); },
            { ...extra, analysisKey: fingerprint }));
          const cards = Array.isArray(parsed?.cards)
            ? parsed!.cards.filter(
                (c): c is InsightCard =>
                  !!c && typeof c.headline === "string" && !!c.headline.trim(),
              )
            : [];
          const valid = cards.every(c => [c.meaning,c.evidence].every(v => typeof v === "string" && !!v.trim()) && !!c.focus && !!(c.lens || c.category) && !!c.confidence);
          // Cited ids outside this chapter's figures would render as blank evidence.
          for (const c of cards) c.metrics = (Array.isArray(c.metrics) ? c.metrics : []).filter(id => metricIds.includes(id)).slice(0, 4);
          if (!valid || !cards.length || typeof parsed?.summary !== "string" || !parsed.summary.trim())
            throw new Error("The model returned no complete chapter analysis. Retry writing insights.");
          // The verdict leads; a model that forgot to mark one has its first card promoted.
          if (!cards.some(c => c.focus === "kpis")) cards[0] = { ...cards[0], focus: "kpis" };
          const narrative: ChapterNarrative = { summary: parsed.summary.trim(), cards, generated: true, usage, analysisKey: fingerprint };
          if (providerModel) writeCache(key, narrative);
          finish(spec, narrative);
        } catch (error) {
          if (signal?.aborted) throw error;
          finish(spec, { ...fallbackNarrative(spec, data, own, model), error: error instanceof Error ? error.message : String(error), usage });
        }
      }
    }),
  );
  onProgress?.(selected.length, selected.length, "Narratives complete");
  return out;
}
