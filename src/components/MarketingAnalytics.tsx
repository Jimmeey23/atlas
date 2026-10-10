import { DropdownField } from "./ui/DropdownField";
import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { query, quote, type Row } from "../data/duckdb";
import { tree } from "../data/hierarchy";
import { today } from "../data/analytics";
import { marketingGroupSQL, marketingDimension, marketingDimensionOptions, marketingContributor } from "../data/performance-marketing";
import { useGroupFields } from "../data/group-registry";
import { GroupByPicker, usePersistentGroups } from "./ui/GroupByPicker";
import { metricSQL, metrics, contributorPredicate } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { useStore, emptyFilters } from "../state/store";
import { exportCSV } from "./exports";
import { ChartControls } from "./ChartControls";
import type { TreeRow } from "./NestedTable";

export const marketingContext = () => ({ today: today(), rate: useStore.getState().rate });
export function useMarketingRows(sql: string, version: string | number, enabled = true) {
  const [state, setState] = useState<{ rows: Row[]; loading: boolean; error: string }>({ rows: [], loading: true, error: "" });
  useEffect(() => {
    let active = true;
    setState({ rows: [], loading: enabled, error: "" });
    if (enabled) query(sql).then(rows => { if (active) setState({ rows, loading: false, error: "" }); })
      .catch(error => { if (active) setState({ rows: [], loading: false, error: String(error) }); });
    return () => { active = false; };
  }, [sql, version, enabled]);
  return state;
}
export function MarketingStatus({ loading, error, empty = false }: { loading: boolean; error: string; empty?: boolean }) {
  return error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading analytics…</p> : empty ? <p className="pm-note">No source records match these filters.</p> : null;
}

export function marketingDrill(source: "leads" | "meta", scope: string, label: string, ids: string[], predicate?: string, summaryPredicate?: string): TreeRow {
  return {
    id: `marketing:${source}:${label}:${ids.join()}:${scope}:${predicate || ""}`,
    label, source, filters: { ...emptyFilters }, transient: [], metrics: ids,
    path: [], values: {}, children: [],
    predicate: [scope.replace(/^\s*WHERE\s+/i, ""), predicate].filter(Boolean).map(p => `(${p})`).join(" AND ") || "TRUE",
    ...(summaryPredicate!==undefined ? { summaryPredicate: [scope.replace(/^\s*WHERE\s+/i,""),summaryPredicate].filter(Boolean).map(p=>`(${p})`).join(" AND ") || "TRUE" } : {}),
  };
}

