import type { Row } from "../data/duckdb";
import { chapters, type ChapterSpec } from "./chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "./definitions";
import { seasonalScenario } from "./findings";
import type { ChapterBriefing, ChapterData, GroupTable, InsightCard, LeadershipDecision, ReportModel } from "./model";
import { monthLabel, shiftMonth } from "./period";

const label = (id: string) => definition(id)?.label ?? id;
const higher = (id: string) => definition(id)?.higherIsBetter ?? true;
const num = (v: unknown) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const sentences = (text?: string) => (text ?? "").split(/(?<=[.!?])\s+(?=[A-Z₹0-9“"(])/).map(s => s.trim()).filter(Boolean);

/** The chapter verdict card: the one marked kpis, else the first. */
export const verdictCard = (model: ReportModel, id: string): InsightCard | undefined => {
  const cards = model.narratives[id]?.cards ?? [];
  return cards.find(c => c.focus === "kpis") ?? cards[0];
};

/** Lead measures with a value this month, in the chapter's priority order. */
export function leadMetrics(spec: ChapterSpec | undefined, data: ChapterData | undefined, priority: string[] = []) {
  if (!spec || !data) return [];
  return [...new Set([...priority, ...spec.metrics])].filter(id => definition(id) && data.total[id] != null);
}

/** "Attendance 939, +4.7% MoM, +3.4% YoY" from the frozen figures. */
export const figureLine = (id: string, data: ChapterData) =>
  `${label(id)} ${fmt(id, data.total[id])}${data.prior[id] != null ? `, ${delta(id, data.total[id], data.prior[id])} vs ${monthLabel(String(data.history.at(-2)?.month ?? "")).split(" ")[0] || "last month"}` : ""}${data.priorYear[id] != null ? `, ${delta(id, data.total[id], data.priorYear[id])} YoY` : ""}`;

/** Where the selected month ranks among this calendar year's observed months, best first. */
export function yearPosition(id: string, data: ChapterData, month: string) {
  const year = month.slice(0, 4);
  const observed = data.history.filter(r => String(r.month).startsWith(year) && String(r.month) <= month && num(r[id]) != null);
  const value = num(data.total[id]);
  if (value == null || observed.length < 3) return null;
  const better = observed.filter(r => higher(id) ? Number(r[id]) > value : Number(r[id]) < value).length;
  return { rank: better + 1, of: observed.length };
}

/** Fourteen-month high and low of one measure. */
export function extremes(id: string, data: ChapterData) {
  const points = data.history.map(r => ({ month: String(r.month), v: num(r[id]) })).filter((p): p is { month: string; v: number } => p.v != null);
  if (points.length < 3) return null;
  const hi = points.reduce((a, b) => b.v > a.v ? b : a), lo = points.reduce((a, b) => b.v < a.v ? b : a);
  return { hi, lo, months: points.length };
}

/** Largest relative moves against the previous month. */
export function movers(data: ChapterData, ids: string[], count = 3) {
  return ids.filter(id => num(data.total[id]) != null && num(data.prior[id]))
    .map(id => ({ id, change: Number(data.total[id]) / Number(data.prior[id]) - 1 }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, count);
}

/**
 * The briefing for a chapter: the AI's v3 briefing when written, otherwise
 * assembled from the verdict card and the frozen figures, and labelled as such.
 */
export function briefingOf(model: ReportModel, id: string, ids: string[]): ChapterBriefing & { written: boolean } {
  const n = model.narratives[id];
  const v = verdictCard(model, id);
  const data = model.chapters[id];
  const computed = data ? movers(data, ids, 4).map(m => figureLine(m.id, data)) : [];
  const summary = sentences(n?.summary);
  return {
    written: !!n?.briefing,
    takeaways: (summary.length >= 3 ? summary.slice(0, 4) : [...summary, ...computed]).slice(0, 4),
    whatChanged: v?.evidence || computed.slice(0, 2).join("; "),
    whyItMoved: v?.driver || v?.reasoning || "",
    whereItSits: v?.concentration || "",
    whatHeldUp: v?.offset || "",
    outlook: [v?.trend, v?.watch && `Watch: ${v.watch}`].filter(Boolean).join(" "),
    soWhat: v?.meaning || "",
    ...present(n?.briefing),
  };
}
/** Fields actually written (by the AI or an admin), so a partial edit keeps the rest. */
const present = <T extends object>(o?: T) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => Array.isArray(v) ? v.length : typeof v === "string" ? v.trim() : v != null)) as Partial<T>;

/** The leadership decision: the AI's v3 decision, else built from the verdict card. */
export function decisionOf(model: ReportModel, id: string): (LeadershipDecision & { written: boolean }) | null {
  const n = model.narratives[id];
  const v = verdictCard(model, id);
  const call = n?.decision?.call || v?.action || v?.recommendation;
  if (!call) return null;
  return { written: !!n?.decision?.call, call, rationale: (v?.recommendation && v.action ? v.recommendation : v?.meaning) ?? "", evidence: sentences(v?.evidence),
    expectedImpact: v?.impact ?? "", successMeasure: v?.watch ?? "", risks: v?.offset ? `Counter-signal to keep in view: ${v.offset}` : "", alternative: "", owner: v?.ownerArea, horizon: v?.horizon,
    ...present(n?.decision) };
}

/**
 * Words that carry a sentence, for spotting prose that says the same thing twice.
 * Articles, prepositions and connectives are dropped so only the substance counts.
 */
const SUBSTANCE = 4;
const terms = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9%₹.,]+/g) ?? []).filter(word => word.length > SUBSTANCE));
const overlap = (a: string, b: string) => {
  const A = terms(a), B = terms(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const word of A) if (B.has(word)) shared++;
  return shared / Math.min(A.size, B.size);
};

