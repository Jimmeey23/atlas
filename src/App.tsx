import { motion } from "framer-motion";
import { AtlasSettings } from "./components/AtlasSettings";
import { QuickFilters } from "./components/QuickFilters";
import { FloatingAgent } from "./components/FloatingAgent";
import {
  usePreferences,
  hydratePreferences,
  themeOptions,
  sections,
} from "./state/preferences";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sun,
  Moon,
  Command,
  Download,
  RefreshCw,
  Bookmark,
  Settings2,
  ArrowUpRight,
  CalendarDays,
  Activity,
  ChevronDown,
  X,
  Check,
  TriangleAlert,
  Columns3,
} from "lucide-react";
import {
  useStore,
  tabs,
  navigationOrder,
  emptyFilters,
  savedPresets,
} from "./state/store";

import { health, query, type Row } from "./data/duckdb";
import {
  ensureWorkspace,
  ensureSource,
  sourceStates,
  subscribeSources,
  dependencies,
  usable,
} from "./data/loader";
import { SourceStatus } from "./components/SourceStatus";
import { RetentionWorklists } from "./components/RetentionWorklists";
import {
  analyse,
  clearAnalyses,
  options as getOptions,
  availableRows,
  today,
  type Analysis,
} from "./data/analytics";
import { blueprints } from "./data/blueprints";
import { MetricCard } from "./components/MetricCard";
import { Filters } from "./components/Filters";
import { Register } from "./components/Register";
import { NestedTable, type TreeRow } from "./components/NestedTable";
import { Chart, Pulse } from "./components/Charts";
import { Rankings } from "./components/Rankings";
import { Heatmap } from "./components/Heatmap";
import { MoMTable } from "./components/MoMTable";
import {
  IntelligenceWorkspace,
  SavedElements,
  CloudSettings,
} from "./components/IntelligenceWorkspace";
import { RenewalCohorts } from "./components/RenewalCohorts";
import { SignalRail } from "./components/SignalRail";
import { DrillPanel } from "./components/DrillPanel";
import { DataHealth } from "./components/DataHealth";
import { Secondary } from "./components/Secondary";
import { exportCSV } from "./components/exports";
import { insights as runInsights } from "./insights/engine";
import type { Insight } from "./insights/rules";
import { defaults, thresholds, type Thresholds } from "./insights/thresholds";
import { fmt } from "./semantics/formats";
import { metrics } from "./semantics/metrics";
import "./design/app.css";
import "./styles.css";
import { sourceRows } from "./data/raw";
const blank: Analysis = {
  total: {},
  previous: {},
  trend: [],
  groups: [],
  heat: [],
  raw: [],
  count: 0,
  elapsed: 0,
};

