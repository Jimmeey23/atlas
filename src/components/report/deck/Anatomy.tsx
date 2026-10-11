import { ArrowDownRight, ArrowUpRight, Crosshair, IndianRupee, Minus, Scale, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import type { Anatomy, PortfolioMap, Quality } from "../../../report/brief";
import { Emphasis } from "./Layout";
import { MetricNotes } from "./MetricNotes";
import type { ChapterData } from "../../../report/model";

const money = (id: string, value: number) => `${value > 0 ? "+" : "−"}${fmt(id, Math.abs(value))}`;
const Arrow = ({ change }: { change: number }) => change > 0 ? <ArrowUpRight size={12}/> : change < 0 ? <ArrowDownRight size={12}/> : <Minus size={12}/>;

/**
 * The movement, taken apart: how much of the month's revenue change came from selling more
 * or fewer times, and how much from each sale being worth more or less. The two effects are
 * derived from the chapter's own figures, so they reconcile to the recorded movement exactly.
 */
export function AnatomyBridge({ anatomy, data }: { anatomy: Anatomy; data: ChapterData }) {
  const rows = [
    { key: "volume", label: anatomy.volumeLabel, effect: anatomy.volumeEffect,
      detail: `${fmt(anatomy.volume, anatomy.volumeNow)} against ${fmt(anatomy.volume, anatomy.volumePrior)} last month` },
    { key: "price", label: anatomy.priceLabel, effect: anatomy.priceEffect,
      detail: `${fmt(anatomy.metric, anatomy.priceNow)} against ${fmt(anatomy.metric, anatomy.pricePrior)} last month` },
  ];
  const peak = Math.max(...rows.map(row => Math.abs(row.effect)), 0) || 1;
  return <section className="dk-anatomy" aria-label="What created the movement">
    <div className="dk-bridge-head">
      <span className="deck-eyebrow"><IndianRupee size={12}/>What created the movement</span>
      <span className="dk-bridge-net"><span>{definition(anatomy.metric)?.label} net change</span><b data-tone={anatomy.net >= 0 ? "up" : "down"}>{money(anatomy.metric, anatomy.net)}</b><span>on last month</span></span>
    </div>
    <div className="dk-anat-rows">
      {rows.map(row => <div className="dk-anat-row" key={row.key}>
        <span className="dk-anat-label"><b>{row.label}</b><small>{row.detail}</small></span>
        <span className="dk-anat-bar"><i data-sign={row.effect < 0 ? "negative" : "positive"} style={{ width: `${Math.max(2, Math.abs(row.effect) / peak * 50)}%`, [row.effect < 0 ? "right" : "left"]: "50%" } as never}/></span>
        <em data-tone={row.effect > 0 ? "up" : row.effect < 0 ? "down" : "flat"}><Arrow change={row.effect}/>{money(anatomy.metric, row.effect)}</em>
      </div>)}
      <div className="dk-anat-row" data-net="true">
        <span className="dk-anat-label"><b>{definition(anatomy.metric)?.label} this month</b><small>{fmt(anatomy.metric, data.total[anatomy.metric])}</small></span>
        <span className="dk-anat-bar"><i data-sign={anatomy.net < 0 ? "negative" : "positive"} style={{ width: `${Math.max(3, Math.abs(anatomy.net) / peak * 50)}%`, [anatomy.net < 0 ? "right" : "left"]: "50%" } as never}/></span>
        <em data-tone={anatomy.net > 0 ? "up" : anatomy.net < 0 ? "down" : "flat"}><Arrow change={anatomy.net}/>{money(anatomy.metric, anatomy.net)}</em>
      </div>
    </div>
    <p className="dk-bridge-note">Revenue taken apart as {definition(anatomy.volume)?.label.toLowerCase()} × spend per unit. Both spend figures are derived from the chapter's own revenue and count, so the two effects add up to the recorded movement exactly — this is arithmetic, not attribution.</p>
    {anatomy.basisNote && <p className="dk-anat-warning"><Scale size={12}/>{anatomy.basisNote}</p>}
    <details className="deck-proof-definitions"><summary>Definitions &amp; source coverage</summary>
      <div className="deck-proof-definition"><b>{definition(anatomy.metric)?.label ?? anatomy.metric}</b><MetricNotes id={anatomy.metric} data={data}/></div>
      <div className="deck-proof-definition"><b>{definition(anatomy.volume)?.label ?? anatomy.volume}</b><MetricNotes id={anatomy.volume} data={data}/></div>
    </details>
  </section>;
}

/**
 * Whether the movement is worth having: topline momentum read beside the momentum of the
 * purchases, buyers and spend behind it. The verdict follows the direction of the recorded
 * figures, so it describes the shape of the month rather than claiming a cause.
 */
export function QualityScorecard({ quality, data }: { quality: Quality; data: ChapterData }) {
  const peak = Math.max(...quality.rows.map(row => Math.abs(row.change)), 0.01);
  const tone = quality.trend === "improving" ? "held" : quality.trend === "deteriorating" ? "critical" : "watch";
  return <section className="dk-quality" aria-label="Is the movement worth having">
    <div className="dk-quality-head">
      <span className="deck-eyebrow"><Crosshair size={12}/>Is the movement worth having</span>
      <span className="dk-quality-verdict" data-band={tone}><b>{quality.verdict}</b></span>
    </div>
    <dl className="dk-quality-rows">
      {quality.rows.map(row => <div key={row.id} data-tone={row.change > 0 ? "up" : row.change < 0 ? "down" : "flat"}>
        <dt>{row.label}</dt>
        <dd><b>{fmt(row.id, row.value)}</b><em><Arrow change={row.change}/>{delta(row.id, row.value, data.prior[row.id])}</em></dd>
        <span className="dk-quality-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, Math.abs(row.change) / peak * 100)}%` }}/></span>
      </div>)}
    </dl>
    <p className="dk-quality-read"><Emphasis text={quality.diagnosis}/></p>
    <p className="dk-bridge-note">Momentum is each measure's change on last month, shown at its own scale, not as a composite index. {data.n.toLocaleString("en-IN")} records sit behind these figures.</p>
  </section>;
}

/**
 * Where the movement came from, row by row: contribution against momentum across the
 * chapter's product, channel or format breakdown, with the actions each position implies.
 */
export function PortfolioBlocks({ map, data }: { map: PortfolioMap; data: ChapterData }) {
  const own = map.contribution === map.metric;
  const unit = definition(map.contribution)?.label.toLowerCase() ?? map.contribution;
  return <section className="dk-portfolio" aria-label={map.title ? `Portfolio map · ${map.title}` : "Portfolio map"}>
    <div className="dk-quality-head">
      <span className="deck-eyebrow"><Sparkles size={12}/>Where it came from</span>
      <span className="dk-portfolio-axis">{own ? `contribution against momentum, on ${map.latest.toLowerCase()}` : `share of ${unit} against the move in ${map.latest.toLowerCase()}`}</span>
    </div>
    <div className="dk-portfolio-grid">
      {map.groups.map(group => <div className="dk-quad" key={group.quadrant} data-quadrant={group.quadrant}>
        <header>
          <b>{group.name}</b>
          <small>{group.question}</small>
        </header>
        <ul>{group.rows.map(row => <li key={row.name}>
          <span className="dk-quad-name"><b>{row.name}</b><small>{(row.share * 100).toFixed(1)}% of {own ? "the total" : unit}</small></span>
          <span className="dk-quad-move" data-tone={row.change > 0 ? "up" : row.change < 0 ? "down" : "flat"}>
            <b>{fmt(map.metric, row.value)}</b>
            <small><Arrow change={row.growth}/>{delta(map.metric, row.value, row.prior)}</small>
          </span>
        </li>)}</ul>
        <p><ShieldCheck size={11}/>{group.action}</p>
      </div>)}
    </div>
    <p className="dk-bridge-note">{map.title}{map.title ? ". " : ""}Large and small are split at the median share of this month's own total, so the line follows the month's distribution rather than a threshold set by hand. Rows within 2% of last month are read as flat and stay out of the quadrants.</p>
    <details className="deck-proof-definitions"><summary>Definitions &amp; source coverage</summary>
      <div className="deck-proof-definition"><b>{definition(map.metric)?.label ?? map.metric}</b><MetricNotes id={map.metric} data={data}/></div>
    </details>
  </section>;
}

export { TrendingUp, TrendingDown };
