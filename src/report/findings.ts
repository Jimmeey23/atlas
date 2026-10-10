import type { Row } from "../data/duckdb";
import type { GroupSpec } from "./chapters";
import { chapters, type ChapterSpec } from "./chapters";
import { definition, reportFmt } from "./definitions";
import { monthLabel, shiftMonth } from "./period";
import type { ChapterData, GroupAnalysis, GroupTable, ReportModel } from "./model";

/**
 * Analyst findings: the arithmetic a senior analyst would do before writing a
 * word — anomalies against the studio's own history, what drove a change,
 * where results are concentrated, what a gap is worth, and where two measures
 * disagree. Everything here is computed from the frozen snapshot, so the model
 * is asked to explain and prioritise verified facts rather than to restate a
 * table or invent a cause.
 */
export type FindingKind = "anomaly" | "streak" | "benchmark" | "target" | "driver" | "mix" | "concentration" | "gap" | "tension" | "cross" | "signal";
export type FindingTone = "risk" | "opportunity" | "context";
export interface Finding {
  chapter: string;
  /** Evidence the finding rests on: a breakdown id, "kpis", "trend" or "cross". */
  focus: string;
  kind: FindingKind;
  tone: FindingTone;
  text: string;
  /** Rupees at stake, when the finding can be valued. Indicative, never a forecast. */
  inr?: number;
}

/** Additive measures movers are read on, in order of preference. */
const ADDITIVE = ["gross_revenue", "payroll_revenue", "attendance", "new_clients", "converted_leads", "leads", "booking_late_cancelled", "lapsed", "renewed", "due", "memberships_count", "bookings", "sessions", "new_handled"];
/** Rate measures and the per-row denominator they are a share of. */
const DENOMINATOR: Record<string, { of: (row: Row) => number | null; noun: string }> = {
  fill_rate: { of: (row) => num(row.fill_rate) && num(row.attendance) != null ? num(row.attendance)! / num(row.fill_rate)! : null, noun: "visits" },
  conversion_rate: { of: (row) => num(row.new_clients), noun: "paid conversions" },
  retention_rate: { of: (row) => num(row.new_clients), noun: "retained newcomers" },
  zero_return_rate: { of: (row) => num(row.new_clients), noun: "newcomers who never returned" },
  lead_conversion_rate: { of: (row) => num(row.leads), noun: "converted leads" },
  renewal_rate: { of: (row) => num(row.due), noun: "renewals" },
  booking_late_rate: { of: (row) => num(row.bookings), noun: "late cancellations" },
  payroll_conversion: { of: (row) => num(row.new_handled), noun: "paid conversions" },
  payroll_retention: { of: (row) => num(row.new_handled), noun: "retained newcomers" },
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
const label = (id: string) => definition(id)?.label ?? id;
const fmt = (id: string, value: unknown) => reportFmt(id, value);
const isRate = (id: string) => definition(id)?.format === "percent";
const better = (id: string) => definition(id)?.higherIsBetter ?? true;
const inr = (value: number) => reportFmt("gross_revenue", Math.round(value));
const pp = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
const signed = (id: string, value: number) => isRate(id) ? pp(value) : `${value >= 0 ? "+" : "−"}${fmt(id, Math.abs(value))}`;
const count = (value: number) => Math.round(value).toLocaleString("en-IN");
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
};

/**
 * Drivers over every group in a breakdown, not only the ranked rows printed.
 * Runs in compute.ts where the full grouped result is still in hand.
 */
