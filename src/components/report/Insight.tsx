import { InsightDrilldown } from "./InsightDrilldown";
import { TrendingUp, TriangleAlert, GitBranch, Lightbulb, Radar, ArrowRightCircle, Target, Gauge, Activity, Coins, Eye, Users, CalendarClock, Crosshair, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { Row } from "../../data/duckdb";
import { InstructorName } from "../InstructorAvatar";
import { chapters } from "../../report/chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../report/definitions";
import type { ChapterData, GroupTable, InsightCard, InsightLens, ReportModel } from "../../report/model";
import { INSIGHT_LENSES } from "../../report/model";

const label = (id: string) => definition(id)?.label ?? id;

const LENS_ICON: Record<InsightLens, typeof TrendingUp> = { win: TrendingUp, risk: TriangleAlert, driver: GitBranch, opportunity: Lightbulb, watch: Radar, next_step: ArrowRightCircle };
const LEGACY: Record<string, InsightLens> = { red_flag: 'risk', worked: 'win', didnt_work: 'risk', meaning: 'driver', next_step: 'next_step', plain_language: 'driver' };
/** Cards written before lenses existed still render under the closest lens. */
export const lensOf = (card: InsightCard): InsightLens => card.lens ?? LEGACY[card.category ?? ''] ?? 'driver';
export const lensLabel = (lens: InsightLens) => INSIGHT_LENSES.find(l => l.id === lens)?.label ?? lens;

/** Up, down or flat, read against the metric's own direction of good. */
export function tone(id: string, value: unknown, previous: unknown) {
  if (value == null || previous == null || !Number.isFinite(Number(value)) || !Number.isFinite(Number(previous))) return "flat";
  const change = Number(value) - Number(previous);
  if (!change) return "flat";
  return (change > 0) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";
}

/** Where a metric's figures live: the card's own chapter first, then any chapter that holds it. */
export function metricSource(model: ReportModel, chapterId: string, id: string): ChapterData | undefined {
  const own = model.chapters[chapterId];
  if (own && (own.total[id] != null || own.history.some(r => r[id] != null))) return own;
  for (const spec of chapters) {
    const data = model.chapters[spec.id];
    if (data && data.total[id] != null) return data;
  }
  return undefined;
}

export function Spark({ id, history, width = 120, height = 30 }: { id: string; history: Row[]; width?: number; height?: number }) {
  const values = history.map(row => row[id] == null ? null : Number(row[id]));
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length < 2) return null;
  const peak = Math.max(...finite), floor = Math.min(...finite), span = peak - floor || Math.abs(peak) || 1;
  const x = (i: number) => 2 + i / Math.max(values.length - 1, 1) * (width - 4);
  const y = (v: number) => height - 3 - (v - floor) / span * (height - 8);
  let d = '';
  values.forEach((v, i) => { if (v != null && Number.isFinite(v)) d += `${i === 0 || values[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; });
  const lastIndex = values.length - 1 - [...values].reverse().findIndex(v => v != null && Number.isFinite(v));
  const last = values[lastIndex]!;
  return <svg className="r2-spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label(id)} over ${history.length} months`}>
    <path d={`${d} L${x(lastIndex).toFixed(1)},${height} L${x(values.findIndex(v => v != null)).toFixed(1)},${height} Z`} className="r2-spark-area" />
    <path d={d} className="r2-spark-line" />
    <circle cx={x(lastIndex)} cy={y(last)} r="2.6" className="r2-spark-dot" />
  </svg>;
}

/** A metric with its comparisons and trajectory: the unit of evidence beside every claim. */
export function MetricChip({ id, data, target, compact = false }: { id: string; data: ChapterData; target?: number; compact?: boolean }) {
  const value = data.total[id];
  const mom = tone(id, value, data.prior[id]), yoy = tone(id, value, data.priorYear[id]);
  const hit = target == null || value == null ? null : (Number(value) >= target) === (definition(id)?.higherIsBetter ?? true);
  return <div className="r2-chip" data-tone={mom}>
    <span className="r2-chip-label">{label(id)}</span>
    <strong className="r2-chip-value">{fmt(id, value)}</strong>
    <span className="r2-chip-deltas">
      <span data-tone={mom}>MoM {delta(id, value, data.prior[id])}</span>
      <span data-tone={yoy}>YoY {delta(id, value, data.priorYear[id])}</span>
      {hit != null && <span data-tone={hit ? 'up' : 'down'}><Target size={10}/>{hit ? 'On target' : 'Below target'} {fmt(id, target)}</span>}
    </span>
    {!compact && <Spark id={id} history={data.history.slice(-12)} />}
    <button type="button" className="r-chip-explore" data-insight-toggle onClick={e => { const detail = e.currentTarget.closest('.r2-insight')?.querySelector<HTMLDetailsElement>('.r-insight-drilldown'); if (detail) detail.open = true; }} aria-label={`Explore ${label(id)} evidence`}>Explore data</button>
  </div>;
}

/** The focus breakdown, shown on its comparison measure with the rows the claim names emphasised. */
export function FocusBars({ table, highlight = [], metric }: { table: GroupTable; highlight?: string[]; metric?: string }) {
  const id = metric && table.columns.includes(metric) ? metric : table.compare ?? table.columns[0];
  const named = new Set(highlight.map(h => h.trim().toLowerCase()));
  const rows = table.rows.filter(row => row[id] != null && Number.isFinite(Number(row[id])));
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => Number(b[id]) - Number(a[id]));
  const isNamed = (row: Row) => named.has(String(row.g ?? '').trim().toLowerCase());
  const shown = [...sorted.slice(0, 6), ...sorted.slice(6).filter(isNamed)].slice(0, 9);
  const peak = Math.max(...shown.map(row => Math.abs(Number(row[id]))), 1e-9);
  const median = sorted[Math.floor(sorted.length / 2)];
  return <figure className="r2-bars">
    <figcaption><span>{table.title}</span><small>{label(id)} · {shown.length} of {rows.length} groups{named.size ? ' · named rows highlighted' : ''}</small></figcaption>
    {shown.map((row, i) => {
      const value = Number(row[id]);
      const prior = table.prior?.[String(row.g)]?.[id];
      return <div className="r2-bar" key={String(row.g) + i} data-named={isNamed(row)}>
        <span className="r2-bar-name">{table.field === 'trainer' && !table.fields?.length ? <InstructorName name={String(row.g ?? 'Unspecified')}/> : String(row.g ?? 'Unspecified')}</span>
        <span className="r2-bar-track"><span style={{ width: `${Math.max(2, Math.abs(value) / peak * 100)}%` }} data-negative={value < 0} /></span>
        <span className="r2-bar-value">{fmt(id, value)}<small data-tone={tone(id, value, prior)}>{delta(id, value, prior)}</small></span>
      </div>;
    })}
    {median && <p className="r2-bars-note">Median group {fmt(id, median[id])}{table.total?.[id] != null ? ` · all groups ${fmt(id, table.total[id])}` : ''} · change vs previous month</p>}
  </figure>;
}

