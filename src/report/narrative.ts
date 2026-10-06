import { fmt, delta } from "../semantics/formats";
import { metricNotes } from "../semantics/evidence";
import { metrics } from "../semantics/metrics";
import { chapters, type ChapterSpec } from "./chapters";
import { monthLabel, shiftMonth } from "./period";
import type { ChapterData, ChapterNarrative, InsightCard, ReportModel } from "./model";

const CACHE_PREFIX = "atlas-report-narrative:v4:";
const cacheKey = (model: ReportModel, chapterId: string) =>
  `${CACHE_PREFIX}${model.scope.studio}:${model.scope.month}:${model.figuresHash}:${chapterId}`;

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
  `${metrics[id]?.label ?? id}: ${fmt(id, data.total[id], true)}` +
  ` (prior month ${fmt(id, data.prior[id], true)}, ${delta(id, data.total[id], data.prior[id])};` +
  ` same month last year ${fmt(id, data.priorYear[id], true)}, ${delta(id, data.total[id], data.priorYear[id])})`;

/**
 * What the model is shown for one chapter: exactly the figures the reader
 * sees, so a card can be checked against the page rather than taken on trust.
 */
export function chapterPayload(spec: ChapterSpec, data: ChapterData, model: ReportModel) {
  const parts = [
    `Chapter: ${spec.title}. Studio: ${model.scope.studio}. Month: ${monthLabel(model.scope.month)}.`,
    `Comparisons are against ${monthLabel(shiftMonth(model.scope.month, -1))} and ${monthLabel(shiftMonth(model.scope.month, -12))}.`,
    `Contributing records: ${data.n.toLocaleString("en-IN")}.`,
    "Definitions: " + spec.metrics.map(id => `${id}: ${metrics[id]?.label ?? id}. ${metricNotes[id]?.definition ?? ""} Governed calculation: ${metrics[id]?.description ?? "unavailable"}. ${metricNotes[id]?.caveat ?? ""}`).join("; "),
    "Membership revenue share is a share of gross collected payments, not net revenue. Newcomer lifetime value and return counts are observed to the source snapshot date: recent cohorts have less time to mature, so lower observed values do not prove weaker eventual outcomes. Churn outcomes can mature as renewals are recorded. Current-snapshot metrics cannot reconstruct historical member counts. Ranked tables omit groups below three contributing records and may be truncated; totals include all groups. Session revenue is attendance attribution, not cash sales.",
  ];
  const headline = spec.metrics.filter((id) => data.total[id] != null);
  if (headline.length)
    parts.push("Headline figures:\n" + headline.map((id) => line(id, data)).join("\n"));
  for (const group of data.groups) {
    const head = ["Group", ...group.columns.map((id) => metrics[id]?.label ?? id)].join(" | ");
    const body = group.rows
      .map((row) =>
        [row.g, ...group.columns.map((id) => fmt(id, row[id], true))].join(" | "),
      );
    parts.push(`${group.title} (by ${group.field}):\n${head}\n${body.join("\n")}`);
  }
  if (data.history.length > 1) {
    const ids = spec.history.filter((id) => data.history.some((row) => row[id] != null));
    if (ids.length)
      parts.push(
        "Trailing months:\n" +
          ["Month", ...ids.map((id) => metrics[id]?.label ?? id)].join(" | ") +
          "\n" +
          data.history
            .map((row) => [row.month, ...ids.map((id) => fmt(id, row[id], true))].join(" | "))
            .join("\n"),
      );
  }
  return parts.join("\n\n");
}

/** Figures the derived chapters reason over: every chapter's headline movement. */
export function portfolioPayload(model: ReportModel) {
  return chapters
    .filter((spec) => !spec.derived)
    .map((spec) => {
      const data = model.chapters[spec.id];
      if (!data) return "";
      return chapterPayload(spec, data, model);
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
      if (metrics[id].format !== "percent" && previous === 0) return [];
      const projected = metrics[id].format === "percent"
        ? Math.min(1, Math.max(0, base + (base - previous)))
        : Math.max(0, base * (base / previous));
      return [`${metrics[id].label}: flat scenario ${fmt(id, base, true)}; repeat-last-month-movement scenario ${fmt(id, projected, true)}. Arithmetic: ${metrics[id].format === "percent" ? `${base} + (${base} - ${previous}), clipped to [0,1]` : `${base} × (${base} / ${previous}), floored at zero`}. These are conditional scenarios, not estimates of likelihood.`];
    });
  }).join("\n");
}

