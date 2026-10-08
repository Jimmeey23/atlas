import { metrics } from '../src/semantics/metrics.ts';
import { formatField } from '../src/semantics/formats.ts';
import { compileMetricQuery, metricSource } from './agent-metrics.mjs';
import { toolScope } from './agent-scope.mjs';

/**
 * Higher-level analysis tools for the studio agent. Each one composes governed
 * metric queries (compileMetricQuery) and does the arithmetic on the server, so
 * the model reasons over finished comparisons, driver splits, projections and
 * outliers instead of hand-writing fragile SQL.
 *
 * ctx = { run(sql, filters) → {rows, provenance, filters}, defaults, available, rate, today }
 */

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 4) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const iso = (d) => d.toISOString().slice(0, 10);
const dayMs = 86400000;
const parse = (s) => new Date(s + 'T00:00:00Z');
const isRate = (id) => ['percent', 'ratio', 'decimal', 'days'].includes(metrics[id]?.format);
/** Totals that add up across studios, weeks and instructors (counts and money, not averages). */
export const additive = (id) =>
  ['integer', 'currency'].includes(metrics[id]?.format) &&
  !/^(aov|arpu|avg_|rev_pa|revenue_per|new_revenue_per|payroll_revenue_per|meta_cp|website_ltv|break_even|gap_to)|_per_/.test(id);

function checkMetrics(source, ids, available) {
  if (!available.includes(source)) throw new Error(`Unknown source ${source}.`);
  for (const id of ids) {
    if (!metrics[id]) throw new Error(`Unknown metric ${id}. Pick one from the metric catalog.`);
    if (metricSource(id) !== source) throw new Error(`${id} belongs to ${metricSource(id)}, not ${source}.`);
  }
}

async function metricRows(ctx, source, ids, groups, scope, extra = {}) {
  const compiled = compileMetricQuery({ source, metric_ids: ids, group_by: groups, scope_json: scope, ...extra }, ctx.defaults, ctx.available, ctx.rate);
  const result = await ctx.run(compiled.sql, compiled.filters);
  return { ...result, sql: compiled.sql, filters: compiled.filters, snapshot: compiled.snapshot };
}

const keyOf = (row, groups) => groups.map((g) => row[g] ?? '—').join(' · ') || 'Total';
const scopeLabel = (f) => `${(f.location || []).join(', ') || 'All studios'} · ${f.from || 'all dates'}${f.to ? ' → ' + f.to : ''}`;
const pctChange = (a, b) => (a == null || b == null || a === 0 ? null : (b - a) / Math.abs(a));

/** Change between two values, in percentage points for rates and % for totals. */
export function describeChange(id, a, b) {
  if (a == null || b == null) return { change: null, change_pct: null, material: false, direction: 'unknown' };
  const change = b - a;
  const pct = pctChange(a, b);
  const material = metrics[id]?.format === 'percent' ? Math.abs(change) >= 0.02 : pct == null ? change !== 0 : Math.abs(pct) >= 0.05;
  return { change: round(change), change_pct: round(pct), ...(metrics[id]?.format === 'percent' ? { change_pp: round(change * 100, 2) } : {}), material, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' };
}

export async function comparePeriods(args, ctx) {
  const ids = args.metric_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 8) throw new Error('Choose 1–8 metrics.');
  checkMetrics(args.source, ids, ctx.available);
  const groups = args.group_by ? [args.group_by] : [];
  const [a, b] = await Promise.all([args.period_a, args.period_b].map((p) => metricRows(ctx, args.source, ids, groups, p, { exclude_hosted: !!args.exclude_hosted })));
  const keys = [...new Set([...a.rows, ...b.rows].map((r) => keyOf(r, groups)))];
  const rows = keys.map((k) => {
    const ra = a.rows.find((r) => keyOf(r, groups) === k) || {};
    const rb = b.rows.find((r) => keyOf(r, groups) === k) || {};
    const out = groups.length ? { [groups[0]]: k } : {};
    for (const id of ids) {
      const va = num(ra[id]), vb = num(rb[id]);
      const c = describeChange(id, va, vb);
      Object.assign(out, { [`${id}_a`]: va, [`${id}_b`]: vb, [`${id}_change`]: c.change, [`${id}_change_pct`]: c.change_pct, ...(c.change_pp != null ? { [`${id}_change_pp`]: c.change_pp } : {}), [`${id}_material`]: c.material });
    }
    out.sample_a = num(ra.source_records); out.sample_b = num(rb.source_records);
    return out;
  });
  return {
    output: { period_a: scopeLabel(a.filters), period_b: scopeLabel(b.filters), snapshot: a.snapshot, note: 'a = first period, b = second period; change = b − a; change_pct = (b − a)/|a|; change_pp is in percentage points for rates; material = |Δ| ≥ 5% (≥ 2pp for rates).', rows },
    evidence: [{ sql: `${a.sql}\n-- vs --\n${b.sql}`, provenance: a.provenance, rows: rows.length, result: rows.slice(0, 40), filters: { a: a.filters, b: b.filters } }],
  };
}

