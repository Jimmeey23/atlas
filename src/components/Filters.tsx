import { useState } from "react";
import { ChevronDown, Check, Filter, X } from "lucide-react";
import {
  useStore,
  emptyFilters,
  type Filters as FilterType,
} from "../state/store";
import { query } from "../data/duckdb";
import { where } from "../data/analytics";
import { blueprints } from "../data/blueprints";
import { today } from "../data/analytics";
import { shortLocation } from "../data/normalise";
function preset(name: string) {
  const end = new Date(today() + "T00:00:00Z");
  const start = new Date(end);
  if (name === "month") start.setUTCDate(1);
  if (name === "30") start.setUTCDate(start.getUTCDate() - 29);
  if (name === "quarter") {
    const quarter = Math.floor(end.getUTCMonth() / 3);
    start.setUTCMonth(quarter * 3 - 3, 1);
    end.setUTCMonth(quarter * 3, 0);
  }
  if (name === "year") start.setUTCMonth(0, 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
export function Filters({
  options,
}: {
  options: Record<string, Record<string, number>>;
}) {
  const s = useStore();
  const count = Object.entries(s.filters).filter(
    ([k, v]) =>
      k !== "from" &&
      k !== "to" &&
      (Array.isArray(v)
        ? v.length
        : ["memberType", "sessionType", "capacityBand"].includes(k)
          ? v !== "all"
          : v),
  ).length;
  return (
    <>
      <div className="filterbar">
        <button
          className="filter-toggle"
          onClick={() => s.set({ filterOpen: !s.filterOpen })}
          aria-expanded={s.filterOpen}
        >
          <Filter size={13} />
          Filters
          <ChevronDown
            size={12}
            style={{ transform: s.filterOpen ? "rotate(180deg)" : undefined }}
          />
        </button>
        <div className="filter-summary">
          <span>
            {s.filters.from
              ? `${s.filters.from} — ${s.filters.to}`
              : "All dates"}
          </span>
          <span className="extra">/</span>
          <span>
            {s.filters.location.length
              ? s.filters.location.map(shortLocation).join(", ")
              : "All locations"}
          </span>
          <span className="extra">/</span>
          <span className="extra">
            {s.filters.trainer.length
              ? s.filters.trainer.length + " instructors"
              : "All instructors"}
          </span>
          {s.transient.map((t) => (
            <button
              className="chip"
              key={t.field}
              onClick={() =>
                s.set({ transient: s.transient.filter((x) => x !== t) })
              }
            >
              {t.value} <X size={10} />
            </button>
          ))}
        </div>
        <span className="filter-count">
          {count + s.transient.length} active
        </span>
        <button
          className="icon-button"
          aria-label="Clear all filters"
          onClick={() => s.set({ filters: { ...emptyFilters }, transient: [] })}
        >
          <X size={13} />
        </button>
      </div>
      {s.filterOpen && (
        <div className="drawer">
          <label>
            Period
            <select
              aria-label="Period preset"
              value="custom"
              onChange={(e) => {
                if (e.target.value === "all") s.filter({ from: "", to: "" });
                else s.filter(preset(e.target.value));
              }}
            >
              <option value="custom">Custom range</option>
              <option value="month">Month to date</option>
              <option value="30">Last 30 days</option>
              <option value="quarter">Last quarter</option>
              <option value="year">Year to date</option>
              <option value="all">All history</option>
            </select>
          </label>
          <div className="dates">
            <label>
              From
              <input
                type="date"
                value={s.filters.from}
                onChange={(e) => s.filter({ from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={s.filters.to}
                onChange={(e) => s.filter({ to: e.target.value })}
              />
            </label>
          </div>
          <label>
            Compare to
            <select
              value={s.compare}
              onChange={(e) => s.set({ compare: e.target.value })}
            >
              <option value="prior">Prior period</option>
              <option value="year">Same period last year</option>
              <option value="none">None</option>
            </select>
          </label>
          {(
            [
              "location",
              "trainer",
              "format",
              "source",
              "category",
              "day",
              "time",
            ] as const
          ).map((field) => (
            <Multi
              key={field}
              field={field}
              options={options[field] || {}}
              values={s.filters[field]}
              set={(v) => s.filter({ [field]: v })}
            />
          ))}
          <label>
            Community members
            <select
              value={s.filters.memberType}
              onChange={(e) => s.filter({ memberType: e.target.value })}
            >
              <option value="all">New and returning</option>
              <option value="new">Newcomers</option>
              <option value="returning">Returning</option>
            </select>
          </label>
          <label>
            Session type
            <select
              value={s.filters.sessionType}
              onChange={(e) => s.filter({ sessionType: e.target.value })}
            >
              <option value="all">All sessions</option>
              <option value="Regular">Regular</option>
              <option value="Hosted">Hosted partnerships</option>
            </select>
          </label>
          <label>
            Capacity band
            <select
              value={s.filters.capacityBand}
              onChange={(e) => s.filter({ capacityBand: e.target.value })}
            >
              <option value="all">All room sizes</option>
              <option value="small">Up to 10 seats</option>
              <option value="medium">11–20 seats</option>
              <option value="large">Over 20 seats</option>
            </select>
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={s.filters.imports}
              onChange={(e) => s.filter({ imports: e.target.checked })}
            />
            Include imported attendance
          </label>
          <button
            className="button"
            onClick={() => s.set({ filterOpen: false })}
          >
            <Check size={13} />
            Done
          </button>
        </div>
      )}
    </>
  );
}
function Multi({
  field,
  options,
  values,
  set,
}: {
  field: keyof FilterType;
  options: Record<string, number>;
  values: string[];
  set: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [live, setLive] = useState<Record<string, number>>({});
  const state = useStore();
  const hover = (v: string) => {
    const source = blueprints[state.tab].source;
    query(
      `SELECT COUNT(*) AS n FROM "${source}"${where(
        { ...state.filters, [field]: [v] },
        source,
        state.transient.filter((t) => t.field !== field),
      )}`,
    )
      .then((r) => setLive((c) => ({ ...c, [v]: Number(r[0].n) })))
      .catch(() => {});
  };
  const label = (
    {
      location: "Location",
      trainer: "Instructor",
      format: "Signature Experience",
      source: "Acquisition source",
      category: "Membership / category",
      day: "Day",
      time: "Time slot",
    } as Record<string, string>
  )[field];
  return (
    <div className="field-label">
      {label}
      <details className="multi">
        <summary>
          {values.length
            ? `${values.length} selected`
            : `All ${label.toLowerCase()}s`}{" "}
          <ChevronDown size={11} style={{ float: "right", marginTop: 3 }} />
        </summary>
        <div className="multi-menu">
          <input
            aria-label={`Search ${label}`}
            type="search"
            placeholder={`Search ${label.toLowerCase()}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="multi-actions">
            <button onClick={() => set(Object.keys(options))}>
              Select all
            </button>
            <button onClick={() => set([])}>Clear</button>
          </div>
          {Object.entries(options)
            .filter(([v]) => v.toLowerCase().includes(search.toLowerCase()))
            .map(([v, n]) => (
              <label
                key={v}
                onMouseEnter={() => hover(v)}
                onFocus={() => hover(v)}
                title={`${(live[v] ?? n).toLocaleString("en-IN")} ${live[v] != null ? "matching rows in current workspace" : "source rows; hover for the current scope"}`}
              >
                <span>
                  <input
                    type="checkbox"
                    checked={values.includes(v)}
                    onChange={() =>
                      set(
                        values.includes(v)
                          ? values.filter((x) => x !== v)
                          : [...values, v],
                      )
                    }
                  />{" "}
                  {v}
                </span>
                <span className="small">
                  {(live[v] ?? n).toLocaleString("en-IN")}
                </span>
              </label>
            ))}
        </div>
      </details>
    </div>
  );
}
