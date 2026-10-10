import type { ChapterNarrative } from "./model";

/** One provider call's billed tokens, as returned by /api/reports/narrative. */
export interface CallUsage {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** Included in outputTokens; reported separately because it is invisible in the prose. */
  reasoningTokens: number;
  durationMs: number;
  /** The server reused a completed chapter; there was no provider call. */
  fromCache?: boolean;
}
/** Everything one chapter cost in this run, including retries and rejected answers. */
export interface ChapterUsage extends Omit<CallUsage, "model"> {
  model: string;
  calls: number;
  costUsd: number | null;
  /** Reused from the local narrative cache: nothing was billed in this run. */
  fromCache?: boolean;
}

/**
 * OpenAI standard-tier list prices, USD per million tokens. Checked on
 * 2026-10-09 against developers.openai.com/api/docs/pricing. A model missing
 * here shows its tokens with the cost marked unavailable rather than guessed.
 */
export const PRICES_AS_OF = "2026-10-09";
const PRICES: Record<string, { input: number; cached?: number; output: number }> = {
  "gpt-5.6-sol": { input: 4, cached: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  "gpt-5.5-pro": { input: 30, output: 180 },
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.4-pro": { input: 30, output: 180 },
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cached: 0.02, output: 1.25 },
  "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
  "gpt-5.2-pro": { input: 21, output: 168 },
  "gpt-5.2": { input: 1.75, cached: 0.175, output: 14 },
  "gpt-5.1": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5-pro": { input: 15, output: 120 },
  "gpt-5-mini": { input: 0.25, cached: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cached: 0.005, output: 0.4 },
  "gpt-5": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cached: 0.025, output: 0.4 },
  "gpt-4.1": { input: 2, cached: 0.5, output: 8 },
  "gpt-4o-2024-05-13": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.6 },
  "gpt-4o": { input: 2.5, cached: 1.25, output: 10 },
  "o3-pro": { input: 20, output: 80 },
  "o3-mini": { input: 1.1, cached: 0.55, output: 4.4 },
  "o3": { input: 2, cached: 0.5, output: 8 },
  "o4-mini": { input: 1.1, cached: 0.275, output: 4.4 },
};
// Longest key first, so "gpt-5-mini-2025-08-07" resolves to gpt-5-mini rather than gpt-5.
const KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length);
export function priceFor(model: string) {
  const id = model.toLowerCase().trim();
  const key = KEYS.find((k) => id === k || id.startsWith(k + "-"));
  return key ? PRICES[key] : null;
}

export function costUsd(usage: Pick<CallUsage, "model" | "inputTokens" | "cachedInputTokens" | "outputTokens">) {
  const price = priceFor(usage.model);
  if (!price) return null;
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  return ((usage.inputTokens - cached) * price.input + cached * (price.cached ?? price.input) + usage.outputTokens * price.output) / 1e6;
}

/** Fold one call into a chapter's running usage. */
export function addCall(total: ChapterUsage | undefined, call: CallUsage): ChapterUsage {
  if (call.fromCache) return total ?? { ...call, calls: 0, costUsd: 0, fromCache: true };
  const cost = costUsd(call);
  return {
    model: call.model,
    calls: (total?.calls ?? 0) + 1,
    inputTokens: (total?.inputTokens ?? 0) + call.inputTokens,
    cachedInputTokens: (total?.cachedInputTokens ?? 0) + call.cachedInputTokens,
    outputTokens: (total?.outputTokens ?? 0) + call.outputTokens,
    reasoningTokens: (total?.reasoningTokens ?? 0) + call.reasoningTokens,
    durationMs: (total?.durationMs ?? 0) + call.durationMs,
    costUsd: cost == null || (total && total.costUsd == null) ? null : (total?.costUsd ?? 0) + cost,
  };
}

export interface RunSummary {
  models: string[];
  chapters: number;
  written: number;
  fromCache: number;
  failed: number;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** Sum of provider time across calls. */
  providerMs: number;
  costUsd: number;
  /** True when a model's price is unknown, so costUsd undercounts. */
  costIncomplete: boolean;
}
/** What this run cost. Cached chapters are counted, but contribute nothing billed. */
export function summariseUsage(narratives: Record<string, ChapterNarrative>): RunSummary {
  const all = Object.values(narratives);
  const billed = all.map((n) => n.usage).filter((u): u is ChapterUsage => !!u && !u.fromCache);
  const sum = (key: "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens" | "durationMs" | "calls") => billed.reduce((s, u) => s + (u[key] ?? 0), 0);
  return {
    models: [...new Set(billed.map((u) => u.model))],
    chapters: all.length,
    written: all.filter((n) => n.generated && !n.usage?.fromCache).length,
    fromCache: all.filter((n) => n.usage?.fromCache).length,
    failed: all.filter((n) => n.error).length,
    calls: sum("calls"),
    inputTokens: sum("inputTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    outputTokens: sum("outputTokens"),
    reasoningTokens: sum("reasoningTokens"),
    providerMs: sum("durationMs"),
    costUsd: billed.reduce((s, u) => s + (u.costUsd ?? 0), 0),
    costIncomplete: billed.some((u) => u.costUsd == null),
  };
}
