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

/* ------------------------------------------------------------------ anatomy --- */

/** A count a revenue figure can be decomposed by: revenue = volume × spend per unit. */
const VOLUMES: { id: string; per: string }[] = [
  { id: "transactions", per: "Average spend per transaction" },
  { id: "buyers", per: "Average spend per buyer" },
  { id: "attendance", per: "Revenue per visit" },
  { id: "bookings", per: "Revenue per booking" },
  { id: "sessions", per: "Revenue per session" },
  { id: "new_clients", per: "Revenue per newcomer" },
];
const REVENUES = ["gross_revenue", "net_revenue", "collected_revenue", "revenue"];

export interface Anatomy {
  metric: string; volume: string; volumeLabel: string; priceLabel: string;
  /** Contribution of more or fewer purchases, at last month's spend per purchase. */
  volumeEffect: number;
  /** Contribution of higher or lower spend per purchase, on this month's purchases. */
  priceEffect: number;
  /** The month's actual revenue movement, which the two effects add up to exactly. */
  net: number;
  volumeNow: number; volumePrior: number; priceNow: number; pricePrior: number;
  /** Set when the report's own average-order-value measure is calculated on another basis. */
  basisNote?: string;
}

/**
 * What created the revenue movement: more or fewer purchases, or more or less spent on each.
 * Prices are derived from the chapter's own revenue and count so the two effects add up to
 * the recorded movement exactly — the panel never presents a decomposition that does not
 * reconcile. Where the report's own average-order-value measure disagrees, the mismatch is
 * surfaced rather than hidden, because it means the two figures are built on different bases.
 */
export function revenueAnatomy(data: ChapterData | undefined, ids: string[]): Anatomy | null {
  if (!data) return null;
  const pool = [...new Set([...ids, ...REVENUES])];
  const revenue = REVENUES.map(id => pool.includes(id) ? id : "").find(id => id && num(data.total[id]) != null && num(data.prior[id]) != null);
  if (!revenue) return null;
  const volume = VOLUMES.find(v => num(data.total[v.id]) != null && num(data.prior[v.id]) != null);
  if (!volume) return null;
  const r1 = num(data.total[revenue])!, r0 = num(data.prior[revenue])!;
  const v1 = num(data.total[volume.id])!, v0 = num(data.prior[volume.id])!;
  if (!v1 || !v0) return null;
  const p1 = r1 / v1, p0 = r0 / v0;
  const stated = num(data.total.aov);
  const derived = p1;
  const basisNote = stated != null && derived && Math.abs(stated - derived) / Math.abs(derived) > 0.02
    ? `The report's own average-order-value measure reads ${fmt("aov", stated)} against ${fmt(revenue, derived)} derived here — the two are calculated on different bases, so read them separately.`
    : undefined;
  return { metric: revenue, volume: volume.id, volumeLabel: label(volume.id), priceLabel: volume.per,
    volumeEffect: (v1 - v0) * p0, priceEffect: (p1 - p0) * v1, net: r1 - r0,
    volumeNow: v1, volumePrior: v0, priceNow: p1, pricePrior: p0, basisNote };
}

export interface QualityRow { id: string; label: string; value: number; change: number }
export interface Quality {
  rows: QualityRow[];
  /** Volume-led, value-led, broad-based or contracting — read from the signs, nothing inferred. */
  verdict: string;
  diagnosis: string;
  trend: "improving" | "deteriorating" | "mixed";
}

/**
 * Is the movement real? Revenue momentum read beside the momentum of the things that
 * produce it — purchases, buyers and spend per purchase. The verdict is read from the
 * direction of those recorded figures, so it states a pattern rather than a cause.
 */
