import { reportFmt as fmt, reportDelta as delta, definition } from "./definitions";
import { metricNotes } from "../semantics/evidence";
import { chapters, type ChapterSpec } from "./chapters";
import { hashText, monthLabel, shiftMonth } from "./period";
import { findingsFor, findingsPayload, ledger, seasonalScenario, type Finding } from "./findings";
import type { ChapterData, ChapterNarrative, InsightCard, ReportModel } from "./model";
import { addCall, type CallUsage, type ChapterUsage } from "./usage";

const CACHE_PREFIX = "atlas-report-narrative:v7:";
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
    parts.push("Headline figures:\n" + headline.map((id) => line(id, data)).join("\n"));
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

/** What the brief and the plan reason over: the ranked cross-report findings plus every chapter's headline movement. */
export function portfolioPayload(model: ReportModel, findings: Record<string, Finding[]> = findingsFor(model)) {
  const ranked = ledger(findings);
  const valued = ranked.filter((f) => f.inr);
  return [
    findingsPayload(ranked, 30),
    valued.length ? `Valued items (indicative; items can overlap, so never add them up): ${valued.slice(0, 12).map((f) => `${f.text.split(". ")[0]} ≈ ${fmt("gross_revenue", Math.round(f.inr!))}`).join(" | ")}` : "",
    "Chapter headline figures:\n" + headlinePayload(model),
  ].filter(Boolean).join("\n\n");
}

function headlinePayload(model: ReportModel) {
  return chapters
    .filter((spec) => !spec.derived)
    .map((spec) => {
      const data = model.chapters[spec.id];
      if (!data) return "";
      return [`${spec.title}:`, ...spec.metrics.filter(id => data.total[id]!=null).map(id => line(id,data)),
        ...(data.diagnostics ?? []), ...data.groups.map(g => `${g.title}: ${g.diagnostics?.join(' ') ?? ''}. Highest rows: ${g.rows.slice(0,2).map(row => [row.g,...g.columns.map(id => `${definition(id)?.label} ${fmt(id,row[id])}`)].join(', ')).join('; ')}`),
        `Trailing series: ${data.history.map(row=>[row.month,...spec.history.slice(0,2).map(id=>`${id}=${fmt(id,row[id])}`)].join(', ')).join('; ')}`].join('\n');
    })
    .filter(Boolean)
    .join("\n\n");
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
  'Leaders have already seen every table and chart. They do not need figures read back to them. They need the so-what: why it happened, what it is worth, what it changes, what to do, who does it, and how they will know it worked.',
].join(' ');

const CARD_RULES = [
  'Return JSON with summary and cards. Each card has headline, meaning, evidence, impact, action, watch, plainLanguage, focus, category and confidence.',
  'START FROM THE ANALYST FINDINGS (F1, F2 …). They are verified arithmetic computed by the app: anomalies against the studio\'s own history, streaks, what drove a change (within-group versus mix), concentration, valued gaps, cross-chapter tensions and rule-engine signals. Choose the findings that matter most for money, risk and decisions. Combine related findings into one insight. Ignore immaterial ones.',
  'BANNED: cards that restate a figure the reader can already see without adding a driver, implication or decision. Do not walk through tables row by row. Do not write one card per table. Do not open with "X increased by Y%". Every card must answer "so what?" and "now what?".',
  'headline: a verdict with the number that matters, 16 words at most. Good: "Three 7am Barre slots are full but earn 30% less per seat than the studio average." Bad: "Fill rate was 64.2%."',
  'meaning: 60–100 words. Explain the driver (which groups or mechanism, within-group versus mix, concentration), what it implies for cash, retention, capacity or people risk, the trade-off involved, and what the evidence cannot yet distinguish together with the specific check that would settle it. Present hypotheses as hypotheses.',
  'evidence: 35 words at most. Exact supporting figures with their comparison basis (prior month, same month last year, trailing average, median, target).',
  'impact: 30 words at most. The rupees or volume at stake, using only the engine\'s valuations or simple arithmetic on supplied figures shown inline (for example "≈₹2.1L: 410 visits × ₹512"). If it cannot be valued honestly, write "Not valued:" and the reason.',
  'action: 45 words at most. Owner role, the first concrete intervention, proposed timing (this week, within 30 days) and a proposed target. Be specific about which instructor, slot, product, source or segment, and say what stops as well as what starts.',
  'watch: 25 words at most. The leading indicator and the threshold to review next month that would show the action is working or failing.',
  'plainLanguage: 10–20 words, no jargon. focus: the breakdown ID the evidence comes from, "trend" for a history-led insight, "cross" for a cross-chapter insight, "kpis" for the chapter verdict. category: red_flag, worked, didnt_work, meaning, next_step or plain_language, according to the evidence; never invent a success or failure. confidence: the strength of the interpretation, not a statistical interval.',
  'summary: 90–130 words. Give a verdict for this area this month (better, worse or mixed against last month, last year and the studio\'s own trailing average), name the two forces behind it, and name the one decision leadership needs to take. Do not list metrics.',
  'Exactly one card has focus "kpis". It is the chapter verdict and its headline becomes the chapter title, so it must be the most decision-relevant statement in the chapter.',
].join('\n');

