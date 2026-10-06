import { fmt, delta } from "../semantics/formats";
import { metrics } from "../semantics/metrics";
import { chapters, type ChapterSpec } from "./chapters";
import { monthLabel, shiftMonth } from "./period";
import type { ChapterData, ChapterNarrative, InsightCard, ReportModel } from "./model";

const CACHE_PREFIX = "atlas-report-narrative:";
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
  ];
  const headline = spec.metrics.filter((id) => data.total[id] != null);
  if (headline.length)
    parts.push("Headline figures:\n" + headline.map((id) => line(id, data)).join("\n"));
  for (const group of data.groups) {
    const head = ["Group", ...group.columns.map((id) => metrics[id]?.label ?? id)].join(" | ");
    const body = group.rows
      .slice(0, 12)
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
function portfolioPayload(model: ReportModel) {
  return chapters
    .filter((spec) => !spec.derived)
    .map((spec) => {
      const data = model.chapters[spec.id];
      if (!data) return "";
      const ids = spec.metrics.filter((id) => data.total[id] != null);
      return `${spec.title}\n${ids.map((id) => line(id, data)).join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

const CARD_RULES = [
  'Return JSON only, in exactly this shape: {"summary":"...","cards":[{"headline":"...","meaning":"...","evidence":"...","action":"..."}]}',
  "summary: two to three sentences for a senior management reader, leading with the single finding that most changes a decision.",
  "cards: four to six of them.",
  "headline: one sentence, the finding itself, with the number in it. Never a label like 'Strong performance'.",
  "meaning: one to two sentences on the mechanism — why the figure looks like this and what it implies.",
  "evidence: the figures the claim rests on, comma separated. Numbers only, no prose.",
  "action: one specific, assignable next step. Not 'monitor this' — say what to change and where.",
  "Every card must be about a different row or a different relationship between rows. No two cards may share an action.",
  "Rank matters: lead with whatever carries the most money or the most risk.",
  "Use only the figures supplied below. Do not query anything and do not invent a number.",
].join("\n");

const DERIVED_RULES: Record<string, string> = {
  recommendations:
    "Write the month's strategic recommendations. Each card is one recommendation: headline states the move and the figure it targets, meaning gives the reasoning, evidence gives the supporting figures, action names the owner role and the first step. Rank by money or risk at stake.",
  predictions:
    "Write the forward view for next month. Each card is one projection: headline states the projected figure and direction, meaning states the assumption it rests on and what would break it, evidence gives the trailing figures behind the projection, action names what to do now to change the outcome. State assumptions rather than hiding them.",
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
    const response = await fetch("/api/intelligence/ask", {
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
        if (cached) {
          finish(spec, cached);
          continue;
        }
        const data = model.chapters[spec.id];
        const figures = spec.derived ? portfolio : data ? chapterPayload(spec, data, model) : "";
        if (!figures) {
          finish(spec, fallbackNarrative(spec, data));
          continue;
        }
        const message = [
          `You are a studio performance analyst writing the "${spec.title}" chapter of a board report for ${model.scope.studio}, ${monthLabel(model.scope.month)}.`,
          DERIVED_RULES[spec.id] ?? "",
          CARD_RULES,
          "Figures:",
          figures.slice(0, 9000),
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
          const narrative: ChapterNarrative = cards.length
            ? { summary: String(parsed?.summary ?? "").trim(), cards, generated: true }
            : fallbackNarrative(spec, data);
          if (narrative.generated) writeCache(key, narrative);
          finish(spec, narrative);
        } catch (error) {
          if (signal?.aborted) throw error;
          finish(spec, fallbackNarrative(spec, data));
        }
      }
    }),
  );
  onProgress?.(chapters.length, chapters.length, "Narratives complete");
  return out;
}
