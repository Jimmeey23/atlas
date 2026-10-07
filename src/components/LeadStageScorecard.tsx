import { useEffect, useState } from "react";
import { query, type Row, quote } from "../data/duckdb";
import { where, context } from "../data/analytics";
import { useStore } from "../state/store";
import { metrics, metricSQL, contributorPredicate } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { Register } from "./Register";
import { exportCSV } from "./exports";
import type { TreeRow } from "./NestedTable";
const columns = ['leads', 'converted_leads', 'trials_completed', 'lead_conversion_rate', 'touches', 'response_time_hours'];
export function LeadStageScorecard({ version, onDrill }: { version: number; onDrill: (row: TreeRow) => void }) {
  const filters = useStore(s => s.filters), transient = useStore(s => s.transient);
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    query(`SELECT COALESCE(stage,'Unspecified') AS stage,${metricSQL(columns, context(filters))} FROM leads${where(filters, 'leads', transient)} GROUP BY stage ORDER BY leads DESC`)
      .then(data => { if (active) setRows(data); }).catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, transient, version]);
  function drill(row: Row, metric: string) {
    // Show only the records behind the clicked cell, not the whole stage.
    const contributors = contributorPredicate(metric, context(filters));
    onDrill({ id: `stage-${row.stage}-${metric}`, label: `${row.stage} · ${metrics[metric].label}`, source: 'leads', filters, metrics: [metric], path: [], predicate: `(COALESCE(stage,'Unspecified')=${quote(String(row.stage))})${contributors ? ` AND (${contributors})` : ''}`, values: row, children: [] });
  }
  return <Register index="05" title="Lead stages & follow-up scorecard" subtitle="Converted: Membership Sold · Trial complete: Trial Completed · exact stage matches" actions={<button className="button" onClick={() => exportCSV('lead-stage-scorecard', rows)} disabled={!rows.length}>Export CSV</button>}>
    {error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading lead stages…</p> : <div className="intelligence-table"><table><thead><tr><th>Stage</th>{columns.map(id => <th key={id}>{metrics[id].label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(row.stage)}><td><button className="scorecard-cell" onClick={() => drill(row, 'leads')}>{row.stage}</button></td>{columns.map(id => <td key={id}><button className="scorecard-cell" aria-label={`Inspect ${metrics[id].label} for ${row.stage}`} onClick={() => drill(row,id)}>{fmt(id,row[id])}</button></td>)}</tr>)}</tbody></table>{!rows.length && <p>No leads match this scope.</p>}</div>}
  </Register>;
}