/** Each driver's share of a multiplicative change (log-mean Divisia), so the parts sum exactly to the total. */
export function splitDrivers(factors, total) {
  const [ta, tb] = total;
  if (!(ta > 0 && tb > 0) || factors.some(([, fa, fb]) => !(fa > 0 && fb > 0))) return null;
  const weight = ta === tb ? ta : (tb - ta) / Math.log(tb / ta);
  return factors.map(([label, fa, fb]) => ({ driver: label, value_a: round(fa), value_b: round(fb), change_pct: round((fb - fa) / fa), contribution: round(weight * Math.log(fb / fa), 2) }));
}

const driverSpecs = {
  'sessions:attendance': { base: ['sessions', 'attendance'], factors: [['Classes run', (r) => r.sessions], ['Attendees per class', (r) => r.attendance / r.sessions]] },
  'sessions:revenue': { base: ['sessions', 'attendance', 'revenue'], factors: [['Classes run', (r) => r.sessions], ['Attendees per class', (r) => r.attendance / r.sessions], ['Earned revenue per visit', (r) => r.revenue / r.attendance]] },
  'sales:gross_revenue': { base: ['gross_revenue', 'transactions'], factors: [['Transactions', (r) => r.transactions], ['Average order value', (r) => r.gross_revenue / r.transactions]] },
  'new:new_converted': { base: ['new_clients', 'new_converted'], factors: [['Newcomers', (r) => r.new_clients], ['Conversion rate', (r) => r.new_converted / r.new_clients]] },
  'new:new_retained': { base: ['new_clients', 'new_retained'], factors: [['Newcomers', (r) => r.new_clients], ['Retention rate', (r) => r.new_retained / r.new_clients]] },
  'bookings:booking_late_cancelled': { base: ['bookings', 'booking_late_cancelled'], factors: [['Bookings', (r) => r.bookings], ['Late-cancel rate', (r) => r.booking_late_cancelled / r.bookings]] },
};

export async function explainChange(args, ctx) {
  const id = args.metric_id;
  checkMetrics(args.source, [id], ctx.available);
  if (!additive(id)) throw new Error(`${id} is an average or rate. Explain the change of a total (e.g. attendance, revenue, new_converted) and use compare_periods for rates.`);
  const dims = (args.dimensions || []).slice(0, 3);
  const evidence = [];
  const extra = { exclude_hosted: !!args.exclude_hosted };
  const [ta, tb] = await Promise.all([args.period_a, args.period_b].map((p) => metricRows(ctx, args.source, [id], [], p, extra)));
  const total = [num(ta.rows[0]?.[id]) ?? 0, num(tb.rows[0]?.[id]) ?? 0];
  const delta = total[1] - total[0];
  const output = { metric: id, label: metrics[id].label, period_a: scopeLabel(ta.filters), period_b: scopeLabel(tb.filters), value_a: total[0], value_b: total[1], ...describeChange(id, total[0], total[1]) };
  const spec = driverSpecs[`${args.source}:${id}`];
  if (spec) {
    const [da, db] = await Promise.all([args.period_a, args.period_b].map((p) => metricRows(ctx, args.source, spec.base, [], p, extra)));
    const ra = Object.fromEntries(spec.base.map((k) => [k, num(da.rows[0]?.[k])]));
    const rb = Object.fromEntries(spec.base.map((k) => [k, num(db.rows[0]?.[k])]));
    const drivers = splitDrivers(spec.factors.map(([label, f]) => [label, f(ra), f(rb)]), [spec.factors.reduce((p, [, f]) => p * f(ra), 1), spec.factors.reduce((p, [, f]) => p * f(rb), 1)]);
    if (drivers) {
      output.drivers = drivers;
      output.driver_note = `${metrics[id].label} = ${spec.factors.map(([l]) => l.toLowerCase()).join(' × ')}; contributions add up to the total change.`;
      evidence.push({ sql: da.sql, provenance: da.provenance, rows: drivers.length, result: drivers, filters: { a: da.filters, b: db.filters } });
    }
  }
  output.mix = {};
  for (const dim of dims) {
    const [ga, gb] = await Promise.all([args.period_a, args.period_b].map((p) => metricRows(ctx, args.source, [id], [dim], p, extra)));
    const keys = [...new Set([...ga.rows, ...gb.rows].map((r) => keyOf(r, [dim])))];
    const parts = keys
      .map((k) => {
        const a = num(ga.rows.find((r) => keyOf(r, [dim]) === k)?.[id]) ?? 0;
        const b = num(gb.rows.find((r) => keyOf(r, [dim]) === k)?.[id]) ?? 0;
        return { [dim]: k, value_a: a, value_b: b, change: round(b - a, 2), share_of_change: delta ? round((b - a) / delta) : null };
      })
      .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
    output.mix[dim] = { biggest_increases: parts.filter((p) => p.change > 0).slice(0, 5), biggest_decreases: parts.filter((p) => p.change < 0).slice(0, 5), groups: parts.length };
    evidence.push({ sql: ga.sql, provenance: ga.provenance, rows: parts.length, result: parts.slice(0, 40), filters: { a: ga.filters, b: gb.filters } });
  }
  evidence.unshift({ sql: ta.sql, provenance: ta.provenance, rows: 1, result: [{ metric: id, value_a: total[0], value_b: total[1], change: round(delta, 2), change_pct: output.change_pct }], filters: { a: ta.filters, b: tb.filters } });
  return { output, evidence };
}