const CARD_RULES = [
  'Return JSON only, in exactly this shape: {"summary":"...","cards":[{"headline":"...","meaning":"...","evidence":"...","action":"..."}]}',
  "summary: four to six substantive sentences for a senior management reader, leading with the single finding that most changes a decision.",
  "cards: six to eight editorial passages, fewer only when evidence is sparse. Cover headline movement, YoY context, strongest and weakest breakdowns, mix/concentration, historical trend, risks, data limitations and management response.",
  "headline: one sentence, the finding itself, with the number in it. Never a label like 'Strong performance'.",
  "meaning: three to five connected sentences explaining the finding, comparison and operational implication. Include hypotheses explicitly as hypotheses; do not claim a cause without evidence. Write readable report prose, not a rigid checklist.",
  "evidence: a short readable sentence naming the source breakdown and supporting figures, sample size and missing comparisons where relevant.",
  "action: one specific next step with owner role, timing and the metric to review. Not 'monitor this' — say what to change and where.",
  "Every card must be about a different row or a different relationship between rows. No two cards may share an action.",
  "Rank matters: lead with whatever carries the most money or the most risk.",
  "Use only the figures supplied below. Do not query anything and do not invent a number.",
  "Do not mix cash-sales and session-attributed revenue growth rates or claim that cash AOV explains session revenue. Identify the population of every ratio and amount. A share of gross payments cannot be applied to net revenue.",
  "Do not declare targets or thresholds as studio policy. Suggested targets must explicitly be proposals. Do not claim a record, consecutive growth or an all-time high/low beyond the supplied populated months.",
  "Check every comparison against the supplied current, prior and prior-year values. Do not say doubled or halved unless the actual ratio supports it. Do not describe conditional scenarios as likely, expected or probable outcomes.",
  "Lifetime value is cumulative observed spend to the source snapshot, never first-month LTV. Do not dismiss cohort maturity as an explanation: without equal follow-up windows the data cannot establish the eventual LTV difference.",
  "A newer cohort has a shorter observation window for return visits and lifetime spend: discuss this before interpreting weaker observed LTV as a performance decline. Separate cohort maturity from recorded conversion outcomes.",
].join("\n");

const DERIVED_RULES: Record<string, string> = {
  recommendations:
    "Write the month's strategic recommendations. Each card is one recommendation: headline states the move and the figure it targets, meaning gives the reasoning, evidence gives the supporting figures, action names the owner role and the first step. Rank by money or risk at stake.",
  predictions:
    "Write a conditional forward view for next month. Use trailing monthly series rather than only the last observation. When fewer than three populated months exist, describe scenarios without numeric forecasts. Any projected number must state its arithmetic, baseline and assumption; never present it as a recorded result. Each passage is one projection: headline states the projected figure and direction, meaning states the assumption it rests on and what would break it, evidence gives the trailing figures behind the projection, action names what to do now to change the outcome. State assumptions rather than hiding them.",
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
export function fallbackNarrative(spec: ChapterSpec, data: ChapterData | undefined): ChapterNarrative {
  if (!data || spec.derived)
    return { summary: "", cards: [], generated: false };
  const moves = spec.metrics
    .filter((id) => data.total[id] != null && data.prior[id] != null && Number(data.prior[id]) !== 0)
    .map((id) => {
      const change = Number(data.total[id]) / Number(data.prior[id]) - 1;
      const good = (change >= 0) === (metrics[id]?.higherIsBetter ?? true);
      return { id, change, good };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 4);
  return {
    summary: "",
    cards: moves.map(({ id, change, good }) => ({
      headline: `${metrics[id]?.label ?? id} is ${fmt(id, data.total[id], true)}, ${delta(id, data.total[id], data.prior[id])} on the prior month.`,
      meaning: good
        ? "Moving in the intended direction for this measure."
        : "Moving against the intended direction for this measure.",
      evidence: `${fmt(id, data.total[id], true)} this month, ${fmt(id, data.prior[id], true)} prior month`,
      action: `Review ${metrics[id]?.label ?? id} against the breakdowns in this chapter and decide whether the ${Math.abs(change * 100).toFixed(1)}% move needs a response.`,
    })),
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

async function askModel(message: string, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("/api/reports/narrative", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, page: 0, filters: {}, saveHistory: false, history: [] }),
    });
    const payload = await response.json();
    if (response.ok) return String(payload.answer || "").trim();
    if (response.status !== 429 || attempt >= RETRY_DELAYS_MS.length)
      throw new Error(payload.error || "Unable to generate.");
    await wait(RETRY_DELAYS_MS[attempt], signal);
  }
}