export function analyseGroup(group: GroupSpec, columns: string[], current: Row[], prior: Record<string, Row>, eligible: Row[], total: Row | null): GroupAnalysis {
  const analysis: GroupAnalysis = {};
  const metric = ADDITIVE.find((id) => columns.includes(id));
  const now = Object.fromEntries(current.map((row) => [String(row.g), row]));
  if (metric) {
    analysis.metric = metric;
    if (Object.keys(prior).length) {
      // A group with no records in a month has none of an additive count.
      const movers = [...new Set([...Object.keys(now), ...Object.keys(prior)])].map((g) => {
        const c = num(now[g]?.[metric]), p = num(prior[g]?.[metric]);
        return { g, current: c, prior: p, change: (c ?? 0) - (p ?? 0) };
      }).filter((m) => m.change !== 0);
      analysis.totalChange = movers.reduce((sum, m) => sum + m.change, 0);
      analysis.gainers = movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 3);
      analysis.decliners = movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 3);
    }
    const whole = num(total?.[metric]);
    const ranked = current.map((row) => ({ g: String(row.g), v: num(row[metric]) ?? 0 })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    if (whole && whole > 0 && ranked.length >= 4)
      analysis.concentration = { metric, groups: ranked.length, top1: { g: ranked[0].g, share: ranked[0].v / whole }, top3Share: ranked.slice(0, 3).reduce((s, r) => s + r.v, 0) / whole };
  }
  const rate = group.compare && DENOMINATOR[group.compare] ? group.compare : undefined;
  if (rate && !group.fields && Object.keys(prior).length) {
    const den = DENOMINATOR[rate].of;
    const side = (rows: Row[]) => {
      const usable = rows.map((row) => ({ g: String(row.g), d: den(row), r: num(row[rate]) })).filter((x): x is { g: string; d: number; r: number } => x.d != null && x.d > 0 && x.r != null);
      const sum = usable.reduce((s, x) => s + x.d, 0);
      return { usable, sum, rate: sum ? usable.reduce((s, x) => s + x.d * x.r, 0) / sum : null };
    };
    const c = side(current), p = side(Object.values(prior));
    if (c.rate != null && p.rate != null && c.sum > 0) {
      const before = Object.fromEntries(p.usable.map((x) => [x.g, x]));
      const matched = c.usable.filter((x) => before[x.g]);
      const rateEffect = matched.reduce((s, x) => s + (x.d / c.sum) * (x.r - before[x.g].r), 0);
      const drivers = matched.map((x) => ({ g: x.g, units: x.d * (x.r - before[x.g].r), rateChange: x.r - before[x.g].r }))
        .sort((a, b) => Math.abs(b.units) - Math.abs(a.units)).slice(0, 3);
      analysis.bridge = { rate, denominator: DENOMINATOR[rate].noun, current: c.rate, prior: p.rate, rateEffect, mixEffect: c.rate - p.rate - rateEffect, drivers };
    }
  }
  const criterion = group.rankBy ?? group.compare;
  if (criterion && DENOMINATOR[criterion] && eligible.length >= 4) {
    const values = eligible.map((row) => num(row[criterion])).filter((v): v is number => v != null);
    const mid = median(values);
    const up = better(criterion);
    let units = 0, groupsBelow = 0;
    for (const row of eligible) {
      const r = num(row[criterion]), d = DENOMINATOR[criterion].of(row);
      if (r == null || d == null) continue;
      const gap = up ? mid - r : r - mid;
      if (gap > 0) { units += gap * d; groupsBelow++; }
    }
    if (groupsBelow >= 2 && units > 0) analysis.medianLift = { metric: criterion, median: mid, groupsBelow, units };
  }
  return analysis;
}

/** Studio unit values used to put a rupee figure on a volume. Each is labelled where it is used. */
export interface ValueContext { revPerVisit: number | null; aov: number | null; firstPurchase: number | null }
export function valueContext(model: ReportModel): ValueContext {
  const exec = model.chapters["executive-summary"]?.total ?? {};
  const revenue = num(exec.revenue), visits = num(exec.attendance);
  return {
    revPerVisit: revenue != null && visits ? revenue / visits : null,
    aov: num(model.chapters["revenue-performance"]?.total.aov),
    firstPurchase: num(model.chapters["conversion-funnel"]?.total.avg_first_purchase),
  };
}
/** Rupees per unit of a rate's denominator outcome, with the basis named. */
function unitValue(rate: string, ctx: ValueContext): { value: number; basis: string } | null {
  if (["fill_rate", "booking_late_rate", "session_complimentary_rate"].includes(rate) && ctx.revPerVisit) return { value: ctx.revPerVisit, basis: `${inr(ctx.revPerVisit)} earned revenue per visit` };
  if (["conversion_rate", "lead_conversion_rate", "payroll_conversion"].includes(rate) && ctx.firstPurchase) return { value: ctx.firstPurchase, basis: `${inr(ctx.firstPurchase)} average first purchase` };
  if (rate === "renewal_rate" && ctx.aov) return { value: ctx.aov, basis: `${inr(ctx.aov)} average order value (indicative for a membership)` };
  return null;
}
/** What a change of `gap` in a headline metric is worth this month, if it can be valued honestly. */
function valueOfGap(id: string, gap: number, total: Row, ctx: ValueContext): { inr: number; basis: string } | null {
  if (definition(id)?.format === "currency" && ["gross_revenue", "net_revenue", "revenue", "payroll_revenue"].includes(id)) return { inr: Math.abs(gap), basis: "direct" };
  if (id === "attendance" && ctx.revPerVisit) return { inr: Math.abs(gap) * ctx.revPerVisit, basis: `${count(Math.abs(gap))} visits × ${inr(ctx.revPerVisit)} per visit` };
  const base = id === "fill_rate" ? (num(total.capacity) ?? (num(total.attendance) != null && num(total.fill_rate) ? num(total.attendance)! / num(total.fill_rate)! : null))
    : id === "session_complimentary_rate" ? num(total.attendance)
    : DENOMINATOR[id]?.of(total) ?? null;
  const unit = unitValue(id, ctx);
  if (base == null || !unit || !isRate(id)) return null;
  const units = Math.abs(gap) * base;
  return { inr: units * unit.value, basis: `${count(units)} ${DENOMINATOR[id]?.noun ?? "visits"} × ${unit.basis}` };
}

