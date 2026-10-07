import { reportFmt as fmt, reportDelta as delta, definition } from "./definitions";
import { metricNotes } from "../semantics/evidence";
import { chapters, type ChapterSpec } from "./chapters";
import { monthLabel, shiftMonth } from "./period";
import type { ChapterData, ChapterNarrative, InsightCard, ReportModel } from "./model";

const CACHE_PREFIX = "atlas-report-narrative:v6:";
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
  `${definition(id)?.label ?? id}: ${fmt(id, data.total[id])}` +
  ` (prior month ${fmt(id, data.prior[id])}, ${delta(id, data.total[id], data.prior[id])};` +
  ` same month last year ${fmt(id, data.priorYear[id])}, ${delta(id, data.total[id], data.priorYear[id])})`;

/**
 * What the model is shown for one chapter: exactly the figures the reader
 * sees, so a card can be checked against the page rather than taken on trust.
 */
export function chapterPayload(spec: ChapterSpec, data: ChapterData, model: ReportModel) {
  const parts = [
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
  return parts.join("\n\n");
}

/** Figures the derived chapters reason over: every chapter's headline movement. */
export function portfolioPayload(model: ReportModel) {
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
      return [`${definition(id)!.label}: flat scenario ${fmt(id, base)}; repeat-last-month-movement scenario ${fmt(id, projected)}. Arithmetic: ${definition(id)!.format === "percent" ? `${base} + (${base} - ${previous}), clipped to [0,1]` : `${base} × (${base} / ${previous}), floored at zero`}. These are conditional scenarios, not estimates of likelihood.`];
    });
  }).join("\n");
}

const CARD_RULES = [
  'Return JSON summary and cards with headline, meaning, evidence, action, focus, category, plainLanguage and confidence.',
  'Write a decision brief, not a verbal copy of the tables. Summary: 35–50 words, explaining the central tension and management decision.',
  'Write ONE passage for EACH requested evidence focus ID, plus exactly two distinct overall passages: one on kpis and one on trend when historical evidence exists. Use category red_flag, worked, didnt_work, meaning, next_step or plain_language according to actual evidence; never invent a failure or success to fill a category.',
  'headline: a concise finding (at most 14 words). meaning: 25–40 words on drivers, trade-offs, concentration, sample strength or an operational choice; interpret relationships and the supplied arithmetic decomposition. Explain what evidence can and cannot distinguish. Do not repeat the same claim across panels.',
  'plainLanguage: 10–18 words explaining the practical meaning without jargon. action: an assignable next step naming the role, proposed timing, the first concrete intervention and the metric that would show improvement; at most 25 words.',
  'evidence: a short sentence with exact supporting figures and comparison/sample limits; at most 20 words. confidence describes the strength of the interpretation, not a statistical confidence interval.',
  'Use only supplied figures and verified diagnostics. Separate additive contributions, changes within groups, and changes in mix. Never add overlapping distinct transaction or member counts from groups.',
  'Higher AOV alone does not establish a price increase: distinguish recorded product-mix changes from unverified pricing hypotheses. Missing-ID warnings must use the supplied coverage counts and reflect their scale. Do not assert that a price change caused demand or conversion changes without evidence.',
  'Cash sales and earned revenue are different populations. Membership revenue share is based on gross payments, never net payments. Payroll costs are estimates at the configured rate, not actual salaries.',
  'Newcomer LTV is cumulative observed spend to the source date, not first-month spend or predicted lifetime spend. Recent cohorts have less follow-up time; equal-age outcomes are needed to attribute eventual differences.',
  'Recorded lead stages are current cohort outcomes, not evidence of transitions during the selected month. Renewal grace is pending, not confirmed churn. Do not compare historical active snapshots or sum recurring and Sessions totals.',
  'Do not invent causes, policy thresholds, uplift promises, record claims beyond supplied history, or certainty from small samples. Hypotheses must include the specific check that could confirm or reject them.',
  'The kpis headline is the section statement: an impactful, specific decision-relevant finding, not a metric label or a generic claim. Keep all focus passages distinct. Use AI for trade-offs, diagnostic hypotheses, evidence limitations and action prioritisation; all figures and arithmetic are already derived by the app engine. Avoid simply converting rows into sentences.',
  'Check every comparative statement. Use percentage points for rate changes. Do not say doubled or halved unless the ratio supports it. Proposed targets and timings must be identified as proposals.',
  'Future figures may use only supplied conditional scenario arithmetic. Do not invent probabilities, confidence bands or forecast ranges, and never call those scenarios likely outcomes.',
].join('\n');

const DERIVED_RULES: Record<string, string> = {
  recommendations:
    "Write the month's strategic recommendations. Use at most four cards and do not restate the chapter summaries. Each card is one recommendation: headline states the move and the figure it targets, meaning gives the reasoning, evidence gives the supporting figures, action names the owner role and the first step. Rank by money or risk at stake.",
  predictions:
    "Write a conditional forward view for next month. Use trailing monthly series rather than only the last observation. When fewer than three populated months exist, describe scenarios without numeric forecasts. Any projected number must state its arithmetic, baseline and assumption; never present it as a recorded result. Use at most three passages. Each passage is one projection: headline states the projected figure and direction, meaning states the assumption it rests on and what would break it, evidence gives the trailing figures behind the projection, action names what to do now to change the outcome. State assumptions rather than hiding them.",
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
      const good = (change >= 0) === (definition(id)?.higherIsBetter ?? true);
      return { id, change, good };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 4);
  return {
    summary: "",
    cards: moves.map(({ id, change, good }) => ({
      headline: `${definition(id)?.label ?? id} is ${fmt(id, data.total[id])}, ${delta(id, data.total[id], data.prior[id])} on the prior month.`,
      meaning: good
        ? "Moving in the intended direction for this measure."
        : "Moving against the intended direction for this measure.",
      evidence: `${fmt(id, data.total[id])} this month, ${fmt(id, data.prior[id])} prior month`,
      action: `Review ${definition(id)?.label ?? id} against the breakdowns in this chapter and decide whether the ${Math.abs(change * 100).toFixed(1)}% move needs a response.`,
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

async function askModel(message: string, focusIds: string[], signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("/api/reports/narrative", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, focusIds, editorial: true }),
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
          data?.groups.length ? `Required evidence focus IDs: ${data.groups.map(g => g.id ?? g.field).join(", ")}. Use focus kpis for headline reasoning and trend for historical interpretation. Write one passage with its matching focus ID for EACH breakdown table: ${data.groups.map(g => g.title).join("; ")}. Do not add closing passages that duplicate breakdowns. Return ${data.groups.length + 2} concise passages, covering each breakdown plus kpis and trend.` : "",
          "Figures:",
          figures.slice(0, 48000),
        ]
          .filter(Boolean)
          .join("\n\n");
        try {
          const parsed = parseJson(await askModel(message, data?.groups.map(g => g.id ?? g.field) ?? [], signal));
          const cards = Array.isArray(parsed?.cards)
            ? parsed!.cards.filter(
                (c): c is InsightCard =>
                  !!c && typeof c.headline === "string" && !!c.headline.trim(),
              )
            : [];
          const valid = cards.every(c => [c.meaning, c.evidence, c.action, c.plainLanguage].every(v => typeof v === "string") && !!c.focus && !!c.category && !!c.confidence) && (data?.groups ?? []).every(g => cards.some(c => c.focus === (g.id ?? g.field)));
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