export function revenueQuality(data: ChapterData | undefined, ids: string[]): Quality | null {
  if (!data) return null;
  const anatomy = revenueAnatomy(data, ids);
  if (!anatomy) return null;
  const wanted = [...new Set([anatomy.metric, anatomy.volume, "buyers", "aov"].filter(id => id && definition(id)) as string[])];
  const rows = wanted.map(id => {
    const now = num(data.total[id]), was = num(data.prior[id]);
    return now == null || was == null || was === 0 ? null : { id, label: label(id), value: now, change: (now - was) / Math.abs(was) };
  }).filter((row): row is QualityRow => !!row);
  if (rows.length < 3) return null;
  const rev = rows[0].change, vol = rows[1].change, basket = rows.find(r => r.id === "aov")?.change ?? null;
  const moved = (v: number) => Math.abs(v) >= 0.005;
  const up = (v: number) => v > 0;
  let verdict = "Broad-based", diagnosis = `Revenue and ${label(anatomy.volume).toLowerCase()} moved together, so the month's change is carried by participation as much as by spend.`, trend: Quality["trend"] = "improving";
  if (moved(rev) && moved(vol) && up(rev) && !up(vol)) {
    verdict = "Value-led"; trend = "mixed";
    diagnosis = `Revenue rose ${pct(rev)} while ${label(anatomy.volume).toLowerCase()} fell ${pct(Math.abs(vol))}${basket != null ? `, so the month rests on spend per ${anatomy.volume === "buyers" ? "buyer" : "purchase"} (${pct(basket)})` : ""}. Growth of this kind lasts only while spending holds up.`;
  } else if (moved(rev) && moved(vol) && !up(rev) && up(vol)) {
    verdict = "Price-led decline"; trend = "mixed";
    diagnosis = `Revenue fell ${pct(Math.abs(rev))} while ${label(anatomy.volume).toLowerCase()} rose ${pct(vol)}, so the loss is in value per ${anatomy.volume === "buyers" ? "buyer" : "purchase"} rather than in demand.`;
  } else if (moved(rev) && moved(vol) && !up(rev) && !up(vol)) {
    verdict = "Contracting"; trend = "deteriorating";
    diagnosis = `Revenue and ${label(anatomy.volume).toLowerCase()} both fell, which is a demand problem rather than a pricing or mix problem.`;
  } else if (moved(rev) && !up(rev)) {
    verdict = "Softening"; trend = "deteriorating";
    diagnosis = `Revenue fell while ${label(anatomy.volume).toLowerCase()} held, so the change sits in what each ${anatomy.volume === "buyers" ? "buyer" : "purchase"} is worth.`;
  } else if (moved(vol) && !up(vol)) {
    verdict = "Volume watch"; trend = "deteriorating";
    diagnosis = `Revenue held while ${label(anatomy.volume).toLowerCase()} fell, so the topline is being propped up by spend per ${anatomy.volume === "buyers" ? "buyer" : "purchase"}.`;
  }
  return { rows, verdict, diagnosis, trend };
}

const pct = (value: number) => `${value > 0 ? "+" : "−"}${(Math.abs(value) * 100).toFixed(1)}%`;

export interface PortfolioRow {
  name: string;
  /** The value the chapter ranks on, and its movement. */
  value: number; prior: number; change: number; growth: number;
  /** The additive measure the row contributes to, and its share of that total. */
  contribution: number; share: number;
}
export interface PortfolioGroup { quadrant: "growth" | "protect" | "emerging" | "under"; name: string; question: string; action: string; rows: PortfolioRow[] }
export interface PortfolioMap {
  /** The criterion the positions are read on; contribution is a share of an additive measure. */
  metric: string; contribution: string; field: string; title: string; latest: string; groups: PortfolioGroup[];
}

/** Which products, formats or channels deserve attention, read on contribution against momentum. */
const QUADRANTS: { quadrant: PortfolioGroup["quadrant"]; name: string; question: string; action: string }[] = [
  { quadrant: "growth", name: "Growth engines", question: "Large and improving", action: "Protect the conditions that produced this." },
  { quadrant: "protect", name: "Protect & optimise", question: "Large but losing ground", action: "Work the specific mechanism behind the fall." },
  { quadrant: "emerging", name: "Emerging opportunities", question: "Small but improving fast", action: "Decide whether to fund the next step." },
  { quadrant: "under", name: "Underperformers", question: "Small and losing ground", action: "Fix, fold or stop — decide with a date." },
];
const PORTFOLIO_FIELDS = ["product", "category", "format_group", "source", "entry_type", "format", "status"];
const additive = (id: string) => definition(id)?.aggregation === "sum";

/**
 * Contribution against momentum for the chapter's product, format or channel breakdown.
 * Contribution is the row's share of an additive measure — a share of a rate would be
 * meaningless, so a breakdown ranked on fill rate or conversion is placed on the volume it
 * carries and read on that rate's movement. The large/small line is the median share of this
 * month's own total rather than a threshold somebody chose by hand.
 */
