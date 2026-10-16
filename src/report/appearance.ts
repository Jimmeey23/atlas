import type { CSSProperties } from 'react';
import type { ReportModel } from './model';

/** A generation keeps its colour across preview, save/reopen and offline export. */
export function reportAppearance(model: Pick<ReportModel, 'builtAt' | 'scope' | 'figuresHash'>): CSSProperties {
  const identity = `${model.builtAt}|${model.scope.studio}|${model.scope.month}|${model.figuresHash}`;
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  // Dark enough for white masthead text and links on white; no fixed small palette.
  const hue = (hash % 360000) / 1000;
  const saturation = 56 + ((hash >>> 16) % 18);
  return {
    '--report-accent': `hsl(${hue} ${saturation}% 27%)`,
    '--report-accent-strong': `hsl(${hue} ${saturation}% 20%)`,
    '--report-accent-soft': `hsl(${hue} 30% 96%)`,
    '--report-accent-line': `hsl(${hue} 20% 86%)`,
  } as CSSProperties;
}
