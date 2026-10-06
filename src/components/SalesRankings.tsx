import {salesRankingCriteria,splitSalesRankings} from "../data/sales-rankings";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Trophy,
  Search,
} from "lucide-react";
import { query, type Row } from "../data/duckdb";
import { metricFacts, context } from "../data/analytics";
import { metrics, metricSQL } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { useStore } from "../state/store";
import { Register } from "./Register";
import { exportCSV } from "./exports";
const dimensions = [
  ["product", "Products"],
  ["category", "Categories"],
  ["associate", "Associates"],
  ["location", "Studios"],
  ["member", "Community members"],
];
export function SalesRankings({ version }: { version: number }) {
  const filters = useStore((s) => s.filters),
    transient = useStore((s) => s.transient),
    cross = useStore((s) => s.cross);
  const [group, setGroup] = useState("product"),
    [criterion, setCriterion] = useState("gross_revenue"),
    [limit, setLimit] = useState(5),
    [minimum, setMinimum] = useState(1),
    [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const facts = metricFacts(filters, "sales", transient);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const field = group === "member" ? "member_id" : group;
    const label =
      group === "member"
        ? "COALESCE(MAX(NULLIF(trim(member),'')),'Member '||member_id)"
        : "COALESCE(NULLIF(trim(" + field + "),''),'Unspecified')";
    const entity =
      group === "member"
        ? "member_id"
        : "COALESCE(NULLIF(trim(" + field + "),''),'Unspecified')";
    query(
      `SELECT ${entity} AS entity,${label} AS label,${metricSQL(salesRankingCriteria, context(filters, transient))},COUNT(*) AS source_rows FROM ${facts} ${group === "member" ? "WHERE member_id IS NOT NULL" : ""} GROUP BY ${entity}`,
    )
      .then((result) => {
        if (active) setRows(result);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [facts, group, version]);
  const { top, bottom, eligible } = splitSalesRankings(
    rows.filter(
      (r) =>
        Number(r.transactions) >= minimum &&
        String(r.label).toLowerCase().includes(search.toLowerCase()),
    ),
    criterion,
    limit,
  );
  const peak = Math.max(
    ...eligible.map((r) => Math.abs(Number(r[criterion]))),
    1,
  );
  return (
    <Register
      index="05"
      title="Sales leaders & opportunities"
      subtitle="Top and bottom groups from successful, non-voided sales in the active scope."
      actions={
        <button
          className="button"
          disabled={!eligible.length}
          onClick={() =>
            exportCSV(`sales-ranking-${group}-${criterion}`, eligible)
          }
        >
          <Download size={12} />
          Export CSV
        </button>
      }
    >
      <div className="sales-ranking-controls">
        <label>
          Compare
          <select
            aria-label="Sales ranking group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            {dimensions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Criterion
          <select
            aria-label="Sales ranking criterion"
            value={criterion}
            onChange={(e) => setCriterion(e.target.value)}
          >
            {salesRankingCriteria.map((id) => (
              <option key={id} value={id}>
                {metrics[id].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Show
          <select
            aria-label="Sales ranking count"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[3, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                Top / bottom {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum transactions
          <select
            aria-label="Sales ranking minimum transactions"
            value={minimum}
            onChange={(e) => setMinimum(Number(e.target.value))}
          >
            {[1, 3, 5, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="sales-ranking-search">
          <Search size={13} />
          <input
            aria-label="Search sales rankings"
            placeholder="Find a group…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <p role="status">Ranking the selected sales groups…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="sales-ranking-grid">
          {[top, bottom].map((list, lane) => (
            <section
              className={`sales-ranking-lane ${lane ? "bottom" : "top"}`}
              key={lane}
            >
              <header>
                {lane ? <ArrowDownRight size={18} /> : <Trophy size={18} />}
                <div>
                  <h3>{lane ? "Bottom performers" : "Top performers"}</h3>
                  <span>
                    {metrics[criterion].label} ·{" "}
                    {metrics[criterion].higherIsBetter
                      ? lane
                        ? "lowest first"
                        : "highest first"
                      : lane
                        ? "highest first"
                        : "lowest first"}
                  </span>
                </div>
              </header>
              {list.map((row, index) => (
                <button
                  className="sales-ranking-row"
                  key={String(row.entity)}
                  onClick={() =>
                    cross(
                      group === "member" ? "member_id" : group,
                      String(row.entity),
                    )
                  }
                >
                  <span className="sales-rank-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="sales-rank-detail">
                    <strong title={String(row.label)}>
                      {String(row.label)}
                    </strong>
                    <span>
                      {fmt("transactions", row.transactions)} transactions ·{" "}
                      {fmt("buyers", row.buyers)} buyers
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${Math.max(0, (Math.abs(Number(row[criterion])) / peak) * 100)}%`,
                        }}
                      />
                    </i>
                  </div>
                  <div className="sales-rank-value">
                    <strong>{fmt(criterion, row[criterion])}</strong>
                    <ArrowUpRight size={12} />
                  </div>
                </button>
              ))}
              {!list.length && (
                <p className="empty-state">
                  {lane
                    ? "No additional qualifying groups for a separate bottom list."
                    : "No groups meet these criteria."}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
      <p className="ranking-foot">
        {eligible.length} qualifying groups · top and bottom lists never
        duplicate a group. Discount rate ranks lower values first; other
        criteria rank higher values first. Small transaction samples can make
        per-buyer and average-order measures volatile. Members group by source
        member ID; purchases spanning groups can appear in each relevant group.
      </p>
    </Register>
  );
}
