import { useState } from "react";
import { CalendarSearch, Database, Eye, Info, Radar, Telescope, TriangleAlert, Target } from "lucide-react";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { briefingOf, decisionOf, scenariosFor, type Scenario } from "../../../report/brief";
import { lensOf } from "../Insight";
import type { ChapterSpec } from "../../../report/chapters";
import type { Row } from "../../../data/duckdb";
import type { ReportModel } from "../../../report/model";
import { monthLabel, monthShort, shiftMonth } from "../../../report/period";
import { useRecordDrilldown } from "./RecordDrilldown";
import { Emphasis } from "./Layout";

const label = (id: string) => definition(id)?.label ?? id;
type Key = "flat" | "repeat" | "run" | "seasonal";
const SCENARIOS: { key: Key; name: string; why: string }[] = [
  { key: "flat", name: "Holds flat", why: "This month repeats" },
  { key: "repeat", name: "Repeats last move", why: "The same change as last month, again" },
  { key: "run", name: "Three-month pace", why: "The average of the last three months" },
  { key: "seasonal", name: "Last year's season", why: "This month moved by last year's same-month shift" },
];
const good = (id: string, from: number, to: number) => to === from ? "flat" : (to > from) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";

/** Twelve recorded months and the chosen scenario as a dashed step into next month. */
function Projection({ id, history, next, chosen }: { id: string; history: Row[]; next: number | null; chosen: boolean }) {
  const values = history.map(r => r[id] == null ? null : Number(r[id]));
  const all = [...values, next].filter((v): v is number => v != null && Number.isFinite(v));
  if (all.length < 3) return null;
  const W = 300, H = 70, lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i: number) => 4 + i / values.length * (W - 12);
  const y = (v: number) => H - 6 - (v - lo) / span * (H - 14);
  let d = "";
  values.forEach((v, i) => { if (v != null) d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; });
  const last = values.length - 1, lastValue = values[last];
  return <svg className="dk-projection" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label(id)}: recorded months and next-month scenario`}>
    <path d={d} className="dk-projection-line" />
    {lastValue != null && <circle cx={x(last)} cy={y(lastValue)} r="3" className="dk-projection-now" />}
    {next != null && lastValue != null && <>
      <path d={`M${x(last)},${y(lastValue)} L${x(values.length)},${y(next)}`} className="dk-projection-step" data-chosen={chosen || undefined} />
      <circle cx={x(values.length)} cy={y(next)} r="4.5" className="dk-projection-next" />
    </>}
  </svg>;
}

/** One sentence per measure: where each scenario lands and how wide the spread is. */
function readScenario(s: Scenario, next: string) {
  const rows = SCENARIOS.map(k => [k.name, s[k.key]] as const).filter(([, v]) => v != null) as [string, number][];
  const values = rows.map(r => r[1]);
  const lo = Math.min(...values), hi = Math.max(...values);
  const parts = [`${label(s.id)} is ${fmt(s.id, s.current)} now.`];
  if (s.run != null) parts.push(`At the three-month pace it would be ${fmt(s.id, s.run)} in ${next} (${delta(s.id, s.run, s.current)}).`);
  if (s.seasonal != null && s.thisLY != null && s.nextLY != null) parts.push(`Last year it moved ${fmt(s.id, s.thisLY)} → ${fmt(s.id, s.nextLY)} over the same two months, which would put it near ${fmt(s.id, s.seasonal)}.`);
  parts.push(rows.length > 1 ? `The scenarios span ${fmt(s.id, lo)}–${fmt(s.id, hi)}${good(s.id, s.current, lo) === good(s.id, s.current, hi) ? `, all ${good(s.id, s.current, hi) === "up" ? "improving on" : good(s.id, s.current, hi) === "down" ? "falling short of" : "level with"} today` : ", so direction depends on which pattern holds"}.` : "");
  return parts.filter(Boolean).join(" ");
}

/** Next month as transparent arithmetic, with written readings and controls to compare scenarios. */
export function Outlook({ model, spec, ids }: { model: ReportModel; spec: ChapterSpec; ids: string[] }) {
  const data = model.chapters[spec.id];
  const drill = useRecordDrilldown();
  const [chosen, setChosen] = useState<Key>("run");
  const [lastYear, setLastYear] = useState<Record<string, boolean>>({});
  if (!data) return null;
  const nextKey = shiftMonth(model.scope.month, 1), next = monthLabel(nextKey);
  const scenarios = scenariosFor(spec, data, model.scope.month);
  const b = briefingOf(model, spec.id, ids);
  const d = decisionOf(model, spec.id);
  const cards = model.narratives[spec.id]?.cards ?? [];
  const warnings = cards.filter(c => ["risk", "watch"].includes(lensOf(c))).slice(0, 4);
  const watch = [
    ...(d?.successMeasure ? [{ text: d.successMeasure, from: "Decision success measure" }] : []),
    ...cards.filter(c => c.watch).map(c => ({ text: c.watch!, from: c.headline })),
  ].slice(0, 6);
  const pick = SCENARIOS.find(k => k.key === chosen)!;
  const under = scenarios.filter(s => s[chosen] != null);
  const better = under.filter(s => good(s.id, s.current, s[chosen]!) === "up").length, worse = under.filter(s => good(s.id, s.current, s[chosen]!) === "down").length;
  return <section className="dk-outlook" aria-label="Outlook">
    <div className="dk-outlook-top">
      <div className="dk-outlook-lead">
        <span className="deck-eyebrow"><Telescope size={12}/>Forward view · reading for {next}</span>
        {b.outlook ? <p><Emphasis text={b.outlook}/></p> : <p className="dk-muted">No durability reading was written for this chapter.</p>}
        {!!under.length && <p className="dk-outlook-summary">Under <b>{pick.name.toLowerCase()}</b>, {better} of {under.length} measures improve on {monthLabel(model.scope.month).split(" ")[0]} and {worse} {worse === 1 ? "slips" : "slip"}{under[0] ? ` — ${label(under[0].id).toLowerCase()} lands at ${fmt(under[0].id, under[0][chosen])}` : ""}.</p>}
        <small><Info size={12}/>Conditional arithmetic on recorded figures, not forecasts or probabilities.</small>
      </div>
    </div>

    {!!scenarios.length && <>
      <div className="dk-scenario-bar" role="group" aria-label="Scenario">
        <span>Scenario</span>
        {SCENARIOS.map(k => <button key={k.key} type="button" aria-pressed={chosen === k.key} title={k.why} onClick={() => setChosen(k.key)}>{k.name}</button>)}
        <small>{pick.why}</small>
      </div>
      <div className="dk-scenarios">{scenarios.map(s => {
        const rows = SCENARIOS.map(k => ({ ...k, v: s[k.key] })).filter(r => r.v != null) as (typeof SCENARIOS[number] & { v: number })[];
        const values = rows.map(r => r.v), lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
        const target = s[chosen];
        const showLY = lastYear[s.id];
        return <article key={s.id} className="dk-scenario">
          <header><b>{label(s.id)}</b>
            {target != null && <span className="dk-scenario-pick" data-tone={good(s.id, s.current, target)}>{fmt(s.id, target)}<small>{delta(s.id, target, s.current)} vs now</small></span>}
          </header>
          <Projection id={s.id} history={data.history.slice(-12)} next={target ?? null} chosen />
          <p className="dk-scenario-read"><Emphasis text={readScenario(s, next.split(" ")[0])}/></p>
          {rows.length > 1 && <p className="dk-scenario-range">Across the three readings this measure lands between <b>{fmt(s.id, lo)}</b> and <b>{fmt(s.id, hi)}</b>.</p>}
          <ul>{rows.map(r => <li key={r.key} data-chosen={r.key === chosen || undefined}>
            <button type="button" onClick={() => setChosen(r.key)} title={r.why}>{r.name}</button>
            <i aria-hidden="true"><i style={{ left: `${(r.v - lo) / span * 100}%` }}/></i>
            <strong>{fmt(s.id, r.v)}</strong>
          </li>)}</ul>
          {showLY && <p className="dk-scenario-ly">{s.thisLY != null && s.nextLY != null ? <>A year ago: {monthShort(shiftMonth(model.scope.month, -12))} {fmt(s.id, s.thisLY)} → {monthShort(shiftMonth(nextKey, -12))} {fmt(s.id, s.nextLY)} ({delta(s.id, s.nextLY, s.thisLY)}).</> : "No same-period history last year."}</p>}
          <footer>
            <button type="button" className="dk-link" aria-pressed={!!showLY} onClick={() => setLastYear(v => ({ ...v, [s.id]: !v[s.id] }))}><CalendarSearch size={13}/>{showLY ? "Hide last year" : "Last year's pattern"}</button>
            {drill && <button type="button" className="dk-link" onClick={() => drill({ metric: s.id, chapterId: spec.id })}><Database size={13}/>This month's records</button>}
          </footer>
        </article>;
      })}</div>
      {(warnings.length > 0 || watch.length > 0) && <div className="dk-outlook-side">
        {!!warnings.length && <section><h4><TriangleAlert size={14}/>What would change this reading</h4>
          <ul>{warnings.map((c, i) => <li key={i}><b>{c.headline}</b>{c.trend && <small>{c.trend}</small>}</li>)}</ul></section>}
        {!!watch.length && <section><h4><Eye size={14}/>Signals to review in {next.split(" ")[0]}</h4>
          <ol>{watch.map((w, i) => <li key={i}><p>{w.text}</p><small>{w.from}</small></li>)}</ol></section>}
      </div>}
    </>}
    {!scenarios.length && <p className="empty-state"><Radar size={14}/>Not enough recorded months to build scenarios for this chapter.</p>}
    {d?.successMeasure && <p className="dk-outlook-goal"><Target size={14}/>The decision on the briefing page is judged by: <b>{d.successMeasure}</b></p>}
  </section>;
}