export function portfolioMap(data: ChapterData | undefined, ids: string[]): PortfolioMap | null {
  if (!data?.groups?.length) return null;
  const tables = [...data.groups].filter(t => t.prior && t.rows.length >= 3 && t.compare)
    .sort((a, b) => PORTFOLIO_FIELDS.indexOf(a.field) - PORTFOLIO_FIELDS.indexOf(b.field) || b.rows.length - a.rows.length);
  for (const table of tables) {
    if (!PORTFOLIO_FIELDS.includes(table.field)) continue;
    const metric = table.compare!;
    /* Ranked on a total: the row's share of that same total. Ranked on a rate: the volume it carries. */
    const contribution = additive(metric) && num(table.total?.[metric]) != null ? metric
      : table.columns.find(column => column !== metric && additive(column) && num(table.total?.[column]) != null);
    if (!contribution) continue;
    const total = num(table.total?.[contribution]);
    const rows = table.rows.map(row => {
      const now = num(row[metric]), was = num(table.prior?.[String(row.g)]?.[metric]);
      const units = num(row[contribution]);
      if (now == null || was == null || !was || units == null) return null;
      return { name: String(row.g ?? "Unspecified"), value: now, prior: was, change: now - was, growth: (now - was) / Math.abs(was), contribution: units, share: total ? units / total : 0 };
    }).filter((row): row is PortfolioRow => !!row);
    if (rows.length < 3 || !total) continue;
    const shares = [...rows.map(r => r.share)].sort((a, b) => a - b);
    const medianShare = shares[Math.floor(shares.length / 2)];
    const band = 0.02;
    const groups = QUADRANTS.map(q => ({ ...q, rows: rows.filter(row => {
      const big = row.share >= medianShare;
      if (Math.abs(row.growth) < band && !big) return false;
      return q.quadrant === "growth" ? big && row.growth >= band
        : q.quadrant === "protect" ? big && row.growth <= -band
        : q.quadrant === "emerging" ? !big && row.growth >= band
        : !big && row.growth <= -band;
    }).sort((a, b) => b.contribution - a.contribution) })).filter(group => group.rows.length);
    if (groups.length < 2) continue;
    return { metric, contribution, field: table.field, title: table.title, latest: label(metric), groups };
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
 * The next questions a chapter raises — the work still to be done rather than what the
 * page has already said. Each is offered only when the chapter holds the figures that
 * would answer it, so the reader never gets a prompt the report cannot support.
 */
export function askAtlas(model: ReportModel, id: string, ids: string[]): { q: string; hint: string }[] {
  const data = model.chapters[id];
  if (!data) return [];
  const out: { q: string; hint: string }[] = [];
  const has = (metric: string) => definition(metric) != null && num(data.total[metric]) != null;
  const table = (fields: string[]) => data.groups.find(t => t.prior && t.compare && fields.includes(t.field) && t.rows.length >= 3);
  if (has("gross_revenue") && has("transactions") && (has("buyers") || has("aov")))
    out.push({ q: "Are fewer people buying more often, or are individual purchases simply getting larger?", hint: "Separates the move in purchase count from the move in spend per purchase." });
  const growth = table(["product", "category", "format_group", "format"]);
  if (growth) {
    const metricNow = growth.compare!;
    const top = growth.rows.map(row => ({ name: String(row.g ?? ""), gain: (num(row[metricNow]) ?? 0) - (num(growth.prior?.[String(row.g)]?.[metricNow]) ?? 0) })).sort((a, b) => b.gain - a.gain)[0];
    if (top?.name) out.push({ q: `Would the month have looked the same without ${top.name}?`, hint: `Tests whether the result rests on one line of the business rather than the whole of it.` });
  }
  if (has("discount_rate") || data.groups.some(t => t.columns.includes("discount_rate")))
    out.push({ q: "Did discounting add purchases, or only reduce what each purchase was worth?", hint: "Discount rate read against transaction count, by product and by associate." });
  const concentration = data.groups.map(t => t.analysis?.concentration).find(Boolean);
  if (concentration?.metric)
    out.push({ q: `How much of ${label(concentration.metric).toLowerCase()} rests on the largest few rows?`, hint: `${concentration.top1.g} carries ${(concentration.top1.share * 100).toFixed(0)}% already; the question is what happens if that slips.` });
  const people = table(["source", "entry_type", "trainer", "associate"]);
  if (people) out.push({ q: `Which ${people.field === "trainer" || people.field === "associate" ? "people" : "sources"} moved most, once the slots they carry are separated out?`, hint: "Same ranking, read within each row's own mix rather than across the whole chapter." });
  if (has("revenue_at_risk_30d") || has("utilisation") || has("dormant_actives"))
    out.push({ q: "Which memberships carry the most recoverable value in the next 30 days?", hint: "Expiring balances against the renewal rate those balances have historically converted at." });
  if (has("buyers") || has("new_clients") || has("conversion_rate"))
    out.push({ q: "Which customers contributed most to the change in spend per purchase?", hint: "Cohorts behind the move: new, returning and renewing buyers." });
  out.push({ q: "Which of this month's sales are least likely to repeat next month?", hint: "Separates repeatable demand from one-off purchases before the next month is planned." });
  const seen = new Set<string>();
  return out.filter(item => !seen.has(item.q) && seen.add(item.q)).slice(0, 4);
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
