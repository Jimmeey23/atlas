import { useRef, useState, type ReactNode } from "react";
import { Download, Rows3, Search, type LucideIcon } from "lucide-react";
import { exportCSV } from "./exports";

export function AcquisitionTableShell({ title, description, icon: Icon, count, actions, metricBar, onSearch, searchLabel, footer, children }: {
  title: string; description: string; icon: LucideIcon; count: number;
  actions?: ReactNode; metricBar?: ReactNode; onSearch?: (value: string) => void; searchLabel?: string;
  footer?: ReactNode; children: ReactNode;
}) {
  const [compact, setCompact] = useState(true);
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
  return <section className="acq-shell" aria-label={title} data-density={compact ? "compact" : "comfortable"}>
    <header className="acq-shell-head">
      <span className="acq-icon"><Icon size={19} aria-hidden="true" /></span>
      <div className="acq-heading"><h2><span className="acq-title-text">{title}</span><span className="acq-count">{count.toLocaleString("en-IN")} rows</span></h2><p>{description}</p></div>
      <div className="acq-shell-actions">
        <button onClick={() => setCompact(!compact)} aria-pressed={compact} title="Toggle row density"><Rows3 size={15} />{compact ? "Compact" : "Comfortable"}</button>
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