/** Least-squares line through equally spaced points: slope per step and the next value. */
export function trend(values) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 3) return null;
  const n = pts.length, mx = pts.reduce((s, [x]) => s + x, 0) / n, my = pts.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx : 0;
  return { slope: round(slope), next: round(my + slope * (values.length - mx)), per_period_pct: my ? round(slope / Math.abs(my)) : null };
}

export async function forecast(args, ctx) {
  const id = args.metric_id;
  checkMetrics(args.source, [id], ctx.available);
  const today = parse(ctx.today);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 12, 1));
  const base = args.scope_json ? JSON.parse(args.scope_json) : {};
  const scope = JSON.stringify({ ...base, from: iso(start), to: ctx.today });
  const r = await metricRows(ctx, args.source, [id], ['month'], scope, { exclude_hosted: !!args.exclude_hosted });
  if (r.snapshot) throw new Error(`${id} is a current snapshot and has no history to project.`);
  const thisMonth = ctx.today.slice(0, 7);
  const series = r.rows.map((row) => ({ month: String(row.month).slice(0, 7), value: num(row[id]) })).sort((x, y) => x.month.localeCompare(y.month));
  const completed = series.filter((p) => p.month < thisMonth).slice(-6);
  const current = series.find((p) => p.month === thisMonth);
  const daysIn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = today.getUTCDate();
  const t = trend(completed.map((p) => p.value));
  const output = { metric: id, label: metrics[id].label, scope: scopeLabel(r.filters), history: series, trend_last_6_completed_months: t };
  if (additive(id) && current) {
    output.month_to_date = current.value;
    output.days_elapsed = elapsed;
    output.days_in_month = daysIn;
    output.run_rate_projection = round((current.value / elapsed) * daysIn, 2);
    output.method = 'run rate = month-to-date ÷ days elapsed × days in month; assumes the rest of the month runs at the same daily pace.';
  } else if (current) {
    output.month_to_date = current.value;
    output.method = 'rates are not projected by run rate; use the month-to-date value and the trend.';
  }
  const target = num(args.target);
  if (target != null) {
    const projected = output.run_rate_projection ?? t?.next;
    output.target = target;
    output.projected = projected;
    output.gap_to_target = projected == null ? null : round(target - projected, 2);
    if (additive(id) && current && elapsed < daysIn) output.required_daily_pace = round((target - current.value) / (daysIn - elapsed), 2);
  }
  return { output, evidence: [{ sql: r.sql, provenance: r.provenance, rows: series.length, result: series.map((p) => ({ month: p.month, [id]: p.value })), filters: r.filters }] };
}

/** Last N complete weeks (Mon–Sun) or months ending before `today`, oldest first. */
export function periodWindows(today, grain, count) {
  const t = parse(today);
  const out = [];
  if (grain === 'week') {
    const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * dayMs);
    for (let i = count; i >= 1; i--) {
      const from = new Date(monday.getTime() - i * 7 * dayMs);
      out.push({ label: 'Week of ' + iso(from), from: iso(from), to: iso(new Date(from.getTime() + 6 * dayMs)) });
    }
  } else {
    for (let i = count; i >= 1; i--) {
      const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1));
      out.push({ label: iso(from).slice(0, 7), from: iso(from), to: iso(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0))) });
    }
  }
  return out;
}

