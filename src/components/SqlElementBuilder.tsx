import './SqlElementBuilder.css';
import { useState } from 'react';
import { blueprints } from '../data/blueprints';
import { sqlTypes } from '../data/normalise';
import { tabs, useStore } from '../state/store';
import { elementTypes, elementSpecError, type ElementType } from '../semantics/element-spec';
import { api, Element } from './IntelligenceWorkspace';
import { GroupByPicker } from './ui/GroupByPicker';
import { DropdownField } from './ui/DropdownField';

export function SqlElementBuilder({ page, version }: { page: number; version: number }) {
  const filters = useStore(s => s.filters);
  const [source, setSource] = useState('sales'), [measure, setMeasure] = useState('revenue'), [aggregate, setAggregate] = useState('Average spend per unique member');
  const [dimensions, setDimensions] = useState(['month', 'location']), [title, setTitle] = useState('Average spend per community member');
  const [sql, setSql] = useState(''), [type, setType] = useState<ElementType>('table'), [ignoreDates, setIgnoreDates] = useState(false);
  const [columns, setColumns] = useState<string[]>([]), [numeric, setNumeric] = useState<string[]>([]), [x, setX] = useState('month'), [series, setSeries] = useState(['value']), [group, setGroup] = useState('location'), [y2, setY2] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [destination, setDestination] = useState(page);
  const [filterColumn, setFilterColumn] = useState(''), [operator, setOperator] = useState('='), [filterValue, setFilterValue] = useState(''), [limit, setLimit] = useState(100), [order, setOrder] = useState('DESC');
  const [precision, setPrecision] = useState(2), [percentile, setPercentile] = useState(0.9), [alias, setAlias] = useState('value'), [sortColumn, setSortColumn] = useState(''), [minimum, setMinimum] = useState(''), [secondMeasure, setSecondMeasure] = useState(''), [secondAggregate, setSecondAggregate] = useState('SUM');
  const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const literal = `'${filterValue.replaceAll("'", "''")}'`;
  const condition = filterColumn ? `\nWHERE "${filterColumn}" ${operator}${operator.includes('NULL') ? '' : ` ${literal}`}` : '';
  const column = identifier(measure);
  const rawExpression = aggregate === 'Average spend per unique member' ? `ROUND(SUM(${column}) / NULLIF(COUNT(DISTINCT member_id), 0), ${precision})`
    : aggregate === 'Count rows' ? 'COUNT(*)'
    : aggregate === 'Count distinct' ? `COUNT(DISTINCT ${column})`
    : aggregate === 'Count populated' ? `COUNT(${column})`
    : aggregate === 'Count missing' ? `COUNT(*) FILTER (WHERE ${column} IS NULL)`
    : aggregate === 'SUM DISTINCT' ? `SUM(DISTINCT ${column})`
    : aggregate === 'Percentile' ? `QUANTILE_CONT(${column}, ${percentile})`
    : aggregate === 'Concatenate distinct' ? `STRING_AGG(DISTINCT ${column}::VARCHAR, ', ')`
    : `${aggregate}(${column})`;
  const expression = ['Average spend per unique member', 'Count rows', 'Count distinct', 'Count populated', 'Count missing', 'BOOL_AND', 'BOOL_OR', 'Concatenate distinct'].includes(aggregate) ? rawExpression : `ROUND(${rawExpression}, ${precision})`;
  const output = alias.trim() || 'value';
  const generated = `SELECT ${dimensions.map(d => `${identifier(d)}, `).join('')}${expression} AS ${identifier(output)}${secondMeasure ? `, ${secondAggregate}(${identifier(secondMeasure)}) AS value_2` : ''}\nFROM "${source}"${condition}${dimensions.length ? `\nGROUP BY ${dimensions.map(identifier).join(', ')}` : ''}${minimum && Number.isFinite(Number(minimum)) ? `\nHAVING ${expression} >= ${Number(minimum)}` : ''}\nORDER BY ${identifier(sortColumn || dimensions[0] || output)} ${order}\nLIMIT ${limit}`;
  const tabular = type === 'table' || type === 'list';
  const matrix = type === 'pivot' || type === 'heatmap';
  const body = { type, sql: sql || generated, x: tabular || type === 'kpi' ? '' : x, series: tabular || matrix ? [] : series, group: matrix || type === 'stacked_bar' ? group : '', value: matrix ? series[0] || '' : '', y2: type === 'combo' ? y2 : [], ignoreDates };
  const invalidate = () => { setPreview(null); setColumns([]); };
  async function run(save = false) {
    setBusy(true); setNotice('');
    try {
      const result = await api('query', { method: 'POST', body: JSON.stringify({ sql: body.sql, filters: { ...filters, ...(ignoreDates ? { from: '', to: '' } : {}) } }) });
      const names = result.columns || Object.keys(result.rows[0] || {});
      setColumns(names); setNumeric(names.filter((name: string) => result.rows.some((r: any) => typeof r[name] === 'number')));
      const error = elementSpecError(body, names); if (error) throw new Error(error);
      if (!result.rows.length) throw new Error('No rows in this scope. Change filters or query before saving.');
      const doc = { id: 'sql-preview', kind: 'artifact', title, page: destination, body };
      setPreview(doc);
      if (save) { await api('documents', { method: 'POST', body: JSON.stringify({ kind: 'artifact', title, page: destination, body }) }); window.dispatchEvent(new Event('p57-documents')); setNotice('Element saved. It updates with your dashboard scope.'); }
      else setNotice(`${result.rows.length} rows returned. Configure columns below, then save.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const select = (label: string, value: string, choices: string[], change: (v: string) => void) => <label>{label}<DropdownField value={value} onChange={e => { change(e.target.value); setPreview(null); }}>{choices.map(v => <option key={v} value={v}>{v}</option>)}</DropdownField></label>;
  return <details className="sql-builder"><summary>Create an interface element with SQL</summary>
    <p className="sql-builder-intro">Choose a source, measure and grouping, or edit the SQL directly. Preview validates the query; Save adds a live element to the selected tab.</p>
    <div className="sql-builder-controls">
      <label>Element title<input value={title} onChange={e => setTitle(e.target.value)} /></label>
      {select('Source', source, [...new Set(blueprints.map(b => b.source))], v => { setSource(v); setSql(''); invalidate(); })}
      {select('Measure column', measure, Object.keys(sqlTypes), v => { setMeasure(v); setSql(''); invalidate(); })}
      {select('Calculation', aggregate, ['Average spend per unique member','SUM','SUM DISTINCT','AVG','MIN','MAX','MEDIAN','Count rows','Count distinct','Count populated','Count missing','Percentile','STDDEV_SAMP','STDDEV_POP','VAR_SAMP','VAR_POP','BOOL_AND','BOOL_OR','Concatenate distinct'], v => { setAggregate(v); setSql(''); invalidate(); })}
      <label>Output column<input value={alias} onChange={e => { setAlias(e.target.value); setSql(''); invalidate(); }} /></label>
      <label>Decimal places<input type="number" min={0} max={8} value={precision} onChange={e => { setPrecision(Math.max(0, Math.min(8, Number(e.target.value)))); setSql(''); invalidate(); }} /></label>
      {aggregate === 'Percentile' && <label>Percentile (0–1)<input type="number" min={0} max={1} step={0.05} value={percentile} onChange={e => { setPercentile(Math.max(0, Math.min(1, Number(e.target.value)))); setSql(''); invalidate(); }} /></label>}
      {select('Second measure (optional)', secondMeasure, ['', ...Object.keys(sqlTypes)], v => { setSecondMeasure(v); setSql(''); invalidate(); })}
      {secondMeasure && select('Second calculation', secondAggregate, ['SUM','AVG','MIN','MAX','MEDIAN','COUNT','STDDEV_SAMP'], v => { setSecondAggregate(v); setSql(''); invalidate(); })}
      {select('Filter column', filterColumn, ['', ...Object.keys(sqlTypes)], v => { setFilterColumn(v); setSql(''); invalidate(); })}
      {select('Filter operator', operator, ['=','<>','>','>=','<','<=','LIKE','ILIKE','NOT LIKE','IS NULL','IS NOT NULL'], v => { setOperator(v); setSql(''); invalidate(); })}
      <label>Filter value<input value={filterValue} onChange={e => { setFilterValue(e.target.value); setSql(''); invalidate(); }} /></label>
      {select('Sort by', sortColumn, ['', ...dimensions, output, ...(secondMeasure ? ['value_2'] : [])], v => { setSortColumn(v); setSql(''); invalidate(); })}
      <label>Minimum aggregate (HAVING)<input type="number" value={minimum} placeholder="Optional" onChange={e => { setMinimum(e.target.value); setSql(''); invalidate(); }} /></label>
      {select('Sort direction', order, ['DESC','ASC'], v => { setOrder(v); setSql(''); invalidate(); })}
      <label>Row limit<input type="number" min={1} max={500} value={limit} onChange={e => { setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1))); setSql(''); invalidate(); }} /></label>
      {select('Element type', type, [...elementTypes], v => setType(v as ElementType))}
      <label>Destination<DropdownField value={destination} onChange={e => setDestination(Number(e.target.value))}>{tabs.map((t, i) => <option key={i} value={i}>{t}</option>)}</DropdownField></label>
      <label><input type="checkbox" checked={ignoreDates} onChange={e => { setIgnoreDates(e.target.checked); setPreview(null); }} />All dates (other dashboard filters apply)</label>
    </div>
    <GroupByPicker name="SQL element" min={0} max={8} emptyLabel="One aggregate row" value={dimensions} fields={Object.keys(sqlTypes).map(field => ({ field, label: field }))} onChange={next => { setDimensions(next); setSortColumn(''); setSql(''); invalidate(); }} />
    <label>SQL starter<DropdownField value="" onChange={e => { if (e.target.value) { setSql(e.target.value); setType('table'); invalidate(); } }}>
      <option value="">Choose an example…</option>
      <option value="SELECT month, location, SUM(revenue) AS sales_revenue, COUNT(DISTINCT member_id) AS members FROM sales GROUP BY month, location ORDER BY month DESC;">Monthly sales and unique members</option>
      <option value="WITH monthly AS (SELECT month, SUM(revenue) AS sales_revenue FROM sales GROUP BY month) SELECT month, sales_revenue, LAG(sales_revenue) OVER (ORDER BY month) AS previous_month FROM monthly ORDER BY month">CTE and previous-month window</option>
      <option value="SELECT location, COUNT(*) FILTER (WHERE discount > 0) AS discounted_lines, SUM(discount) AS discount_value FROM sales GROUP BY location HAVING SUM(discount) > 0 ORDER BY discount_value DESC">Conditional aggregation and HAVING</option>
      <option value="SELECT member_id, STRING_AGG(DISTINCT product, ', ') AS purchased_products FROM sales GROUP BY member_id LIMIT 100">Distinct product lists</option>
    </DropdownField></label>
    <label>SQL editor<textarea rows={8} value={sql || generated} onChange={e => { setSql(e.target.value); invalidate(); }} /></label>
    <button className="button" onClick={() => { setSql(''); invalidate(); }}>Rebuild SQL from dropdowns</button>
    {!!columns.length && <div className="sql-builder-controls">
      {select('X / row column', x, ['',...columns], setX)}{select('Group / pivot column', group, ['',...columns], setGroup)}
      <fieldset><legend>Measures / left axis</legend>{numeric.map(c => <label key={c}><input type="checkbox" checked={series.includes(c)} onChange={() => { setSeries(v => v.includes(c) ? v.filter(a => a !== c) : [...v,c]); setPreview(null); }} />{c}</label>)}</fieldset>
      <fieldset><legend>Combo right axis</legend>{numeric.map(c => <label key={c}><input type="checkbox" checked={y2.includes(c)} onChange={() => { setY2(v => v.includes(c) ? v.filter(a => a !== c) : [...v,c]); setPreview(null); }} />{c}</label>)}</fieldset>
    </div>}
    <button className="button" disabled={busy} onClick={() => void run()}>Preview query</button> <button className="button" disabled={busy || !preview} onClick={() => void run(true)}>Save element</button>
    <p role="status">{notice}</p>{preview && <Element doc={preview} version={version} preview />}
    <details><summary>Learn the SQL pattern</summary><p>SELECT chooses output columns. SUM totals sales revenue. COUNT(DISTINCT member_id) counts identified community members. NULLIF protects division by zero. ROUND sets precision. GROUP BY defines one row per combination; include location in SELECT when grouping by location so rows remain identifiable. ORDER BY controls display order.</p><p>Use 'Category' for a literal label; use category (without single quotes) for the source column. Every selected non-aggregate column must appear in GROUP BY. Missing values remain unavailable. A shared-schema column may be unpopulated in a particular source.</p><p>Start with Table to inspect output columns, then choose a chart and its axes. Combo uses left and right measures; pivot and heatmap need row, group and value columns; KPI needs a single aggregate row. Advanced SQL supports joins, UNION, CASE, FILTER, CTEs, HAVING, window functions, comments and trailing semicolons. You can run several analytical queries separated by semicolons; the final result supplies the saved element. Saved elements use connected workspace storage.</p></details>
  </details>;
}
