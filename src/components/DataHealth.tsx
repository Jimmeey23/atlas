import { useEffect, useState } from "react";
import { CheckCircle2, TriangleAlert, RefreshCw, Download } from "lucide-react";
import { health, query, type Row } from "../data/duckdb";
import { useStore } from "../state/store";
import { where } from "../data/analytics";
import { availableRows } from "../data/analytics";
import { sheets } from "../data/sheets.config";
import { sourceStates, usable } from "../data/loader";
import { Register } from "./Register";
import { fmt } from "../semantics/formats";
import { exportCSV } from "./exports";
export function DataHealth({
  onRefresh,
  version,
}: {
  onRefresh: () => void;
  version: number;
}) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const sources = sheets.map(
    (s) =>
      health[s.key] || {
        ...s,
        rows: [],
        status: "error",
        fetchedAt: null,
        loadMs: 0,
        recordsCount: 0,
        defects: [],
        error: sourceStates[s.key].error || "Source unavailable",
      },
  );
  const incomplete = sheets.some((s) => !usable(s.key));
  const defects = sources.flatMap((s) => s.defects);
  const [joins, setJoins] = useState<Row[]>([]);
  const [complete, setComplete] = useState<Row[]>([]);
  const [reconcile, setReconcile] = useState<Row[]>([]);
  const [fields, setFields] = useState<Row[]>([]);
  const [fieldSearch, setFieldSearch] = useState("");
  const [duplicate, setDuplicate] = useState<Row[]>([]);
  const refreshing = Object.values(sourceStates).some(
    (s) => s.state === "loading" || s.state === "refreshing",
  );
  useEffect(() => {
    if (refreshing) return;
    fetch("/api/field-health")
      .then((r) => r.json())
      .then(setFields)
      .catch(() => {});
    query(
      `SELECT LOWER(email) AS email,REGEXP_REPLACE(phone,'[^0-9]','','g') AS phone,COUNT(DISTINCT member_id) AS member_ids FROM new${where(filters, "new", transient)}${where(filters, "new", transient) ? " AND " : " WHERE "}contactable AND phone IS NOT NULL GROUP BY LOWER(email),REGEXP_REPLACE(phone,'[^0-9]','','g') HAVING COUNT(DISTINCT member_id)>1 ORDER BY member_ids DESC`,
    ).then(setDuplicate);
  }, [version, refreshing, filters, transient]);
  useEffect(() => {
    let active = true;
    if (incomplete || refreshing) return;
    const joinSQL = [
      ["Checkins → New", "checkins", "new", "member_id", "member_id"],
      ["Sales → New", "sales", "new", "member_id", "member_id"],
      ["Lapsed → New", "lapsed", "new", "member_id", "member_id"],
      ["Leads → New", "leads", "new", "member_id", "member_id"],
      [
        "Sessions → Checkins",
        "sessions",
        "checkins",
        "session_id",
        "session_id",
      ],
      ["Sessions → Payroll", "sessions", "payroll", "trainer_id", "trainer_id"],
    ]
      .map(
        ([name, a, b, key, ref]) =>
          `SELECT '${name}' AS relation,COUNT(*) AS keyed,COUNT(*) FILTER (WHERE NOT EXISTS(SELECT 1 FROM "${b}" b WHERE b."${ref}"=a."${key}")) AS orphans FROM "${a}" a${where(filters, a, transient)}${where(filters, a, transient) ? " AND " : " WHERE "}a."${key}" IS NOT NULL`,
      )
      .join(" UNION ALL ");
    const scoped = (source: string) =>
      `(SELECT * FROM "${source}"${where(filters, source, transient)})`;
    Promise.all([
      query(joinSQL),
      query(
        `SELECT 'Session revenue vs booking value (different recognition)' AS measure,(SELECT SUM(revenue) FROM ${scoped("sessions")}) AS primary_value,(SELECT SUM(revenue) FROM ${scoped("bookings")} WHERE NOT imported) AS secondary_value UNION ALL SELECT 'Attendance: matched session IDs',(SELECT SUM(checked_in) FROM ${scoped("sessions")} WHERE session_id IN (SELECT session_id FROM ${scoped("checkins")})),(SELECT COUNT(*) FROM ${scoped("checkins")} WHERE attended AND session_id IN (SELECT session_id FROM ${scoped("sessions")})) UNION ALL SELECT 'Members: New vs Checkins',(SELECT COUNT(DISTINCT member_id) FROM ${scoped("new")}),(SELECT COUNT(DISTINCT member_id) FROM ${scoped("checkins")})`,
      ),
      query(
        Object.keys(health)
          .map(
            (key) =>
              `SELECT '${key}' AS source,COUNT(*) AS n,COUNT(*) FILTER (WHERE date IS NULL) AS missing_date,COUNT(*) FILTER (WHERE location='Unknown location') AS missing_location,COUNT(*) FILTER (WHERE member_id IS NULL) AS missing_member_id,COUNT(*) FILTER (WHERE revenue IS NULL) AS missing_revenue FROM "${key}"${where(filters, key, transient)}`,
          )
          .join(" UNION ALL "),
      ),
    ])
      .then(([j, r, c]) => {
        if (active) {
          setJoins(j);
          setReconcile(r);
          setComplete(c);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [version, refreshing, filters, transient]);
  const failures = sources.filter((s) => s.status === "error").length;
  const warnings = sources.filter((s) => s.status === "warning").length;
  return (
    <>
      {incomplete && (
        <p className="notice warn">
          Some sources are unavailable. Cross-source reconciliation and orphan
          counts are withheld until all required sources load. Retry each failed
          source in Source freshness.
        </p>
      )}
      <div className="health-cards">
        {[
          ["Cached source records", availableRows().toLocaleString("en-IN")],
          [
            "Records in global scope",
            complete
              .reduce((sum, row) => sum + Number(row.n), 0)
              .toLocaleString("en-IN"),
          ],
          [
            "Connected sheets",
            `${sources.length - failures} / ${sources.length}`,
          ],
          ["Schema warnings", warnings],
          [
            "Duration defects",
            defects
              .filter((d) => d.field === "Duration (Minutes)")
              .length.toLocaleString("en-IN"),
          ],
          [
            "Join orphans",
            incomplete
              ? "Unavailable"
              : joins
                  .reduce((s, r) => s + Number(r.orphans), 0)
                  .toLocaleString("en-IN"),
          ],
        ].map(([label, value]) => (
          <div className="health-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <Register
        index="01"
        title="Source status"
        subtitle="Resolved by title, never by reference gid"
        actions={
          <button className="button" onClick={onRefresh}>
            <RefreshCw size={12} />
            Refresh all
          </button>
        }
      >
        <div className="table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>Sheet</th>
                <th>State</th>
                <th>Rows</th>
                <th>Columns</th>
                <th>Fetched</th>
                <th>Load time</th>
                <th>Schema / connection</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.key}>
                  <td>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${s.id}/edit`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.title}
                    </a>
                  </td>
                  <td>
                    <span
                      className={`pill ${s.status === "ok" ? "good" : "warning"}`}
                    >
                      {s.status === "ok" ? (
                        <CheckCircle2 size={11} />
                      ) : (
                        <TriangleAlert size={11} />
                      )}{" "}
                      {s.status}
                    </span>
                  </td>
                  <td>
                    {s.fetchedAt ? s.recordsCount.toLocaleString("en-IN") : "—"}
                  </td>
                  <td>{s.columns.filter(Boolean).length}</td>
                  <td>
                    {s.fetchedAt
                      ? new Date(s.fetchedAt).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })
                      : "—"}
                  </td>
                  <td>{s.loadMs}ms</td>
                  <td className="error-text">
                    {s.error || s.missing?.length
                      ? s.error ||
                        `Mapped header drift: ${s.missing?.join(", ")}`
                      : s.mode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Register>
      <Register
        index="02"
        title="Field completeness"
        subtitle="Missing is different from zero"
        actions={
          <button
            className="icon-button"
            aria-label="Export completeness"
            onClick={() => exportCSV("field-completeness", complete)}
          >
            <Download size={13} />
          </button>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Records</th>
                <th>Missing date</th>
                <th>Missing location</th>
                <th>Missing member ID</th>
                <th>Missing revenue</th>
              </tr>
            </thead>
            <tbody>
              {complete.map((r) => (
                <tr key={String(r.source)}>
                  <td>{r.source}</td>
                  <td>{r.n}</td>
                  {[
                    "missing_date",
                    "missing_location",
                    "missing_member_id",
                    "missing_revenue",
                  ].map((k) => (
                    <td
                      key={k}
                      title={`${r[k]} null values`}
                      style={{
                        color:
                          Number(r[k]) / Number(r.n) > 0.1
                            ? "var(--warn)"
                            : undefined,
                      }}
                    >
                      {Number(r.n)
                        ? ((Number(r[k]) / Number(r.n)) * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ranking-foot">
          Member IDs are not expected on Sessions or Payroll. Their absence is
          context, not automatically a defect.
        </p>
      </Register>
      <Register
        index="03"
        title="Cross-sheet reconciliation"
        subtitle="Different source grains stay explicit"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Comparison</th>
                <th>First source</th>
                <th>Second source</th>
                <th>Absolute gap</th>
                <th>Gap %</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {reconcile.map((r) => {
                const gap = Number(r.primary_value) - Number(r.secondary_value);
                return (
                  <tr key={String(r.measure)}>
                    <td>{r.measure}</td>
                    <td>{fmt("records", r.primary_value)}</td>
                    <td>{fmt("records", r.secondary_value)}</td>
                    <td>{fmt("records", gap)}</td>
                    <td>
                      {r.primary_value
                        ? ((gap / Number(r.primary_value)) * 100).toFixed(1) +
                          "%"
                        : "—"}
                    </td>
                    <td>
                      <span className="pill warning">
                        {String(r.measure).startsWith("Attendance")
                          ? "Investigate variance"
                          : "Different grain / coverage"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Register>
      <Register
        index="04"
        title="Referential integrity"
        subtitle="Null keys excluded from orphan denominators"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Join</th>
                <th>Keyed rows</th>
                <th>Orphans</th>
                <th>Orphan rate</th>
              </tr>
            </thead>
            <tbody>
              {joins.map((r) => (
                <tr key={String(r.relation)}>
                  <td>{r.relation}</td>
                  <td>{fmt("records", r.keyed)}</td>
                  <td>{fmt("records", r.orphans)}</td>
                  <td>
                    {Number(r.keyed)
                      ? ((Number(r.orphans) / Number(r.keyed)) * 100).toFixed(
                          1,
                        ) + "%"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Register>
      <Register
        index="05"
        title="Original field audit"
        subtitle="Every supplied source column"
        actions={
          <input
            aria-label="Find a source field"
            placeholder="Search fields…"
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
          />
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Sheet / field</th>
                <th>Rows</th>
                <th>Missing %</th>
                <th>Distinct</th>
                <th>Numeric min</th>
                <th>Numeric max</th>
              </tr>
            </thead>
            <tbody>
              {fields
                .filter((f) =>
                  (String(f.source) + " " + f.field)
                    .toLowerCase()
                    .includes(fieldSearch.toLowerCase()),
                )
                .map((f, i) => (
                  <tr key={i}>
                    <td>
                      {f.source} / {f.field}
                    </td>
                    <td>{fmt("records", f.rows)}</td>
                    <td
                      style={{
                        color:
                          Number(f.nullPercent) > 0.2
                            ? "var(--warn)"
                            : undefined,
                      }}
                    >
                      {(Number(f.nullPercent) * 100).toFixed(1)}%
                    </td>
                    <td>{fmt("records", f.distinct)}</td>
                    <td>{fmt("records", f.min)}</td>
                    <td>{fmt("records", f.max)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="ranking-foot">
          Nulls include empty strings and bare hyphens. Numeric bounds are shown
          only for parseable numeric values.
        </p>
      </Register>
      <Register
        index="06"
        title="Identity collisions"
        subtitle="Normalised email + phone, never auto-merged"
      >
        <p className="muted">
          {duplicate.length} contact identities carry multiple distinct Member
          IDs.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Phone</th>
                <th>Distinct member IDs</th>
              </tr>
            </thead>
            <tbody>
              {duplicate.slice(0, 100).map((d, i) => (
                <tr key={i}>
                  <td>{d.email}</td>
                  <td>{d.phone}</td>
                  <td>{d.member_ids}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Register>
      <Register
        index="07"
        title="Known defects register"
        subtitle="Affecting metrics are labelled at the point of use"
      >
        <div className="notice">
          <TriangleAlert size={14} />
          Duration (Minutes) contains Excel dates. Some Sales net-of-VAT values
          exceed gross payments. Duration-derived metrics remain unavailable; no
          default duration is substituted.
        </div>
        <div className="table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Row</th>
                <th>Field</th>
                <th>Defect</th>
              </tr>
            </thead>
            <tbody>
              {defects.slice(0, 100).map((d, i) => (
                <tr key={i}>
                  <td>{d.source}</td>
                  <td>{d.row}</td>
                  <td>{d.field}</td>
                  <td>{d.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ranking-foot">
          Showing first 100 of {defects.length.toLocaleString("en-IN")} observed
          defects.
        </p>
      </Register>
    </>
  );
}