/** Score the latest period of each series against its own history. */
export function scoreSeries(series, { minBaseline = 0 } = {}) {
  const out = [];
  for (const [key, values] of Object.entries(series)) {
    const latest = values.at(-1);
    const history = values.slice(0, -1).filter((v) => v != null);
    if (latest == null || history.length < 3) continue;
    const mean = history.reduce((s, v) => s + v, 0) / history.length;
    if (Math.abs(mean) < minBaseline) continue;
    const sd = Math.sqrt(history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length);
    const z = sd ? (latest - mean) / sd : latest === mean ? 0 : Math.sign(latest - mean) * 3;
    const pct = mean ? (latest - mean) / Math.abs(mean) : null;
    out.push({ key, latest: round(latest), baseline: round(mean), z: round(z, 2), change_vs_baseline_pct: round(pct), unusual: Math.abs(z) >= 2 && (pct == null || Math.abs(pct) >= 0.1) });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export async function findAnomalies(args, ctx) {
  const id = args.metric_id;
  checkMetrics(args.source, [id], ctx.available);
  const grain = args.grain === 'month' ? 'month' : 'week';
  const windows = periodWindows(ctx.today, grain, grain === 'week' ? 8 : 7);
  const groups = args.dimension ? [args.dimension] : [];
  const base = args.scope_json ? JSON.parse(args.scope_json) : {};
  const results = [];
  for (const w of windows) results.push(await metricRows(ctx, args.source, [id], groups, JSON.stringify({ ...base, from: w.from, to: w.to }), { exclude_hosted: !!args.exclude_hosted }));
  if (results[0].snapshot) throw new Error(`${id} is a current snapshot; it has no weekly history.`);
  const series = {};
  const samples = {};
  const flat = [];
  results.forEach((r, i) => {
    for (const row of r.rows) {
      const k = keyOf(row, groups);
      (series[k] ??= Array(windows.length).fill(null))[i] = num(row[id]);
      (samples[k] ??= Array(windows.length).fill(0))[i] = num(row.source_records) ?? 0;
      flat.push({ period: windows[i].label, ...(groups.length ? { [groups[0]]: k } : {}), [id]: num(row[id]) });
    }
  });
  // Small groups swing wildly; require a typical sample of at least 5 records.
  const eligible = Object.fromEntries(Object.entries(series).filter(([k]) => samples[k].slice(0, -1).reduce((s, v) => s + v, 0) / (windows.length - 1) >= 5));
  const scored = scoreSeries(eligible).map((s) => ({ [groups[0] || 'scope']: s.key, ...s, latest_period: windows.at(-1).label }));
  return {
    output: { metric: id, label: metrics[id].label, grain, latest_period: windows.at(-1).label, baseline_periods: windows.length - 1, method: `latest complete ${grain} vs the mean of the previous ${windows.length - 1}; unusual = |z| ≥ 2 and ≥ 10% from baseline.`, unusual: scored.filter((s) => s.unusual), all: scored.slice(0, 25) },
    evidence: [{ sql: results.at(-1).sql, provenance: results.at(-1).provenance, rows: scored.length, result: scored.slice(0, 40), filters: results.at(-1).filters }, { sql: '-- series behind the anomaly scores', provenance: results.at(-1).provenance, rows: flat.length, result: flat.slice(-40), filters: results.at(-1).filters }],
  };
}

export async function rankPerformance(args, ctx) {
  const ids = args.metric_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 6) throw new Error('Choose 1–6 metrics; the first one is the ranking metric.');
  checkMetrics(args.source, ids, ctx.available);
  const [key] = ids;
  const r = await metricRows(ctx, args.source, ids, [args.group_by], args.scope_json, { exclude_hosted: !!args.exclude_hosted });
  const min = Math.max(1, num(args.min_sample) ?? 3);
  const rows = r.rows.map((row) => ({ ...row, sample: num(row.source_records) }));
  const eligible = rows.filter((row) => row.sample >= min && num(row[key]) != null);
  const desc = args.order !== 'asc';
  eligible.sort((a, b) => (desc ? num(b[key]) - num(a[key]) : num(a[key]) - num(b[key])));
  const values = eligible.map((row) => num(row[key]));
  const peer = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const ranked = eligible.map((row, i) => ({
    rank: i + 1,
    [args.group_by]: row[args.group_by],
    ...Object.fromEntries(ids.map((id) => [id, num(row[id])])),
    sample: row.sample,
    percentile: values.length > 1 ? round(1 - i / (values.length - 1), 2) : 1,
    vs_peer_avg: peer ? round((num(row[key]) - peer) / Math.abs(peer)) : null,
  }));
  const limit = Math.min(50, num(args.limit) || 10);
  return {
    output: { ranking_metric: key, label: metrics[key].label, scope: scopeLabel(r.filters), peer_average: round(peer), ranked: ranked.slice(0, limit), eligible: ranked.length, excluded_low_sample: rows.filter((row) => row.sample < min).map((row) => ({ [args.group_by]: row[args.group_by], sample: row.sample })).slice(0, 15), sample_rule: `at least ${min} source records (classes for sessions)` },
    evidence: [{ sql: r.sql, provenance: r.provenance, rows: ranked.length, result: ranked.slice(0, 40), filters: r.filters }],
  };
}

const quoteSQL = (v) => `'${String(v).replaceAll("'", "''")}'`;
export async function memberJourney(args, ctx) {
  const text = String(args.member || '').trim();
  if (text.length < 2) throw new Error('Give a member name or member ID.');
  const scope = { ...(ctx.defaults.imports ? { imports: true } : {}) }; // all dates and studios
  const sources = ['new', 'checkins', 'bookings', 'sales', 'lapsed'].filter((s) => ctx.available.includes(s));
  const like = quoteSQL('%' + text.toLowerCase().replace(/[%_]/g, '') + '%');
  const ids = new Map();
  for (const s of sources) {
    const r = await ctx.run(`SELECT member_id, ANY_VALUE(member) AS member, COUNT(*) AS n FROM ${s} WHERE member_id IS NOT NULL AND (member_id = ${quoteSQL(text)} OR lower(member) LIKE ${like}) GROUP BY 1 ORDER BY n DESC LIMIT 10`, scope).catch(() => ({ rows: [] }));
    for (const row of r.rows) ids.set(String(row.member_id), { member: row.member, records: (ids.get(String(row.member_id))?.records || 0) + Number(row.n) });
  }
  if (!ids.size) return { output: { found: false, note: `No member matches "${text}".` }, evidence: [] };
  if (ids.size > 1 && ![...ids.keys()].includes(text)) {
    return { output: { found: false, ambiguous: true, candidates: [...ids].map(([member_id, v]) => ({ member_id, ...v })).slice(0, 8), note: 'Several members match; ask which one or pass the member_id.' }, evidence: [] };
  }
  const [memberId, info] = [...ids][0];
  const id = quoteSQL(memberId);
  const parts = {};
  const evidence = [];
  const q = {
    new: `SELECT date AS first_visit, location, format, trainer, conversion, retention FROM new WHERE member_id = ${id} ORDER BY date LIMIT 5`,
    checkins: `SELECT COUNT(*) FILTER (WHERE attended) AS visits, MIN(date) FILTER (WHERE attended) AS first_visit, MAX(date) FILTER (WHERE attended) AS last_visit, COUNT(DISTINCT location) AS studios, MODE(format_group) AS favourite_format, MODE(trainer) AS favourite_instructor FROM checkins WHERE member_id = ${id}`,
    bookings: `SELECT COUNT(*) AS bookings, COUNT(*) FILTER (WHERE late_cancelled>0) AS late_cancels, MAX(date) AS last_booking FROM bookings WHERE member_id = ${id}`,
    sales: `SELECT date, product, category, revenue, location FROM sales WHERE member_id = ${id} ORDER BY date DESC LIMIT 12`,
    lapsed: `SELECT product, status, end_date, latest_lapse FROM lapsed WHERE member_id = ${id} ORDER BY end_date DESC LIMIT 6`,
  };
  for (const s of sources) {
    const r = await ctx.run(q[s], scope).catch((e) => ({ rows: [], error: e.message }));
    parts[s] = r.error ? { error: r.error } : r.rows;
    if (r.rows?.length) evidence.push({ sql: q[s], provenance: r.provenance, rows: r.rows.length, result: r.rows, filters: scope });
  }
  return { output: { found: true, member_id: memberId, member: info.member, note: 'All dates and studios. Contact details are never returned.', ...parts }, evidence };
}

export async function whatIf(args, ctx) {
  if (!ctx.available.includes('sessions')) throw new Error('What-if scenarios need the Sessions source.');
  const r = await metricRows(ctx, 'sessions', ['sessions', 'capacity', 'attendance', 'revenue', 'fill_rate'], [], args.scope_json, { exclude_hosted: true });
  const b = Object.fromEntries(['sessions', 'capacity', 'attendance', 'revenue', 'fill_rate'].map((k) => [k, num(r.rows[0]?.[k])]));
  if (!b.sessions || !b.attendance) throw new Error('No regular classes in this scope to model.');
  const sessions = b.sessions * (1 + (num(args.sessions_change_pct) ?? 0) / 100);
  const seatsPerClass = b.capacity / b.sessions;
  const perClass = num(args.fill_rate_target_pct) != null ? seatsPerClass * (num(args.fill_rate_target_pct) / 100) : (b.attendance / b.sessions) * (1 + (num(args.class_size_change_pct) ?? 0) / 100);
  const yieldPerVisit = (b.revenue / b.attendance) * (1 + (num(args.yield_change_pct) ?? 0) / 100);
  const s = { sessions: sessions, capacity: seatsPerClass * sessions, attendance: perClass * sessions, revenue: perClass * sessions * yieldPerVisit };
  s.fill_rate = s.attendance / s.capacity;
  const rows = ['sessions', 'attendance', 'fill_rate', 'revenue'].map((k) => ({ measure: k, baseline: round(b[k], 4), scenario: round(s[k], 4), change: round(s[k] - b[k], 4), change_pct: round(pctChange(b[k], s[k])) }));
  return {
    output: { scope: scopeLabel(r.filters), baseline_basis: 'regular classes (hosted excluded); earned (session-attributed) revenue', assumptions: 'Linear: seats per class and other drivers unchanged unless set; no cannibalisation between classes; fill is capped only by the stated target.', formatted: rows.map((x) => ({ measure: x.measure, baseline: formatField(x.measure, x.baseline), scenario: formatField(x.measure, x.scenario) })), rows },
    evidence: [{ sql: r.sql, provenance: r.provenance, rows: rows.length, result: rows, filters: r.filters }],
  };
}

export const analysisTools = {
  compare_periods: comparePeriods,
  explain_change: explainChange,
  forecast,
  find_anomalies: findAnomalies,
  rank_performance: rankPerformance,
  member_journey: memberJourney,
  what_if: whatIf,
};

const scopeField = { type: ['string', 'null'], description: 'JSON scope overrides as in query_studio (from/to YYYY-MM-DD, location/trainer/format_group/... arrays). null keeps the resolved question scope.' };
const periodField = { type: 'string', description: 'JSON scope for this period, e.g. {"from":"2026-08-01","to":"2026-08-31","location":["Kwality House, Kemps Corner"]}.' };
const groupEnum = ['location', 'month', 'trainer', 'format', 'format_group', 'category', 'product', 'associate', 'payment_method', 'day', 'time', 'status', 'source', 'class_slot', 'session_type'];
export function analysisToolDefs(sources, metricIds) {
  const source = { type: 'string', enum: sources };
  const metric = { type: 'string', enum: metricIds };
  const fn = (name, description, properties) => ({ type: 'function', name, strict: true, description, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } });
  return [
    fn('compare_periods', 'Compare governed metrics between two periods (or two scopes), optionally grouped by one dimension. Returns a, b, absolute change, % change, pp change for rates and a materiality flag. Use for MoM / WoW / YoY / "vs last month" / "this vs that studio".', { source, metric_ids: { type: 'array', items: metric }, group_by: { type: ['string', 'null'], enum: [...groupEnum, null] }, period_a: periodField, period_b: periodField, exclude_hosted: { type: 'boolean' } }),
    fn('explain_change', 'Explain WHY a total changed between two periods: splits it into multiplicative drivers (classes × class size × yield; transactions × AOV; newcomers × conversion; bookings × late rate) whose contributions add up exactly, and shows which studios / formats / instructors / slots drove it. Use for "why", "what drove", "what caused".', { source, metric_id: metric, dimensions: { type: 'array', items: { type: 'string', enum: groupEnum } }, period_a: periodField, period_b: periodField, exclude_hosted: { type: 'boolean' } }),
    fn('forecast', 'Monthly history (12 months), linear trend on the last 6 completed months, month-end run-rate projection for totals, and gap / required daily pace to an optional target. Use for "will we hit", "on track", "projection", "month-end".', { source, metric_id: metric, target: { type: ['number', 'null'] }, scope_json: scopeField, exclude_hosted: { type: 'boolean' } }),
    fn('find_anomalies', 'Find unusual values: the latest complete week or month vs its own recent history (z-score), per studio / instructor / format etc. Use for "anything unusual", "what stands out", "spikes", "drops", "red flags".', { source, metric_id: metric, dimension: { type: ['string', 'null'], enum: [...groupEnum, null] }, grain: { type: 'string', enum: ['week', 'month'] }, scope_json: scopeField, exclude_hosted: { type: 'boolean' } }),
    fn('rank_performance', 'Rank studios / instructors / formats / class slots etc. by a governed metric with a minimum sample, percentile and gap to the peer average. The first metric is the ranking metric; others are shown beside it. Use for best / worst / top / bottom / leaderboard.', { source, metric_ids: { type: 'array', items: metric }, group_by: { type: 'string', enum: groupEnum }, min_sample: { type: ['integer', 'null'] }, order: { type: 'string', enum: ['desc', 'asc'] }, limit: { type: ['integer', 'null'] }, scope_json: scopeField, exclude_hosted: { type: 'boolean' } }),
    fn('member_journey', "One member's history across all dates and studios: first visit and outcome, visits, favourite format and instructor, bookings and late cancels, purchases, memberships and lapse. Takes a name (partial is fine) or member ID. Never returns contact details.", { member: { type: 'string' } }),
    fn('what_if', 'Scenario model on regular classes: change fill rate (target %), class size %, number of classes % or revenue per visit %, and see attendance, fill and earned revenue vs the baseline. Use for "what if", "if we", "how much more".', { scope_json: scopeField, fill_rate_target_pct: { type: ['number', 'null'] }, class_size_change_pct: { type: ['number', 'null'] }, sessions_change_pct: { type: ['number', 'null'] }, yield_change_pct: { type: ['number', 'null'] } }),
  ];
}

