import { DropdownField } from "./ui/DropdownField";
import { useEffect, useMemo, useRef, useState } from "react";
import { where } from "../data/analytics";
import { query, quote, health, type Row } from "../data/duckdb";
import { today } from "../data/analytics";
import { useStore } from "../state/store";
import {
  reasons,
  episodeKey,
  followupFor,
  retentionSQL,
  worklistLabels,
  blankFollowup,
  type Worklist,
  type Followup,
} from "../data/retention";
import { contactable } from "../data/normalise";
import { sourceRows } from "../data/raw";
import { exportCSV } from "./exports";
import { sheets } from "../data/sheets.config";
const statuses = [
  "Not started",
  "Contact planned",
  "Contacted",
  "Awaiting member",
  "Closed",
];
export function RetentionWorklists({ version }: { version: number }) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const [rows, setRows] = useState<Row[]>([]),
    [followups, setFollowups] = useState<Record<string, Followup>>({});
  const [list, setList] = useState<Worklist>("renewal"),
    [search, setSearch] = useState(""),
    [horizon, setHorizon] = useState(30),
    [gap, setGap] = useState(14);
  const [status, setStatus] = useState("Open"),
    [owner, setOwner] = useState(""),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null),
    [draft, setDraft] = useState<Followup>(blankFollowup);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState("");
  const [original, setOriginal] = useState<Record<string, unknown> | null>(
    null,
  );
  const panel = useRef<HTMLDivElement>(null);
  const activeMember = useRef<Row | null>(null);
  activeMember.current = selected;
  const sourceVersion = ["lapsed", "new", "checkins"]
    .map((k) => health[k]?.fetchedAt || "unavailable")
    .join(",");
  const asOf = today(),
    sources = ["lapsed", "new", "checkins"];
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    (async () => {
      const response = await fetch("/api/retention-followups");
      if (!response.ok)
        throw new Error(
          "Follow-up history could not load. Retry before making changes.",
        );
      const records = (await response.json()) as Record<string, Followup>;
      const terms = [];
      if (filters.location.length)
        terms.push(`location IN (${filters.location.map(quote).join(",")})`);
      if (filters.from) terms.push(`end_date>=${quote(filters.from)}`);
      if (filters.to) terms.push(`end_date<=${quote(filters.to)}`);
      const activity = {...filters, from:"", to:"", location:[]};
      const dimensionScope = where(activity, "checkins", transient.filter(t=>t.field!=="location"));
      if (dimensionScope) terms.push(`member_id IN (SELECT DISTINCT member_id FROM checkins${dimensionScope})`);
      for (const t of transient)
        if (t.field === "location") terms.push(`location=${quote(t.value)}`);
      const result = await query(
        retentionSQL(asOf, terms.join(" AND ") || "TRUE", Object.keys(records)),
      );
      if (current) {
        setFollowups(records);
        setRows(result);
        setLoading(false);
      }
    })().catch((e) => {
      if (current) {
        setError(String(e));
        setLoading(false);
      }
    });
    return () => {
      current = false;
    };
  }, [sourceVersion, filters, transient, asOf]);
  const classified = useMemo(
    () =>
      rows.map((row) => ({
        row,
        reasons: {
          ...reasons(row, asOf, horizon, gap),
          ...(followups[String(row.member_id)]?.memberVoice &&
          followups[String(row.member_id)].status !== "Closed"
            ? {
                concerns:
                  "Member-reported concern recorded; follow-up remains open",
              }
            : {}),
        },
      })),
    [rows, asOf, horizon, gap, followups],
  );
  const matches = (row: Row, kind: Worklist) => {
    const f = followupFor(followups[String(row.member_id)], row, kind);
    return (
      (status === "All" ||
        (status === "Open" ? f.status !== "Closed" : f.status === status)) &&
      (!owner || f.owner === owner) &&
      `${row.member} ${row.member_id} ${row.email} ${row.product}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  };
  const counts = Object.fromEntries(
    (Object.keys(worklistLabels) as Worklist[]).map((kind) => [
      kind,
      classified.filter((x) => x.reasons[kind] && matches(x.row, kind)).length,
    ]),
  );
  const visible = classified.filter(
    (x) => x.reasons[list] && matches(x.row, list),
  );
  useEffect(
    () => setPage(0),
    [list, search, horizon, gap, status, owner, version],
  );
  useEffect(() => {
    if (!selected) return;
    const old = document.activeElement as HTMLElement;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
      if (e.key === "Tab") {
        const nodes = panel.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href],summary",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (old?.isConnected) old.focus();
      else
        document
          .querySelector<HTMLButtonElement>(".worklist-tabs button.active")
          ?.focus();
    };
  }, [selected]);
  const open = (row: Row) => {
    setSelected(row);
    setDraft({ ...followupFor(followups[String(row.member_id)], row, list) });
    setOriginal(null);
    setSaved("");
  };
  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setSaved("");
    try {
      const response = await fetch(
        `/api/retention-followups/${encodeURIComponent(String(selected.member_id))}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: draft.owner,
            status: draft.status,
            nextDate: draft.nextDate,
            preference: draft.preference,
            note: draft.note,
            memberVoice: draft.memberVoice,
            observation: draft.observation,
            closedReasons:
              draft.status === "Closed"
                ? [
                    ...new Set(
                      [
                        list,
                        ...Object.keys(reasons(selected, asOf, horizon, gap)),
                        ...(draft.memberVoice.trim() ? ["concerns"] : []),
                      ].map((kind) => episodeKey(selected, kind as Worklist)),
                    ),
                  ]
                : [],
          }),
        },
      );
      const record = await response.json();
      if (!response.ok) throw new Error(record.error);
      setFollowups((prev) => ({
        ...prev,
        [String(selected.member_id)]: record,
      }));
      setDraft(record);
      setSaved("Follow-up saved.");
    } catch (e) {
      setSaved(String(e));
    } finally {
      setSaving(false);
    }
  };
  const field = (key: keyof Followup, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const snapshotOld = sources.some(
    (k) => Date.now() - (health[k]?.fetchedAt || 0) >= 900000,
  );
  return (
    <section
      className="retention-worklists"
      aria-label="Retention and renewal worklists"
    >
      <div className="register-head">
        <div>
          <h2>Member follow-ups</h2>
          <p>Clear reasons. Relevant context. One next step.</p>
        </div>
        <button
          className="button"
          disabled={loading || !!error}
          onClick={() =>
            exportCSV(
              `atlas-${list}-worklist`,
              visible.map((x) => ({
                ...x.row,
                reason: x.reasons[list],
                ...followupFor(followups[String(x.row.member_id)], x.row, list),
                history: undefined,
                as_of: asOf,
                scope: `Location: ${filters.location.join(",") || "all"}; ${status}; ${horizon}-day renewals; ${gap}-day absence`,
              })),
              `As of ${asOf} IST; location: ${filters.location.join(",") || "all"}; ${status}; renewal ${horizon} days; minimum absence ${gap} days. Global date filters use membership expiry; activity dimensions match attended member records.`,
            )
          }
        >
          Export worklist
        </button>
      </div>
      <p className="worklist-scope">
        Operational list as of <strong>{asOf} IST</strong> · Global filters apply. Dates select membership expiry; instructor, format and schedule dimensions select members with matching activity.{" "}
        {snapshotOld && (
          <span className="warn">
            Saved source snapshots are displayed; eligibility may change after
            refresh.
          </span>
        )}
      </p>
      <div
        className="worklist-tabs"
        role="group"
        aria-label="Choose a worklist"
      >
        {(Object.keys(worklistLabels) as Worklist[]).map((key) => (
          <button
            key={key}
            className={list === key ? "active" : ""}
            aria-pressed={list === key}
            onClick={() => setList(key)}
          >
            {worklistLabels[key]} <span>{loading ? "…" : counts[key]}</span>
          </button>
        ))}
      </div>
      <div className="worklist-controls">
        <input
          aria-label="Search member worklist"
          placeholder="Search member, ID or package"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          Renewal window
          <DropdownField value={horizon} onChange={(e) => setHorizon(+e.target.value)}>
            {[7, 14, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </DropdownField>
        </label>
        <label>
          Minimum absence
          <DropdownField value={gap} onChange={(e) => setGap(+e.target.value)}>
            {[7, 14, 21, 30].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </DropdownField>
        </label>
        <label>
          Follow-up status
          <DropdownField value={status} onChange={(e) => setStatus(e.target.value)}>
            {["Open", "All", ...statuses].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </DropdownField>
        </label>
        <label>
          Owner
          <DropdownField value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All owners</option>
            {[
              ...new Set(
                Object.values(followups)
                  .map((f) => f.owner)
                  .filter(Boolean),
              ),
            ]
              .sort()
              .map((v) => (
                <option key={v}>{v}</option>
              ))}
          </DropdownField>
        </label>
      </div>
      {error ? (
        <p role="alert" className="warn">
          {error}
        </p>
      ) : loading ? (
        <p role="status">Preparing member evidence…</p>
      ) : (
        <>
          <div className="worklist-table-wrap">
            <table className="worklist-table">
              <thead>
                <tr>
                  <th>Community member</th>
                  <th>Why this member appears</th>
                  <th>Access / attendance</th>
                  <th>Contact</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {visible
                  .slice(page * 25, (page + 1) * 25)
                  .map(({ row, reasons: why }) => {
                    const f = followupFor(
                        followups[String(row.member_id)],
                        row,
                        list,
                      ),
                      overdue =
                        f.nextDate &&
                        f.nextDate < asOf &&
                        f.status !== "Closed";
                    return (
                      <tr key={String(row.member_id)}>
                        <td>
                          <button
                            className="member-worklist-link"
                            onClick={() => open(row)}
                          >
                            {row.member || "Name unavailable"}
                          </button>
                          <small>
                            {row.member_id} · {row.location}
                          </small>
                        </td>
                        <td>{why[list]}</td>
                        <td>
                          {row.product || "No membership record"}
                          <small>
                            {row.remaining == null
                              ? "Remaining sessions unavailable"
                              : `${row.remaining} sessions left`}{" "}
                            · Last attended {row.last_visit || "unavailable"}
                          </small>
                        </td>
                        <td>
                          {contactable(row.email)
                            ? "Email available"
                            : row.phone
                              ? "Phone recorded"
                              : "No usable contact recorded"}
                          <small>
                            Preference {f.preference || "not recorded"}
                          </small>
                        </td>
                        <td>
                          <button className="button" onClick={() => open(row)}>
                            {f.status === "Not started"
                              ? "Plan follow-up"
                              : f.status}
                          </button>
                          <small className={overdue ? "warn" : ""}>
                            {f.owner || "Unassigned"}
                            {f.nextDate
                              ? ` · ${overdue ? "Overdue " : ""}${f.nextDate}`
                              : ""}
                          </small>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className="empty-state">
              No members match this worklist and its filters.
            </p>
          )}
          <div className="worklist-pagination">
            <span>
              {visible.length.toLocaleString()} members ·{" "}
              {visible.length
                ? `${page * 25 + 1}–${Math.min((page + 1) * 25, visible.length)}`
                : "0"}{" "}
              shown
            </span>
            <button
              className="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="button"
              disabled={(page + 1) * 25 >= visible.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      <details className="worklist-method">
        <summary>Eligibility and evidence</summary>
        <p>
          Renewals include paid ongoing access (multi-session packages or
          memberships), excluding complimentary, introductory and single-session
          products. The representative membership prioritises current paid
          ongoing access, then the latest purchase per Member ID. Unused access
          uses this same representative record, with an active, new or
          not-activated status and a current start/end date. Frozen access is
          excluded. Concurrent memberships may require a source review.
        </p>
        <p>
          Attendance gaps use attended Checkins, excluding future dates. The
          threshold is the greater of the chosen minimum and twice the member’s
          median positive attendance gap over the last 180 days; at least three
          gaps are required. Gaps over 180 days are excluded from this active
          outreach list.
        </p>
        <p>
          Second-session return includes newcomers 7–30 days after their first
          session, with zero recorded post-trial visits and no later attended
          Checkin. Member concerns include a documented member statement with an
          open follow-up. Missing Member IDs are excluded; names and emails
          never merge identities.
        </p>
        <p>
          Contact availability does not establish consent. No message is sent
          from this workspace. Follow-up records are stored by this local
          gateway; closure records an outcome, not attributed revenue. Closed
          episodes stay closed across source refreshes. A new access term or a
          new attendance-gap episode reopens the relevant worklist while
          preserving previous history.
        </p>
      </details>
      {selected && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div
            className="drill followup-panel"
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Follow-up for ${selected.member}`}
          >
            <div className="panel-head">
              <div>
                <h2>{selected.member || selected.member_id}</h2>
                <p>
                  {selected.member_id} · {selected.location}
                </p>
              </div>
              <button
                className="button"
                aria-label="Close member follow-up"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <div className="followup-evidence">
              <h3>Member context</h3>
              <p>
                {Object.values(reasons(selected, asOf, horizon, gap)).join(
                  " · ",
                ) || "Documented follow-up"}
              </p>
              <p>
                {selected.product || "No membership record"} ·{" "}
                {selected.status || selected.lifecycle || "Status unavailable"}
                <br />
                Last attended {selected.last_visit || "unavailable"} ·{" "}
                {selected.attended_visits ?? "—"} recorded sessions
              </p>
              <p>
                Email:{" "}
                {contactable(selected.email) ? selected.email : "Unavailable"}
                <br />
                Phone: {selected.phone || "Unavailable"}
              </p>
              {(["lapsed", "new"] as const).map((k) => {
                const row =
                  selected[k === "lapsed" ? "membership_row" : "newcomer_row"];
                const definition = sheets.find((s) => s.key === k)!;
                return row != null ? (
                  <div className="followup-source" key={k}>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${definition.id}/edit#range=${encodeURIComponent(`'${definition.title}'!A${row}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open {definition.title} row {row}
                    </a>
                    <button
                      className="button"
                      onClick={() =>
                        sourceRows(k, [
                          {
                            source_row: row,
                            source_snapshot:
                              selected[
                                k === "lapsed"
                                  ? "membership_snapshot"
                                  : "newcomer_snapshot"
                              ],
                          },
                        ])
                          .then((r) => {
                            if (activeMember.current === selected)
                              setOriginal(r[0]);
                          })
                          .catch((e) => {
                            if (activeMember.current === selected)
                              setSaved(String(e));
                          })
                      }
                    >
                      View original fields
                    </button>
                  </div>
                ) : null;
              })}
              {original && (
                <details open>
                  <summary>Original source fields</summary>
                  <div className="detail-fields">
                    {Object.entries(original)
                      .filter(([k]) => !k.includes("Token"))
                      .map(([k, v]) => (
                        <div className="detail-field" key={k}>
                          <small>{k}</small>
                          <span>{v == null ? "—" : String(v)}</span>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="followup-form"
            >
              <label>
                Follow-up owner
                <input
                  maxLength={120}
                  value={draft.owner}
                  onChange={(e) => field("owner", e.target.value)}
                  placeholder="Team member responsible"
                />
              </label>
              <div className="followup-field">
                <label htmlFor="floor-followup-status">Status</label>
                <DropdownField
                  id="floor-followup-status"
                  value={draft.status}
                  onChange={(e) => field("status", e.target.value)}
                >
                  {statuses.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </DropdownField>
              </div>
              <label>
                Next follow-up date
                <input
                  type="date"
                  value={draft.nextDate}
                  onChange={(e) => field("nextDate", e.target.value)}
                />
              </label>
              <label>
                Member’s stated contact preference
                <DropdownField
                  value={draft.preference}
                  onChange={(e) => field("preference", e.target.value)}
                >
                  {[
                    "",
                    "Phone",
                    "Email",
                    "WhatsApp",
                    "In person",
                    "No follow-up requested",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v || "Not recorded"}
                    </option>
                  ))}
                </DropdownField>
              </label>
              <label>
                Member’s verbatim concern or barrier
                <textarea
                  maxLength={4000}
                  value={draft.memberVoice}
                  onChange={(e) => field("memberVoice", e.target.value)}
                  placeholder="Member stated…"
                />
              </label>
              <label>
                Action taken and member’s response / outcome
                <textarea
                  required={draft.status === "Closed"}
                  maxLength={4000}
                  value={draft.note}
                  onChange={(e) => field("note", e.target.value)}
                  placeholder="Resolution offered; member’s response; next step…"
                />
              </label>
              <label>
                Objective staff observation (separate from member voice)
                <textarea
                  maxLength={4000}
                  value={draft.observation}
                  onChange={(e) => field("observation", e.target.value)}
                />
              </label>
              <button className="button primary" disabled={saving}>
                {saving ? "Saving…" : "Save follow-up"}
              </button>
              <p role="status">{saved}</p>
            </form>
            {!!draft.history?.length && (
              <details>
                <summary>Follow-up history ({draft.history.length})</summary>
                {[...draft.history].reverse().map((item, i) => (
                  <article className="followup-history" key={i}>
                    <strong>
                      {item.status} · {item.owner || "Unassigned"}
                    </strong>
                    <p>{item.note || "No outcome recorded"}</p>
                    <p>
                      {item.memberVoice && `Member stated: ${item.memberVoice}`}
                    </p>
                    <small>
                      {item.updatedAt
                        ? new Date(item.updatedAt).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })
                        : ""}{" "}
                      IST
                    </small>
                  </article>
                ))}
              </details>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
