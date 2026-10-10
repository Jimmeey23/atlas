import { DropdownField } from "./ui/DropdownField";
import {salesRankingCriteria,salesRankingDimensions,salesRankingGroup,splitSalesRankings} from "../data/sales-rankings";
import { useEffect, useMemo, useState } from "react";
import { useGroupFields } from "../data/group-registry";
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
  // Named comparisons first, then every other populated column of the Sales sheet.
  const registry = useGroupFields("sales", [group]);
  const dimensions = useMemo(() => [
    ...salesRankingDimensions,
    ...registry.filter((f) => !salesRankingDimensions.some(([k]) => k === f.field) && f.field !== "member_id").map((f) => [f.field, f.label] as [string, string]),
  ], [registry]);
  const spec = useMemo(() => { try { return salesRankingGroup(group); } catch { return salesRankingGroup("product"); } }, [group]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const { entity, label } = spec;
    query(
      `SELECT ${entity} AS entity,${label} AS label,${metricSQL(salesRankingCriteria, context(filters, transient))},COUNT(*) AS source_rows FROM ${facts} ${spec.where} GROUP BY ${entity}`,
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
  }, [facts, spec, version]);
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
          <DropdownField
            aria-label="Sales ranking group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            {dimensions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </DropdownField>
        </label>
        <label>
          Criterion
          <DropdownField
            aria-label="Sales ranking criterion"
            value={criterion}
            onChange={(e) => setCriterion(e.target.value)}
          >
            {salesRankingCriteria.map((id) => (
              <option key={id} value={id}>
                {metrics[id].label}
              </option>
            ))}
          </DropdownField>
        </label>
        <label>
          Show
          <DropdownField
            aria-label="Sales ranking count"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[3, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                Top / bottom {n}
              </option>
            ))}
          </DropdownField>
        </label>
        <label>
          Minimum transactions
          <DropdownField
            aria-label="Sales ranking minimum transactions"
            value={minimum}
            onChange={(e) => setMinimum(Number(e.target.value))}
          >
            {[1, 3, 5, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </DropdownField>
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
                    cross(spec.field, String(row.entity))
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