/** The final, structured reply the chat renders: headline, figures, chart, table, caveats and next actions. */
export const presentAnswerDef = {
  type: 'function',
  name: 'present_answer',
  strict: true,
  description: 'Deliver the final answer. Call exactly once, after the queries, instead of replying in plain text. Every figure must come from a tool result in this conversation.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'answer', 'highlights', 'chart', 'table_evidence', 'caveats', 'follow_ups', 'actions'],
    properties: {
      headline: { type: 'string', description: 'One sentence that answers the question directly, with the key number.' },
      answer: { type: 'string', description: 'Markdown body: interpretation, breakdown, drivers and what it means. Short paragraphs, bullets or a small table. Do not repeat the headline.' },
      highlights: { type: 'array', description: '0–4 key figures shown as cards.', items: { type: 'object', additionalProperties: false, required: ['label', 'value', 'change', 'tone'], properties: { label: { type: 'string' }, value: { type: 'string', description: 'Formatted, e.g. ₹4.2L, 68%, 12.5' }, change: { type: ['string', 'null'], description: 'e.g. +12% vs Aug, −3.1pp MoM; null if no comparison' }, tone: { type: 'string', enum: ['positive', 'negative', 'neutral'] } } } },
      chart: { type: 'object', additionalProperties: false, required: ['type', 'title', 'evidence', 'x', 'series'], description: 'A chart drawn from one evidence result. type none when a chart adds nothing.', properties: { type: { type: 'string', enum: ['none', 'bar', 'horizontal_bar', 'line', 'stacked_bar', 'donut'] }, title: { type: 'string' }, evidence: { type: 'integer', description: 'evidence_index of the tool result to plot' }, x: { type: 'string', description: 'Column for categories / time' }, series: { type: 'array', items: { type: 'string' }, description: '1–4 numeric columns from that result' } } },
      table_evidence: { type: ['integer', 'null'], description: 'evidence_index of a result to show as a table, or null.' },
      caveats: { type: 'array', items: { type: 'string' }, description: '0–3 short notes on scope, sample size, definitions or data gaps.' },
      follow_ups: { type: 'array', items: { type: 'string' }, description: '2–4 natural next questions the user can click, written as the user would ask them, specific to this answer.' },
      actions: {
        type: 'array',
        description: '0–4 buttons. open_tab: tab number + scope_json to open the dashboard view that shows this. set_compare: compare = prior|month|quarter|year. build_element: prompt describing a chart/table to save. export_csv: evidence index. pin_insight: prompt = the insight text to pin on tab.',
        items: { type: 'object', additionalProperties: false, required: ['type', 'label', 'tab', 'compare', 'prompt', 'evidence', 'scope_json'], properties: { type: { type: 'string', enum: ['open_tab', 'set_compare', 'build_element', 'export_csv', 'pin_insight'] }, label: { type: 'string' }, tab: { type: ['integer', 'null'] }, compare: { type: ['string', 'null'], enum: ['prior', 'month', 'quarter', 'year', null] }, prompt: { type: ['string', 'null'] }, evidence: { type: ['integer', 'null'] }, scope_json: { type: ['string', 'null'] } } },
      },
    },
  },
};

