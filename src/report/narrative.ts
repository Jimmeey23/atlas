import { reportFmt as fmt, reportDelta as delta, definition } from "./definitions";
import { metricNotes } from "../semantics/evidence";
import { chapters, type ChapterSpec } from "./chapters";
import { monthLabel, shiftMonth } from "./period";
import { findingsFor, findingsPayload, ledger, seasonalScenario, type Finding } from "./findings";
import { INSIGHT_LENSES, type ChapterData, type ChapterNarrative, type InsightCard, type ReportModel } from "./model";
import { reportOptions } from "./options";
import { addCall, type CallUsage, type ChapterUsage } from "./usage";
import { cardsFromDocument, cleanDocument, exhibitCatalog } from "./document";

const CACHE_PREFIX = "atlas-report-narrative:v14:";
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

/** Section counts per chapter kind; a thin chapter writes fewer sections rather than padding. */
const SHAPE: Record<string, { sections: string; recs: string; words: string }> = {
  "executive-summary": { sections: "9–13", recs: "10–13", words: "4,000–6,000" },
  recommendations: { sections: "3–4", recs: "13–17", words: "3,000–4,500" },
  predictions: { sections: "5–8", recs: "4–6", words: "2,000–3,000" },
};

/**
 * v4: the chapter is written as a long-form analyst report, in the shape of
 * the studio's hand-written monthly reviews: a lede, numbered sections that
 * each argue one point in prose with their exhibits and evidence, numbered
 * recommendations with reasoning and expected impact, and a method note.
 */
