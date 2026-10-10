import { useMemo, useRef, type ReactNode } from "react";
import { Download, Search, type LucideIcon } from "lucide-react";
import { exportCSV } from "./exports";
import { useGroupFields } from "../data/group-registry";
import { acquisitionDimension, acquisitionDimensionColumns, acquisitionDimensions, type AcquisitionDimensionDef } from "../data/acquisition";

const staticKeys = new Set<string>(acquisitionDimensions.map(d => d.key));
/** Static acquisition dimensions, then every populated New-sheet column they do not already cover. */
export function useAcquisitionDimensions(chosen: readonly string[] = [], enabled = true) {
  const fields = useGroupFields(enabled ? "new" : undefined, chosen.filter(key => !staticKeys.has(key)));
  return useMemo(() => {
    const columns = fields.filter(f => !staticKeys.has(f.field) && !acquisitionDimensionColumns.includes(f.field))
      .map(f => acquisitionDimension(f.field)).filter((d): d is AcquisitionDimensionDef => !!d);
    return { all: [...acquisitionDimensions, ...columns] as AcquisitionDimensionDef[], columns };
  }, [fields]);
}
/** Valid key, else the fallback; a saved column that left the schema cannot break the table. */
export const dimensionOr = (key: string | undefined, fallback: string) => key && acquisitionDimension(key) ? key : fallback;
export function DimensionOptions({ columns, exclude }: { columns: AcquisitionDimensionDef[]; exclude?: string }) {
  return <>{acquisitionDimensions.filter(d => d.key !== exclude).map(d => <option value={d.key} key={d.key}>{d.label}</option>)}
    {columns.length > 0 && <optgroup label="Sheet columns">{columns.filter(d => d.key !== exclude).map(d => <option value={d.key} key={d.key}>{d.label}</option>)}</optgroup>}</>;
}

export function AcquisitionTableShell({ title, description, icon: Icon, count, actions, metricBar, onSearch, searchLabel, footer, children }: {
  title: string; description: string; icon: LucideIcon; count: number;
  actions?: ReactNode; metricBar?: ReactNode; onSearch?: (value: string) => void; searchLabel?: string;
  footer?: ReactNode; children: ReactNode;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  function exportTable() {
    const table = tableRef.current?.querySelector("table");
    if (!table) return;
    const headers = [...(table.tHead?.rows[table.tHead.rows.length - 1]?.cells || [])].map(th => th.textContent?.trim() || "");
    const rows = [...table.tBodies].flatMap(body => [...body.rows]).concat(table.tFoot ? [...table.tFoot.rows] : [])
      .filter(tr => tr.children.length === headers.length)
      .map(tr => Object.fromEntries([...tr.children].map((td, i) => [headers[i], td.textContent?.trim() || ""])));
    exportCSV(title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"), rows);
  }
  return <section className="acq-shell" aria-label={title} data-density="compact">
    <header className="acq-shell-head">
      <span className="acq-icon"><Icon size={19} aria-hidden="true" /></span>
      <div className="acq-heading"><h2><span className="acq-title-text">{title}</span><span className="acq-count">{count.toLocaleString("en-IN")} rows</span></h2><p>{description}</p></div>
      <div className="acq-shell-actions">
        <span className="table-row-standard">32px rows</span>
        <button onClick={exportTable}><Download size={15} />Export visible CSV</button>
      </div>
    </header>
    <div className="acq-toolbar">
      {onSearch && <label className="acq-search"><Search size={15} aria-hidden="true" /><input aria-label={searchLabel || `Search ${title}`} placeholder="Search rows…" onChange={e => onSearch(e.target.value)} /></label>}
      {actions}
    </div>
    {metricBar && <div className="acq-metric-bar">{metricBar}</div>}
    <div ref={tableRef} className="acq-body">{children}</div>
    {footer && <footer className="acq-footer">{footer}</footer>}
  </section>;
}