/** Anomalies, streaks and the studio's own best month, from the trailing series. */
function historyFindings(spec: ChapterSpec, data: ChapterData, ctx: ValueContext): Finding[] {
  const out: Finding[] = [];
  const rows = [...(data.history ?? [])].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  if (rows.length < 5) return out;
  const ids = [...new Set([...spec.metrics.slice(0, 5), ...spec.history])];
  for (const id of ids) {
    if (!definition(id)) continue;
    const series = rows.map((row) => ({ month: String(row.month), v: num(row[id]) }));
    const current = series.at(-1)!;
    if (current.v == null) continue;
    const baseline = series.slice(-13, -1).filter((x): x is { month: string; v: number } => x.v != null);
    if (baseline.length < 4) continue;
    const values = baseline.map((x) => x.v);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    const up = better(id);
    const goodWhen = (delta: number) => (delta >= 0) === up;
    const z = sd > 0 ? (current.v - mean) / sd : 0;
    const max = Math.max(...values), min = Math.min(...values);
    const record = baseline.length >= 6 && (current.v > max || current.v < min);
    if (Math.abs(z) >= 1.5 || record) {
      const where = current.v > max ? `the highest in ${baseline.length + 1} months` : current.v < min ? `the lowest in ${baseline.length + 1} months` : `${Math.abs(z).toFixed(1)} standard deviations ${z > 0 ? "above" : "below"} normal`;
      out.push({ chapter: spec.id, focus: "trend", kind: "anomaly", tone: goodWhen(current.v - mean) ? "opportunity" : "risk",
        text: `${label(id)} at ${fmt(id, current.v)} is ${where}: trailing ${values.length}-month average ${fmt(id, mean)}, range ${fmt(id, min)}–${fmt(id, max)}${sd > 0 ? `, z = ${z.toFixed(1)}` : ""}.` });
    }
    let streak = 0, direction = 0;
    for (let i = series.length - 1; i > 0; i--) {
      const a = series[i].v, b = series[i - 1].v;
      if (a == null || b == null || a === b) break;
      const d = Math.sign(a - b);
      if (!direction) direction = d;
      if (d !== direction) break;
      streak++;
    }
    if (streak >= 3) {
      const start = series[series.length - 1 - streak].v!;
      out.push({ chapter: spec.id, focus: "trend", kind: "streak", tone: goodWhen(direction) ? "opportunity" : "risk",
        text: `${label(id)} has ${direction > 0 ? "risen" : "fallen"} for ${streak} consecutive months, from ${fmt(id, start)} to ${fmt(id, current.v)} (${isRate(id) ? pp(current.v - start) : `${((current.v / start - 1) * 100).toFixed(1)}%`}).` });
    }
    if (spec.metrics.slice(0, 4).includes(id) && baseline.length >= 6) {
      const best = baseline.reduce((a, b) => (up ? b.v > a.v : b.v < a.v) ? b : a);
      const gap = best.v - current.v;
      const material = isRate(id) ? Math.abs(gap) >= 0.03 : best.v !== 0 && Math.abs(gap / best.v) >= 0.1;
      if (material && goodWhen(gap)) {
        const value = valueOfGap(id, gap, data.total, ctx);
        out.push({ chapter: spec.id, focus: "kpis", kind: "benchmark", tone: "opportunity", inr: value?.inr,
          text: `${label(id)} is ${isRate(id) ? pp(Math.abs(gap)).slice(1) : fmt(id, Math.abs(gap))} short of the studio's own best month in the last year (${monthLabel(best.month)}: ${fmt(id, best.v)}).${value ? ` Closing that gap is worth about ${inr(value.inr)} a month (${value.basis}).` : ""}` });
      }
    }
  }
  return out;
}