function documentRules(model: ReportModel, spec: ChapterSpec) {
  const o = reportOptions(model.customization);
  const shape = SHAPE[spec.id] ?? { sections: "9–13", recs: "9–13", words: "3,500–5,500" };
  const catalog = exhibitCatalog(model, spec);
  return [
    "FORMAT: You are writing one chapter of a long-form monthly studio report, read top to bottom like a written analyst review — not slides, not cards, not bullet points. The text carries the argument; charts and tables prove it. Aim for " + shape.words + " words in total, with roughly one exhibit for every 250–350 words of prose.",
    "Return JSON with summary, verdict, document and questions.",
    "summary: the chapter's lede printed under its title, 80–140 words: the headline figure with its comparison, what sits underneath it, and the two findings that matter most, each with its number. Plain declarative sentences.",
    "verdict: the chapter's single conclusion for the report cover — headline at most 16 words with the key number; meaning 30–60 words; lens; priority; impact (value at stake with arithmetic, or empty string); metrics 1–4 ids from AVAILABLE METRIC IDS; confidence.",
    `document.sections: ${shape.sections} sections in reading order. Never pad: a chapter with little evidence writes fewer, and no two sections may argue the same movement. The first section is titled exactly "Start here".`,
    "Each section:",
    "- title: 2–6 words, sentence case, naming the topic or stating the finding plainly (e.g. 'The base is widening', 'Where the money came from', 'The commitment-length problem', 'Who sold it', 'Discounting'). No figures. Unique.",
    "- sub: one sentence of 10–30 words printed under the heading — the section's thesis as a claim, not a label (e.g. 'Half the churn is people who never engaged. Half is people who engaged and then withdrew.').",
    "- paragraphs: 2–4 paragraphs of 70–150 words. Argue, do not list: state the figure with its comparison, decompose it (which rows, mix or rate moved it and by how much), then say what it means for the business and what the obvious reading misses. Put the single most important claim of each paragraph in **double asterisks**, as a whole phrase with its number (one or two bold spans per paragraph). *Single asterisks* italicise a word for stress, sparingly. No bullets, headings, lists or 'In conclusion'.",
    "- Start here has 3–5 paragraphs: the top line and whether it can be taken at face value; then the findings underneath it, each opening with a bold lead sentence such as **First, the month was funded by people the studio already had.** Its callout is titled 'The one-line version, if you read nothing else' (60–100 words).",
    "- callout: null, or { title: the reframe as a full sentence of at most 18 words, body: 50–110 words }. Use one in at most a third of sections, for what a leader must not miss: what a figure means commercially, a misleading comparison, a definitional trap.",
    "- exhibits: 1–2 per section (every section except Start here needs at least one). ref must come from EXHIBITS below; view chart or table; caption: a sentence-case title of what it shows (at most 14 words, e.g. 'Visits per active member, by month — sliding since mid-2025'); note: 15–45 words telling the reader what to see in it, with a number; highlight: up to 4 row labels copied exactly from that breakdown, else [].",
    "- evidence: the full table behind the argument, folded under the section — { title starting 'Evidence — ', ref (a group or kpis ref), note: 20–50 words on how to read it or its caveat } — or null. Give roughly half of the sections an evidence fold, preferring those that rest on a breakdown. Use each breakdown somewhere in the chapter where it informs the argument; reuse an exhibit only in a different view.",
    "- lens: which leadership question it answers (" + INSIGHT_LENSES.map(l => l.id).join(", ") + "); priority high, medium or low.",
    `document.recommendations: ${shape.recs} numbered actions ordered by expected value, each following from a section. title: an imperative of at most 14 words (e.g. 'Book the second visit before the member leaves the building'); owner: the team best placed to act; horizon; reasoning: 40–90 words citing the exact supplied figures that justify the action, the key figure in **double asterisks**; impact: 40–90 words on what changes and its indicative size, with the arithmetic when it rests on an average, labelled indicative — never a promised uplift.`,
    "document.method: 2–4 paragraphs of 40–100 words for 'Method and limitations': what was read (sources, record counts, scope and period), how the key terms are defined, and what the data cannot show or which comparisons are unsafe.",
    `Comparison emphasis: ${COMPARISON_FOCUS[o.comparisonFocus]}`,
    o.quantifyImpact ? "Value what is at stake in rupees, members, seats or sessions wherever the figures allow, with the arithmetic." : "Do not value impact in rupees unless a supplied figure states it.",
    "questions: 6–8 hard questions senior leadership is likely to ask about this chapter, each with a 25–60 word evidence-based answer; say plainly when the data cannot answer.",
    "EXHIBITS (ref: what it shows):\n" + (catalog.length ? catalog.map(e => `${e.ref}: ${e.describe}`).join("\n") : "none — sections carry prose only"),
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

/** What each derived chapter is about, for the long-form document. */
const DERIVED_DOCUMENT: Record<string, string> = {
  'executive-summary': 'This is the studio overview: the whole month across every chapter in one reading. Its sections connect the chapters — cash against attendance, acquisition volume against quality, continuity, instructors and the timetable — and each section names the chapter whose figures it rests on. Do not treat historical LTV as future revenue at risk. Recommendations are the cross-report priorities.',
  recommendations: 'This chapter is the action plan. Its few sections explain how the actions were chosen and ranked and what they share; the weight is in the recommendations, each following from a material selected-month finding named in its reasoning, with the trade-off and guardrail in its impact. Owners are teams, never people. Keep valuations conditional and distinct from actual cash.',
  predictions: 'This chapter explains only the supplied conditional scenarios: what next month looks like if the month repeats, if last month\'s movement repeats, at the three-month run rate and with last year\'s seasonality, and which leading signals would tell them apart. These are not forecasts: no probabilities, ranges or invented numbers. Its recommendations are the signals to watch and the review to hold.',
};

type ParsedChapter = { summary?: string; cards?: InsightCard[] } & Partial<Pick<ChapterNarrative, "briefing" | "decision" | "performers" | "questions">>;
/** Keeps only well-formed v3 sections; a malformed one is dropped and the page falls back to the verdict card. */
function chapterExtras(parsed: ParsedChapter): Partial<ChapterNarrative> {
  const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const list = (v: unknown) => Array.isArray(v) ? v.map(text).filter(Boolean) : [];
  const out: Partial<ChapterNarrative> = {};
  const b = parsed.briefing;
  if (b && list(b.takeaways).length) out.briefing = { takeaways: list(b.takeaways), whatChanged: text(b.whatChanged), whyItMoved: text(b.whyItMoved), whereItSits: text(b.whereItSits), whatHeldUp: text(b.whatHeldUp), outlook: text(b.outlook), soWhat: text(b.soWhat) };
  const d = parsed.decision;
  if (d && text(d.call)) out.decision = { call: text(d.call), rationale: text(d.rationale), evidence: list(d.evidence), expectedImpact: text(d.expectedImpact), successMeasure: text(d.successMeasure), risks: text(d.risks), alternative: text(d.alternative), owner: text(d.owner) || undefined, horizon: text(d.horizon) || undefined };
  const p = parsed.performers;
  if (p && [p.leaders, p.laggards, p.pattern].some(text)) out.performers = { leaders: text(p.leaders), laggards: text(p.laggards), pattern: text(p.pattern) };
  const q = Array.isArray(parsed.questions) ? parsed.questions.filter(x => x && text(x.q) && text(x.a)).map(x => ({ q: text(x.q), a: text(x.a) })) : [];
  if (q.length) out.questions = q;
  return out;
}

function parseJson(answer: string): ParsedChapter | null {
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
          documentRules(model, spec),
          `You are writing the "${spec.title}" chapter of the monthly management report for ${model.scope.studio}, ${monthLabel(model.scope.month)}.`,
          DERIVED_DOCUMENT[spec.id] ?? `Build the sections from the analyst findings, the breakdowns and the monthly history: the findings say what matters, the breakdowns and trends are the exhibits that prove it.`,
          "AVAILABLE METRIC IDS (id: label): " + metricIds.map(id => `${id}: ${definition(id)?.label ?? id}`).join("; "),
          preferences ? `Editorial preferences (subject to the evidence and accuracy rules above): ${preferences.slice(0, 8000)}${preferences.length > 8000 ? " [Long editorial preferences shortened.]" : ""} Do not invent figures or change metric definitions to satisfy preferences.` : "",
        ], [
          ...(spec.id === "predictions" ? [{ label: "Use only the following numeric what-if scenarios for future values. Do not invent forecast ranges, confidence bands, probabilities or additional numeric forecasts.", text: forwardScenarios(model) }] : []),
          // Derived chapters already reason over the portfolio; send it once.
          ...(!spec.derived ? [{ label: "Figures:", text: figures }] : []),
          { label: "All-tab performance context (independent of visible chapter selection):", text: portfolio },
        ]);
        const refs = exhibitCatalog(model, spec).map(e => e.ref);
        const extra = { insightVersion: 4, metricIds, exhibitRefs: refs, lenses: o.lenses };
        // Include complete pre-budget evidence: changes to omitted records must invalidate reuse too.
        const fingerprint = await analysisKey({ version: 14, providerModel, providerPolicy, message, focusIds, extra,
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
            { ...extra, analysisKey: fingerprint })) as (ParsedChapter & { verdict?: InsightCard; document?: unknown }) | null;
          const document = cleanDocument(parsed?.document, refs);
          const v = parsed?.verdict;
          if (!document || !v || typeof v.headline !== "string" || !v.headline.trim() || typeof parsed?.summary !== "string" || !parsed.summary.trim())
            throw new Error("The model returned no complete chapter analysis. Retry writing insights.");
          // Cited ids outside this chapter's figures would render as blank evidence.
          const verdict: InsightCard = { ...v, evidence: v.evidence || v.meaning, action: v.action ?? "", focus: "kpis", metrics: (Array.isArray(v.metrics) ? v.metrics : []).filter(id => metricIds.includes(id)).slice(0, 4) };
          const narrative: ChapterNarrative = { summary: parsed.summary.trim(), document, cards: cardsFromDocument(document, verdict, spec.id === "recommendations"),
            generated: true, usage, analysisKey: fingerprint, ...chapterExtras(parsed) };
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