/**
 * The reading, deduplicated. A briefing answers several questions from the same month,
 * so fields frequently restate each other; repeating a sentence at a second heading
 * costs the reader attention and makes the page feel padded. Lines that largely repeat
 * the headline or an earlier line are dropped, and the reading never runs past three.
 */
export function readingLines(b: ChapterBriefing, headline = ""): string[] {
  const kept: string[] = [];
  for (const line of [b.whatChanged, b.whyItMoved, b.whereItSits, b.whatHeldUp, b.soWhat].map(t => (t ?? "").trim()).filter(Boolean)) {
    if (headline && overlap(line, headline) > .6) continue;
    if (kept.some(existing => overlap(existing, line) > .5)) continue;
    kept.push(line);
    if (kept.length === 3) break;
  }
  return kept;
}

export interface DriverRow { name: string; change: number; value: number; share: number }
export interface DriverBridge {
  metric: string; net: number; peak: number; rows: DriverRow[]; rest: { count: number; change: number } | null; groups: number;
}

/**
 * What actually moved the number: each row of the chapter's primary breakdown,
 * measured as its contribution to the month-on-month change. Contributions come from
 * recorded rows only and are read as arithmetic on them, not as attribution — rows
 * that partition the total add up to the net movement, which is what the panel states.
 */