function groupFindings(spec: ChapterSpec, table: GroupTable, ctx: ValueContext): Finding[] {
  const out: Finding[] = [];
  const a = table.analysis;
  const focus = table.id ?? table.field;
  const by = (table.fields ?? [table.field]).join(" × ");
  if (a?.metric && a.totalChange && (a.gainers?.length || a.decliners?.length)) {
    const m = a.metric;
    const list = (xs: { g: string; change: number }[] = []) => xs.map((x) => `${x.g} ${signed(m, x.change)}`).join(", ");
    const largest = [...(a.gainers ?? []), ...(a.decliners ?? [])].sort((x, y) => Math.abs(y.change) - Math.abs(x.change))[0];
    const share = largest && a.totalChange ? largest.change / a.totalChange : 0;
    const money = definition(m)?.format === "currency" ? Math.abs(a.totalChange) : m === "attendance" && ctx.revPerVisit ? Math.abs(a.totalChange) * ctx.revPerVisit : undefined;
    out.push({ chapter: spec.id, focus, kind: "driver", tone: (a.totalChange >= 0) === better(m) ? "context" : "risk", inr: money,
      text: `${label(m)} by ${by} moved ${signed(m, a.totalChange)} net against last month.${a.gainers?.length ? ` Biggest gains: ${list(a.gainers)}.` : ""}${a.decliners?.length ? ` Biggest declines: ${list(a.decliners)}.` : ""}${share > 1 ? ` ${largest.g} alone moved more than the net change, so other groups offset it.` : share >= 0.5 ? ` ${largest.g} accounts for ${(share * 100).toFixed(0)}% of the net change, not of gross losses; gains and declines elsewhere may offset.` : ""}` });
  }
  if (a?.bridge && Math.abs(a.bridge.current - a.bridge.prior) >= 0.005) {
    const b = a.bridge;
    const dominant = Math.abs(b.mixEffect) > Math.abs(b.rateEffect) ? "a shift in mix between groups" : "performance changing within groups";
    const unit = unitValue(b.rate, ctx);
    const units = b.drivers.reduce((s, d) => s + d.units, 0);
    out.push({ chapter: spec.id, focus, kind: "mix", tone: (b.current >= b.prior) === better(b.rate) ? "context" : "risk",
      inr: unit && Math.abs(units) > 0 ? Math.abs(units) * unit.value : undefined,
      text: `${label(b.rate)} moved ${pp(b.current - b.prior)} (${fmt(b.rate, b.prior)} → ${fmt(b.rate, b.current)}). Within-group change explains ${pp(b.rateEffect)} and mix shift ${pp(b.mixEffect)}, so the move is mainly ${dominant}. Largest within-group contributors: ${b.drivers.map((d) => `${d.g} ${pp(d.rateChange)} (${d.units >= 0 ? "+" : "−"}${count(Math.abs(d.units))} ${b.denominator})`).join(", ")}.` });
  }
  if (a?.concentration && (a.concentration.top1.share >= 0.35 || a.concentration.top3Share >= 0.75)) {
    const c = a.concentration;
    out.push({ chapter: spec.id, focus, kind: "concentration", tone: "risk",
      text: `${label(c.metric)} is concentrated: ${c.top1.g} holds ${(c.top1.share * 100).toFixed(0)}% and the top three hold ${(c.top3Share * 100).toFixed(0)}% across ${c.groups} ${by} groups. Losing or disrupting the leader would move the whole result.` });
  }
  if (a?.medianLift) {
    const l = a.medianLift;
    const unit = unitValue(l.metric, ctx);
    out.push({ chapter: spec.id, focus, kind: "gap", tone: "opportunity", inr: unit ? l.units * unit.value : undefined,
      text: `Bringing the ${l.groupsBelow} ${by} groups that are worse than the median ${label(l.metric).toLowerCase()} (${fmt(l.metric, l.median)}) up to the median would add about ${count(l.units)} ${DENOMINATOR[l.metric].noun} a month${unit ? `, worth about ${inr(l.units * unit.value)} at ${unit.basis}` : ""}.` });
  }
  // Disagreements between fill and yield inside one table: the rows a table hides in plain sight.
  if (table.columns.includes("fill_rate") && table.columns.includes("revenue_per_session") && table.rows.length >= 6) {
    const rows = table.rows.filter((r) => num(r.fill_rate) != null && num(r.revenue_per_session) != null);
    const fills = rows.map((r) => num(r.fill_rate)!), yields = rows.map((r) => num(r.revenue_per_session)!);
    const [fHi, fLo, yHi, yLo] = [quantile(fills, 2 / 3), quantile(fills, 1 / 3), quantile(yields, 2 / 3), quantile(yields, 1 / 3)];
    const fullCheap = rows.filter((r) => num(r.fill_rate)! >= fHi && num(r.revenue_per_session)! <= yLo).slice(0, 3);
    const emptyRich = rows.filter((r) => num(r.fill_rate)! <= fLo && num(r.revenue_per_session)! >= yHi).slice(0, 3);
    const row = (r: Row) => `${r.g} (fill ${fmt("fill_rate", r.fill_rate)}, ${fmt("revenue_per_session", r.revenue_per_session)}/session${num(r.session_complimentary_rate) != null ? `, comps ${fmt("session_complimentary_rate", r.session_complimentary_rate)}` : ""})`;
    if (fullCheap.length) out.push({ chapter: spec.id, focus, kind: "tension", tone: "risk",
      text: `Full but low-yield: ${fullCheap.map(row).join("; ")}. High fill with bottom-third revenue per session points to complimentary, discounted or low-price visits filling these classes; check comp and package mix before adding capacity.` });
    if (emptyRich.length) out.push({ chapter: spec.id, focus, kind: "tension", tone: "opportunity",
      text: `High-yield but under-filled: ${emptyRich.map(row).join("; ")}. These earn well per session but leave seats empty; they are the cheapest place to add paying visits.` });
  }
  return out;
}

