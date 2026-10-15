import { definition } from "./definitions";
import type { ChapterData, InsightCard, ReportModel } from "./model";

/**
 * Deterministic claim audit. It catches the one error a number check cannot:
 * a sentence that names a cited measure and states a direction the supplied
 * comparisons contradict, or calls an adverse move an improvement. It only
 * acts when every available comparison disagrees with the sentence, so loose
 * wording about a mixed picture is never rejected.
 */
const UP = /\b(rose|rise[sn]?|rising|increas\w+|grew|grow\w*|climb\w*|gain\w*|expand\w*|surg\w+|higher|up)\b/i;
const DOWN = /\b(fell|fall\w*|declin\w+|drop\w*|decreas\w+|slip\w*|shrank|shrink\w*|contract\w*|eroded|lower|down)\b/i;
const GOOD = /\b(improv\w+|strengthen\w*|healthier|better|recover\w*)\b/i;
const BAD = /\b(worsen\w*|deteriorat\w+|weaken\w*|erod\w+|deteriorated)\b/i;
const MIXED = /\b(while|but|whereas|however|although|though|offset\w*|despite|yet|unless|versus|against|if)\b/i;

function moves(id: string, data: ChapterData): number[] {
  const value = Number(data.total[id]);
  const pairs: [unknown, unknown][] = [[data.total[id], data.prior[id]], [data.total[id], data.priorYear[id]]];
  if (Number(data.yearToDate?.n) > 0 && Number(data.priorYearToDate?.n) > 0) pairs.push([data.yearToDate?.[id], data.priorYearToDate?.[id]]);
  void value;
  return pairs.filter(([a, b]) => a != null && b != null && Number.isFinite(Number(a)) && Number.isFinite(Number(b))).map(([a, b]) => Math.sign(Number(a) - Number(b)));
}

function dataFor(model: ReportModel, chapter: string, id: string): ChapterData | undefined {
  const own = model.chapters[chapter];
  if (own?.total[id] != null) return own;
  return Object.values(model.chapters).find(d => d.total[id] != null);
}

const FIELDS = ["headline", "meaning", "driver", "trend", "concentration", "offset", "evidence"] as const;

/** Sentences in which the card states a direction its own cited figures contradict. */
export function directionIssues(card: InsightCard, model: ReportModel, chapter: string): string[] {
  const issues: string[] = [];
  const cited = (card.metrics ?? []).filter(id => definition(id));
  for (const field of FIELDS) {
    const text = card[field];
    if (typeof text !== "string") continue;
    for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
      if (MIXED.test(sentence)) continue;
      const lower = sentence.toLowerCase();
      const named = cited.filter(id => { const label = definition(id)!.label.toLowerCase(); return label.length > 3 && lower.includes(label); });
      if (named.length !== 1) continue;
      const id = named[0], data = dataFor(model, chapter, id);
      if (!data) continue;
      const m = moves(id, data);
      if (!m.length) continue;
      const label = definition(id)!.label, up = UP.test(sentence), down = DOWN.test(sentence);
      const favourable = (sign: number) => (sign > 0) === definition(id)!.higherIsBetter;
      if (up !== down && m.every(sign => sign < 0) && up) issues.push(`${label} is said to rise, but every comparison fell: "${sentence.trim()}"`);
      else if (up !== down && m.every(sign => sign > 0) && down) issues.push(`${label} is said to fall, but every comparison rose: "${sentence.trim()}"`);
      else if (GOOD.test(sentence) && !BAD.test(sentence) && m.every(sign => sign !== 0 && !favourable(sign))) issues.push(`${label} is called an improvement, but every comparison moved against its direction: "${sentence.trim()}"`);
      else if (BAD.test(sentence) && !GOOD.test(sentence) && m.every(sign => sign !== 0 && favourable(sign))) issues.push(`${label} is called a deterioration, but every comparison moved in its favour: "${sentence.trim()}"`);
    }
  }
  return issues;
}