const UNIT = { k: 1e3, K: 1e3, L: 1e5, l: 1e5, lakh: 1e5, lakhs: 1e5, Cr: 1e7, cr: 1e7, crore: 1e7, crores: 1e7, M: 1e6, m: 1e6 };
/** Numbers written in a reply, with their display precision; dates, times, years and small counts are skipped. */
export function figuresIn(text) {
  const out = [];
  const cleaned = String(text)
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b(?:Q[1-4]|H[12]|FY\d{2,4})\b/gi, ' ');
  const re = /(₹\s?)?([+\-−]?)(\d[\d,]*(?:\.\d+)?)\s?(%|pp|p\.p\.|×|x\b|K\b|k\b|L\b|l\b|lakhs?\b|Cr\b|cr\b|crores?\b|M\b)?/g;
  for (const m of cleaned.matchAll(re)) {
    const [, rupee, , digits, unitRaw] = m;
    const prev = cleaned[m.index - 1];
    if (prev && /[A-Za-z]/.test(prev)) continue; // part of a word like "Q3" or "H1"
    const raw = Number(digits.replaceAll(',', ''));
    if (!Number.isFinite(raw)) continue;
    const unit = unitRaw?.toLowerCase().startsWith('p') ? 'pp' : unitRaw === '%' ? '%' : unitRaw;
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
    if (!unit && !rupee && !decimals && (raw < 10 || (raw >= 1990 && raw <= 2100))) continue;
    const scale = UNIT[unit] || 1;
    out.push({ text: m[0].trim(), value: raw * scale, half: 0.5 * 10 ** -decimals * scale, unit: unit === '%' || unit === 'pp' ? unit : unit === '×' || unit === 'x' ? 'x' : '' });
  }
  return out;
}