/** Exact two-factor decomposition: volume at prior yield, then yield at current volume. */
export function movementBridge(spec: ChapterSpec, data: ChapterData): Finding[] {
  const cash = spec.id === 'revenue-performance';
  if (!cash && !['sessions', 'executive-summary'].includes(spec.id)) return [];
  const valueId = cash ? 'gross_revenue' : 'attendance';
  const volumeId = cash ? 'transactions' : 'sessions';
  const value = num(data.total[valueId]), previousValue = num(data.prior[valueId]);
  const volume = num(data.total[volumeId]), previousVolume = num(data.prior[volumeId]);
  if (value == null || previousValue == null || volume == null || previousVolume == null || volume <= 0 || previousVolume <= 0) return [];
  const priorYield = previousValue / previousVolume, currentYield = value / volume;
  const volumeEffect = (volume - previousVolume) * priorYield;
  const yieldEffect = volume * (currentYield - priorYield);
  const format = (v: number) => cash ? inr(v) : `${v.toFixed(1)} visits`;
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${format(Math.abs(v))}`;
  return [{ chapter: spec.id, focus: 'kpis', kind: 'driver', tone: value < previousValue ? 'risk' : 'context',
    text: `${cash ? 'Cash collections' : 'Attendance'} changed ${signed(value - previousValue)}: ${signed(volumeEffect)} from ${cash ? 'transaction' : 'session'} volume at the prior month's average, and ${signed(yieldEffect)} from ${cash ? 'gross collections per transaction' : 'attendance per session'} at current volume. The effects reconcile exactly before rounding. This is an arithmetic decomposition, not proof of ${cash ? 'pricing changes or buyer behaviour' : 'schedule quality or member motivation'}.` }];
}

