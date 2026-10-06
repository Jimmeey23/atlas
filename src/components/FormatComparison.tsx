import { Fragment, useEffect, useMemo, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { metricSQL, metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { context, metricFacts, today } from "../data/analytics";
import { historicalFilters, historicalTransient } from "../data/periods";
import { Register } from "./Register";
import { exportCSV } from "./exports";

// Every section groups by format_group, derived from the class name in
// normalise.ts. Formats come from the data rather than a fixed list so a
// renamed or retired format does not leave an empty column behind.
const SCORECARD = [
  { heading: "Supply", ids: ["sessions", "capacity", "trainers"] },
  { heading: "Demand", ids: ["booked", "attendance", "paid_attendance", "avg_class_size_incl", "avg_class_size_excl"] },
  { heading: "Efficiency", ids: ["fill_rate", "booking_fill_rate", "show_up_rate", "empty_sessions", "empty_session_rate", "unsold_seats", "attendance_cv"] },
  { heading: "Leakage", ids: ["late_cancel_rate", "no_show_rate", "non_paid_rate"] },
  { heading: "Yield", ids: ["revenue", "revenue_per_session", "rev_pac", "rev_pas", "lost_revenue", "membership_att_share"] },
];
const SCORECARD_IDS = SCORECARD.flatMap((s) => s.ids);
const SHARE_IDS = ["sessions", "capacity", "attendance", "revenue"];
const TREND_IDS = ["attendance", "fill_rate", "revenue", "revenue_per_session", "avg_class_size_incl", "sessions"];
const SLOT_IDS = ["sessions", "attendance", "fill_rate", "avg_class_size_incl", "revenue_per_session"];
const MIN_SESSIONS = 5;

type Section = { rows: Row[]; trend: Row[]; slots: Row[]; trainers: Row[]; studios: Row[] };
const empty: Section = { rows: [], trend: [], slots: [], trainers: [], studios: [] };

export function FormatComparison({ version }: { version: string | number }) {
  const s = useStore();
  const [data, setData] = useState<Section>(empty);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [trendMetric, setTrendMetric] = useState("attendance");
  const [view, setView] = useState<"value" | "index">("value");

  const sql = useMemo(() => {
    const facts = metricFacts(s.filters, "sessions", s.transient);
    const labelled = `WITH f AS (SELECT *, COALESCE(format_group,'Barre') AS fg FROM ${facts})`;
    // The trend ignores the page date filter so the shape of a format over the
    // year stays readable while the rest of the tab is scoped to a period.
    const history = historicalFilters(s.filters, today());
    const historyFacts = metricFacts(history, "sessions", historicalTransient(s.transient));
    return {
      rows: `${labelled} SELECT fg,GROUPING(fg) AS is_total,${metricSQL(SCORECARD_IDS, context(s.filters, s.transient))},COUNT(*) AS n FROM f GROUP BY GROUPING SETS ((fg),()) ORDER BY is_total,fg`,
      trend: `WITH f AS (SELECT *, COALESCE(format_group,'Barre') AS fg FROM ${historyFacts}) SELECT month,fg,${metricSQL(TREND_IDS, context(history, historicalTransient(s.transient)))} FROM f WHERE month IS NOT NULL GROUP BY month,fg ORDER BY month`,
      slots: `${labelled} SELECT fg,day,time,${metricSQL(SLOT_IDS, context(s.filters, s.transient))} FROM f WHERE day IS NOT NULL AND time IS NOT NULL GROUP BY fg,day,time HAVING SUM(sessions)>=${MIN_SESSIONS}`,
      trainers: `${labelled} SELECT fg,COALESCE(trainer,'Unspecified') AS trainer,${metricSQL(SLOT_IDS, context(s.filters, s.transient))} FROM f GROUP BY fg,trainer HAVING SUM(sessions)>=${MIN_SESSIONS}`,
      studios: `${labelled} SELECT fg,COALESCE(location,'Unspecified') AS location,${metricSQL(SLOT_IDS, context(s.filters, s.transient))} FROM f GROUP BY fg,location`,
    };
  }, [s.filters, s.transient, s.rate]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([query(sql.rows), query(sql.trend), query(sql.slots), query(sql.trainers), query(sql.studios)])
      .then(([rows, trend, slots, trainers, studios]) => {
        if (active) setData({ rows, trend, slots, trainers, studios });
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sql, version]);

  const formats = useMemo(
    () => data.rows.filter((r) => !Number(r.is_total)).map((r) => String(r.fg)),
    [data.rows],
  );
  const total = data.rows.find((r) => Number(r.is_total));
  const row = (format: string) => data.rows.find((r) => String(r.fg) === format);
  // Only rates and per-unit measures are comparable across formats. Totals
  // follow timetable volume, so "Barre leads on sessions" says nothing.
  const best = (id: string) => {
    const higher = metrics[id]?.higherIsBetter;
    if (higher == null || metrics[id]?.aggregation === "sum" || id === "lost_revenue") return null;
    const scored = formats
      .map((f) => ({ f, v: Number(row(f)?.[id]) }))
      .filter((x) => Number.isFinite(x.v));
    if (scored.length < 2) return null;
    return scored.reduce((a, b) => ((higher ? b.v > a.v : b.v < a.v) ? b : a)).f;
  };

  if (error) return <Register index="F1" title="Format comparison" subtitle="Scorecard"><p role="alert">{error}</p></Register>;

  return (
    <>
      <Register
        index="F1"
        title="Format head to head"
        subtitle={`PowerCycle, Strength Lab and Barre on the same measures · ${view === "index" ? "each format against the all-format average" : "absolute values"}`}
        actions={
          <>
            <div className="segmented">
              {(["value", "index"] as const).map((m) => (
                <button key={m} className={view === m ? "active" : ""} onClick={() => setView(m)}>
                  {m === "value" ? "Values" : "vs all formats"}
                </button>
              ))}
            </div>
            <button
              className="button"
              disabled={!formats.length}
              onClick={() =>
                exportCSV(
                  "format-head-to-head",
                  SCORECARD_IDS.map((id) => ({
                    Measure: metrics[id]?.label || id,
                    ...Object.fromEntries(formats.map((f) => [f, row(f)?.[id] ?? null])),
                    "All formats": total?.[id] ?? null,
                  })) as Row[],
                )
              }
            >
              Export CSV
            </button>
          </>
        }
      >
        {loading && <p role="status">Comparing formats…</p>}
        <div className="table-scroll">
          <table className="worklist-table format-scorecard">
            <thead>
              <tr>
                <th>Measure</th>
                {formats.map((f) => (
                  <th key={f}>{f}</th>
                ))}
                <th>All formats</th>
              </tr>
            </thead>
            <tbody>
              {SCORECARD.map((group) => (
                <Fragment key={group.heading}>
                  <tr className="format-group-head">
                    <th scope="row" colSpan={formats.length + 2}>{group.heading}</th>
                  </tr>
                  {group.ids.map((id) => {
                    const leader = best(id);
                    return (
                      <tr key={id}>
                        <th scope="row">{metrics[id]?.label || id}</th>
                        {formats.map((f) => (
                          <td key={f} className={leader === f ? "format-leader" : undefined}>
                            {view === "index" && total
                              ? delta(id, row(f)?.[id], total[id])
                              : fmt(id, row(f)?.[id])}
                          </td>
                        ))}
                        <td>{fmt(id, total?.[id])}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          Highlighted cells lead on that measure in the direction the metric is
          read. Shares and rates are weighted, not averaged across formats.
        </p>
      </Register>

      <Register index="F2" title="Share of the timetable" subtitle="What each format takes of the studio, and what it returns">
        <div className="format-share-grid">
          {SHARE_IDS.map((id) => (
            <article className="format-share" key={id}>
              <h3>{metrics[id]?.label || id}</h3>
              <div className="format-share-bar" role="img" aria-label={`${metrics[id]?.label} split by format`}>
                {formats.map((f, i) => {
                  const part = Number(row(f)?.[id] ?? 0);
                  const whole = Number(total?.[id] ?? 0);
                  return (
                    <span
                      key={f}
                      data-format={i}
                      style={{ flexGrow: whole ? part / whole : 1 }}
                      title={`${f}: ${fmt(id, part)}`}
                    />
                  );
                })}
              </div>
              <dl>
                {formats.map((f) => {
                  const part = Number(row(f)?.[id] ?? 0);
                  const whole = Number(total?.[id] ?? 0);
                  return (
                    <div key={f}>
                      <dt>{f}</dt>
                      <dd>
                        {whole ? ((part / whole) * 100).toFixed(1) + "%" : "—"}
                        <small>{fmt(id, part)}</small>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          ))}
        </div>
        <p className="small">
          A format earning a larger share of revenue than of seats is returning
          more than the studio time it takes.
        </p>
      </Register>

      <TrendTable rows={data.trend} formats={formats} metric={trendMetric} onMetric={setTrendMetric} />
      <SliceTable
        index="F4"
        title="Where each format works"
        subtitle="Day and time slots, ranked by fill within each format"
        rows={data.slots}
        formats={formats}
        label={(r) => `${r.day} · ${r.time}`}
        caption={`Slots with at least ${MIN_SESSIONS} sessions in scope.`}
      />
      <SliceTable
        index="F5"
        title="Who teaches each format best"
        subtitle="Instructors ranked by fill within each format"
        rows={data.trainers}
        formats={formats}
        label={(r) => String(r.trainer)}
        caption={`Instructors with at least ${MIN_SESSIONS} sessions of that format in scope.`}
      />
      <SliceTable
        index="F6"
        title="Format mix by studio"
        subtitle="How each studio's timetable splits, and how each format performs there"
        rows={data.studios}
        formats={formats}
        label={(r) => String(r.location)}
        caption="Every studio with recorded sessions for that format."
      />
    </>
  );
}

function TrendTable({ rows, formats, metric, onMetric }: { rows: Row[]; formats: string[]; metric: string; onMetric: (v: string) => void }) {
  const months = [...new Set(rows.map((r) => String(r.month)))].slice(-14);
  const monthLabel = (key: string) =>
    new Date(key + "-01T00:00:00Z").toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  const cell = (month: string, format: string) =>
    rows.find((r) => String(r.month) === month && String(r.fg) === format)?.[metric];
  return (
    <Register
      index="F3"
      dateIndependent
      title="How each format trends"
      subtitle="14 completed months · ignores the page date filter, every other filter applies"
      actions={
        <select aria-label="Trend metric" value={metric} onChange={(e) => onMetric(e.target.value)}>
          {TREND_IDS.map((id) => (
            <option key={id} value={id}>{metrics[id]?.label || id}</option>
          ))}
        </select>
      }
    >
      <div className="table-scroll mom">
        <table>
          <thead>
            <tr>
              <th>Format</th>
              {months.map((m) => (
                <th key={m}>{monthLabel(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {formats.map((f) => (
              <tr key={f}>
                <th scope="row">{f}</th>
                {months.map((m) => (
                  <td key={m}>{fmt(metric, cell(m, f))}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">Leader</th>
              {months.map((m) => {
                const scored = formats
                  .map((f) => ({ f, v: Number(cell(m, f)) }))
                  .filter((x) => Number.isFinite(x.v));
                const top = scored.length ? scored.reduce((a, b) => (b.v > a.v ? b : a)) : null;
                return <td key={m}>{top ? top.f : "—"}</td>;
              })}
            </tr>
            <tr>
              <th scope="row">Gap</th>
              {months.map((m) => {
                const values = formats.map((f) => Number(cell(m, f))).filter(Number.isFinite);
                if (values.length < 2) return <td key={m}>—</td>;
                const high = Math.max(...values);
                const low = Math.min(...values);
                // A percentage-point gap is readable across formats; a count is
                // not, so volume measures show the multiple instead.
                return (
                  <td key={m}>
                    {metrics[metric]?.format === "percent"
                      ? ((high - low) * 100).toFixed(1) + "pp"
                      : low > 0
                        ? (high / low).toFixed(1) + "\u00d7"
                        : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small">
        Leader is the highest format that month; Gap is the distance to the
        weakest — percentage points for rates, a multiple for everything else.
        A widening gap is a format pulling away, not a seasonal swing.
      </p>
    </Register>
  );
}

function SliceTable({ index, title, subtitle, rows, formats, label, caption }: {
  index: string; title: string; subtitle: string; rows: Row[]; formats: string[];
  label: (row: Row) => string; caption: string;
}) {
  const [limit, setLimit] = useState(5);
  return (
    <Register
      index={index}
      title={title}
      subtitle={subtitle}
      actions={
        <div className="segmented">
          {[5, 10, 25].map((n) => (
            <button key={n} className={limit === n ? "active" : ""} onClick={() => setLimit(n)}>
              Top {n}
            </button>
          ))}
        </div>
      }
    >
      <div className="format-slice-grid">
        {formats.map((f) => {
          const ranked = rows
            .filter((r) => String(r.fg) === f)
            .sort((a, b) => Number(b.fill_rate ?? 0) - Number(a.fill_rate ?? 0))
            .slice(0, limit);
          return (
            <article key={f}>
              <h3>{f}</h3>
              <div className="table-scroll">
                <table className="worklist-table">
                  <thead>
                    <tr>
                      <th>{title.includes("studio") ? "Studio" : title.includes("teaches") ? "Instructor" : "Slot"}</th>
                      <th>Sessions</th>
                      <th>Fill</th>
                      <th>Avg size</th>
                      <th>Rev / session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((r) => (
                      <tr key={label(r)}>
                        <th scope="row">{label(r)}</th>
                        <td>{fmt("sessions", r.sessions)}</td>
                        <td>{fmt("fill_rate", r.fill_rate)}</td>
                        <td>{fmt("avg_class_size_incl", r.avg_class_size_incl)}</td>
                        <td>{fmt("revenue_per_session", r.revenue_per_session)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!ranked.length && <p className="empty-state">No qualifying rows.</p>}
            </article>
          );
        })}
      </div>
      <p className="small">{caption}</p>
    </Register>
  );
}
