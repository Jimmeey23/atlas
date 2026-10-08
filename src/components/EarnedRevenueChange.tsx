import { comparisonLabel } from '../data/periods';
import { Chart } from './Charts';
import type { Analysis } from '../data/analytics';
import { revenueBridge } from '../semantics/aggregations';
import { fmt } from '../semantics/formats';
import { useStore } from '../state/store';

export function EarnedRevenueChange({data}:{data:Analysis}) {
  const comparison = useStore(s=>s.compare);
  const bridge = revenueBridge(data.total,data.previous);
  const available = bridge.length === 4 && bridge.every(step=>Number.isFinite(step.value));
  const baseline = `the comparison period (${comparisonLabel(comparison).replace(/^vs /, '')})`;
  const change = available ? bridge[3].value - bridge[0].value : null;
  const signed = (amount:number) => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${fmt('revenue',Math.abs(amount))}`;
  return <div className="earned-revenue-split">
    <div className="earned-revenue-chart"><Chart tab={0} data={data}/></div>
    <aside className="earned-revenue-explanation" aria-label="Earned revenue change explained">
      <span className="earned-revenue-eyebrow">Reading the bridge</span>
      <h3>{change == null ? 'Attendance and yield explain the movement.' : `Earned revenue ${change > 0 ? 'rose' : change < 0 ? 'fell' : 'was unchanged'}${change === 0 ? '' : ` by ${fmt('revenue',Math.abs(change))}`}.`}</h3>
      <p>This chart connects {baseline} to the selected period by separating changes in attended seats from changes in revenue earned per attended seat.</p>
      {available ? <>
        <div className="earned-revenue-endpoints"><div><span>Reference revenue</span><strong>{fmt('revenue',bridge[0].value)}</strong></div><span aria-hidden="true">→</span><div><span>Selected period</span><strong>{fmt('revenue',bridge[3].value)}</strong></div></div>
        <dl className="earned-revenue-drivers">
          <div><dt><span className="session-driver-dot" style={{background:bridge[1].value >= 0 ? "var(--growth)" : "var(--revenue)"}}/>Attendance volume <strong>{signed(bridge[1].value)}</strong></dt><dd>Attended seats changed from {fmt('attendance',data.previous.attendance)} to {fmt('attendance',data.total.attendance)}. This contribution values that difference at the reference period’s revenue per attended seat.</dd></div>
          <div><dt><span className="session-driver-dot yield" style={{background:bridge[2].value >= 0 ? "var(--growth)" : "var(--revenue)"}}/>Realised yield <strong>{signed(bridge[2].value)}</strong></dt><dd>Revenue per attended seat changed from {fmt('revenue',Number(data.previous.revenue)/Number(data.previous.attendance))} to {Number(data.total.attendance) > 0 ? fmt('revenue',Number(data.total.revenue)/Number(data.total.attendance)) : 'unavailable'}. This contribution applies the yield difference to the selected period’s attendance.</dd></div>
        </dl>
      </> : <p className="earned-revenue-unavailable">A valid reference revenue and attendance total are needed to quantify both contributions. Missing values are unavailable, rather than a change of zero.</p>}
      <p className="earned-revenue-footnote">The two contributions add up to the revenue change. This is an arithmetic explanation, not proof of what caused it. Session-attributed revenue differs from payments collected in Revenue & sales.{comparison === 'none' ? ' This bridge uses the previous period as its reference while metric-card comparisons are off.' : ''}</p>
    </aside>
  </div>;
}
