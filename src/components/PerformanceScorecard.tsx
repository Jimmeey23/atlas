import { useEffect, useMemo, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { usable } from "../data/loader";
import { scorecardPredicate, scorecardSQL, scorecardTotalSQL, scorecardTops, type ScorecardDimension } from "../data/scorecard";
import { fmt } from "../semantics/formats";
import { useStore } from "../state/store";
import { exportCSV } from "./exports";
import { InstructorName } from "./InstructorAvatar";
import { Register } from "./Register";
import type { TreeRow } from "./NestedTable";
import { GroupByPicker, usePersistentGroups } from "./ui/GroupByPicker";
import { useGroupFields } from "../data/group-registry";
import { groupable, groupLabel } from "../data/group-fields";

type Column = { id: string; label: string; format?: string; drill?: "sessions" | "new" | "bookings"; extra?: string };

// `format` borrows a registry metric's number format for computed scorecard fields.
const measures: Column[] = [
  { id: "composite_score", label: "Composite score" },
  { id: "sessions", label: "Classes", drill: "sessions" },
  { id: "empty_sessions", label: "Empty classes", drill: "sessions", extra: "empty>0" },
  { id: "non_empty_sessions", label: "Non-empty classes", format: "sessions", drill: "sessions", extra: "COALESCE(empty,0)=0" },
  { id: "booked", label: "Booked", drill: "sessions" },
  { id: "attendance", label: "Checked in", drill: "sessions" },
  { id: "avg_class_size_excl", label: "Class avg (excl. empty)", drill: "sessions" },
  { id: "avg_class_size_incl", label: "Class avg (incl. empty)", drill: "sessions" },
  { id: "fill_rate", label: "Fill rate", drill: "sessions" },
  { id: "revenue", label: "Earned revenue", drill: "sessions" },
  { id: "revenue_per_session", label: "Revenue / class", drill: "sessions" },
  { id: "new_visitors", label: "New members", format: "new_clients", drill: "new", extra: "is_new" },
  { id: "converted", label: "Converted", format: "new_converted", drill: "new", extra: "is_new AND conversion='Converted'" },
  { id: "retained", label: "Retained", format: "new_retained", drill: "new", extra: "is_new AND retention='Retained'" },
  { id: "conversion_rate", label: "Conversion %", drill: "new", extra: "is_new" },
  { id: "retention_rate", label: "Retention %", drill: "new", extra: "is_new" },
  { id: "late_cancelled", label: "Late cancelled", format: "booking_late_cancelled", drill: "bookings", extra: "late_cancelled>0" },
  { id: "late_cancel_rate", label: "Late-cancel %", format: "booking_late_rate", drill: "bookings" },
];

export function PerformanceScorecard({
  dimension: initial,
  index,
  version,
  onDrill,
}: {
  dimension: ScorecardDimension;
  index: string;
  version: number;
  onDrill: (entry: TreeRow) => void;
}) {
  // The row dimension defaults to the page's (format or instructor) and may be any Sessions column.
  const [chosen, setChosen] = usePersistentGroups(`scorecard:${initial}`, [initial]);
  const dimension: ScorecardDimension = chosen[0] && (chosen[0] === initial || groupable(chosen[0])) ? chosen[0] : initial;
  const fields = useGroupFields("sessions", [dimension]);
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ id: string; desc: boolean }>({ id: "attendance", desc: true });
  const tops = scorecardTops(dimension);
  const noun = dimension === "trainer" ? "Instructor" : dimension === "format_group" ? "Format" : groupLabel(dimension);
  const ready = usable("sessions") && usable("new") && usable("bookings");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([query(scorecardSQL(dimension, filters, transient)), query(scorecardTotalSQL(dimension, filters, transient))])
      .then(([r, t]) => {
        if (!active) return;
        setRows(r);
        setTotal(t[0] ?? null);
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [dimension, filters, transient, version, ready]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const x = a[sort.id], y = b[sort.id];
        if (x == null) return 1;
        if (y == null) return -1;
        const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort.desc ? -order : order;
      }),
    [rows, sort],
  );

  function drill(row: Row, column?: Column) {
    const source = column?.drill ?? "sessions";
    const label = `${row.label}${column ? ` · ${column.label}` : ""}`;
    onDrill({
      id: `scorecard:${dimension}:${row.k}:${column?.id ?? "all"}`,
      label,
      source,
      filters,
      transient,
      metrics: source === "sessions" ? ["sessions", "attendance", "fill_rate", "revenue"] : source === "new" ? ["new_clients", "conversion_rate", "retention_rate"] : ["bookings", "booking_late_cancelled", "booking_late_rate"],
      predicate: scorecardPredicate(dimension, String(row.k), column?.extra),
      path: [],
      values: row,
      children: [],
    });
  }

  const header = (id: string, label: string) => (
    <th key={id} scope="col" aria-sort={sort.id === id ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button className="scorecard-sort" onClick={() => setSort((s) => ({ id, desc: s.id === id ? !s.desc : true }))}>
        {label}
        {sort.id === id ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <Register
      index={index}
      title={`${noun} scorecard`}
      subtitle={`Classes and demand · new members by first-visit ${noun.toLowerCase()} · late cancellations`}
      actions={
        <button
          className="button"
          disabled={!rows.length}
          onClick={() =>
            exportCSV(
              `${noun.toLowerCase()}-scorecard`,
              sorted.map((r) => ({
                [noun]: r.label,
                ...Object.fromEntries(measures.map((m) => [m.label, r[m.id]])),
                ...Object.fromEntries(tops.map(([id, , label]) => [label, r[id]])),
              })),
            )
          }
        >
          Export CSV
        </button>
      }
    >
      <GroupByPicker name={`${noun} scorecard`} label="Rows" value={[dimension]} fields={fields} max={1} defaults={[initial]}
        onChange={(next) => { setChosen(next.length ? next : [initial]); setSort({ id: "attendance", desc: true }); }} />
      {!ready ? (
        <p role="status">Loading scorecard sources…</p>
      ) : error ? (
        <p role="alert">Scorecard unavailable: {error}</p>
      ) : loading && !rows.length ? (
        <p role="status">Building scorecard…</p>
      ) : !rows.length ? (
        <p role="status">No classes match this scope.</p>
      ) : (
        <div className="table-scroll performance-scorecard">
          <table>
            <thead>
              <tr>
                {header("label", noun)}
                {measures.map((m) => header(m.id, m.label))}
                {tops.map(([id, , label]) => header(id, label))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={String(r.k)}>
                  <th scope="row">
                    <button className="scorecard-cell" onClick={() => drill(r)}>
                      {dimension === "trainer" ? <InstructorName name={String(r.label)} /> : String(r.label)}
                    </button>
                  </th>
                  {measures.map((m) => (
                    <td key={m.id} className="number">
                      {m.id === "composite_score" ? (
                        <span className="scorecard-score" style={{ "--score": `${Number(r[m.id] ?? 0)}%` } as React.CSSProperties}>
                          {r[m.id] == null ? "—" : Number(r[m.id]).toFixed(0)}
                        </span>
                      ) : (
                        <button className="scorecard-cell" onClick={() => drill(r, m)} aria-label={`Inspect ${m.label} for ${r.label}`}>
                          {fmt(m.format ?? m.id, r[m.id])}
                        </button>
                      )}
                    </td>
                  ))}
                  {tops.map(([id]) => (
                    <td key={id}>{r[id] == null ? "—" : String(r[id])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {total && (
              <tfoot>
                <tr>
                  <th scope="row">All {noun.toLowerCase()}s</th>
                  {measures.map((m) => (
                    <td key={m.id} className="number">
                      {m.id === "composite_score" ? "—" : fmt(m.format ?? m.id, total[m.id])}
                    </td>
                  ))}
                  {tops.map(([id]) => (
                    <td key={id}>—</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <p className="small">
        Composite score (0–100) averages each {noun.toLowerCase()}'s rank against the others on fill rate, class average
        excluding empty classes, revenue per class, conversion %, retention % and, inversely, late-cancel % and empty-class
        share. New members are first visits whose “Is New” label contains “new”; converted and retained follow the
        Conversion and Retention Status columns. Late cancellations count late-cancelled bookings.
        Top values are the busiest by checked-in attendance.
      </p>
    </Register>
  );
}
