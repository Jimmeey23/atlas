import { metrics, type QueryContext } from '../semantics/metrics';

/** Historical points use the same population rules as cards, evaluated at the point's date. */
export function retentionSnapshotSQL(asOf: string, ctx: QueryContext) {
  return ['active_memberships', 'revenue_at_risk_30d'].map(id => {
    const expression = metrics[id].sql(ctx)
      .replaceAll(`DATE '${ctx.today}'`, '__P57_ASOF_DATE__')
      .replaceAll(`'${ctx.today}'`, '__P57_ASOF_TEXT__')
      .replaceAll('__P57_ASOF_DATE__', `CAST(${asOf} AS DATE)`)
      .replaceAll('__P57_ASOF_TEXT__', `CAST(${asOf} AS VARCHAR)`);
    return `${expression} AS ${id}`;
  }).join(',');
}