const ACCURACY_RULES = [
  'Accuracy rules (these override style):',
  'Use only supplied figures, findings and diagnostics. Use percentage points for rate changes. Do not say doubled or halved unless the ratio supports it. Proposed targets and timings must be labelled as proposals.',
  'Separate additive contributions, changes within groups and changes in mix. Never add overlapping distinct transaction or member counts from groups, and never sum ledger items that can overlap.',
  'Higher AOV alone does not establish a price increase. Do not claim a price change caused demand or conversion changes without evidence. Missing-ID warnings must use the supplied coverage counts.',
  'Cash sales and earned (attendance-attributed) revenue are different populations. Membership revenue share is based on gross payments. Payroll costs are estimates at the configured rate, not actual salaries.',
  'Newcomer LTV is cumulative observed spend to the source date; recent cohorts have had less time. Recorded lead stages are current cohort positions, not transitions in the month. Renewal lapses are recorded Churned Dates and recent cohorts can still change. Do not compare historical active snapshots or sum recurring and Sessions totals.',
  'Do not invent causes, policy thresholds, uplift promises or certainty from small samples. Every causal idea is a hypothesis paired with the check that would confirm or reject it. Valuations are indicative and must say so where the basis is an average.',
  'Future figures may use only the supplied conditional scenario arithmetic. Never call scenarios likely outcomes or add probabilities or ranges.',
].join('\n');

const cardCount = (model: ReportModel, derived = false) => model.customization?.detail === 'Concise'
  ? derived ? '4–5' : '3–5' : derived ? '6–8' : '5–7';

