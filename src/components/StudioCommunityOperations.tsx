import { communityOperationsSQL } from "../data/studio-operations";
import { useEffect, useMemo, useState } from "react";
import { groupable } from "../data/group-fields";
import { usePersistentGroups } from "./ui/GroupByPicker";
import { query, type Row } from "../data/duckdb";
import { comparison, context, metricFacts } from "../data/analytics";
import { contributorPredicate } from "../semantics/metrics";
import { useStore } from "../state/store";
import { NestedTable, type TreeRow } from "./NestedTable";
import { Register } from "./Register";
import { ensureSource, usable } from "../data/loader";
const sections = [
  {
    source: "bookings",
    title: "Booking behaviour",
    description:
      "Reservations, attendance outcomes and cancellations from booking records.",
    columns: [
      "bookings",
      "unique_bookers",
      "booking_attendance_rate",
      "cancellation_rate",
      "booking_late_rate",
      "booking_no_show_rate",
      "booking_lead_time_days",
    ],
    groups: ["format", "day", "time", "trainer"],
  },
  {
    source: "checkins",
    title: "Member attendance",
    description:
      "Community attendance, visit frequency and earned visit value from check-in records.",
    columns: [
      "checkins",
      "unique_attendees",
      "visits_per_member",
      "checkin_revenue",
      "revenue_per_checkin",
      "teaching_hours",
    ],
    groups: ["member", "format", "trainer"],
  },
];
export function SourceRegister({
  config,
  version,
  onDrill,
  inline = false,
}: {
  config: (typeof sections)[number] & { predicate?: string };
  inline?: boolean;
  version: string | number;
  onDrill: (r: TreeRow) => void;
}) {
  const s = useStore();
  const [chosen, setGroups] = usePersistentGroups(`ops-register:${config.source}:${config.title}`, config.groups);
  // Levels vary in number; unsafe or stale saved fields fall back to the register's defaults.
  const groupKey = chosen.join();
  const groups = useMemo(() => {
    const valid = [...new Set(chosen)].filter(groupable);
    return valid.length ? valid : config.groups;
  }, [groupKey, config.groups]); // eslint-disable-line react-hooks/exhaustive-deps
  const [columns, setColumns] = useState(config.columns);
  const [data, setData] = useState<{ rows: Row[]; total: Row; key: string }>({
    rows: [],
    total: {},
    key: "",
  });
  const [priorRows, setPriorRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData({ rows: [], total: {}, key: "" });
    setPriorRows([]);
    (async () => {
      await ensureSource(config.source);
      if (!usable(config.source))
        throw new Error(
          "Source unavailable. Refresh this source in Data quality.",
        );
      const base = metricFacts(s.filters, config.source, s.transient);
      const facts = config.predicate
        ? `(SELECT * FROM ${base} WHERE ${config.predicate})`
        : base;
      const sql = communityOperationsSQL(
        facts,
        groups,
        columns,
        context(s.filters, s.transient),
      );
      const previous = comparison(s.filters, s.compare);
      const previousBase = metricFacts(previous, config.source, s.transient);
      const previousFacts = config.predicate
        ? `(SELECT * FROM ${previousBase} WHERE ${config.predicate})`
        : previousBase;
      const previousSql = communityOperationsSQL(
        previousFacts,
        groups,
        columns,
        context(previous, s.transient),
      );
      const [rows, total, prior] = await Promise.all([
        query(sql.rows),
        query(sql.total),
        s.compare === "none" ? Promise.resolve([]) : query(previousSql.rows),
      ]);
      if (active) {
        setData({ rows, total: total[0] || {}, key: groups.join() });
        setPriorRows(prior);
      }
    })()
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [
    config.source,
    config.predicate,
    version,
    s.filters,
    s.transient,
    s.rate,
    s.compare,
    groups,
    columns,
  ]);
  const content = (
    <>
      {loading || (!error && data.key !== groups.join()) ? (
        <p className="ops-status" role="status">
          Loading {config.title.toLowerCase()}…
        </p>
      ) : error ? (
        <p className="ops-status" role="alert">
          {error}
        </p>
      ) : !data.rows.length ? (
        <p className="ops-status">No records in the selected scope.</p>
      ) : (
        <NestedTable
          rows={data.rows}
          priorRows={priorRows}
          source={config.source}
          predicate={config.predicate}
          groups={groups}
          columns={columns}
          total={data.total}
          onGroups={(g) => {
            if (g.length) setGroups(g);
          }}
          onColumns={setColumns}
          onDrill={(r, metric) =>
            onDrill({
              ...r,
              source: config.source,
              filters: s.filters,
              metrics: metric ? [metric] : columns,
              predicate:
                [
                  config.predicate,
                  metric
                    ? contributorPredicate(
                        metric,
                        context(s.filters, s.transient),
                      )
                    : undefined,
                ]
                  .filter(Boolean)
                  .map((p) => "(" + p + ")")
                  .join(" AND ") || undefined,
            })
          }
        />
      )}
    </>
  );
  return inline ? (
    content
  ) : (
    <Register
      index={config.source === "bookings" ? "OB" : "OA"}
      title={config.title}
      subtitle={config.description}
    >
      {content}
    </Register>
  );
}
export function StudioCommunityOperations(props: {
  version: string | number;
  onDrill: (r: TreeRow) => void;
}) {
  return (
    <div className="ops-community">
      {sections.map((config) => (
        <SourceRegister key={config.source} config={config} {...props} />
      ))}
    </div>
  );
}