export default function App() {
  const s = useStore();
  const { preferences: prefs, page: updatePage } = usePreferences();
  const pagePrefs = prefs.page[s.tab] || {};
  const bp = blueprints[s.tab];
  const workspaceVersion = dependencies(s.tab)
    .map((k) => health[k]?.fetchedAt || "unavailable")
    .join(",");
  const ready =
    s.tab === 11
      ? dependencies(11).every(
          (k) => usable(k) || sourceStates[k].state === "error",
        )
      : dependencies(s.tab).every(usable);
  const progress = "Preparing this workspace’s sources";
  const loaded = Object.values(health).filter((h) => h.fetchedAt).length;
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis>(blank);
  const [busy, setBusy] = useState(true);
  const [choices, setChoices] = useState<
    Record<string, Record<string, number>>
  >({});
  const [groups, setGroups] = useState(pagePrefs.groups || bp.groups);
  const [columns, setColumns] = useState(pagePrefs.columns || bp.columns);
  const [configuredTab, setConfiguredTab] = useState(s.tab);
  const [signals, setSignals] = useState<Insight[]>([]);
  const [drill, setDrill] = useState<TreeRow | null>(null);
  const [modal, setModal] = useState("");
  const [command, setCommand] = useState("");
  const [toast, setToast] = useState("");
  const [version, setVersion] = useState(0);
  const [thresholdValues, setThresholdValues] =
    useState<Thresholds>(thresholds());
  const main = useRef<HTMLElement>(null);
  const lastTab = useRef(s.tab);
  const sequence = useRef(0);
  const notify = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(""), 3000);
  };
  const load = useCallback(async (force = false) => {
    try {
      await ensureWorkspace(useStore.getState().tab, force);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }, []);
  useEffect(() => subscribeSources(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    const loaded = () => {
      hydratePreferences();
      setThresholdValues(thresholds());
      setVersion((v) => v + 1);
    };
    window.addEventListener("p57-settings-hydrated", loaded);
    return () => window.removeEventListener("p57-settings-hydrated", loaded);
  }, []);
  useEffect(() => {
    void load();
  }, [s.tab, load]);
  useEffect(() => {
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    const timer = setTimeout(
      () =>
        getOptions()
          .then((options) => {
            if (current) setChoices(options);
          })
          .catch(() => {}),
      500,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [ready, version]);
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.dataset.density = s.density;

  }, []);
  useEffect(() => {
    if (lastTab.current !== s.tab) {
      lastTab.current = s.tab;
      setGroups(pagePrefs.groups || bp.groups);
      setColumns(pagePrefs.columns || bp.columns);
      setConfiguredTab(s.tab);
      setAnalysis(blank);
      setDrill(null);
      main.current?.scrollTo({ top: 0 });
    }
  }, [s.tab, bp]);
  useEffect(() => {
    if (pagePrefs.columns) setColumns(pagePrefs.columns);
    if (pagePrefs.groups) setGroups(pagePrefs.groups);
  }, [pagePrefs.columns, pagePrefs.groups]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--atlas-font-size", prefs.fontSize + "px");
    root.style.setProperty("--atlas-radius", prefs.radius + "px");
    root.style.setProperty("--atlas-chart-height", prefs.chartHeight + "px");
    root.dataset.animation = prefs.animation ? "on" : "off";
    for (const section of sections)
      root.dataset["hide" + section[0].toUpperCase() + section.slice(1)] =
        String(pagePrefs.sections?.[section] === false);
  }, [prefs, pagePrefs]);
  useEffect(() => {
    if (configuredTab !== s.tab) return;
    if (!ready || s.tab === 11 || s.tab === 13) {
      setBusy(
        !ready &&
          !dependencies(s.tab).some((k) => sourceStates[k].state === "error"),
      );
      return;
    }
    const id = ++sequence.current;
    setBusy(true);
    const timer = setTimeout(
      () => {
        analyse(s.tab, groups, columns)
          .then((a) => {
            if (id === sequence.current) {
              setAnalysis(a);
              setBusy(false);
              setError("");
              sessionStorage.setItem("floor-pulse-seen", "true");
            }
          })
          .catch((e) => {
            if (id === sequence.current) {
              setError(String(e));
              setBusy(false);
            }
          });
      },
      s.tab === lastTab.current ? 0 : 180,
    );
    return () => clearTimeout(timer);
  }, [
    configuredTab,
    ready,
    s.tab,
    groups,
    columns,
    s.filters,
    s.transient,
    s.compare,
    s.rate,
    workspaceVersion,
  ]);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    const timer = setTimeout(() => {
      runInsights()
        .then((x) => {
          if (current) setSignals(x);
        })
        .catch(() => {});
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [ready, s.filters, s.rate, version]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("command");
        return;
      }
      if (e.key === "Escape") {
        setModal("");
        setDrill(null);
        return;
      }
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      const key = e.key.toLowerCase();
      if (/^[1-9]$/.test(key)) s.set({ tab: navigationOrder[Number(key) - 1] });
      if (key === "0") s.set({ tab: navigationOrder[9] });
      if (key === "f") s.set({ filterOpen: !s.filterOpen });
      if (key === "s") s.set({ signalOpen: !s.signalOpen });
      if (key === "t")
        s.set({ theme: s.theme === "matte" ? "gloss" : "matte" });
      if (key === "d")
        s.set({
          density:
            s.density === "compact"
              ? "dense"
              : s.density === "dense"
                ? "comfortable"
                : "compact",
        });
      if (key === "c")
        s.set({ compare: s.compare === "none" ? "prior" : "none" });
      if (key === "/") {
        e.preventDefault();
        setModal("command");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [s]);
  const onDrill = useCallback((r: TreeRow) => setDrill(r), []);
  const closeDrill = useCallback(() => setDrill(null), []);
  const dismiss = (i: Insight) => {
    const d = JSON.parse(localStorage.getItem("floor-dismissals") || "{}");
    d[i.rule + i.entity] = Date.now();
    localStorage.setItem("floor-dismissals", JSON.stringify(d));
    window.dispatchEvent(new Event("p57-preferences"));
    setSignals(signals.filter((x) => x !== i));
  };
  const recordGroups = analysis.groups.filter(
    (g) => Number(g.level) === 2 ** (groups.length - 1) - 1,
  );
  const sourceProblem = health[bp.source]?.status === "error";
  const domainStyle = {
    "--accent": pagePrefs.accent || `var(--${bp.domain})`,
  } as React.CSSProperties;
  const commands = [
    ...tabs.map((name, i) => ({
      name,
      kind: "Workspace",
      run: () => s.set({ tab: i }),
    })),
    ...Object.values(metrics).map((m) => ({
      name: m.label,
      kind: "Metric",
      run: () => {
        const tab = blueprints.findIndex((b) => b.kpis.includes(m.id));
        if (tab >= 0) s.set({ tab });
        setToast(m.description);
      },
    })),
    ...Object.keys(choices.trainer || {}).map((name) => ({
      name,
      kind: "Instructor",
      run: () =>
        s.set({ tab: 3, transient: [{ field: "trainer", value: name }] }),
    })),
  ]
    .filter((c) => c.name.toLowerCase().includes(command.toLowerCase()))
    .slice(0, 12);
  return (
    <div
      className="app"
      style={{
        ...domainStyle,
        ...(prefs.contentWidth
          ? { maxWidth: prefs.contentWidth, margin: "0 auto" }
          : {}),
      }}
    >
      <a className="skip" href="#main">
        Skip to performance data
      </a>
      <header className="titlebar">
        <div className="brand">
          <a
            href="?tab=0"
            className="floor-logo"
            aria-label="Atlas overview"
            style={{ color: "var(--text-1)" }}
          >
            <span className="logo-mark">
              <i />
              <i />
              <i />
            </span>
            Atlas<span style={{ color: "var(--attendance)" }}>.</span>
          </a>
          <span className="brand-divider" />
          <div className="brand-copy">
            Physique 57 India<span>Studio intelligence</span>
          </div>
        </div>
        <div className="toolbar">
          <select
            aria-label="Theme"
            className="theme-select"
            value={s.theme}
            onChange={(e) => s.set({ theme: e.target.value })}
          >
            {themeOptions.map((theme) => (
              <option value={theme.id} key={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>

          <span className="small hide-small" style={{ marginRight: 10 }}>
            Kemps Corner / Kenkere / Plash
          </span>
          <button
            className="button hide-small"
            onClick={() => setModal("views")}
          >
            <Bookmark size={12} />
            Saved views
            <ChevronDown size={10} />
          </button>
          <select
            aria-label="Display density"
            value={s.density}
            onChange={(e) => s.set({ density: e.target.value })}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="dense">Dense</option>
          </select>
          <button
            className="icon-button"
            aria-label={`Switch to ${s.theme === "matte" ? "gloss" : "matte"} theme`}
            title="Toggle theme (T)"
            onClick={() =>
              s.set({ theme: s.theme === "matte" ? "gloss" : "matte" })
            }
          >
            {s.theme === "matte" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="button hide-mobile"
            title="Command palette (⌘K)"
            onClick={() => setModal("command")}
          >
            <Command size={12} />
            <span style={{ color: "var(--text-3)" }}>K</span>
          </button>
          <span className="toolbar-divider" />
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Refresh source data"
            onClick={() => void load(true)}
            disabled={dependencies(s.tab).some((k) =>
              ["loading", "refreshing"].includes(sourceStates[k].state),
            )}
          >
            <RefreshCw size={14} />
          </button>
          <button className="button" onClick={() => setModal("export")}>
            <Download size={12} />
            Export
          </button>
        </div>
      </header>
      <CloudSettings />
      <QuickFilters />
      <Filters options={choices} />
      <nav className="tabbar" aria-label="Performance workspaces">
        {navigationOrder
          .filter((i) => !prefs.page[i]?.hidden)
          .map((i) => {
            const name = prefs.page[i]?.name || tabs[i];
            return (
              <button
                key={name}
                className={`tab ${i === s.tab ? "active" : ""}`}
                style={
                  {
                    "--accent":
                      prefs.page[i]?.accent || `var(--${blueprints[i].domain})`,
                  } as React.CSSProperties
                }
                onClick={() => s.set({ tab: i })}
                aria-current={i === s.tab ? "page" : undefined}
              >
                {name}
                {i === 11 &&
                  Object.values(health).some((h) => h.status !== "ok") && (
                    <span className="tab-number">
                      {
                        Object.values(health).filter((h) => h.status !== "ok")
                          .length
                      }
                    </span>
                  )}
                {i === s.tab && (
                  <motion.span
                    layoutId="atlas-active-tab"
                    className="barre"
                    transition={
                      prefs.animation
                        ? { type: "spring", stiffness: 460, damping: 38 }
                        : { duration: 0 }
                    }
                  />
                )}
              </button>
            );
          })}
      </nav>
      <div className="workspace">
        {busy && <div className="loader-bar" />}
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className={`canvas ${busy && ready ? "loading" : ""}`}
          aria-busy={busy}
        >
          <div className="print-context">
            <h2>Atlas / {tabs[s.tab]}</h2>
            <p>
              Filters: {JSON.stringify(s.filters)} / Cross-filters:{" "}
              {JSON.stringify(s.transient)} / Estimated instructor rate: ₹
              {s.rate}
            </p>
          </div>
          <div className="page-intro">
            <div>
              <h1 key={s.tab}>{pagePrefs.heading || bp.title}</h1>
              <p>{pagePrefs.subtitle ?? bp.subtitle}</p>
            </div>
            <div className="intro-meta">
              <span className="pill good">
                <span className="dot" />
                {ready
                  ? dependencies(s.tab).some(
                      (k) => sourceStates[k].state === "error",
                    )
                    ? "Saved data · refresh failed"
                    : dependencies(s.tab).some(
                          (k) => sourceStates[k].state === "refreshing",
                        )
                      ? "Saved data · updating"
                      : "Source data ready"
                  : "Connecting sources"}
              </span>
              <span className="period icon">
                <CalendarDays size={12} />
                {s.filters.from
                  ? new Date(s.filters.from + "T00:00:00").toLocaleDateString(
                      "en-IN",
                      { month: "long", year: "numeric" },
                    )
                  : "All available history"}
                <span className="small">
                  /{" "}
                  {s.compare === "none"
                    ? "No comparison"
                    : s.compare === "year"
                      ? "vs last year"
                      : "vs prior period"}
                </span>
              </span>
            </div>
          </div>
          <SourceStatus
            tab={s.tab}
            version={version}
            onRetry={(key) => void ensureSource(key, true)}
          />
          {!ready && !error && (
            <div className="notice">
              <Activity size={14} />
              {progress}. Other workspaces load their sources when opened.
            </div>
          )}
          {error && (
            <div className="notice">
              <TriangleAlert size={14} />
              {error}
              <button className="button" onClick={() => void load(true)}>
                Retry
              </button>
            </div>
          )}
          {sourceProblem && (
            <div className="notice">
              <TriangleAlert size={14} />
              {health[bp.source].error}
              <button onClick={() => s.set({ tab: 11 })}>
                Inspect Data health
              </button>
            </div>
          )}
          {s.tab === 9 &&
            health.checkins?.defects.some(
              (d) => d.field === "Duration (Minutes)",
            ) && (
              <div className="notice">
                <TriangleAlert size={13} />
                Recorded duration is corrupted. Hours and revenue per hour are
                unavailable. Attendance and revenue remain source-derived.
              </div>
            )}
          {s.tab === 10 && (
            <div className="rate-card">
              <span>
                <strong>Instructor rate assumption</strong>
                <span className="small" style={{ display: "block" }}>
                  Estimated cost, not actual payroll paid
                </span>
              </span>
              <input
                aria-label="Instructor rate per session"
                type="range"
                min={500}
                max={5000}
                step={50}
                value={s.rate}
                onChange={(e) => s.set({ rate: +e.target.value })}
              />
              <span className="rate-value number">
                {fmt("revenue", s.rate)}
              </span>
              <span className="small">/ session</span>
            </div>
          )}
          {analysis.groups.length >= 50000 && (
            <div className="notice">
              <TriangleAlert size={13} />
              This hierarchy exceeds 50,000 groups. Top-level totals remain
              complete; narrow the period or location to inspect every leaf.
            </div>
          )}
          {s.tab === 13 ? (
            <IntelligenceWorkspace />
          ) : s.tab === 11 ? (
            ready ? (
              <DataHealth version={version} onRefresh={() => void load(true)} />
            ) : (
              <div className="empty-state">
                <h3>Validating your sources</h3>
                <p>
                  The diagnostic register will appear when ingestion finishes.
                </p>
              </div>
            )
          ) : !ready ? (
            <div className="empty-state">
              <h3>Loading workspace data</h3>
              <p>
                Saved source snapshots will appear first. Live refresh continues
                in the background.
              </p>
            </div>
          ) : (
            <>
              {s.tab === 6 && (
                <>
                  <RenewalCohorts version={version} />
                  <RetentionWorklists version={version} />
                </>
              )}
              <SavedElements page={s.tab} version={version} />
              {s.tab === 0 && <Pulse data={analysis} />}
              <div
                className={`metric-strip ${bp.kpis.length > 6 ? "eight" : ""}`}
              >
                {bp.kpis.map((id) => (
                  <MetricCard
                    key={id}
                    id={id}
                    value={analysis.count ? analysis.total[id] : null}
                    previous={
                      s.compare === "none" ? null : analysis.previous[id]
                    }
                    trend={analysis.trend}
                    n={analysis.count}
                    compare={s.compare !== "none"}
                    warning={
                      id === "net_revenue" &&
                      health.sales?.defects.some(
                        (d) => d.field === "Price Excluding VAT In Currency",
                      )
                        ? "Source net-of-VAT exceeds gross on some sale lines. Inspect Data health before using net revenue."
                        : ["teaching_hours", "revenue_per_hour"].includes(id) &&
                            health.checkins?.defects.length
                          ? "Duration is corrupted. No estimated hours are substituted."
                          : sourceProblem
                            ? "Source could not load."
                            : undefined
                    }
                    onDrill={() => {
                      main.current
                        ?.querySelector("#main-register")
                        ?.scrollIntoView({ behavior: "smooth" });
                      if (recordGroups.length)
                        setDrill({
                          id: "all",
                          label: metrics[id].label + " in scope",
                          path: [],
                          values: analysis.total,
                          children: [],
                        });
                    }}
                  />
                ))}
              </div>
              {s.tab !== 0 && (
                <Register
                  index="02"
                  title={bp.chartTitle}
                  subtitle={
                    s.tab === 2
                      ? "Observed weekly fill, in the selected period"
                      : "Compare the shape, then inspect the detail"
                  }
                >
                  {s.tab === 2 ? (
                    <div className="chart-surface">
                      <Heatmap rows={analysis.heat} schedule />
                    </div>
                  ) : (
                    <Chart tab={s.tab} data={analysis} />
                  )}
                </Register>
              )}
              {s.tab === 0 && (
                <Register
                  index="02"
                  title="What changed the revenue"
                  subtitle="Exact attendance × realised-yield decomposition"
                >
                  <Chart tab={0} data={analysis} />
                </Register>
              )}
              <div id="main-register">
                <Register
                  index="03"
                  title={
                    s.tab === 2
                      ? "Schedule decision register"
                      : s.tab === 0
                        ? "Your studios, side by side"
                        : "The performance register"
                  }
                  subtitle="Expand from the business to the individual"
                >
                  <NestedTable
                    rows={analysis.groups}
                    groups={groups}
                    columns={columns}
                    total={analysis.total}
                    onGroups={(g) => {
                      setGroups(g);
                      updatePage(s.tab, { groups: g });
                    }}
                    onColumns={(c) => {
                      setColumns(c);
                      updatePage(s.tab, { columns: c });
                    }}
                    onDrill={onDrill}
                  />
                </Register>
              </div>
              <div className="two-up">
                <Rankings
                  rows={analysis.groups}
                  groups={groups}
                  columns={columns}
                  onDrill={(r) =>
                    onDrill({
                      id: String(r.g0),
                      label: String(r.g0),
                      path: [{ field: groups[0], value: String(r.g0) }],
                      values: r,
                      children: [],
                    })
                  }
                />
                <Register
                  index="04"
                  title={
                    s.tab === 0
                      ? "How the locations compare"
                      : s.tab === 3
                        ? "Instructor distribution"
                        : "The relationship behind the result"
                  }
                  subtitle="Explore the contributing pattern"
                >
                  <Chart tab={s.tab} data={analysis} secondary />
                </Register>
              </div>
              <Register
                index="05"
                title={
                  s.tab === 7
                    ? "When seats go unclaimed"
                    : s.tab === 5
                      ? "The best time for a first visit"
                      : "The weekly pattern"
                }
                subtitle="Day × time / Click a cell to scope the workspace"
              >
                <div className="chart-surface">
                  <Heatmap
                    rows={analysis.heat}
                    metric={
                      s.tab === 7
                        ? "booking_no_show_rate"
                        : s.tab === 5
                          ? "conversion_rate"
                          : s.tab === 4
                            ? "gross_revenue"
                            : "fill_rate"
                    }
                  />
                </div>
              </Register>
              <MoMTable rows={analysis.trend} ids={bp.columns.slice(0, 9)} />
              <Register
                index="07"
                title="Go one level deeper"
                subtitle="Focused operational registers"
              >
                {bp.secondary.map((title, index) =>
                  s.tab === 0 && index === 2 ? (
                    <details className="secondary" key={title}>
                      <summary>
                        Action register
                        <span className="small">
                          {signals.length} evidence-backed actions
                        </span>
                      </summary>
                      <div className="secondary-content">
                        {signals.slice(0, 7).map((i) => (
                          <article
                            className={`insight ${i.severity}`}
                            key={i.rule + i.entity}
                          >
                            <h3>{i.title}</h3>
                            <p>{i.template}</p>
                            <button
                              className="insight-action"
                              onClick={() =>
                                s.set({ tab: i.tab, transient: i.linkFilters })
                              }
                            >
                              Inspect evidence <ArrowUpRight size={11} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <Secondary
                      key={title}
                      tab={s.tab}
                      index={index}
                      title={title}
                    />
                  ),
                )}
              </Register>
              <p className="performance-note" style={{ marginTop: 24 }}>
                Query completed in {Math.round(analysis.elapsed)}ms.{" "}
                {analysis.count.toLocaleString("en-IN")} contributing rows.
                Amounts in INR. Opportunity values assume observed yield; they
                are not recoverable revenue forecasts.
              </p>
            </>
          )}
          <div className="print-insights">
            <h2>Operational insights</h2>
            {(s.tab === 0 ? signals : signals.filter((i) => i.tab === s.tab))
              .slice(0, 7)
              .map((i) => (
                <article key={i.rule + i.entity}>
                  <h3>{i.title}</h3>
                  <p>
                    {i.template} n = {i.n}.
                  </p>
                </article>
              ))}
          </div>
        </main>
        <SignalRail items={signals} onDismiss={dismiss} />
      </div>
      <footer className="statusbar">
        <span>
          {availableRows().toLocaleString("en-IN")} source rows / {loaded} / 10
          sources loaded on demand
        </span>
        <div className="status-sources">
          {Object.values(health).map((h) => (
            <button
              className={`status-source ${h.status}`}
              key={h.key}
              onClick={() => s.set({ tab: 11 })}
              title={h.error || `${h.title}: ${h.recordsCount} records`}
            >
              <span className="dot" />
              {h.title}
            </button>
          ))}
        </div>
        <span>
          Atlas / {themeOptions.find((t) => t.id === s.theme)?.name || s.theme}
        </span>
      </footer>
      <FloatingAgent />
      <DrillPanel entry={drill} tab={s.tab} onClose={closeDrill} />
      {modal && (
        <div
          className="modal-wrap"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <h2>
                {modal === "command"
                  ? "Find your next decision"
                  : modal === "settings"
                    ? "Atlas settings"
                    : modal === "views"
                      ? "Your working views"
                      : "Export this view"}
              </h2>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setModal("")}
              >
                <X size={16} />
              </button>
            </div>
            {modal === "command" && (
              <>
                <input
                  autoFocus
                  aria-label="Find a workspace, metric or instructor"
                  placeholder="Search workspaces, metrics, instructors…"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
                <div className="command-results">
                  {commands.map((c, i) => (
                    <button
                      key={c.kind + c.name + i}
                      onClick={() => {
                        c.run();
                        setModal("");
                        setCommand("");
                      }}
                    >
                      <span>{c.name}</span>
                      <span className="small">{c.kind}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === "settings" && (
              <>
                <AtlasSettings />
                <p className="muted">
                  Every cost-based figure uses the rate below. Adjust rule
                  thresholds to match your operating policy.
                </p>
                <div className="settings-row">
                  <label htmlFor="rate">
                    Instructor rate per Studio Session (INR)
                  </label>
                  <input
                    id="rate"
                    type="number"
                    min="0"
                    value={s.rate}
                    onChange={(e) =>
                      s.set({ rate: Math.max(0, +e.target.value) })
                    }
                  />
                </div>
                {Object.entries(thresholdValues).map(([k, v]) => (
                  <div className="settings-row" key={k}>
                    <label htmlFor={k}>
                      {k
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (s) => s.toUpperCase())}
                    </label>
                    <input
                      id={k}
                      type="number"
                      min="0"
                      step={v < 1 ? 0.01 : 1}
                      value={v}
                      onChange={(e) =>
                        setThresholdValues({
                          ...thresholdValues,
                          [k]: +e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
                <div className="settings-row">
                  <button
                    className="button"
                    onClick={() => setThresholdValues(defaults)}
                  >
                    Reset thresholds
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      localStorage.setItem(
                        "floor-thresholds",
                        JSON.stringify(thresholdValues),
                      );
                      window.dispatchEvent(new Event("p57-preferences"));
                      setVersion((v) => v + 1);
                      setModal("");
                      notify("Assumptions saved. Insights recalculated.");
                    }}
                  >
                    Save assumptions
                  </button>
                </div>
              </>
            )}
            {modal === "views" && (
              <>
                <div className="command-results">
                  {savedPresets.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => {
                        s.set({
                          tab: v.tab,
                          transient: [],
                          density: "compact",
                        });
                        setModal("");
                      }}
                    >
                      <span>{v.name}</span>
                      <span className="small">{tabs[v.tab]}</span>
                    </button>
                  ))}
                  {(
                    JSON.parse(localStorage.getItem("floor-views") || "[]") as {
                      name: string;
                      tab: number;
                      filters: typeof s.filters;
                      density: string;
                      compare: string;
                      groups: string[];
                      columns: string[];
                    }[]
                  ).map((v, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        s.set({
                          tab: v.tab,
                          filters: v.filters,
                          density: v.density,
                          compare: v.compare,
                          transient: [],
                        });
                        setGroups(v.groups);
                        setColumns(v.columns);
                        setModal("");
                      }}
                    >
                      <span>{v.name}</span>
                      <span className="small">Saved</span>
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Name this view"
                  placeholder="Name the current view…"
                  id="view-name"
                />
                <button
                  className="button primary"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    const name = (
                      document.getElementById("view-name") as HTMLInputElement
                    ).value.trim();
                    if (!name) return;
                    const views = JSON.parse(
                      localStorage.getItem("floor-views") || "[]",
                    );
                    views.push({
                      name,
                      tab: s.tab,
                      filters: s.filters,
                      density: s.density,
                      compare: s.compare,
                      groups,
                      columns,
                    });
                    localStorage.setItem("floor-views", JSON.stringify(views));
                    window.dispatchEvent(new Event("p57-preferences"));
                    setModal("");
                    notify("View saved in this browser.");
                  }}
                >
                  <Bookmark size={12} />
                  Save current view
                </button>
              </>
            )}
            {modal === "export" && (
              <>
                <p className="muted">
                  Exports carry the current tab, filters and assumptions. Chart
                  PNG exports are available on each chart.
                </p>
                <div className="command-results">
                  <button
                    onClick={() => {
                      exportCSV(
                        "p57-" + tabs[s.tab].toLowerCase(),
                        analysis.groups,
                      );
                      setModal("");
                    }}
                  >
                    <span className="icon">
                      <Download size={14} />
                      Performance register CSV
                    </span>
                    <span className="small">All hierarchy levels</span>
                  </button>
                  <button
                    onClick={() => {
                      sourceRows(bp.source, analysis.raw)
                        .then((rows) => exportCSV("p57-source-records", rows))
                        .catch((e) => notify(String(e)));
                      setModal("");
                    }}
                  >
                    <span>Contributing source rows CSV</span>
                    <span className="small">Latest 250 rows</span>
                  </button>
                  <button
                    onClick={() => {
                      setModal("");
                      setTimeout(() => window.print(), 100);
                    }}
                  >
                    <span>Print / save tab as PDF</span>
                    <span className="small">Browser print dialog</span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