/**
 * One call per chapter. Cached on the figures, so re-running a month whose
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
  const portfolio = portfolioPayload(model);
  let done = 0;
  const finish = (spec: ChapterSpec, narrative: ChapterNarrative) => {
    out[spec.id] = narrative;
    done++;
    onProgress?.(done, chapters.length, spec.title);
  };
  const pending = [...chapters];
  onProgress?.(0, chapters.length, chapters[0].title);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
      while (pending.length) {
        if (signal?.aborted) return;
        const spec = pending.shift()!;
        const key = cacheKey(model, spec.id);
        const cached = readCache(key);
        if (cached?.generated) {
          finish(spec, cached);
          continue;
        }
        const data = model.chapters[spec.id];
        const figures = spec.derived ? portfolio : data ? chapterPayload(spec, data, model) + (spec.id === "executive-summary" ? "\n\nCross-chapter context:\n" + portfolio : "") : "";
        if (!figures) {
          finish(spec, fallbackNarrative(spec, data));
          continue;
        }
        const message = [
          `You are a studio performance analyst writing the "${spec.title}" chapter of a board report for ${model.scope.studio}, ${monthLabel(model.scope.month)}.`,
          DERIVED_RULES[spec.id] ?? "",
          spec.id === "predictions" ? "Use only the following numeric what-if scenarios for future values. Do not invent forecast ranges, confidence bands, probabilities or additional numeric forecasts. Explain the arithmetic and assumptions in prose, and compare with the trailing history.\n" + forwardScenarios(model) : "",
          CARD_RULES,
          data?.groups.length ? `Passage order: the first two passages explain the chapter headline and trend. Then write one passage for EACH of these breakdown tables in this exact order: ${data.groups.map(g => g.title).join("; ")}. End with one or two passages on risk, limitations and next steps. Return at least ${data.groups.length + 3} passages so each table has commentary.` : "",
          "Figures:",
          figures.slice(0, 48000),
        ]
          .filter(Boolean)
          .join("\n\n");
        try {
          const parsed = parseJson(await askModel(message, signal));
          const cards = Array.isArray(parsed?.cards)
            ? parsed!.cards.filter(
                (c): c is InsightCard =>
                  !!c && typeof c.headline === "string" && !!c.headline.trim(),
              )
            : [];
          const valid = cards.every(c => [c.meaning, c.evidence, c.action].every(v => typeof v === "string"));
          if (!valid || !cards.length || typeof parsed?.summary !== "string" || !parsed.summary.trim())
            throw new Error("The model returned no complete chapter analysis. Retry writing insights.");
          const narrative: ChapterNarrative = cards.length
            ? { summary: String(parsed?.summary ?? "").trim(), cards, generated: true }
            : fallbackNarrative(spec, data);
          if (narrative.generated) writeCache(key, narrative);
          finish(spec, narrative);
        } catch (error) {
          if (signal?.aborted) throw error;
          finish(spec, { ...fallbackNarrative(spec, data), error: error instanceof Error ? error.message : String(error) });
        }
      }
    }),
  );
  onProgress?.(chapters.length, chapters.length, "Narratives complete");
  return out;
}
