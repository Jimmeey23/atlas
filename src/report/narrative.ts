import { reportFmt as fmt, reportDelta as delta, definition } from "./definitions";
import { metricNotes } from "../semantics/evidence";
import { chapters, type ChapterSpec } from "./chapters";
import { hashText, monthLabel, shiftMonth } from "./period";
import { findingsFor, findingsPayload, ledger, seasonalScenario, type Finding } from "./findings";
import type { ChapterData, ChapterNarrative, InsightCard, ReportModel } from "./model";
import { addCall, type CallUsage, type ChapterUsage } from "./usage";

const CACHE_PREFIX = "atlas-report-narrative:v10:";
/** Keyed on the exact prompt, so any change to figures, findings, targets or rules is a new analysis. */
const cacheKey = (model: ReportModel, chapterId: string, message: string) =>
  `${CACHE_PREFIX}${model.scope.studio}:${model.scope.month}:${chapterId}:${hashText(message)}`;

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
/** Drop every cached narrative for one studio-month, so Regenerate really regenerates. */
export function clearNarrativeCache(model: ReportModel) {
  const prefix = `${CACHE_PREFIX}${model.scope.studio}:${model.scope.month}:`;
  for (const key of Object.keys(localStorage))
    if (key.startsWith(prefix)) localStorage.removeItem(key);
}

const line = (id: string, data: ChapterData) =>
  `${definition(id)?.label ?? id}: ${fmt(id, data.total[id])}` +
  ` (prior month ${fmt(id, data.prior[id])}, ${delta(id, data.total[id], data.prior[id])};` +
  ` same month last year ${fmt(id, data.priorYear[id])}, ${delta(id, data.total[id], data.priorYear[id])})`;

/**
 * What the model is shown for one chapter: exactly the figures the reader
 * sees, so a card can be checked against the page rather than taken on trust.
 */