/** Monthly line for the claim's lead metric, with the selected month marked. */
export function FocusTrend({ id, history }: { id: string; history: Row[] }) {
  const values = history.map(row => row[id] == null ? null : Number(row[id]));
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length < 3) return null;
  const W = 360, H = 120, peak = Math.max(...finite), floor = Math.min(...finite, 0), span = peak - floor || 1;
  const x = (i: number) => 34 + i / Math.max(values.length - 1, 1) * (W - 44);
  const y = (v: number) => H - 20 - (v - floor) / span * (H - 34);
  let d = '';
  values.forEach((v, i) => { if (v != null && Number.isFinite(v)) d += `${i === 0 || values[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; });
  return <figure className="r2-trend"><figcaption><span>{label(id)}</span><small>{history.length} months · selected month marked</small></figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label(id)} monthly trend`}>
      {[floor, peak].map((v, i) => <g key={i}><line className="r2-grid" x1="34" x2={W - 10} y1={y(v)} y2={y(v)} /><text className="r2-axis" x="30" y={y(v) + 3} textAnchor="end">{fmt(id, v)}</text></g>)}
      <path d={d} className="r2-trend-line" />
      {values.map((v, i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4 : 2.2} className={i === values.length - 1 ? 'r2-trend-now' : 'r2-trend-dot'}><title>{String(history[i].month)}: {fmt(id, v)}</title></circle>)}
      {history.map((row, i) => i % 3 === 0 || i === history.length - 1 ? <text key={i} className="r2-axis" x={x(i)} y={H - 4} textAnchor="middle">{String(row.month).slice(2)}</text> : null)}
    </svg></figure>;
}

