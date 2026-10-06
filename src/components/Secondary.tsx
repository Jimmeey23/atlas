import { useEffect, useState } from "react";
import { ChevronDown, Download, ExternalLink } from "lucide-react";
import { query, type Row } from "../data/duckdb";
import { blueprints } from "../data/blueprints";
import { where, context, metricFacts } from "../data/analytics";
import { metricSQL, metrics } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { useStore } from "../state/store";
import { exportCSV } from "./exports";
const secondaryGroups: Record<number, string[]> = {
  0: ["location", "format", "day"],
  1: ["capacity", "category", "format", "format"],
  2: ["time", "time", "format", "trainer"],
  3: ["trainer", "time", "trainer", "trainer"],
  4: ["associate", "payment_method", "product", "status"],
  5: ["source", "conversion", "trainer", "lifecycle"],
  6: ["end_date", "product", "product", "member"],
  7: ["member", "member", "payment_method", "product"],
  8: ["associate", "status", "touches", "member"],
  9: ["member", "trainer", "format", "member"],
  10: ["trainer", "trainer", "trainer", "trainer"],
};
export function Secondary({
  tab,
  index,
  title,
}: {
  tab: number;
  index: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const state = useStore();
  const bp = blueprints[tab];
  const group = secondaryGroups[tab]?.[index] || bp.groups[0];
  const columns = bp.columns.slice(0, 7);
  useEffect(() => {
    if (!open) return;
    let active = true;
    let predicate = "";
    if (tab === 6 && index === 1) predicate = "completed=0";
    if (tab === 6 && index === 2) predicate = "freeze_count>0";
    if (tab === 6 && index === 3) predicate = "days_absent>21";
    if (tab === 7 && index === 1) predicate = "no_show";
    if (tab === 8 && index === 3)
      predicate =
        "touches=0 AND lower(trim(COALESCE(stage,'')))<>'membership sold' AND (status NOT IN ('Lost','Disqualified') OR status IS NULL)";
    if (tab === 5 && index === 3)
      predicate = "lifecycle='Active' AND days_absent>21";
    if (tab === 4 && index === 3) predicate = "voided OR status<>'succeeded'";
    const w = where(state.filters, bp.source, []);
    const effective =
      tab === 4 && index === 3
        ? w.replace(
            "NOT COALESCE(voided,FALSE) AND (status='succeeded' OR status IS NULL)",
            "TRUE",
          )
        : w;
    query(
      `SELECT CAST("${group}" AS VARCHAR) AS entity,${metricSQL(columns, context())},COUNT(*) AS n FROM ${metricFacts(state.filters, bp.source, [], effective)}${predicate ? (!["sessions", "sales", "checkins"].includes(bp.source) && effective ? " AND " : " WHERE ") + predicate : ""} GROUP BY "${group}" ORDER BY n DESC LIMIT 100`,
    )
      .then((r) => {
        if (active) {
          setRows(r);
          setError("");
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
    };
  }, [open, tab, index, state.filters, state.rate]);
  return (
    <details
      className="secondary"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {title}
        <span className="icon small">
          {open ? "Collapse" : "Explore"}
          <ChevronDown size={12} />
        </span>
      </summary>
      <div className="secondary-content">
        {error ? (
          <p className="warn">{error}</p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: 8,
              }}
            >
              <span className="small">
                {rows.length} groups / Active global filters apply
              </span>
              <button
                className="icon-button"
                aria-label={`Export ${title}`}
                onClick={() => exportCSV(title, rows)}
              >
                <Download size={13} />
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{group}</th>
                    {columns.map((id) => (
                      <th key={id}>{metrics[id].label}</th>
                    ))}
                    <th>Sample</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <button
                          onClick={() => state.cross(group, String(r.entity))}
                        >
                          {r.entity || "Unspecified"} <ExternalLink size={10} />
                        </button>
                      </td>
                      {columns.map((id) => (
                        <td key={id} title={metrics[id].description}>
                          {fmt(id, r[id])}
                        </td>
                      ))}
                      <td>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="small">No matching records in this scope.</p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