/** Leakage and idle value the month's totals already imply. */
function chapterGaps(spec: ChapterSpec, data: ChapterData, ctx: ValueContext): Finding[] {
  const t = data.total, out: Finding[] = [];
  const v = ctx.revPerVisit;
  const add = (tone: FindingTone, text: string, value?: number | null) => out.push({ chapter: spec.id, focus: "kpis", kind: "gap", tone, text, inr: value ?? undefined });
  if (spec.id === "sessions") {
    const capacity = num(t.capacity), unsold = num(t.unsold_seats), empty = num(t.empty_sessions);
    if (capacity && v) add("opportunity", `Each 1pp of fill is about ${count(capacity * 0.01)} visits, worth about ${inr(capacity * 0.01 * v)} a month at ${inr(v)} earned revenue per visit; a 5pp improvement is worth about ${inr(capacity * 0.05 * v)}.${unsold ? ` ${count(unsold)} seats went unsold (ceiling ${inr(unsold * v)} if every one were sold, which is not a realistic target).` : ""}`, capacity * 0.05 * v);
    if (empty) add("risk", `${count(empty)} sessions ran with nobody attending${num(t.empty_session_rate) != null ? ` (${fmt("empty_session_rate", t.empty_session_rate)} of sessions)` : ""}. Each one carries instructor and studio cost with no revenue.`);
  }
  if (spec.id === "executive-summary") {
    const comps = num(t.complimentary_visits);
    if (comps && v) add("context", `${count(comps)} complimentary visits (${fmt("session_complimentary_rate", t.session_complimentary_rate)} of attendance) would be worth about ${inr(comps * v)} at the paid yield of ${inr(v)} per visit. This is an opportunity-cost ceiling, not lost cash: comps that convert newcomers pay for themselves.`);
  }
  if (spec.id === "late-cancellations") {
    const lost = (num(t.booking_late_cancelled) ?? 0) + (num(t.booking_no_shows) ?? 0);
    if (lost && v) add("risk", `${count(lost)} booked seats were released late or not used (late cancellations plus no-shows), about ${inr(lost * v)} of attendance value at ${inr(v)} per visit if those seats were not resold.`, lost * v);
  }
  if (spec.id === "conversion-funnel") {
    const n = num(t.new_clients), zero = num(t.zero_return_rate), conv = num(t.conversion_rate);
    if (n && zero != null) add("risk", `${count(n * zero)} of ${count(n)} newcomers (${fmt("zero_return_rate", zero)}) have not returned after their first visit.${ctx.firstPurchase && conv != null ? ` Each 5pp of conversion is about ${count(n * 0.05)} paying members, worth about ${inr(n * 0.05 * ctx.firstPurchase)} in first purchases alone.` : ""}`, ctx.firstPurchase ? n * 0.05 * ctx.firstPurchase : null);
  }
  if (spec.id === "leads") {
    const idle = num(t.untouched_leads), conv = num(t.lead_conversion_rate);
    if (idle && conv != null && ctx.firstPurchase) add("risk", `${count(idle)} leads have no recorded touch. At the current ${fmt("lead_conversion_rate", conv)} conversion and ${inr(ctx.firstPurchase)} average first purchase, that idle pipeline is worth about ${inr(idle * conv * ctx.firstPurchase)}.`, idle * conv * ctx.firstPurchase);
    else if (idle) add("risk", `${count(idle)} leads have no recorded touch.`);
  }
  if (spec.id === "renewals") {
    const lapsed = num(t.lapsed), due = num(t.due);
    if (lapsed && ctx.aov) add("risk", `${count(lapsed)} of ${count(due ?? 0)} due memberships lapsed. At this month's ${inr(ctx.aov)} average order value that is roughly ${inr(lapsed * ctx.aov)} of renewal revenue not collected (indicative; membership prices vary).`, lapsed * ctx.aov);
  }
  if (spec.id === "lapsed") {
    const risk = num(t.revenue_at_risk_30d), dormant = num(t.dormant_actives);
    if (risk) add("risk", `${inr(risk)} of membership revenue is at risk in the next 30 days${dormant ? `, with ${count(dormant)} active members not visiting recently` : ""}. These are current-snapshot figures.`, risk);
  }
  if (spec.id === "revenue-performance") {
    const discount = num(t.discount_value), rate = num(t.discount_rate);
    if (discount) add(rate != null && num(data.prior.discount_rate) != null && rate > num(data.prior.discount_rate)! ? "risk" : "context", `Discounts cost ${inr(discount)} this month (${fmt("discount_rate", rate)} of list value${num(data.prior.discount_rate) != null ? `, ${pp((rate ?? 0) - num(data.prior.discount_rate)!)} on last month` : ""}).`, discount);
  }
  return out;
}

const group = (model: ReportModel, chapter: string, id: string) => model.chapters[chapter]?.groups?.find((g) => (g.id ?? g.field) === id);
const byName = (table: GroupTable | undefined) => Object.fromEntries((table?.rows ?? []).map((r) => [String(r.g).trim().toLowerCase(), r]));