function Facet({ icon: Icon, title, children, kind }: { icon: typeof Activity; title: string; children: ReactNode; kind?: string }) {
  return <section className="r2-facet" data-kind={kind}><h4><Icon size={13}/>{title}</h4><p>{children}</p></section>;
}

export function InsightBlock({ card, model, chapterId, index, inlineEvidence = true, confidence = true, plan = false, targets }: {
  card: InsightCard; model: ReportModel; chapterId: string; index: number; inlineEvidence?: boolean; confidence?: boolean; plan?: boolean; targets?: Record<string, number>;
}) {
  const lens = lensOf(card);
  const Icon = LENS_ICON[lens];
  const own = model.chapters[chapterId];
  const table = own?.groups.find(g => (g.id ?? g.field) === card.focus);
  // Older cards name no metrics: fall back to the breakdown's comparison or the chapter's lead measure.
  const cited = (card.metrics?.length ? card.metrics : [table?.compare, ...(chapters.find(c => c.id === chapterId)?.metrics ?? [])].filter((id): id is string => !!id).slice(0, 2))
    .map(id => ({ id, data: metricSource(model, chapterId, id) })).filter((m): m is { id: string; data: ChapterData } => !!m.data && m.data.total[m.id] != null).slice(0, 4);
  const lead = cited[0];
  const driver = card.driver || card.reasoning;
  const trend = card.trend || [card.monthContext, card.yearContext].filter(Boolean).join(' ');
  const hasEvidence = inlineEvidence && (cited.length > 0 || !!table);
  return <article className="r2-insight" data-lens={lens} data-priority={card.priority ?? 'medium'} data-evidence={hasEvidence}>
    <div className="r2-insight-main">
      <header>
        {plan && <span className="r2-plan-no">{String(index + 1).padStart(2, '0')}</span>}
        <span className="r2-lens"><Icon size={13}/>{lensLabel(lens)}</span>
        {card.priority && <span className="r2-tag" data-priority={card.priority}>{card.priority} priority</span>}
        {confidence && card.confidence && <span className="r2-tag r2-confidence" title="Interpretation confidence">{card.confidence} confidence</span>}
      </header>
      <InsightDrilldown model={model} chapterId={chapterId} headline={card.headline} metrics={cited} table={table}>{card.headline}</InsightDrilldown>
      {card.meaning && <p className="r2-meaning">{card.meaning}</p>}
      <div className="r2-facets">
        {driver && <Facet icon={GitBranch} title={plan ? 'Why this move' : 'Root cause'}>{plan && card.recommendation ? card.recommendation : driver}</Facet>}
        {card.concentration && !plan && <Facet icon={Crosshair} title="Where it concentrates">{card.concentration}</Facet>}
        {card.offset && !plan && <Facet icon={ShieldCheck} title="What held up" kind="offset">{card.offset}</Facet>}
        {trend && !plan && <Facet icon={Activity} title="Structural or one-off?">{trend}</Facet>}
        {card.impact && <Facet icon={Coins} title="Value at stake" kind="impact">{card.impact}</Facet>}
      </div>
      {(card.action || (plan && card.recommendation && !driver)) && <div className="r2-move">
        <h4><ArrowRightCircle size={14}/>{plan ? 'The move' : 'Recommended move'}</h4>
        <p>{card.action || card.recommendation}</p>
        {(card.ownerArea || card.horizon) && <div className="r2-move-meta">{card.ownerArea && <span><Users size={12}/>{card.ownerArea}</span>}{card.horizon && <span><CalendarClock size={12}/>{card.horizon}</span>}</div>}
      </div>}
      {card.watch && <p className="r2-watch"><Eye size={13}/><b>Signal to watch</b> {card.watch}</p>}
    </div>
    {hasEvidence && <aside className="r2-evidence" aria-label="Supporting evidence">
      <span className="r2-evidence-title"><Gauge size={12}/>Evidence</span>
      {card.evidence && <p className="r2-evidence-text">{card.evidence}</p>}
      {!!cited.length && <div className="r2-chips">{cited.map(m => <MetricChip key={m.id} id={m.id} data={m.data} target={targets?.[m.id]} compact={cited.length > 2} />)}</div>}
      {table ? <FocusBars table={table} highlight={card.highlight} metric={card.metrics?.find(id => table.columns.includes(id))} />
        : lead && (card.focus === 'trend' || cited.length <= 2) ? <FocusTrend id={lead.id} history={lead.data.history.slice(-14)} /> : null}
    </aside>}
  </article>;
}