function candidates(evidence) {
  const set = new Set();
  const add = (v) => { if (Number.isFinite(v)) set.add(Math.abs(v)); };
  for (const e of evidence) {
    const rows = (e.result || []).slice(0, 60);
    const cols = {};
    for (const row of rows)
      for (const [k, v] of Object.entries(row || {})) {
        const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?(e-?\d+)?$/.test(v.trim()) ? Number(v) : NaN;
        if (Number.isFinite(n)) (cols[k] ??= []).push(n);
      }
    const all = Object.values(cols).flat().slice(0, 150);
    for (const v of all) add(v);
    for (const vals of Object.values(cols)) {
      add(vals.reduce((s, v) => s + v, 0));
      add(vals.reduce((s, v) => s + v, 0) / vals.length);
    }
    for (let i = 0; i < all.length; i++)
      for (let j = 0; j < all.length; j++) {
        if (i === j) continue;
        const a = all[i], b = all[j];
        add(a - b);
        if (b) { add(a / b); add((a - b) / b); }
      }
  }
  return [...set];
}

/** Figures in the reply that no tool result, or simple arithmetic on one, supports. */
export function unverifiedFigures(text, evidence, ignore = '') {
  const skip = new Set(figuresIn(ignore).map((f) => f.value));
  const pool = candidates(evidence);
  const near = (target, half) => pool.some((c) => Math.abs(c - target) <= half + Math.abs(target) * 0.01 + 1e-9);
  return figuresIn(text)
    .filter((f) => !skip.has(f.value))
    .filter((f) => {
      const v = Math.abs(f.value);
      if (f.unit === '%' || f.unit === 'pp') return !(near(v / 100, f.half / 100) || near(v, f.half));
      return !near(v, f.half);
    })
    .map((f) => f.text);
}

