import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Save,
  Play,
  Database,
  Link2,
  Trash2,
  Download,
  Copy,
  FlaskConical,
} from "lucide-react";
import { query, health, type Row } from "../data/duckdb";
import { ensureSource } from "../data/loader";
import { sheets } from "../data/sheets.config";
import { sqlTypes } from "../data/normalise";
import { where } from "../data/analytics";
import { useStore } from "../state/store";
import {
  labTypes,
  labAggregates,
  labSQL,
  parseLabCollection,
  validateLabRelationships,
  labId,
  newLabSpec,
  type LabSpec,
  type LabField,
} from "../data/data-lab";
import { exportCSV } from "./exports";
import { LabResult } from "./LabResult";
import { LabRelationshipPreview } from "./LabRelationshipPreview";
import { SavedElements } from "./IntelligenceWorkspace";
import "./DataLab.css";
const storageKey = "atlas-data-lab-v1";
const key = (f: LabField) => JSON.stringify(f);
const name = (f: LabField) => `${f.source} · ${f.column}`;
const included = (s: LabSpec) => [
  s.source,
  ...s.relationships.map((r) => r.to),
  ...(s.sharedSheets || []),
];
function readSaved(): LabSpec[] {
  try {
    return parseLabCollection(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}
/** A saved agent element can hand its analysis to the builder through session storage. */
function openRequested(): LabSpec {
  try {
    const raw = sessionStorage.getItem("atlas-data-lab-open");
    if (raw) {
      sessionStorage.removeItem("atlas-data-lab-open");
      return parseLabCollection(JSON.stringify([JSON.parse(raw)]))[0];
    }
  } catch {
    /* Fall back to a new analysis. */
  }
  return newLabSpec();
}
export function DataLab({ version }: { version: number }) {
  const filters = useStore((s) => s.filters),
    transient = useStore((s) => s.transient);
  const [spec, setSpec] = useState<LabSpec>(openRequested),
    [saved, setSaved] = useState<LabSpec[]>(readSaved);
  const [fields, setFields] = useState<Record<string, string[]>>({}),
    [rows, setRows] = useState<Row[]>([]),
    [resultSpec, setResultSpec] = useState<LabSpec | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [profiles, setProfiles] = useState<string[]>([]),
    [dirty, setDirty] = useState(true);
  const [schemaRevision, setSchemaRevision] = useState(0);
  const seq = useRef(0);
  const update = (patch: Partial<LabSpec>) => {
    seq.current++;
    setBusy(false);
    setSpec((s) => ({ ...s, ...patch }));
    setDirty(true);
  };
  const scopesFor = (s: LabSpec) =>
    Object.fromEntries(
      included(s).map((source) => {
        const mode =
          s.relationships.find((r) => r.to === source)?.scope || "global";
        return [
          source,
          mode === "unfiltered"
            ? ""
            : where(
                mode === "all_dates"
                  ? { ...filters, from: "", to: "" }
                  : filters,
                source,
                transient,
              ),
        ];
      }),
    );
  const sources = included(spec);
  useEffect(() => {
    let active = true;
    const keys = included(spec);
    void Promise.all(
      keys.map(async (source) => {
        await ensureSource(source);
        if (!health[source]?.fetchedAt)
          throw new Error(
            `${source} is unavailable. Retry it under Source coverage.`,
          );
        const cols = Object.keys(sqlTypes);
        const counts = await query(
          `SELECT ${cols.map((c) => `COUNT(${labId(c)}) AS ${labId(c)}`).join(",")} FROM ${labId(source)}`,
        );
        if (active)
          setFields((f) => ({
            ...f,
            [source]: cols.filter((c) => Number(counts[0]?.[c]) > 0),
          }));
      }),
    ).catch((e) => {
      if (active) setError(String(e.message || e));
    });
    return () => {
      active = false;
    };
  }, [sources.join(","), version, schemaRevision]);
  useEffect(() => {
    seq.current++;
    setBusy(false);
    setDirty(true);
  }, [filters, transient, version]);
  const fieldOptions = sources.flatMap((source) =>
    (fields[source] || []).map((column) => ({ source, column })),
  );
  const patchSource = (source: string) =>
    update({
      source,
      rows: [],
      columns: [],
      measures: [],
      relationships: [],
      sharedSheets: [],
      filterField: "",
      filterValue: "",
    });
  const comparing = !!spec.sharedSheets?.length;
  // Side-by-side comparison matches sheets by column name, so hierarchy fields come from the base sheet.
  const dimOptions = comparing
    ? fieldOptions.filter((f) => f.source === spec.source)
    : fieldOptions;
  const select = (
    label: string,
    value: string,
    opts: { value: string; label: string }[],
    change: (v: string) => void,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const choices = (v: string[]) => v.map((value) => ({ value, label: value }));
  const fieldSelect = (
    label: string,
    value: LabField,
    change: (f: LabField) => void,
    options = fieldOptions,
  ) =>
    select(
      label,
      key(value),
      [
        { value: key(value), label: name(value) },
        ...options
          .filter((f) => key(f) !== key(value))
          .map((f) => ({ value: key(f), label: name(f) })),
      ],
      (v) => change(JSON.parse(v)),
    );
  async function run(override?: LabSpec) {
    const request = ++seq.current;
    setBusy(true);
    setError("");
    setNotice("");
    setProfiles([]);
    const current = structuredClone(override || spec);
    try {
      await Promise.all(included(current).map((s) => ensureSource(s)));
      for (const source of included(current))
        if (!health[source]?.fetchedAt)
          throw new Error(
            `${source} is unavailable. Retry this sheet before running.`,
          );
      const scopes = scopesFor(current);
      const checks = await validateLabRelationships(current, query, scopes);
      const result = await query(labSQL(current, scopes));
      if (request !== seq.current) return;
      if (result.length > current.limit)
        throw new Error(
          `Result exceeds ${current.limit.toLocaleString()} ${current.type === "Merged table" ? "merged rows" : "cells/groups"}. Narrow filters or raise the limit. Partial pivots are not displayed.`,
        );
      setRows(result);
      setResultSpec(current);
      setDirty(false);
      setProfiles(checks);
      setNotice(
        `${result.length.toLocaleString()} ${current.type === "Merged table" ? "merged rows" : "result groups"} · ${included(
          current,
        )
          .map((s) => sheets.find((t) => t.key === s)?.title || s)
          .join(
            " + ",
          )} · base sheet uses dashboard filters; merge scopes apply before aggregation`,
      );
    } catch (e) {
      if (request === seq.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request === seq.current) setBusy(false);
    }
  }
  function save() {
    try {
      const next = [
        ...saved.filter((s) => s.id !== spec.id),
        structuredClone(spec),
      ];
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setNotice(
        "Analysis saved in this browser. Use Export collection for a portable backup.",
      );
    } catch {
      setError(
        "Browser storage is full or unavailable. Export the collection to preserve your work.",
      );
    }
  }
  function download(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const dimensions = (kind: "rows" | "columns", label: string) => (
    <fieldset>
      <legend>{label}</legend>
      {spec[kind].map((f, i) => (
        <div className="lab-line" key={i}>
          {fieldSelect(
            `${spec.type === "Merged table" ? "Column" : "Level"} ${i + 1}`,
            f,
            (next) =>
              update({
                [kind]: spec[kind].map((v, j) => (j === i ? next : v)),
              }),
            dimOptions,
          )}
          <button
            aria-label={`Move ${label} level ${i + 1} up`}
            disabled={!i}
            onClick={() => {
              const next = [...spec[kind]];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              update({ [kind]: next });
            }}
          >
            ↑
          </button>
          <button
            aria-label={`Remove ${label} level ${i + 1}`}
            onClick={() =>
              update({ [kind]: spec[kind].filter((_, j) => i !== j) })
            }
          >
            ×
          </button>
        </div>
      ))}
      <button
        disabled={
          !dimOptions.length ||
          spec[kind].length >= (spec.type === "Merged table" ? 40 : 6)
        }
        onClick={() => {
          const next = dimOptions.find(
            (f) =>
              ![...spec.rows, ...spec.columns].some(
                (v) => v.column === f.column,
              ),
          );
          if (next) update({ [kind]: [...spec[kind], next] });
        }}
      >
        <Plus size={13} />{" "}
        {spec.type === "Merged table" ? "Add column" : "Add level"}
      </button>
    </fieldset>
  );
  function renderResult() {
    const s = resultSpec;
    if (!s)
      return (
        <div className="lab-empty">
          <FlaskConical size={36} />
          <h3>Your next question starts here.</h3>
          <p>
            Choose a source, arrange dimensions and measures, then run your
            analysis.
          </p>
        </div>
      );
    if (dirty)
      return (
        <div key="stale" className="lab-empty">
          <h3>Ready to recalculate</h3>
          <p>
            The configuration or global filters changed. Run analysis to see
            current results.
          </p>
        </div>
      );
    return <LabResult spec={s} rows={rows} />;
  }
  return (
    <section className="data-lab">
      <div className="lab-toolbar">
        <span className="lab-eyebrow lab-heading">
          <FlaskConical size={16} /> Analytical workspace
        </span>
        <div>
          <button
            onClick={() => {
              update(newLabSpec());
              setResultSpec(null);
            }}
          >
            <Plus size={14} /> New analysis
          </button>
          <button
            onClick={() =>
              download(
                "data-lab-collection.json",
                JSON.stringify(saved, null, 2),
                "application/json",
              )
            }
          >
            <Download size={14} /> Export collection
          </button>
          <label className="lab-import">
            Import collection
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Import collection"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 2000000)
                    throw new Error("Collection must be smaller than 2 MB.");
                  const imported = parseLabCollection(await file.text());
                  const next = [
                    ...saved.filter(
                      (s) => !imported.some((v) => v.id === s.id),
                    ),
                    ...imported,
                  ];
                  if (next.length > 100)
                    throw new Error("Keep collections under 100 analyses.");
                  localStorage.setItem(storageKey, JSON.stringify(next));
                  setSaved(next);
                  setNotice(
                    `${imported.length} analyses imported. Open one and run it against current data.`,
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </label>
        </div>
      </div>
      <div className="lab-layout">
        <aside className="lab-builder">
          <label>
            Analysis title
            <input
              maxLength={200}
              value={spec.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <div className="lab-pair">
            {select("Visualization", spec.type, choices(labTypes), (type) =>
              update({ type }),
            )}
            {select(
              "Source sheet",
              spec.source,
              sheets.map((s) => ({ value: s.key, label: s.title })),
              patchSource,
            )}
          </div>
          <details className="lab-relationships" open>
            <summary>
              <Link2 size={14} /> Merge sheets ({spec.relationships.length})
            </summary>
            <p>
              Match a column in one sheet to a column in another, then select
              fields from either sheet in the same table. Add more merges to
              connect additional sheets. Use Merged table for detailed records,
              or Table / Pivot table for summaries.
            </p>
            {spec.relationships.map((r, i) => (
              <fieldset key={r.id}>
                <legend>Relationship {i + 1}</legend>
                {select(
                  "From sheet",
                  r.from,
                  choices([
                    spec.source,
                    ...spec.relationships.slice(0, i).map((v) => v.to),
                  ]),
                  (from) =>
                    update({
                      relationships: spec.relationships.map((v) =>
                        v.id === r.id ? { ...v, from } : v,
                      ),
                    }),
                )}
                {select(
                  "Source key",
                  r.fromKey,
                  choices(fields[r.from] || Object.keys(sqlTypes)),
                  (fromKey) =>
                    update({
                      relationships: spec.relationships.map((v) =>
                        v.id === r.id ? { ...v, fromKey } : v,
                      ),
                    }),
                )}
                {select(
                  "Target sheet",
                  r.to,
                  sheets
                    .filter((s) => s.key === r.to || !sources.includes(s.key))
                    .map((s) => ({ value: s.key, label: s.title })),
                  (to) =>
                    update({
                      relationships: spec.relationships.map((v) =>
                        v.id === r.id ? { ...v, to } : v,
                      ),
                    }),
                )}
                {select(
                  "Target key",
                  r.toKey,
                  choices(fields[r.to] || Object.keys(sqlTypes)),
                  (toKey) =>
                    update({
                      relationships: spec.relationships.map((v) =>
                        v.id === r.id ? { ...v, toKey } : v,
                      ),
                    }),
                )}
                {select(
                  "Join behaviour",
                  r.join,
                  [
                    { value: "LEFT", label: "Keep all source records" },
                    { value: "INNER", label: "Matching records only" },
                  ],
                  (join) =>
                    update({
                      relationships: spec.relationships.map((v) =>
                        v.id === r.id
                          ? { ...v, join: join as "LEFT" | "INNER" }
                          : v,
                      ),
                    }),
                )}
                {select(
                  "Target sheet filter scope",
                  r.scope || "global",
                  [
                    { value: "global", label: "Follow dashboard filters" },
                    {
                      value: "all_dates",
                      label: "All dates; other filters apply",
                    },
                    {
                      value: "unfiltered",
                      label: "All records (lookup sheet)",
                    },
                  ],
                  (scope) =>
                    update({
                      relationships: spec.relationships.map((v) =>
                        v.id === r.id
                          ? {
                              ...v,
                              scope: scope as
                                | "global"
                                | "all_dates"
                                | "unfiltered",
                            }
                          : v,
                      ),
                    }),
                )}
                {select(
                  "Duplicate matches",
                  r.duplicates || "require_unique",
                  [
                    {
                      value: "require_unique",
                      label: "Require unique key (expand in Merged table)",
                    },
                    {
                      value: "latest",
                      label: "Latest record per matching key",
                    },
                    {
                      value: "earliest",
                      label: "Earliest record per matching key",
                    },
                  ],
                  (duplicates) =>
                    update({
                      relationships: spec.relationships.map((v) =>
                        v.id === r.id
                          ? {
                              ...v,
                              duplicates: duplicates as
                                | "require_unique"
                                | "latest"
                                | "earliest",
                            }
                          : v,
                      ),
                    }),
                )}
                {r.duplicates && r.duplicates !== "require_unique" && (
                  <>
                    {select(
                      "Choose record using",
                      r.orderBy || "date",
                      choices(fields[r.to] || ["date"]),
                      (orderBy) =>
                        update({
                          relationships: spec.relationships.map((v) =>
                            v.id === r.id ? { ...v, orderBy } : v,
                          ),
                        }),
                    )}
                    <p>
                      One complete target record is kept per key after target
                      filters.{" "}
                      {r.duplicates === "latest" ? "Highest" : "Lowest"} value
                      wins; ties use source row order. Other target records are
                      excluded, without mixing values from different records.
                    </p>
                  </>
                )}
                <LabRelationshipPreview relationship={r} />
                <button
                  onClick={() =>
                    update({
                      relationships: spec.relationships.slice(0, i),
                      rows: [],
                      columns: [],
                      measures: [],
                      filterField: "",
                    })
                  }
                >
                  Remove this link and downstream links
                </button>
              </fieldset>
            ))}
            <button
              disabled={sources.length === sheets.length || comparing}
              onClick={() => {
                const to = (
                  sheets.find(
                    (s) => s.key === "new" && !sources.includes(s.key),
                  ) || sheets.find((s) => !sources.includes(s.key))
                )?.key;
                if (to)
                  update({
                    relationships: [
                      ...spec.relationships,
                      {
                        id: crypto.randomUUID(),
                        from: spec.source,
                        fromKey: "member_id",
                        to,
                        toKey: "member_id",
                        join: "LEFT",
                      },
                    ],
                  });
              }}
            >
              <Plus size={13} /> Merge another sheet
            </button>
          </details>
          {spec.type !== "Merged table" && (
            <details className="lab-relationships" open={comparing}>
              <summary>
                <Link2 size={14} /> Compare sheets side by side (
                {spec.sharedSheets?.length || 0})
              </summary>
              <p>
                Show measures from other sheets next to each other, matched by
                the row and column fields above (for example location or
                month). Each sheet is summed or counted separately, so totals
                are never inflated. Not combinable with row-level merges.
              </p>
              {(spec.sharedSheets || []).map((src) => (
                <div className="lab-line" key={src}>
                  <span>{sheets.find((t) => t.key === src)?.title || src}</span>
                  <button
                    onClick={() =>
                      update({
                        sharedSheets: (spec.sharedSheets || []).filter(
                          (x) => x !== src,
                        ),
                        measures: spec.measures.filter((m) => m.source !== src),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                disabled={
                  !!spec.relationships.length || sources.length === sheets.length
                }
                onClick={() => {
                  const to = (
                    sheets.find(
                      (s) => s.key === "new" && !sources.includes(s.key),
                    ) || sheets.find((s) => !sources.includes(s.key))
                  )?.key;
                  if (to)
                    update({
                      sharedSheets: [...(spec.sharedSheets || []), to],
                    });
                }}
              >
                <Plus size={13} /> Add sheet to compare
              </button>
            </details>
          )}
          {spec.type !== "Metric cards" &&
            dimensions(
              "rows",
              spec.type === "Merged table" ? "Table columns" : "Row hierarchy",
            )}
          {spec.type === "Pivot table" &&
            dimensions("columns", "Column hierarchy")}
          {spec.type !== "Merged table" && (
            <fieldset>
              <legend>Measures</legend>
              {spec.measures.map((m, i) => (
                <div className="lab-measure" key={m.id}>
                  {fieldSelect("Field", m, (f) =>
                    update({
                      measures: spec.measures.map((v, j) =>
                        j === i ? { ...v, ...f } : v,
                      ),
                    }),
                  )}
                  <div className="lab-pair">
                    {select(
                      "Calculation",
                      m.aggregate,
                      choices(labAggregates),
                      (aggregate) =>
                        update({
                          measures: spec.measures.map((v, j) =>
                            j === i ? { ...v, aggregate } : v,
                          ),
                        }),
                    )}
                    <label>
                      Display name
                      <input
                        value={m.label}
                        onChange={(e) =>
                          update({
                            measures: spec.measures.map((v, j) =>
                              j === i ? { ...v, label: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="lab-pair">
                    {select(
                      "Only count rows where",
                      m.where?.column || "",
                      [
                        { value: "", label: "All rows" },
                        ...(fields[m.source] || []).map((c) => ({
                          value: c,
                          label: c,
                        })),
                      ],
                      (column) =>
                        update({
                          measures: spec.measures.map((v, j) =>
                            j === i
                              ? {
                                  ...v,
                                  where: column
                                    ? {
                                        column,
                                        op: v.where?.op || "=",
                                        values: v.where?.values || [""],
                                      }
                                    : undefined,
                                }
                              : v,
                          ),
                        }),
                    )}
                    {m.where && (
                      <>
                        {select(
                          "Condition",
                          m.where.op,
                          [
                            { value: "=", label: "equals" },
                            { value: "!=", label: "does not equal" },
                            { value: "in", label: "is one of (comma list)" },
                          ],
                          (op) =>
                            update({
                              measures: spec.measures.map((v, j) =>
                                j === i && v.where
                                  ? {
                                      ...v,
                                      where: {
                                        ...v.where,
                                        op: op as "=" | "!=" | "in",
                                      },
                                    }
                                  : v,
                              ),
                            }),
                        )}
                        <label>
                          Value
                          <input
                            value={m.where.values.join(",")}
                            onChange={(e) =>
                              update({
                                measures: spec.measures.map((v, j) =>
                                  j === i && v.where
                                    ? {
                                        ...v,
                                        where: {
                                          ...v.where,
                                          values:
                                            v.where.op === "in"
                                              ? e.target.value.split(",")
                                              : [e.target.value],
                                        },
                                      }
                                    : v,
                                ),
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      update({
                        measures: spec.measures.filter((_, j) => i !== j),
                      })
                    }
                  >
                    Remove measure
                  </button>
                </div>
              ))}
              <button
                disabled={!fieldOptions.length}
                onClick={() => {
                  const f =
                    fieldOptions.find((f) =>
                      /DOUBLE|INT/.test(
                        sqlTypes[f.column as keyof typeof sqlTypes],
                      ),
                    ) || fieldOptions[0];
                  update({
                    measures: [
                      ...spec.measures,
                      {
                        ...f,
                        id: crypto.randomUUID(),
                        aggregate: "COUNT",
                        label: "Record count",
                      },
                    ],
                  });
                }}
              >
                <Plus size={13} /> Add measure
              </button>
            </fieldset>
          )}
          <details>
            <summary>Filtering & presentation</summary>
            <p>
              Dashboard filters apply before joins, using the app’s
              source-specific rules. Each merge can use the target sheet in the
              same scope, across all dates, or as an unfiltered lookup. Use all
              dates when looking up members whose first visit predates the
              reporting period.
            </p>
            {select(
              "Additional field filter",
              spec.filterField,
              [
                { value: "", label: "No additional filter" },
                ...fieldOptions.map((f) => ({ value: key(f), label: name(f) })),
              ],
              (filterField) => update({ filterField }),
            )}
            {spec.filterField && (
              <label>
                Equals
                <input
                  value={spec.filterValue}
                  onChange={(e) => update({ filterValue: e.target.value })}
                />
              </label>
            )}
            <div className="lab-pair">
              {select(
                "Sort dimensions",
                spec.sort,
                choices(["ASC", "DESC"]),
                (sort) => update({ sort: sort as "ASC" | "DESC" }),
              )}
              {!["Pivot table", "Merged table"].includes(spec.type) &&
                select(
                  "Sort by",
                  spec.sortBy || "Dimensions",
                  choices(["Dimensions", "Measure"]),
                  (sortBy) => update({ sortBy }),
                )}
              {select(
                "Number format",
                spec.format,
                choices(["Number", "Currency", "Percent"]),
                (format) => update({ format }),
              )}
              <label>
                Decimal places
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={spec.decimals}
                  onChange={(e) =>
                    update({
                      decimals: Math.max(
                        0,
                        Math.min(8, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <label>
                Result group limit
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={spec.limit}
                  onChange={(e) =>
                    update({
                      limit: Math.max(
                        1,
                        Math.min(10000, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <label>
                Accent color
                <input
                  type="color"
                  value={spec.color}
                  onChange={(e) => update({ color: e.target.value })}
                />
              </label>
              {select(
                "Density",
                spec.density,
                choices(["Comfortable", "Compact"]),
                (density) => update({ density }),
              )}
            </div>
            {spec.type === "Pivot table" &&
              select(
                "Show pivot values as",
                spec.valueMode || "Value",
                choices([
                  "Value",
                  "% of row total",
                  "% of column total",
                  "% of grand total",
                ]),
                (valueMode) => update({ valueMode }),
              )}
            <label className="lab-check">
              <input
                type="checkbox"
                checked={spec.totals}
                onChange={(e) => update({ totals: e.target.checked })}
              />{" "}
              Show grand totals and column subtotals
            </label>
            <label className="lab-check">
              <input
                type="checkbox"
                checked={spec.heat}
                onChange={(e) => update({ heat: e.target.checked })}
              />{" "}
              Pivot cell heat shading
            </label>
            <p>
              Percent format expects fractional values (0.25 → 25%). Missing
              values display as —. Pivot totals are recalculated from source
              records, including averages and distinct counts.
            </p>
          </details>
          <div className="lab-actions">
            <button
              className="lab-run"
              onClick={() => void run()}
              disabled={
                busy ||
                (spec.type === "Merged table"
                  ? !spec.rows.length
                  : !spec.measures.length) ||
                !sources.every((s) => fields[s]?.length)
              }
            >
              <Play size={14} />
              {busy ? "Validating & calculating…" : "Run analysis"}
            </button>
            <button onClick={save} disabled={busy || dirty || !resultSpec}>
              <Save size={14} /> Save
            </button>
          </div>
        </aside>
        <div className="lab-workspace">
          <div
            className="lab-result"
            aria-busy={busy}
            style={{ "--lab-accent": spec.color } as React.CSSProperties}
          >
            <div className="lab-result-heading">
              <div>
                <span className="lab-eyebrow">
                  {spec.type} / {sources.length} SHEET
                  {sources.length > 1 ? "S" : ""}
                </span>
                <h2>{spec.title || "Untitled analysis"}</h2>
              </div>
              {resultSpec && !dirty && (
                <button
                  onClick={() => {
                    const s = resultSpec;
                    const dimensions =
                      s.type === "Metric cards"
                        ? []
                        : [
                            ...s.rows,
                            ...(s.type === "Pivot table" ? s.columns : []),
                          ];
                    const data = rows.map((r) =>
                      Object.fromEntries(
                        Object.entries(r).map(([column, value]) => {
                          if (column.startsWith("d"))
                            return [
                              name(dimensions[Number(column.slice(1))]),
                              value,
                            ];
                          if (column.startsWith("m")) {
                            const i = Number(column.slice(1));
                            return [`${s.measures[i].label} (${i + 1})`, value];
                          }
                          const length =
                            column === "gr" ? s.rows.length : s.columns.length;
                          return [
                            column === "gr"
                              ? "Row hierarchy depth"
                              : "Column hierarchy depth",
                            length -
                              Number(value).toString(2).replaceAll("0", "")
                                .length,
                          ];
                        }),
                      ),
                    );
                    exportCSV(
                      "data-lab-results",
                      data,
                      `${s.title} / raw aggregates before display formatting / ${included(s).join(" + ")}`,
                    );
                  }}
                >
                  <Download size={14} /> CSV
                </button>
              )}
            </div>
            {error && (
              <div className="lab-error" role="alert">
                <p>{error}</p>
                {spec.relationships
                  .filter((r) =>
                    error.includes(
                      `${r.to}.${r.toKey} contains duplicate keys`,
                    ),
                  )
                  .map((r) => (
                    <div className="lab-error-actions" key={r.id}>
                      <button
                        onClick={() => {
                          const next = {
                            ...spec,
                            relationships: spec.relationships.map((v) =>
                              v.id === r.id
                                ? {
                                    ...v,
                                    duplicates: "latest" as const,
                                    orderBy: "date",
                                  }
                                : v,
                            ),
                          };
                          update(next);
                          void run(next);
                        }}
                      >
                        Use latest target record per key and rerun
                      </button>
                      <button
                        onClick={() => {
                          const next = { ...spec, type: "Merged table" };
                          update(next);
                          void run(next);
                        }}
                      >
                        Show all matching records
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <p className="lab-status" role="status">
              {notice}
            </p>
            {profiles.map((p) => (
              <p className="lab-status" key={p}>
                <Link2 size={12} /> {p}
              </p>
            ))}
            <div
              className={resultSpec?.density === "Compact" ? "lab-compact" : ""}
            >
              {renderResult()}
            </div>
            <details>
              <summary>Source coverage & freshness</summary>
              {sources.map((source) => (
                <div className="lab-source" key={source}>
                  <div>
                    <strong>
                      {sheets.find((s) => s.key === source)?.title}
                    </strong>
                    <p>
                      {health[source]?.fetchedAt
                        ? `${health[source].recordsCount.toLocaleString()} source rows · ${fields[source]?.length || 0} populated normalized fields · retrieved ${new Date(health[source].fetchedAt!).toLocaleString("en-IN")}${health[source].stale || health[source].refreshError ? " · saved snapshot; refresh unavailable" : ""}`
                        : "Source unavailable or connecting"}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setError("");
                      try {
                        await ensureSource(source, true);
                        setSchemaRevision((v) => v + 1);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Retry / refresh
                  </button>
                </div>
              ))}
              <p>
                Source row counts precede dashboard filters and aggregation. The
                field picker shows populated normalized columns. Join match
                counts describe key coverage across the loaded sheets; confirm
                the business meaning of every relationship.
              </p>
            </details>
            <details>
              <summary>Inspect generated query</summary>
              <pre>
                {(() => {
                  try {
                    return labSQL(spec, scopesFor(spec));
                  } catch (e) {
                    return String((e as Error).message);
                  }
                })()}
              </pre>
            </details>
          </div>
          <SavedElements page={16} version={version} />
          <section className="lab-library">
            <div className="lab-result-heading">
              <div>
                <span className="lab-eyebrow">SAVED IN THIS BROWSER</span>
                <h3>
                  Your collection <span>({saved.length})</span>
                </h3>
              </div>
              <Database size={20} />
            </div>
            {!saved.length && (
              <p>
                Save a validated analysis to reuse its relationships, hierarchy,
                measures and styling. Saved views run against current source
                data and global filters when opened.
              </p>
            )}
            <div className="lab-saved-grid">
              {saved.map((s) => (
                <article key={s.id}>
                  <span className="lab-eyebrow">{s.type}</span>
                  <h4>{s.title}</h4>
                  <p>
                    {s.source} ·{" "}
                    {s.type === "Merged table"
                      ? `${s.rows.length} columns`
                      : `${s.measures.length} measures`}{" "}
                    · {s.rows.length} row levels
                  </p>
                  <div>
                    <button
                      onClick={() => {
                        update(structuredClone(s));
                        setResultSpec(null);
                        setNotice(
                          "Saved configuration opened. Run analysis with the current global filters.",
                        );
                      }}
                    >
                      Open
                    </button>
                    <button
                      aria-label={`Duplicate ${s.title}`}
                      onClick={() => {
                        update({
                          ...structuredClone(s),
                          id: crypto.randomUUID(),
                          title: s.title + " (copy)",
                        });
                        setResultSpec(null);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      aria-label={`Delete ${s.title}`}
                      onClick={() => {
                        try {
                          const next = saved.filter((v) => v.id !== s.id);
                          localStorage.setItem(
                            storageKey,
                            JSON.stringify(next),
                          );
                          setSaved(next);
                        } catch {
                          setError("Unable to update browser storage.");
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
