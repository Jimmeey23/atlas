import { chapters, type ChapterSpec } from "./chapters";
import type { ChapterNarrative, InsightCard } from "./model";
import { reportedElsewhere } from "./ownership";

/**
 * A report states each fact once. Chapters are written one after another, so a
 * chapter is checked against everything the earlier chapters already said and
 * repeats are removed. Synthesis chapters (overview, recommendations,
 * predictions) summarise by design and are neither checked nor compared.
 */
const SYNTHESIS = new Set(["executive-summary", "recommendations", "predictions"]);
const STOP = new Set(["the", "a", "an", "of", "in", "on", "to", "and", "or", "is", "was", "were", "by", "for", "with", "at", "as", "from", "that", "this", "it", "its", "than", "month", "last", "year", "prior", "previous", "versus", "against"]);

const words = (text: string) => new Set(text.toLowerCase().replace(/(\d),(\d)/g, "$1$2").split(/[^\p{L}\p{N}.%]+/u).filter(w => w.length > 1 && !STOP.has(w)));
function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}
const numbers = (text: string) => new Set([...text.replace(/(\d),(\d)/g, "$1$2").matchAll(/\d+(?:\.\d+)?%?/g)].map(m => m[0]).filter(n => n.length > 1));

interface Seen { chapter: string; headline: Set<string>; claim: Set<string>; nums: Set<string>; metric?: string }
const seenFrom = (chapter: string, card: InsightCard): Seen => ({ chapter, headline: words(card.headline), claim: words(`${card.headline} ${card.evidence}`), nums: numbers(`${card.headline} ${card.evidence}`), metric: card.metrics?.[0] });

/** A card repeats an earlier chapter when it makes the same claim: near-identical headline, or the same figures and measure. */
function repeats(card: InsightCard, earlier: Seen[]) {
  const head = words(card.headline), claim = words(`${card.headline} ${card.evidence}`), nums = numbers(`${card.headline} ${card.evidence}`);
  return earlier.some(e => similarity(head, e.headline) >= 0.7
    || similarity(claim, e.claim) >= 0.75
    || (nums.size >= 2 && [...nums].filter(n => e.nums.has(n)).length >= Math.min(nums.size, e.nums.size, 3) && card.metrics?.[0] != null && card.metrics[0] === e.metric));
}

/** What earlier chapters have already said, as the compact digest a later chapter is shown. */
export function coveredDigest(done: Record<string, ChapterNarrative>, upTo?: string): string {
  const order = chapters.map(c => c.id);
  const lines = Object.entries(done).filter(([id, n]) => !SYNTHESIS.has(id) && n.cards?.length && (upTo == null || order.indexOf(id) < order.indexOf(upTo)))
    .map(([id, n]) => `- ${chapters.find(c => c.id === id)?.title ?? id}: ${n.cards.slice(0, 6).map(c => c.headline).join(" | ")}`);
  return lines.join("\n");
}

/** Removes claims, takeaways and commentary an earlier chapter already carries. Returns the narrative unchanged for synthesis chapters. */
export function uniqueNarrative(spec: ChapterSpec, narrative: ChapterNarrative, done: Record<string, ChapterNarrative>): ChapterNarrative {
  if (SYNTHESIS.has(spec.id) || spec.derived || !narrative.cards.length) return narrative;
  const earlier: Seen[] = Object.entries(done).filter(([id]) => id !== spec.id && !SYNTHESIS.has(id)).flatMap(([id, n]) => n.cards.map(card => seenFrom(id, card)));
  const kept: InsightCard[] = [];
  for (const card of narrative.cards) {
    // The chapter verdict always stays; it leads the chapter even when a sibling touched the same measure.
    if (card.focus !== "kpis" && repeats(card, earlier)) continue;
    kept.push(card);
  }
  const earlierTakeaways = Object.entries(done).filter(([id]) => id !== spec.id && !SYNTHESIS.has(id)).flatMap(([, n]) => n.briefing?.takeaways ?? []).map(words);
  const takeaways = narrative.briefing?.takeaways.filter(t => !earlierTakeaways.some(e => similarity(words(t), e) >= 0.75));
  const commentary = narrative.metricCommentary?.filter(item => !item.metricIds.every(id => reportedElsewhere(spec, id)));
  return { ...narrative, cards: kept.length ? kept : narrative.cards.slice(0, 1),
    ...(narrative.briefing && takeaways ? { briefing: { ...narrative.briefing, takeaways: takeaways.length ? takeaways : narrative.briefing.takeaways.slice(0, 1) } } : {}),
    ...(commentary ? { metricCommentary: commentary } : {}) };
}