const DERIVED_RULES: Record<string, (model: ReportModel) => string> = {
  'executive-summary': (model) =>
    `This is the Executive decision brief: the first and possibly only page the CEO reads. Use the cross-report findings and ledger, not just this chapter's figures. summary: 110–150 words giving the overall verdict on the month, the single biggest risk and the single biggest opportunity with rupees at stake, and the decisions required this month. Cards: one "kpis" verdict card, then ${cardCount(model, true)} more covering the most material risks and opportunities across the whole business, ranked by money at stake. Include at least one cross-chapter insight (focus "cross") that no single chapter shows, for example demand versus cash, popularity versus conversion, or volume versus quality.`,
  recommendations: (model) =>
    `Write next month's operating plan. Do not restate chapter findings; turn them into decisions. Return ${cardCount(model, true)} cards ranked by rupees at stake, each one recommendation. headline: a verb-led move with its target (for example "Move two sub-40% PowerCycle slots to the 6pm peak to recover ≈₹1.2L a month"). meaning: why this beats the alternatives, why now, and the risk of acting and of not acting. evidence: the findings behind it. impact: the rupee estimate, with the arithmetic and an explicit, conservative assumption (for example "recovering a quarter of the gap"). action: owner role, the first step this week and a 30-day milestone. watch: the KPI and threshold for next month's review. The plan must include at least one quick win executable within 14 days and at least one "stop or reduce" decision where the evidence supports it; include a people/instructor or member-experience move if the evidence supports one. The first card has focus "kpis" and is the single most important move; the rest use focus "cross". Use category next_step, or red_flag for urgent risk mitigation.`,
  predictions: () =>
    'Write a conditional forward view for next month. Compare the flat, repeat-last-movement, three-month run-rate and seasonal scenarios and explain which assumptions separate them; never call any of them the likely outcome. Use at most four cards. headline: the scenario range for a key metric and what decides where it lands. meaning: the assumption each scenario rests on, what would break it, and which current finding pushes towards the better or worse end. evidence: the trailing figures. impact: the rupee difference between scenarios where it can be computed. action: what to do now to land at the better end. watch: the leading indicator to check in the first two weeks of next month, with its threshold. The first card has focus "kpis"; the rest use "trend".',
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

/**
 * Rule-based cards, used when no provider answers. They are returned with
 * `generated: false` and the document labels them, so deterministic copy is
 * never mistaken for analysis.
 */
export function fallbackNarrative(spec: ChapterSpec, data: ChapterData | undefined, findings: Finding[] = []): ChapterNarrative {
  if (!data || spec.derived)
    return { summary: "", cards: [], generated: false };
  // Engine findings already say something a table does not; lead with them.
  const flagged: InsightCard[] = findings.slice(0, 4).map((f) => {
    const [headline, ...rest] = f.text.split(/(?<=[.:])\s+/);
    return {
      headline: headline.replace(/[.:]$/, ""),
      meaning: rest.join(" ") || f.text,
      evidence: f.text,
      impact: f.inr ? `≈${fmt("gross_revenue", Math.round(f.inr))} at stake (indicative).` : undefined,
      action: f.tone === "risk" ? "Assign an owner to confirm the cause and agree a response before the next monthly review." : "Assign an owner to size and test this opportunity before the next monthly review.",
      focus: f.focus,
      category: f.tone === "risk" ? "red_flag" : f.tone === "opportunity" ? "next_step" : "meaning",
    };
  });
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
    summary: "",
    cards: [...flagged, ...moves.map(({ id, change, good }) => ({
      headline: `${definition(id)?.label ?? id} is ${fmt(id, data.total[id])}, ${delta(id, data.total[id], data.prior[id])} on the prior month.`,
      meaning: good
        ? "Moving in the intended direction for this measure."
        : "Moving against the intended direction for this measure.",
      evidence: `${fmt(id, data.total[id])} this month, ${fmt(id, data.prior[id])} prior month`,
      action: `Review ${definition(id)?.label ?? id} against the breakdowns in this chapter and decide whether the ${Math.abs(change * 100).toFixed(1)}% move needs a response.`,
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
    if (response.status !== 429 || attempt >= RETRY_DELAYS_MS.length)
      throw new Error(payload.error || "Unable to generate.");
    await wait(RETRY_DELAYS_MS[attempt], signal);
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
        const figures = spec.derived ? portfolio
          : data ? chapterPayload(spec, data, model, own) + (spec.id === "executive-summary" ? "\n\nCross-report context:\n" + portfolio : "") : "";
        if (!figures) {
          finish(spec, fallbackNarrative(spec, data, own));
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
          model.customization ? `Editorial preferences (subject to the evidence and accuracy rules above): Audience: ${model.customization.audience}. Tone: ${model.customization.tone}. Detail: ${model.customization.detail}. Requested priorities: ${model.customization.instructions || "none"}. Do not invent figures or change metric definitions to satisfy preferences.` : "",
          "Figures:",
          figures.slice(0, 52000),
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
          const valid = cards.every(c => [c.meaning, c.evidence, c.action, c.plainLanguage].every(v => typeof v === "string") && !!c.focus && !!c.category && !!c.confidence);
          if (!valid || !cards.length || typeof parsed?.summary !== "string" || !parsed.summary.trim())
            throw new Error("The model returned no complete chapter analysis. Retry writing insights.");
          // The verdict leads; a model that forgot to mark one has its first card promoted.
          if (!cards.some(c => c.focus === "kpis")) cards[0] = { ...cards[0], focus: "kpis" };
          const narrative: ChapterNarrative = { summary: parsed.summary.trim(), cards, generated: true, usage };
          writeCache(key, narrative);
          finish(spec, narrative);
        } catch (error) {
          if (signal?.aborted) throw error;
          finish(spec, { ...fallbackNarrative(spec, data, own), error: error instanceof Error ? error.message : String(error), usage });
        }
      }
    }),
  );
  onProgress?.(selected.length, selected.length, "Narratives complete");
  return out;
}