/** One short line per tool call for the live progress feed. */
export function describeCall(name, args = {}) {
  const label = (id) => metrics[id]?.label || String(id || '').replaceAll('_', ' ');
  const list = (ids) => (ids || []).slice(0, 3).map(label).join(', ');
  const by = (g) => (g && (Array.isArray(g) ? g.length : true) ? ` by ${[].concat(g).join(' & ').replaceAll('_', ' ')}` : '');
  switch (name) {
    case 'query_metrics': return `Calculating ${list(args.metric_ids)}${by(args.group_by)}`;
    case 'query_sales': return `Totalling sales${args.group_by && args.group_by !== 'total' ? ' by ' + args.group_by.replace('_', ' & ') : ''}`;
    case 'query_studio': return 'Running a custom query on the source sheets';
    case 'inspect_source': return `Checking ${args.source} coverage`;
    case 'find_entity': return `Resolving “${args.text}” (${args.kind})`;
    case 'compare_periods': return `Comparing ${list(args.metric_ids)} across two periods${by(args.group_by)}`;
    case 'explain_change': return `Breaking down what drove ${label(args.metric_id)}`;
    case 'forecast': return `Projecting ${label(args.metric_id)}`;
    case 'find_anomalies': return `Scanning ${label(args.metric_id)} for unusual ${args.grain || 'week'}s${by(args.dimension)}`;
    case 'rank_performance': return `Ranking ${args.group_by?.replaceAll('_', ' ')} by ${label(args.metric_ids?.[0])}`;
    case 'member_journey': return `Looking up member “${args.member}”`;
    case 'what_if': return 'Modelling the scenario';
    case 'save_element': return `Saving “${args.title}”`;
    case 'present_answer': return 'Checking every figure against the results';
    default: return name.replaceAll('_', ' ');
  }
}

/** Deterministic daily briefing: the most unusual studio-level moves in the last complete week. */
export const briefingChecks = [
  ['sessions', 'attendance', 'Attendance', 3],
  ['sessions', 'fill_rate', 'Fill rate', 0],
  ['sessions', 'revenue', 'Earned revenue', 3],
  ['sales', 'gross_revenue', 'Sales', 3],
  ['new', 'new_clients', 'Newcomers', 3],
  // Conversion is left out: the latest week's newcomers have not had time to convert yet.
  ['bookings', 'booking_late_rate', 'Late-cancel rate', 0],
];
export async function briefing(ctx) {
  const items = [];
  for (const [source, id, label, minBaseline] of briefingChecks) {
    if (!ctx.available.includes(source)) continue;
    try {
      const { output } = await findAnomalies({ source, metric_id: id, dimension: 'location', grain: 'week', scope_json: null, exclude_hosted: source === 'sessions' }, ctx);
      for (const s of output.unusual) {
        if (Math.abs(s.baseline) < minBaseline) continue;
        const up = s.latest > s.baseline;
        const good = id === 'booking_late_rate' ? !up : up;
        const change = metrics[id].format === 'percent' ? `${Math.abs((s.latest - s.baseline) * 100).toFixed(1)}pp` : `${Math.abs((s.change_vs_baseline_pct ?? 0) * 100).toFixed(0)}%`;
        items.push({
          tone: good ? 'positive' : 'negative',
          metric: id,
          location: s.location,
          z: s.z,
          title: `${label} ${up ? 'up' : 'down'} ${change} at ${s.location}`,
          detail: `${output.latest_period}: ${formatField(id, s.latest)} vs a ${output.baseline_periods}-week average of ${formatField(id, s.baseline)}.`,
          question: `Why did ${label.toLowerCase()} ${up ? 'rise' : 'fall'} at ${s.location} in the ${output.latest_period.toLowerCase()} compared with the previous weeks?`,
        });
      }
    } catch { /* a source without history simply contributes nothing */ }
  }
  return items.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8);
}