export function MarketingChart({ rows, ids, onInspect, title, chronological = false }: {
  rows: Row[]; ids: string[]; onInspect: (row: Row, id: string) => void; title: string; chronological?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState(ids[0]);
  const [second, setSecond] = useState(ids[1] || "");
  const [kind, setKind] = useState(chronological ? "line" : "bar");
  const theme = useStore(s => s.theme);
  const a = ids.includes(first) ? first : ids[0];
  const b = ids.includes(second) && second!==a ? second : "";
  const separateAxis = !!b && metrics[a].format!==metrics[b].format;
  const inspectRef=useRef(onInspect); inspectRef.current=onInspect;
  const plotted = useMemo(() => chronological ? [...rows].sort((x,y) => String(x.label).localeCompare(String(y.label))) : [...rows].sort((x,y)=>Number(y[a]??-Infinity)-Number(x[a]??-Infinity)).slice(0,20), [rows, chronological,a]);
  useEffect(() => {
    if (!ref.current || !plotted.length) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => css.getPropertyValue(`--${token}`).trim();
    const measures = [a, b].filter(Boolean);
    const display = (id: string, value: unknown) => id === "response_time_hours" ? `${fmt(id,value)}h` : fmt(id,value);
    chart.setOption({
      textStyle: { fontFamily: "Instrument Sans", color: color("text-2") },
      animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      color: [color("accent"), color("revenue") || "#159988"],
      grid: { left: 35, right: separateAxis ? 70 : 20, top: 52, bottom: 70, containLabel: true },
      legend: { top: 0, textStyle: { color: color("text-2") } },
      tooltip: { trigger: "axis", renderMode: "richText", formatter: (items: { dataIndex: number; seriesIndex: number }[]) => {
        const row = plotted[items[0]?.dataIndex];
        return row ? `${row.label}\n${measures.map(id => `${metrics[id].label}: ${display(id,row[id])}`).join("\n")}` : "";
      } },
      xAxis: { type: "category", data: plotted.map(r => r.label), axisLabel: { color: color("text-3"), rotate: chronological ? 0 : 20, width: 120, overflow: "truncate" }, axisLine: { lineStyle: { color: color("hairline") } } },
      yAxis: (separateAxis ? measures : [a]).map((id,index) => ({ type: "value", position: index ? "right" : "left", name: metrics[id].label, nameTextStyle: { color: color("text-2"), fontSize:11 }, axisLabel: { color: color("text-3"), formatter: (v: number) => display(id,v) }, splitLine: { show: !index, lineStyle: { color: color("hairline") } } })),
      series: measures.map((id,index) => ({ name: metrics[id].label, type: kind, yAxisIndex: separateAxis ? index : 0, data: plotted.map(r => r[id] == null ? null : Number(r[id])), barMaxWidth: 28, connectNulls: false, showSymbol: true, symbolSize:5, lineStyle:{width:2}, itemStyle:{borderRadius:kind==="bar"?[4,4,0,0]:undefined}, areaStyle:kind==="line"?{opacity:.06}:undefined })),
    });
    chart.on("click", p => { if (p.dataIndex!=null && p.seriesIndex!=null && plotted[p.dataIndex]) inspectRef.current(plotted[p.dataIndex], measures[p.seriesIndex]); });
    const observer = new ResizeObserver(() => chart.resize()); observer.observe(ref.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [plotted, a, b, kind, theme, separateAxis]);
  return <div className="pm-chart-block chart-surface">
    <ChartControls title={title} rows={plotted.map(row=>Object.fromEntries([["Group",row.label],...ids.map(id=>[metrics[id].label,row[id]])]))}/>
    <div className="pm-controls">
      <label>Chart measure <DropdownField aria-label={`${title} chart measure`} value={a} onChange={e=>setFirst(e.target.value)}>{ids.map(id=><option key={id} value={id}>{metrics[id].label}</option>)}</DropdownField></label>
      <label>Compare measure <DropdownField aria-label={`${title} compare measure`} value={b} onChange={e=>setSecond(e.target.value)}><option value="">None</option>{ids.filter(id=>id!==a).map(id=><option key={id} value={id}>{metrics[id].label}</option>)}</DropdownField></label>
      <label>Chart <DropdownField value={kind} onChange={e=>setKind(e.target.value)}><option value="bar">Bars</option><option value="line">Lines</option></DropdownField></label>
      {!chronological && rows.length>20 && <span className="small">Top 20 by {metrics[a].label}; the table includes every group.</span>}
    </div>
    <div ref={ref} className="pm-chart chart" role="img" aria-label={`${title}: ${metrics[a].label}${b ? ` and ${metrics[b].label}${separateAxis ? ', separate axes' : ', shared scale'}` : ""}. Inspect records using chart marks or table cells.`} />
  </div>;
}

export function MarketingTable({ source, scope, initialGroups, ids, version, onDrill, title, showChart = false, chronological = false, storageKey }: {
  source: "leads" | "meta"; scope: string; initialGroups: string[]; ids: string[]; version: string | number;
  onDrill: (entry: TreeRow) => void; title: string; showChart?: boolean; chronological?: boolean; storageKey?: string;
}) {
  const [saved,saveGroups] = usePersistentGroups(storageKey ?? `marketing:${source}:${title}`, initialGroups);
  // A remembered grouping that no longer resolves falls back to the table's default.
  const groups = useMemo(() => { const g=[...new Set(saved)].filter(k=>marketingDimension(source,k)).slice(0,3); return g.length ? g : initialGroups; }, [saved.join(),source,initialGroups.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const dimension = (g: string) => marketingDimension(source,g)!;
  const registry = useGroupFields(source,groups);
  const options = useMemo(() => marketingDimensionOptions(source,registry), [source,registry]);
  const [visible,setVisible] = useState(ids);
  const [expanded,setExpanded] = useState<Set<string>>(new Set());
  const [chart,setChart] = useState(showChart);
  const [sort,setSort] = useState({ id: ids[0], descending: true });
  const ctx = marketingContext();
  const data = useMarketingRows(marketingGroupSQL(source,scope,groups,ids,ctx), version);
  const total = useMarketingRows(`SELECT ${metricSQL(ids,ctx)},COUNT(*) AS n FROM "${source}"${scope}`, version);
  const nodes = useMemo(() => tree(data.rows,groups), [data.rows,groups]);
  const displayRows = useMemo(() => {
    const result: { node: TreeRow; depth: number }[] = [];
    const walk = (items: TreeRow[],depth: number) => {
      [...items].sort((a,b) => {
        if(sort.id==="label") return (sort.descending ? -1 : 1)*a.label.localeCompare(b.label);
        const x=a.values[sort.id], y=b.values[sort.id];
        if (x==null) return y==null ? 0 : 1; if (y==null) return -1;
        const difference = Number(x)-Number(y);
        return sort.descending ? -difference : difference;
      }).forEach(node => { result.push({node,depth}); if(expanded.has(node.id)) walk(node.children,depth+1); });
    }; walk(nodes,0); return result;
  },[nodes,sort,expanded]);
  function inspect(node: TreeRow,id?: string) {
    const groupPredicate = node.path.map(p=>`${dimension(p.field).sql}=${quote(p.value)}`).join(" AND ");
    const contribution = id ? marketingContributor(id) || contributorPredicate(id,ctx) : undefined;
    onDrill(marketingDrill(source,scope,`${node.path.map(p=>p.value).join(" / ")}${id ? ` · ${metrics[id].label}` : ""}`,id ? [id] : ids.slice(0,4),[groupPredicate,contribution].filter(Boolean).join(" AND "),groupPredicate));
  }
  function changeGroups(next: string[]) { saveGroups(next.slice(0,3)); setExpanded(new Set()); }
  const chartRows = useMemo(()=>nodes.map(n=>({...n.values,label:n.label,nodeId:n.id})),[nodes]);
  return <div className="pm-analytics-table" data-marketing-table={title}>
    <div className="pm-table-toolbar nested-toolbar">
      <GroupByPicker name={title} value={groups} onChange={changeGroups} fields={options} min={1} max={3} defaults={initialGroups}/>
      <div className="table-controls"><button className="button" onClick={()=>setExpanded(expanded.size ? new Set() : new Set(data.rows.map(r=>JSON.stringify(groups.slice(0,groups.length-Math.round(Math.log2(Number(r.level)+1))).map((field,i)=>({field,value:String(r[`g${i}`]??'Unspecified')}))))))}>{expanded.size ? "Collapse groups" : "Expand groups"}</button>
      <button className="button" aria-pressed={chart} onClick={()=>setChart(!chart)}>{chart ? "Hide chart" : "Show chart"}</button>
      <details className="pm-column-menu"><summary>Columns</summary><div>{ids.map(id=><label key={id}><input type="checkbox" checked={visible.includes(id)} onChange={()=>setVisible(v=>v.includes(id) ? v.length>1 ? v.filter(x=>x!==id) : v : ids.filter(x=>v.includes(x)||x===id))}/>{metrics[id].label}</label>)}</div></details>
      <button className="button" disabled={data.loading||!!data.error||!data.rows.length} onClick={()=>exportCSV(`marketing-${source}-${title}`,data.rows.map(r=>Object.fromEntries([...groups.map((g,i)=>[dimension(g).label,r[`g${i}`]]),["Grouping level",r.level],...ids.map(id=>[metrics[id].label,r[id]]),["Source rows",r.n]])),`${source} · ${scope || 'All dates'} · grouped ${groups.join(' → ')}`)}>Export CSV</button></div>
    </div>
    <MarketingStatus loading={data.loading} error={data.error||total.error} empty={!data.rows.length}/>
    {!data.loading && !data.error && data.rows.length>0 && <>
      {chart && <MarketingChart title={title} rows={chartRows} ids={visible} chronological={chronological && ["month","date"].includes(groups[0])} onInspect={(r,id)=>{const node=nodes.find(n=>n.id===r.nodeId);if(node) inspect(node,id);}}/>}
      <div className="pm-table table-scroll"><table>
        <thead><tr><th scope="col"><button className="pm-cell" onClick={()=>setSort(s=>({id:"label",descending:s.id==="label"&&!s.descending}))}>{groups.map(g=>dimension(g).label).join(" / ")}</button></th>{visible.map(id=><th scope="col" key={id}><button className="pm-cell" title={`Sort by ${metrics[id].label}`} onClick={()=>setSort(s=>({id,descending:s.id===id ? !s.descending : true}))}>{metrics[id].label}{sort.id===id ? sort.descending ? " ↓" : " ↑" : ""}</button></th>)}</tr></thead>
        <tbody>{displayRows.map(({node,depth})=><tr key={node.id} className={`level-${depth}${depth ? " pm-child-row" : ""}`}>
          <td><div className="pm-group-label row-label" style={{paddingLeft:depth*18}}>{node.children.length>0 && <button className="pm-expander row-chevron" aria-label={`${expanded.has(node.id) ? "Collapse" : "Expand"} ${node.label}`} aria-expanded={expanded.has(node.id)} onClick={()=>setExpanded(current=>{const next=new Set(current);next.has(node.id)?next.delete(node.id):next.add(node.id);return next;})}>{expanded.has(node.id)?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>}<button className="pm-cell pm-wrap row-name" title={node.label} onClick={()=>inspect(node)}>{node.label}</button></div></td>
          {visible.map(id=><td key={id}><button className="pm-cell cell-value" aria-label={`Inspect ${metrics[id].label} for ${node.label}`} onClick={()=>inspect(node,id)}>{fmt(id,node.values[id])}{id==="response_time_hours"&&node.values[id]!=null ? "h" : ""}</button></td>)}
        </tr>)}</tbody>
        <tfoot><tr className="totals"><td>All matching records</td>{visible.map(id=><td key={id}><button className="pm-cell" aria-label={`Inspect total ${metrics[id].label} in ${title}`} onClick={()=>onDrill(marketingDrill(source,scope,`${title} · ${metrics[id].label}`,[id],marketingContributor(id)||contributorPredicate(id,ctx),""))}>{fmt(id,total.rows[0]?.[id])}</button></td>)}</tr></tfoot>
      </table></div>
      <p className="pm-note">{Number(total.rows[0]?.n || 0).toLocaleString("en-IN")} source rows · Group totals include their child rows; totals and rates are recalculated from the underlying records. Select a metric to inspect its contributing records.</p>
    </>}
  </div>;
}