/** Relationships no single chapter can see. */
function crossFindings(model: ReportModel, ctx: ValueContext): Finding[] {
  const out: Finding[] = [];
  // Instructors who fill rooms versus instructors who turn first visits into members.
  const demand = byName(group(model, "instructors", "trainer")), convert = byName(group(model, "conversion-funnel", "trainer"));
  const both = Object.keys(demand).filter((k) => convert[k] && num(demand[k].fill_rate) != null && num(convert[k].conversion_rate) != null);
  if (both.length >= 4) {
    const fm = median(both.map((k) => num(demand[k].fill_rate)!)), cm = median(both.map((k) => num(convert[k].conversion_rate)!));
    const name = (k: string) => `${demand[k].g} (fill ${fmt("fill_rate", demand[k].fill_rate)}, newcomer conversion ${fmt("conversion_rate", convert[k].conversion_rate)})`;
    const fullLeaky = both.filter((k) => num(demand[k].fill_rate)! > fm && num(convert[k].conversion_rate)! < cm).slice(0, 3);
    const hidden = both.filter((k) => num(demand[k].fill_rate)! < fm && num(convert[k].conversion_rate)! > cm).slice(0, 3);
    if (fullLeaky.length) out.push({ chapter: "instructors", focus: "cross", kind: "cross", tone: "risk",
      text: `Popular but weak at converting newcomers: ${fullLeaky.map(name).join("; ")}. These instructors fill classes, but first-timers in their classes convert below the studio median (${fmt("conversion_rate", cm)}).` });
    if (hidden.length) out.push({ chapter: "instructors", focus: "cross", kind: "cross", tone: "opportunity",
      text: `Strong converters with spare capacity: ${hidden.map(name).join("; ")}. Their newcomers convert above the median (${fmt("conversion_rate", cm)}), but their classes fill below the median (${fmt("fill_rate", fm)}). Routing trial bookings to them is a low-cost test.` });
  }
  // Lead sources versus what those newcomers go on to do.
  const leads = byName(group(model, "leads", "source")), newcomers = byName(group(model, "conversion-funnel", "source"));
  const sources = Object.keys(leads).filter((k) => newcomers[k]);
  if (sources.length >= 2) out.push({ chapter: "leads", focus: "cross", kind: "cross", tone: "context",
    text: `Source quality across the funnel: ${sources.slice(0, 5).map((k) => `${leads[k].g}: ${fmt("leads", leads[k].leads)} leads at ${fmt("lead_conversion_rate", leads[k].lead_conversion_rate)} lead conversion, newcomers retain at ${fmt("retention_rate", newcomers[k].retention_rate)} with ${fmt("avg_ltv", newcomers[k].avg_ltv)} observed LTV`).join("; ")}. Judge sources on what their members are worth, not only on volume.` });
  // Collections versus studio demand.
  const sales = model.chapters["revenue-performance"], exec = model.chapters["executive-summary"];
  const g = num(sales?.total.gross_revenue), gp = num(sales?.prior.gross_revenue), a = num(exec?.total.attendance), ap = num(exec?.prior.attendance);
  if (g != null && gp && a != null && ap) {
    const gc = g / gp - 1, ac = a / ap - 1;
    if (Math.sign(gc) !== Math.sign(ac) || Math.abs(gc - ac) >= 0.1)
      out.push({ chapter: "executive-summary", focus: "cross", kind: "cross", tone: gc < ac ? "risk" : "context",
        text: `Cash collections (${(gc * 100).toFixed(1)}%) and studio attendance (${(ac * 100).toFixed(1)}%) moved ${Math.sign(gc) !== Math.sign(ac) ? "in opposite directions" : `${Math.abs((gc - ac) * 100).toFixed(0)} points apart`} on last month. ${gc < ac ? "Studio usage grew faster than collections, so attendance strength is not matched by the same movement in cash." : "Collections outpaced studio usage, so cash strength is not matched by the same movement in attendance."} Purchase timing and package mix may explain the divergence; these different populations do not establish a change in prepaid balances.}` });
  }
  // Newcomer demand versus conversion.
  const funnel = model.chapters["conversion-funnel"];
  const n = num(funnel?.total.new_clients), np = num(funnel?.prior.new_clients), c = num(funnel?.total.conversion_rate), cp = num(funnel?.prior.conversion_rate);
  if (n != null && np && c != null && cp != null && Math.sign(n - np) !== Math.sign(c - cp) && Math.abs(c - cp) >= 0.02)
    out.push({ chapter: "conversion-funnel", focus: "cross", kind: "cross", tone: n > np ? "risk" : "context",
      text: `Newcomer volume moved ${((n / np - 1) * 100).toFixed(1)}% while conversion moved ${pp(c - cp)}. ${n > np ? "More first visits are converting less well, so check whether the extra volume came from lower-intent sources or offers." : "Fewer first visits converted better, which suggests a smaller but higher-intent intake."}${ctx.firstPurchase ? ` The conversion change alone is worth about ${inr(Math.abs(c - cp) * n * ctx.firstPurchase)} in first purchases.` : ""}`,
      inr: ctx.firstPurchase ? Math.abs(c - cp) * n * ctx.firstPurchase : undefined });
  return out;
}

