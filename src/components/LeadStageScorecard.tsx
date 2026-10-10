import { useEffect, useMemo, useState } from "react";
import { query, type Row, quote } from "../data/duckdb";
import { where, context } from "../data/analytics";
import { useStore } from "../state/store";
import { metrics, metricSQL, contributorPredicate } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { Register } from "./Register";
import { exportCSV } from "./exports";
import type { TreeRow } from "./NestedTable";
import { groupable, groupLabel, groupValueSQL } from "../data/group-fields";
import { useGroupFields } from "../data/group-registry";
import { GroupByPicker, usePersistentGroups } from "./ui/GroupByPicker";
const columns = ['leads', 'converted_leads', 'trials_completed', 'lead_conversion_rate', 'touches', 'response_time_hours'];
export function LeadStageScorecard({ version, onDrill }: { version: number; onDrill: (row: TreeRow) => void }) {
  const filters = useStore(s => s.filters), transient = useStore(s => s.transient);
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [saved, setGroups] = usePersistentGroups('lead-stage-scorecard', ['stage']);
  const by = saved[0] && groupable(saved[0]) ? saved[0] : 'stage';
  const fields = useGroupFields('leads', [by]);
  // Default keeps the original stage query; any other column is grouped as labelled text.
  const expression = by === 'stage' ? "COALESCE(stage,'Unspecified')" : groupValueSQL(by);
  const key = columns.includes(by) ? 'group_value' : by;
  const sql = useMemo(() => by === 'stage'
    ? `SELECT COALESCE(stage,'Unspecified') AS stage,${metricSQL(columns, context(filters))} FROM leads${where(filters, 'leads', transient)} GROUP BY stage ORDER BY leads DESC`
    : `SELECT ${expression} AS "${key}",${metricSQL(columns, context(filters))} FROM leads${where(filters, 'leads', transient)} GROUP BY 1 ORDER BY leads DESC`, [by, expression, key, filters, transient]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    query(sql)
      .then(data => { if (active) setRows(data); }).catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sql, version]);
  function drill(row: Row, metric: string) {
    // Show only the records behind the clicked cell, not the whole stage.
    const contributors = contributorPredicate(metric, context(filters));
    const value = String(row[key]);
    onDrill({ id: `${by === 'stage' ? 'stage' : by}-${value}-${metric}`, label: `${value} · ${metrics[metric].label}`, source: 'leads', filters, metrics: [metric], path: [], predicate: `(${expression}=${quote(value)})${contributors ? ` AND (${contributors})` : ''}`, values: row, children: [] });
  }
  return <Register index="05" title="Lead stages & follow-up scorecard" subtitle="Converted: Membership Sold · Trial complete: Trial Completed · exact stage matches" actions={<button className="button" onClick={() => exportCSV('lead-stage-scorecard', rows)} disabled={!rows.length}>Export CSV</button>}>
    {error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading lead stages…</p> : <div className="intelligence-table"><GroupByPicker name="Lead scorecard" value={[by]} onChange={setGroups} fields={fields} min={1} max={1} defaults={['stage']}/><table><thead><tr><th>{by === 'stage' ? 'Stage' : groupLabel(by)}</th>{columns.map(id => <th key={id}>{metrics[id].label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(row[key])}><td><button className="scorecard-cell" onClick={() => drill(row, 'leads')}>{String(row[key])}</button></td>{columns.map(id => <td key={id}><button className="scorecard-cell" aria-label={`Inspect ${metrics[id].label} for ${row[key]}`} onClick={() => drill(row,id)}>{fmt(id,row[id])}</button></td>)}</tr>)}</tbody></table>{!rows.length && <p>No leads match this scope.</p>}</div>}
  </Register>;
}
