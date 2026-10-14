/** Pure calculations behind the Overview tab's board components, kept apart from the UI so they can be tested. */
export type FunnelInput = { id: string; label: string; value: number | null };
export type FunnelStep = FunnelInput & {
  ofFirst: number | null;
  ofPrevious: number | null;
  biggestDrop: boolean;
};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function funnelSteps(steps: FunnelInput[]): FunnelStep[] {
  const first = steps[0]?.value;
  const out = steps.map((s, i) => {
    const prev = i ? steps[i - 1].value : null;
    return {
      ...s,
      ofFirst: finite(first) && first > 0 && finite(s.value) ? s.value / first : null,
      ofPrevious: i && finite(prev) && prev > 0 && finite(s.value) ? s.value / prev : null,
      biggestDrop: false,
    };
  });
  const drops = out.slice(1).filter((s) => s.ofPrevious !== null && s.ofPrevious < 1);
  if (drops.length) {
    const worst = drops.reduce((a, b) => (b.ofPrevious! < a.ofPrevious! ? b : a));
    worst.biggestDrop = true;
  }
  return out;
}

export type GoalStatus = "none" | "behind" | "ahead" | "met";
const day = 86400000;
const utc = (d: string) => Date.parse(d + "T00:00:00Z");
/**
 * Progress against a target for a reporting period. A period still running is judged against the
 * share of it that has elapsed, so a mid-month view is not marked behind the full-month target.
 */
export function goalProgress(p: { value: number | null; target: number; from: string; to: string; today: string }) {
  const none = { status: "none" as GoalStatus, progress: 0, expected: 0, elapsed: 0 };
  if (!finite(p.value) || !(p.target > 0) || !p.from || !p.to) return none;
  const start = utc(p.from), end = utc(p.to), now = utc(p.today);
  if (![start, end, now].every(Number.isFinite) || end < start) return none;
  const total = Math.round((end - start) / day) + 1;
  const elapsedDays = Math.min(total, Math.max(0, Math.round((now - start) / day) + 1));
  const elapsed = now >= end ? 1 : elapsedDays / total;
  const expected = p.target * elapsed;
  const progress = p.value / p.target;
  const status: GoalStatus = p.value >= p.target ? "met" : p.value >= expected ? "ahead" : "behind";
  return { status, progress, expected, elapsed };
}

export type MixRow = { label: string; value: number };
/** Largest groups first; everything beyond the top N is folded into "Other" so the total is preserved. */
export function topNWithOther(rows: MixRow[], n: number): MixRow[] {
  const sorted = rows.filter((r) => finite(r.value) && r.value !== 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n).reduce((sum, r) => sum + r.value, 0);
  return [...sorted.slice(0, n), { label: "Other", value: rest }];
}

export type RankInput = { label: string; value: number | null; previous: number | null };
export type RankedRow = { label: string; value: number; previous: number | null; change: number | null };
export function rankRows(rows: RankInput[], higherIsBetter: boolean): RankedRow[] {
  return rows
    .filter((r): r is RankInput & { value: number } => finite(r.value))
    .map((r) => ({
      label: r.label,
      value: r.value,
      previous: r.previous,
      change: finite(r.previous) && r.previous !== 0 ? (r.value - r.previous) / Math.abs(r.previous) : null,
    }))
    .sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
}