export function driverBridge(data: ChapterData | undefined, ids: string[]): DriverBridge | null {
  if (!data) return null;
  for (const table of data.groups ?? []) {
    const metric = (table.compare && table.columns.includes(table.compare) ? table.compare : table.columns.find(column => definition(column) && table.columns.includes(column))) ?? "";
    if (!metric || !table.prior || table.rows.length < 3) continue;
    const rows = table.rows.map(row => {
      const now = num(row[metric]), was = num(table.prior?.[String(row.g)]?.[metric]);
      return now == null || was == null ? null : { name: String(row.g ?? "Unspecified"), change: now - was, value: now };
    }).filter((row): row is { name: string; change: number; value: number } => !!row && row.change !== 0);
    if (rows.length < 3) continue;
    const net = rows.reduce((sum, row) => sum + row.change, 0);
    const ranked = [...rows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const shown = ranked.slice(0, 5);
    const tail = ranked.slice(5);
    const peak = Math.max(...shown.map(row => Math.abs(row.change)), 0);
    return { metric, net, peak, groups: data.groups.length,
      rows: shown.map(row => ({ ...row, share: peak ? Math.abs(row.change) / peak : 0 })),
      rest: tail.length ? { count: tail.length, change: tail.reduce((sum, row) => sum + row.change, 0) } : null };
  }
  return null;
}

/** Metrics a decision rests on: those the verdict cites, else the chapter's largest movers. */
export function decisionMetrics(model: ReportModel, id: string, ids: string[]) {
  const data = model.chapters[id];
  const cited = (verdictCard(model, id)?.metrics ?? []).filter(m => data?.total[m] != null);
  return [...new Set([...cited, ...(data ? movers(data, ids, 4).map(m => m.id) : [])])].slice(0, 4);
}

export interface Performer { g: string; value: number; prior: number | null; yoy: number | null; n: number; share: number | null; row: Row }
/** Every eligible group ranked on one measure, best first by that measure's direction of good. */
export function rankPerformers(table: GroupTable, metric: string): Performer[] {
  const pool = (table.eligible?.length ? table.eligible : table.rows).filter(r => num(r[metric]) != null);
  const total = num(table.total?.[metric]);
  const additive = definition(metric)?.aggregation === "sum";
  return pool.map(r => ({
    g: String(r.g), value: Number(r[metric]), n: Number(r.n ?? 0), row: r,
    prior: num(table.prior?.[String(r.g)]?.[metric]), yoy: num(table.priorYear?.[String(r.g)]?.[metric]),
    share: additive && total ? Number(r[metric]) / total : null,
  })).sort((a, b) => higher(metric) ? b.value - a.value : a.value - b.value);
}

/** Written context for a ranked list, computed from the figures. */
export function performerContext(table: GroupTable, metric: string, top: Performer[], bottom: Performer[], all: Performer[]) {
  const lines: string[] = [];
  if (!all.length) return lines;
  const values = all.map(p => p.value).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const best = all[0], worst = all.at(-1)!;
  lines.push(`${all.length} eligible ${all.length === 1 ? "group" : "groups"}; ${label(metric).toLowerCase()} runs from ${fmt(metric, worst.value)} (${worst.g}) to ${fmt(metric, best.value)} (${best.g}), median ${fmt(metric, median)}.`);
  const share = top.reduce((s, p) => s + (p.share ?? 0), 0);
  if (share > 0) lines.push(`The top ${top.length} hold ${(share * 100).toFixed(0)}% of the total.`);
  const risers = all.filter(p => p.prior != null).map(p => ({ g: p.g, change: p.value - p.prior! })).sort((a, b) => (higher(metric) ? b.change - a.change : a.change - b.change));
  if (risers.length > 1) lines.push(`Biggest improvement vs last month: ${risers[0].g} (${fmt(metric, risers[0].change)} change); biggest slip: ${risers.at(-1)!.g} (${fmt(metric, risers.at(-1)!.change)}).`);
  const lift = table.analysis?.medianLift;
  if (lift && lift.metric === metric && lift.groupsBelow) lines.push(`Lifting the ${lift.groupsBelow} groups below the median to it is worth about ${fmt(lift.metric, lift.units)} (indicative).`);
  const thin = bottom.filter(p => p.n < 5).length;
  if (thin) lines.push(`${thin} of the bottom ${bottom.length} rest on fewer than five records — read as signals, not verdicts.`);
  return lines;
}

export interface Scenario { id: string; current: number; prior: number | null; flat: number; repeat: number | null; run: number | null; seasonal: number | null; thisLY: number | null; nextLY: number | null }
/** Conditional next-month arithmetic per measure; not forecasts. */
export function scenariosFor(spec: ChapterSpec, data: ChapterData, month: string): Scenario[] {
  return [...new Set([...spec.history, ...spec.metrics])].filter(id => definition(id)).flatMap(id => {
    const s = seasonalScenario(id, data, month);
    if (!s) return [];
    const prior = num(data.prior[id]);
    const rate = definition(id)?.format === "percent";
    const repeat = prior == null ? null : rate ? Math.min(1, Math.max(0, s.current + (s.current - prior))) : prior ? Math.max(0, s.current * (s.current / prior)) : null;
    return [{ id, current: s.current, prior, flat: s.current, repeat, run: s.run, seasonal: s.seasonal, thisLY: s.thisLY, nextLY: s.nextLY }];
  }).slice(0, 6);
}

/**
 * Questions senior leadership tends to ask about a chapter, answered from the
 * frozen figures. The AI's own question bank, when written, leads.
 */
export function questionBank(model: ReportModel, id: string, ids: string[]): { q: string; a: string; source: "ai" | "figures" }[] {
  const n = model.narratives[id];
  const data = model.chapters[id];
  const spec = chapters.find(c => c.id === id);
  const v = verdictCard(model, id);
  const out: { q: string; a: string; source: "ai" | "figures" }[] = (n?.questions ?? []).map(x => ({ ...x, source: "ai" as const }));
  const add = (q: string, a?: string | null) => { if (a && !out.some(x => x.q === q)) out.push({ q, a, source: "figures" }); };
  if (data && ids.length) {
    const lead = ids[0];
    add("How does this compare with the same month last year?", ids.slice(0, 3).filter(m => data.priorYear[m] != null).map(m => `${label(m)} ${fmt(m, data.total[m])} vs ${fmt(m, data.priorYear[m])} (${delta(m, data.total[m], data.priorYear[m])})`).join("; "));
    const pos = yearPosition(lead, data, model.scope.month);
    add(`Is this a good month for ${label(lead).toLowerCase()} by this year's standards?`, pos && `It ranks ${pos.rank} of ${pos.of} observed months in ${model.scope.month.slice(0, 4)} (1 = best).${data.yearToDate?.[lead] != null ? ` Year to date ${fmt(lead, data.yearToDate[lead])}${data.priorYearToDate?.[lead] != null ? `, ${delta(lead, data.yearToDate[lead], data.priorYearToDate[lead])} on the same period last year` : ""}.` : ""}`);
    const ex = extremes(lead, data);
    add(`What are the 14-month high and low?`, ex && `High ${fmt(lead, ex.hi.v)} in ${monthLabel(ex.hi.month)}; low ${fmt(lead, ex.lo.v)} in ${monthLabel(ex.lo.month)}. This month: ${fmt(lead, data.total[lead])}.`);
    const run = seasonalScenario(lead, data, model.scope.month);
    add("Is it above or below the recent run-rate?", run?.run != null ? `The three-month average is ${fmt(lead, run.run)}; this month is ${fmt(lead, run.current)}.` : null);
    const g = data.groups.find(t => t.analysis?.gainers?.length || t.analysis?.decliners?.length);
    const a = g?.analysis;
    if (g && a?.metric) add(`Which ${g.title.toLowerCase().replace(/^.*\bby\b\s*/, "") || "segments"} drove the change?`, [a.gainers?.[0] && `${a.gainers[0].g} added ${fmt(a.metric, a.gainers[0].change)}`, a.decliners?.[0] && `${a.decliners[0].g} fell ${fmt(a.metric, Math.abs(a.decliners[0].change))}`].filter(Boolean).join("; ") + ` on ${label(a.metric).toLowerCase()}.`);
    const c = data.groups.find(t => t.analysis?.concentration)?.analysis?.concentration;
    if (c) add("How concentrated is it?", `${c.top1.g} alone is ${(c.top1.share * 100).toFixed(0)}% of ${label(c.metric).toLowerCase()}; the top three are ${(c.top3Share * 100).toFixed(0)}% across ${c.groups} groups.`);
    add("How much data sits behind these figures?", `${data.n.toLocaleString("en-IN")} contributing records for ${model.scope.studio} in ${monthLabel(model.scope.month)}, frozen at report build.${spec?.network ? " These are account-level figures, not studio-attributed." : ""}${data.notes?.length ? ` Caveat: ${data.notes[0]}` : ""}`);
  }
  if (v?.trend) add("Is this structural or a one-off?", v.trend);
  if (v?.impact) add("What is it worth in rupees?", v.impact);
  if (v?.driver) add("What is the evidence for the cause?", `${v.driver}${v.confidence ? ` Confidence: ${v.confidence}.` : ""}`);
  if (v?.ownerArea || v?.horizon) add("Who owns this, and by when?", [v.ownerArea, v.horizon].filter(Boolean).join(" · "));
  return out.slice(0, 12);
}

/** Months between the report month and its comparisons, for labels. */
export const comparisonMonths = (month: string) => ({ prior: monthLabel(shiftMonth(month, -1)), lastYear: monthLabel(shiftMonth(month, -12)) });
