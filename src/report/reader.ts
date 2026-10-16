import type { InsightCard, ReportModel } from './model';

export type ReaderPreferences = { layout: 'adaptive' | 'single'; textSize: 'small' | 'standard' | 'large'; spacing: 'compact' | 'comfortable' };
export const READER_DEFAULTS: ReaderPreferences = { layout: 'adaptive', textSize: 'standard', spacing: 'compact' };
export function readerPreferences(value: unknown): ReaderPreferences {
  const v = value && typeof value === 'object' ? value as Partial<ReaderPreferences> : {};
  return { layout: v.layout === 'single' ? 'single' : 'adaptive', textSize: v.textSize === 'small' || v.textSize === 'large' ? v.textSize : 'standard', spacing: v.spacing === 'comfortable' ? 'comfortable' : 'compact' };
}
/** Wide tables, long labels and developed arguments need an uninterrupted reading row. */
export function readingSpan({ columns = 0, rows = 0, words = 0, longestLabel = 0 }: { columns?: number; rows?: number; words?: number; longestLabel?: number }): 'full' | 'compact' {
  return columns > 5 || rows > 8 || words > 170 || longestLabel > 48 ? 'full' : 'compact';
}
export function findingWordCount(card: InsightCard) {
  return [card.meaning, card.evidence, card.driver, card.concentration, card.offset, card.trend, card.impact, card.action, card.recommendation, card.watch].filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;
}
export function readerIdentity(model: Pick<ReportModel, 'builtAt' | 'scope' | 'figuresHash'>) {
  return `${model.scope.studio}:${model.scope.month}:${model.builtAt}:${model.figuresHash}`;
}