export function chapterPayload(spec: ChapterSpec, data: ChapterData, model: ReportModel, findings: Finding[] = []) {
  const parts = [
    findingsPayload(findings),
    `Chapter: ${spec.title}. Studio: ${model.scope.studio}. Month: ${monthLabel(model.scope.month)}.`,
    `Comparisons are against ${monthLabel(shiftMonth(model.scope.month, -1))} and ${monthLabel(shiftMonth(model.scope.month, -12))}.`,
    `Contributing records: ${data.n.toLocaleString("en-IN")}.`,
    ...data.diagnostics ?? [],
    ...data.notes ?? [],
    "Definitions: " + spec.metrics.map(id => `${id}: ${definition(id)?.label ?? id}. ${metricNotes[id]?.definition ?? ""} Governed calculation: ${definition(id)?.description ?? "unavailable"}. ${metricNotes[id]?.caveat ?? ""}`).join("; "),
    "Membership revenue share is a share of gross collected payments, not net revenue. Newcomer lifetime value and return counts are observed to the source snapshot date: recent cohorts have less time to mature, so lower observed values do not prove weaker eventual outcomes. Churn outcomes can mature as renewals are recorded. Current-snapshot metrics cannot reconstruct historical member counts. Ranked tables omit groups below three contributing records and may be truncated; totals include all groups. Earned revenue is attendance attribution, not cash sales.",
  ];
  const headline = spec.metrics.filter((id) => data.total[id] != null);
  if (headline.length)
    parts.push("Headline figures:\n" + headline.map((id) => line(id, data)).join("\n") + "\nCalendar-year context:\n" + yearContextPayload(spec,data,model.scope.month));
  for (const group of data.groups) {
    const head = ["Group", ...group.columns.map((id) => definition(id)?.label ?? id)].join(" | ");
    const body = group.rows
      .map((row) =>
        [row.g, ...group.columns.map((id) => fmt(id, row[id])), group.compare ? `MoM ${delta(group.compare,row[group.compare],group.prior?.[String(row.g)]?.[group.compare])}; YoY ${delta(group.compare,row[group.compare],group.priorYear?.[String(row.g)]?.[group.compare])}` : ''].join(" | "),
      );
    parts.push(`Focus ID: ${group.id ?? group.field}. ${group.title} (${group.minimum}; ${group.omitted ?? 0} eligible rows omitted). Diagnostics: ${group.diagnostics?.join(" ") ?? ""}. By ${group.fields?.join(" + ") ?? group.field}:\n${head}\n${body.join("\n")}`);
  }
  if (data.history.length > 1) {
    const ids = spec.history.filter((id) => data.history.some((row) => row[id] != null));
    if (ids.length)
      parts.push(
        "Trailing months:\n" +
          ["Month", ...ids.map((id) => definition(id)?.label ?? id)].join(" | ") +
          "\n" +
          data.history
            .map((row) => [row.month, ...ids.map((id) => fmt(id, row[id]))].join(" | "))
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
export function portfolioPayload(model: ReportModel, findings: Record<string, Finding[]> = findingsFor(model)) {
  const ranked = ledger(findings);
  const valued = ranked.filter((f) => f.inr);
  return [
    findingsPayload(ranked, 30),
    valued.length ? `Valued items (indicative; items can overlap, so never add them up): ${valued.slice(0, 12).map((f) => `${f.text.split(". ")[0]} ≈ ${fmt("gross_revenue", Math.round(f.inr!))}`).join(" | ")}` : "",
    "Chapter headline figures (all tabs, including chapters omitted from display):\n" + headlinePayload(model),
    "Additional connected context:\n" + JSON.stringify(model.additionalContext ?? []),
    "Different source populations must not be added or joined without verified keys; Meta and KRA are network/account context. n=0 indicates no contributing records, not demonstrated zero performance.\nSource freshness and coverage:\n" + JSON.stringify(model.sources ?? []),
  ].filter(Boolean).join("\n\n");
}

function headlinePayload(model: ReportModel) {
  return chapters.filter(spec=>!spec.derived).map(spec=>{
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

const CARD_RULES = [
  'Return JSON with summary and cards. Each card has headline, meaning, evidence, monthContext, yearContext, reasoning, recommendation, layout, focus, category, confidence, action, impact, watch and plainLanguage.',
  'REPORT PURPOSE: interpret performance of the SELECTED MONTH, in context of the previous month, the same month last year, the observed calendar-year trajectory and governed YTD comparisons. This is a performance review, not a task list. Use yearContext supplied for the correct elapsed months; missing months are unavailable.',
  'Start with verified engine findings, reconcile changes with the volume/yield and rate/mix bridges, and join relevant all-tab context. Explain the dominant driver and its offset. Distinguish stronger scale from improved efficiency and durable trends from one-month noise. Omit immaterial anomalies.',
  'headline: a concise performance verdict, at most 18 words. meaning: 60–100 words explaining what changed, the supported driver, the offsetting evidence and its business significance. No generic commentary or row-by-row table reading.',
  'monthContext: 25–45 words comparing selected-month values with the prior month, explaining the numerical driver rather than repeating a percentage. yearContext: 25–45 words comparing the same month last year, the year position, and YTD where supplied; mention limited coverage or cohort maturity where relevant.',
  'reasoning: 35–65 words explaining why the evidence supports the interpretation, the alternative explanation and the missing check. Observed decompositions are arithmetic, not causal proof.',
  'recommendation: empty in ordinary performance chapters. In the recommendations chapter ONLY, give a considered recommendation linked to the selected-month evidence; explain why it is preferred to an alternative and what guardrail or uncertainty limits it. Do not invent deadlines, owners or numerical uplift promises.',
  'evidence: exact source-backed figures and comparison periods, at most 45 words. focus: kpis for the verdict, trend for history, cross for cross-tab context, otherwise an available breakdown ID. category: worked, didnt_work, red_flag or meaning for performance analysis; next_step only for the recommendations chapter. confidence: high, medium or low, justified by source coverage, sample and consistency.',
  'layout: comparison for a balanced month-versus-year interpretation, narrative for a concise qualitative synthesis, full for a complex cross-tab argument. Rendering density and measured height override this preference to preserve alignment.',
  'Legacy fields action, impact, watch and plainLanguage must be empty strings. Do not produce Next step, At stake or Watch next month blocks.',
  'summary: 100–160 words. Overall verdict for this month, largest quantified driver, offsetting force, relative year position and why it matters. Be decisive about supported facts and explicit about hypotheses and unavailable evidence. Exactly one kpis card provides the chapter verdict.',
].join('\n');

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

const cardCount = (model: ReportModel, derived = false) => model.customization?.detail === 'Concise'
  ? derived ? '4–5' : '3–5' : derived ? '6–8' : '5–7';

const DERIVED_RULES: Record<string, (model: ReportModel) => string> = {
  'executive-summary': model => `Write a strong selected-month executive performance assessment across all tabs. Return one verdict and ${cardCount(model,true)} cross-report insights. Explain cash versus attendance, acquisition quality versus volume, member continuity and instructor/schedule mix where supported. Frame this month against MoM, YoY and observed YTD; do not treat historical LTV as future revenue at risk.`,
  recommendations: model => `Return ${cardCount(model,true)} evidence-led recommendations with reasoning. Each must follow from a material selected-month finding and its year context. recommendation states the considered choice; reasoning explains why, the trade-off and the alternative. Do not prescribe an owner, deadline, policy or uplift. Keep valuations conditional and distinct from actual cash.`,
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
    category:f.tone==='risk'?'red_flag':f.tone==='opportunity'?'worked':'meaning' };
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
      cards: ranked.map((f, i) => ({ ...findingCard(f), recommendation:`Consider the cited ${f.chapter} finding in the selected-month review; validate the cause and feasibility before choosing an intervention.`, reasoning:'This priority follows the calculated signal and its materiality; the calculation does not prove a recoverable cash gain or establish a cause.', focus: i === 0 ? 'kpis' : 'cross', category: 'next_step' })), generated: false };
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

async function askModel(message: string, focusIds: string[], signal?: AbortSignal, onUsage?: (usage: CallUsage) => void): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("/api/reports/narrative", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, focusIds, editorial: true }),
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

export async function generateNarratives(
  model: ReportModel,
  onProgress?: (done: number, total: number, label: string) => void,
  signal?: AbortSignal,
): Promise<Record<string, ChapterNarrative>> {
  const out: Record<string, ChapterNarrative> = {};
  const findings = findingsFor(model);
  const portfolio = portfolioPayload(model, findings);
  let done = 0;
  const finish = (spec: ChapterSpec, narrative: ChapterNarrative) => {
    out[spec.id] = narrative;
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
        const figures = spec.derived ? portfolio : data ? chapterPayload(spec,data,model,own) : "";
        if (!figures) {
          finish(spec, fallbackNarrative(spec, data, own, model));
          continue;
        }
        const focusIds = data?.groups.map(g => g.id ?? g.field) ?? [];
        const message = [
          ANALYST_ROLE,
          `You are writing the "${spec.title}" chapter of the monthly management report for ${model.scope.studio}, ${monthLabel(model.scope.month)}.`,
          DERIVED_RULES[spec.id]?.(model) ?? `Return ${cardCount(model)} cards: one "kpis" verdict card, ${data?.history.length ? "at most one \"trend\" card if the history shows something the findings do not, " : ""}and the rest as ranked insights built from the analyst findings. Breakdown IDs available for focus: ${focusIds.join(", ") || "none"}. Most breakdowns should not get their own card.`,
          spec.id === "predictions" ? "Use only the following numeric what-if scenarios for future values. Do not invent forecast ranges, confidence bands, probabilities or additional numeric forecasts.\n" + forwardScenarios(model) : "",
          CARD_RULES,
          ACCURACY_RULES,
          model.customization ? `Editorial preferences (subject to the evidence and accuracy rules above): Audience: ${model.customization.audience}. Tone: ${model.customization.tone}. Focus areas: ${(model.customization.focusAreas ?? []).join(", ") || "balanced"}. Detail: ${model.customization.detail}. Requested priorities: ${model.customization.instructions || "none"}. Do not invent figures or change metric definitions to satisfy preferences.` : "",
          "Figures:",
          figures.slice(0, Math.max(1000,80000 - portfolio.length - 8000)),
          "All-tab performance context (independent of visible chapter selection):",
          portfolio,
        ]
          .filter(Boolean)
          .join("\n\n");
        const key = cacheKey(model, spec.id, message);
        const cached = readCache(key);
        if (cached?.generated) {
          finish(spec, { ...cached, usage: cached.usage ? { ...cached.usage, fromCache: true } : { model: "", calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, durationMs: 0, costUsd: 0, fromCache: true } });
          continue;
        }
        let usage: ChapterUsage | undefined;
        try {
          const parsed = parseJson(await askModel(message, focusIds, signal, (call) => { usage = addCall(usage, call); }));
          const cards = Array.isArray(parsed?.cards)
            ? parsed!.cards.filter(
                (c): c is InsightCard =>
                  !!c && typeof c.headline === "string" && !!c.headline.trim(),
              )
            : [];
          const valid = cards.every(c => [c.meaning,c.evidence].every(v => typeof v === "string" && !!v.trim()) && !!c.focus && !!c.category && !!c.confidence);
          if (!valid || !cards.length || typeof parsed?.summary !== "string" || !parsed.summary.trim())
            throw new Error("The model returned no complete chapter analysis. Retry writing insights.");
          // The verdict leads; a model that forgot to mark one has its first card promoted.
          if (!cards.some(c => c.focus === "kpis")) cards[0] = { ...cards[0], focus: "kpis" };
          const narrative: ChapterNarrative = { summary: parsed.summary.trim(), cards, generated: true, usage };
          writeCache(key, narrative);
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