function targetFindings(spec: ChapterSpec, data: ChapterData, targets: Record<string, number>, ctx: ValueContext, seen: Set<string>): Finding[] {
  return spec.metrics.flatMap((id) => {
    const target = targets[id], current = num(data.total[id]);
    // Several chapters carry fill rate; the first one reports the target, once.
    if (target == null || current == null || seen.has(id)) return [];
    seen.add(id);
    const gap = target - current;
    const behind = better(id) ? gap > 0 : gap < 0;
    const value = behind ? valueOfGap(id, gap, data.total, ctx) : null;
    return [{ chapter: spec.id, focus: "kpis", kind: "target" as const, tone: behind ? "risk" as const : "opportunity" as const, inr: value?.inr,
      text: `${label(id)} is ${fmt(id, current)} against a target of ${fmt(id, target)}: ${behind ? "behind" : "ahead"} by ${isRate(id) ? pp(Math.abs(gap)).slice(1) : fmt(id, Math.abs(gap))}.${value ? ` The shortfall is worth about ${inr(value.inr)} this month (${value.basis}).` : ""}` }];
  });
}

const TONE: Record<FindingTone, number> = { risk: 0, opportunity: 1, context: 2 };
const KIND: Record<FindingKind, number> = { target: 0, signal: 1, cross: 2, tension: 3, gap: 4, mix: 5, anomaly: 6, streak: 7, benchmark: 8, concentration: 9, driver: 10 };
/** Money at stake first, then risk before opportunity, then the more diagnostic kinds. */
export const rankFindings = (xs: Finding[]) => [...xs].sort((a, b) =>
  (b.inr ?? -1) - (a.inr ?? -1) || TONE[a.tone] - TONE[b.tone] || KIND[a.kind] - KIND[b.kind]);

/** Every chapter's findings, ranked. Derived chapters read the ranked ledger instead. */
export function findingsFor(model: ReportModel): Record<string, Finding[]> {
  const ctx = valueContext(model);
  const targets = model.customization?.targets ?? {};
  const out: Record<string, Finding[]> = {};
  const targeted = new Set<string>();
  for (const spec of chapters.filter((c) => !c.derived)) {
    const data = model.chapters[spec.id];
    if (!data) continue;
    out[spec.id] = [
      ...targetFindings(spec, data, targets, ctx, targeted),
      ...movementBridge(spec, data),
      ...chapterGaps(spec, data, ctx),
      ...historyFindings(spec, data, ctx),
      ...(data.groups ?? []).flatMap((table) => groupFindings(spec, table, ctx)),
    ];
  }
  for (const f of crossFindings(model, ctx)) (out[f.chapter] ??= []).push(f);
  for (const s of model.signals ?? [])
    (out["executive-summary"] ??= []).push({ chapter: "executive-summary", focus: "cross", kind: "signal",
      tone: s.severity === "opportunity" ? "opportunity" : s.severity === "context" ? "context" : "risk",
      inr: s.impactINR > 0 ? s.impactINR : undefined, text: `${s.title} — ${s.entity}: ${s.text} (${s.n} records).` });
  for (const id of Object.keys(out)) out[id] = rankFindings(out[id]);
  return out;
}

/** The whole report's findings in one ranked list: what the action plan prioritises from. */
export const ledger = (findings: Record<string, Finding[]>) => rankFindings(Object.values(findings).flat());

export function findingsPayload(findings: Finding[], limit = 14) {
  if (!findings.length) return "";
  const title = (id: string) => chapters.find((c) => c.id === id)?.nav ?? id;
  return "Analyst findings (engine-computed and verified; ranked by money at stake, then risk):\n" + findings.slice(0, limit).map((f, i) =>
    `F${i + 1} [${f.tone} · ${f.kind} · focus ${f.focus} · ${title(f.chapter)}${f.inr ? ` · ≈${inr(f.inr)} at stake` : ""}] ${f.text}`).join("\n");
}

/** Next-month scenarios built from the studio's own seasonality and recent run-rate. */
export function seasonalScenario(id: string, data: ChapterData, month: string) {
  const at = (key: string) => num(data.history?.find((row) => String(row.month) === key)?.[id]);
  const current = num(data.total[id]) ?? at(month);
  if (current == null) return null;
  const recent = [0, -1, -2].map((k) => at(shiftMonth(month, k))).filter((v): v is number => v != null);
  const run = recent.length === 3 ? recent.reduce((s, v) => s + v, 0) / 3 : null;
  const thisLY = at(shiftMonth(month, -12)), nextLY = at(shiftMonth(month, -11));
  let seasonal: number | null = null;
  if (thisLY != null && nextLY != null)
    seasonal = isRate(id) ? Math.min(1, Math.max(0, current + (nextLY - thisLY))) : thisLY !== 0 ? Math.max(0, current * (nextLY / thisLY)) : null;
  return { current, run, seasonal, thisLY, nextLY };
}
