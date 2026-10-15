import type { ReportModel } from './model';

/** The sidebar surface the accent sits on; keep in step with `.deck-tabs` in report-modern.css. */
export const RAIL_BACKGROUND = '#14243b';

/** Stable per generated snapshot, including before its first save. No stored report mutation. */
export function sidebarAccent(model: Pick<ReportModel, 'scope' | 'builtAt' | 'figuresHash'>) {
  const key = `${model.scope.studio}|${model.scope.month}|${model.builtAt}|${model.figuresHash}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  const hue = (hash >>> 0) % 360;
  const accent = `hsl(${hue} 70% 76%)`;
  // Lightness 76% keeps the accent above 4.5:1 against the navy rail in every hue; the
  // active row, border and number chip are the accent mixed into the rail colour, so
  // they always read as one family with the sidebar instead of a pastel patch on it.
  const mix = (share: number) => `color-mix(in srgb, ${accent} ${share}%, ${RAIL_BACKGROUND})`;
  return {
    '--rail-accent': accent,
    '--rail-tint': mix(15),
    '--rail-border': mix(36),
    '--rail-number': mix(16),
  };
}
