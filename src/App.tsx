import { StickyNotes } from "./components/StickyNotes";
import { workspaceIcons, useWorkspaceCopy } from "./data/workspaceCopy";
import { OverviewAttention } from "./components/OverviewAttention";
import { SessionRevenueChange } from "./components/SessionRevenueChange";
import { PresentationTools } from "./components/PresentationTools";
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
import { ReportBuilder } from "./components/report/ReportBuilder";
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
import { LeadStageScorecard } from "./components/LeadStageScorecard";
import { SalesScorecards } from "./components/SalesScorecards";
import { Filters } from "./components/Filters";
import { Register } from "./components/Register";
import { NestedTable, type TreeRow } from "./components/NestedTable";
import { Chart, Pulse } from "./components/Charts";
import { Rankings } from "./components/Rankings";
import { Heatmap } from "./components/Heatmap";
import { AcquisitionMainTables, AcquisitionDeepDive, AcquisitionTableView } from "./components/AcquisitionTables";
import { MoMTable } from "./components/MoMTable";
import { InstructorEconomics } from "./components/InstructorEconomics";
import { FormatComparison } from "./components/FormatComparison";
import { WebsiteLeadPeriods } from "./components/WebsiteLeadPeriods";
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
import { DataInsightAction } from "./components/DataInsightAction";
import { PinnedInsights } from "./components/PinnedInsights";
import { insights as runInsights } from "./insights/engine";
import type { Insight } from "./insights/rules";
import { defaults, thresholds, type Thresholds } from "./insights/thresholds";
import { fmt } from "./semantics/formats";
import { currentSnapshotMetrics } from "./semantics/evidence";
import { metrics } from "./semantics/metrics";
import "./design/app.css";
import "./styles.css";
import "./design/refinement.css";
import "./design/acquisition.css";
import "./design/report.css";
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
  const workspaceHeading = useWorkspaceCopy(s.tab, bp.subtitle);
  const workspaceVersion = dependencies(s.tab)
    .map((k) => health[k]?.fetchedAt || "unavailable")
    .join(",");
  const ready =
    s.tab === 11
      ? dependencies(11).every(
          (k) => usable(k) || sourceStates[k].state === "error",
        )
      : dependencies(s.tab).every(usable);
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
        getOptions(s.tab)
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
  }, [ready, version, s.tab]);
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
      setError("");
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
    if (!ready || s.tab === 11 || s.tab === 13 || s.tab === 15) {
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
    return () => {
      clearTimeout(timer);
      if (sequence.current === id) sequence.current++;
    };
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
        setCommand("");
        if (s.filterOpen || s.signalOpen)
          s.set({ filterOpen: false, signalOpen: false });
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
  const loaderLines: Record<number, string[]> = {
    0: ["Putting the big picture into focus…", "A little number crunch. A lot of studio insight…", "Connecting the dots across your studios…", "Your studio story is taking shape…"],
    1: ["Warming up the barre and the numbers…", "Finding the sessions that steal the show…", "A little pulse, a little shake, a lot of insight…", "Giving every signature experience its spotlight…"],
    2: ["Getting your studio rhythm in sync…", "Making room for the next full house…", "Finding the sweet spots in your schedule…", "Lining up the week, one session at a time…"],
    3: ["Setting the stage for your instructors…", "Putting great teaching in the spotlight…", "Connecting instruction with community progress…", "The instructor picture is coming together…"],
    4: ["Giving every rupee a roll call…", "Following the money, finding the story…", "Getting your revenue ducks in a row…", "Adding a little clarity to the cash flow…"],
    5: ["Rolling out the welcome mat for newcomers…", "Tracing first hellos to first sessions…", "Finding where new studio journeys begin…", "Connecting curiosity with the Method…"],
    6: ["Checking in on your studio regulars…", "Looking ahead to the next chapter…", "Connecting renewals with lasting routines…", "Keeping a finger on the community pulse…"],
    7: ["Taking your bookings out for a spin…", "Connecting reserved spots with real arrivals…", "Finding the rhythm behind the reservations…", "Getting the booking story lined up…"],
    8: ["Turning the pipeline lights on…", "Following every hello through the funnel…", "Connecting questions with next steps…", "Your prospect picture is coming into focus…"],
    9: ["Taking a roll call of your studio family…", "Spotting the routines behind the check-ins…", "Finding who keeps coming back for more…", "Connecting visits with practice habits…"],
    10: ["Giving the studio maths a little stretch…", "Bringing teaching and economics together…", "Finding the balance behind every session…", "Putting instructor costs into perspective…"],
    11: ["Giving your data a studio-quality check…", "Checking the dots before we connect them…", "Looking for numbers that need a second look…", "Tidying the evidence behind the insights…"],
    12: ["Following the seats that slipped away…", "Putting late changes on the timeline…", "Finding the patterns behind the cancellations…", "Checking where plans changed at the last minute…"],
    13: ["Warming up your thinking partner…", "Getting the evidence ready for a good question…", "Setting the table for your next insight…", "A little curiosity goes a long way…"],
  };
  const [loaderTick, setLoaderTick] = useState(0);
  useEffect(() => {
    setLoaderTick(0);
    if (!busy) return;
    const timer = setInterval(() => setLoaderTick((t) => t + 1), 2800);
    return () => clearInterval(timer);
  }, [busy, s.tab]);
  const loaderLine =
    (loaderLines[s.tab] || loaderLines[0])[
      loaderTick % (loaderLines[s.tab] || loaderLines[0]).length
    ];
  const onDrill = useCallback((r: TreeRow) => setDrill(r), []);
  useEffect(() => { setDrill(null); main.current?.scrollTo({top: 0}); }, [s.view]);
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
    "--accent": pagePrefs.accent || (s.tab === 5 ? "var(--acquisition-accent)" : `var(--${bp.domain})`),
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
  const includeWeeklyPattern = [0, 1, 2, 3, 7, 12].includes(s.tab);
  const weeklyTitle =
    s.tab === 7
      ? "When seats go unclaimed"
      : s.tab === 5
        ? "The best time for a first visit"
        : "The weekly pattern";
  const weeklyMetric =
    s.tab === 12
      ? "booking_late_cancelled"
      : s.tab === 7
      ? "booking_no_show_rate"
      : s.tab === 5
        ? "conversion_rate"
        : s.tab === 4
          ? "gross_revenue"
          : "fill_rate";
  const heatOptions = [
    ...new Set([...bp.kpis, ...bp.columns].filter((id) => metrics[id])),
  ];
  const [heatMetric, setHeatMetric] = useState(weeklyMetric);
  useEffect(() => setHeatMetric(weeklyMetric), [s.tab]);
  useEffect(() => { document.querySelector('.tabbar [aria-current="page"]')?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"auto"}); }, [s.tab]);
  return (
    <div
      className="app"
      data-workspace={s.tab === 5 ? "acquisition" : undefined}
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
            <span className="logo-mark" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="logo-orbit-dot"/>
              <span className="logo-glint"/>
            </span>
            Atlas<span style={{ color: "var(--attendance)" }}>.</span>
          </a>
          <span className="brand-divider" />
          <div className="brand-copy">
            Physique 57 India<span>Studio intelligence</span>
          </div>
        </div>
        <div className="toolbar">
          <PresentationTools /><StickyNotes />
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
            {Object.keys(choices.location || {}).length} studios
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
          {s.view !== "kra" && <button className="button" aria-label="Export" onClick={() => setModal("export")}>
            <Download size={12} />
            Export
          </button>}
        </div>
      </header>
      <CloudSettings />
      {s.view === "kra" ? <div className="kra-fixed-scope">June–November 2026 · All studios · fixed organisation-wide KRA review</div> : <><QuickFilters locations={Object.keys(choices.location || {})} /><Filters options={choices} /></>}
      <nav className="tabbar" aria-label="Performance workspaces">
        {navigationOrder
          .filter((i) => !prefs.page[i]?.hidden)
          .map((i) => {
            const name = prefs.page[i]?.name || tabs[i];
            const TabIcon = workspaceIcons[i];
            return (
              <button
                key={i}
                className={`tab ${i === s.tab ? "active" : ""}`}
                style={
                  {
                    "--accent":
                      prefs.page[i]?.accent || (i === 5 ? "var(--acquisition-accent)" : `var(--${blueprints[i].domain})`),
                  } as React.CSSProperties
                }
                onClick={() => s.set({ tab: i })}
                aria-current={i === s.tab ? "page" : undefined}
              >
                <TabIcon size={15} strokeWidth={1.7} aria-hidden="true" /><span>{name}</span>
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
        {busy && (
          <div className="loader-shell" role="status" aria-live="polite" aria-atomic="true" style={{ "--loader-accent": `var(--${bp.domain})` } as React.CSSProperties}>
            <div className="loader-graphic" aria-hidden="true">
              <svg className="loader-orbit" viewBox="0 0 88 88"><circle className="loader-orbit-track" cx="44" cy="44" r="38" /><circle className="loader-orbit-arc" cx="44" cy="44" r="38" /><circle className="loader-orbit-dot" cx="44" cy="6" r="3" /></svg>
              <span className="loader-mark"><i /><i /><i /></span>
            </div>
            <div className="loader-copy">
              <strong>{tabs[s.tab]}</strong>
              <p key={loaderLine} className="loader-line">
                {loaderLine}
              </p>
            </div>
          </div>
        )}
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className={`canvas ${busy ? "loading" : ""}`}
          aria-busy={busy}
        >
          <div className="print-context">
            <h2>Atlas / {s.view === "kra" ? "Jimmeey Gondaa · KRA performance" : tabs[s.tab]}</h2>
            <p>
              Filters: {JSON.stringify(s.filters)} / Cross-filters:{" "}
              {JSON.stringify(s.transient)} / Estimated instructor rate: ₹
              {s.rate}
            </p>
          </div>
          <div className="page-intro">
            <div>
              <h1 key={s.tab}>{s.view === "kra" ? "Jimmeey Gondaa · KRA performance" : pagePrefs.heading || workspaceHeading.title || bp.title}</h1>
              <p>{s.view === "kra" ? "Systems, sales & client servicing · June–November 2026" : pagePrefs.subtitle ?? workspaceHeading.subtitle}</p>
            </div>
            <div className="intro-meta">
              <span className="pill good">
                <span className="dot" />
                {s.view === "kra" ? "Protected saved view" : ready
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
                {s.view === "kra" ? "June–November 2026" : s.filters.from
                  ? new Date(s.filters.from + "T00:00:00").toLocaleDateString(
                      "en-IN",
                      { month: "long", year: "numeric" },
                    )
                  : "All available history"}
                <span className="small" style={s.view === "kra" ? {display: "none"} : undefined}>
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
          {s.view !== "kra" && <SourceStatus
            tab={s.tab}
            version={version}
            onRetry={(key) => void ensureSource(key, true)}
          />}
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
                Some recorded durations could not be recovered. Hours and revenue per hour use valid duration-covered sessions only.
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
          {s.tab === 15 ? (
            ready ? (
              <ReportBuilder version={version} />
            ) : null
          ) : s.tab === 13 ? (
            <IntelligenceWorkspace />
          ) : s.tab === 11 ? (
            ready ? (
              <DataHealth version={version} onRefresh={() => void load(true)} />
            ) : null
          ) : !ready || configuredTab !== s.tab ? null : (
            <>
              {!busy && !error && analysis.count === 0 && (
                <div className="notice" role="status">
                  <TriangleAlert size={13} />
                  No records match this tab’s current filters. Check the period and selected studios or other filters.
                  <button className="button" onClick={() => s.set({ filters: { ...emptyFilters, from: s.filters.from, to: s.filters.to }, transient: [] })}>
                    Clear filters, keep period
                  </button>
                </div>
              )}
              <div className="metric-strip-head">
                <div>
                  <h3>Metric cards</h3>
                  <p>Snapshot signals for the active scope and filters.</p>
                </div>
                <DataInsightAction
                  compact
                  subject={`${tabs[s.tab]} · Metric cards`}
                  detail={`Displayed metrics: ${bp.kpis.map((id) => metrics[id]?.label || id).join(", ")}`}
                />
              </div>
              <div
                className={`metric-strip ${bp.kpis.length > 6 ? "eight" : ""}`}
                style={
                  {
                    "--metric-cols": String(
                      bp.kpis.length > 6
                        ? Math.ceil(bp.kpis.length / 2)
                        : bp.kpis.length,
                    ),
                  } as React.CSSProperties
                }
              >
                {bp.kpis.map((id) => (
                  <MetricCard
                    key={id}
                    id={id}
                    value={analysis.total[id]}
                    previous={
                      analysis.previous[id]
                    }
                    trend={analysis.trend}
                    n={Number(s.tab === 9 && ["complimentary_visits", "session_complimentary_rate"].includes(id) ? analysis.total.complimentary_source_records : s.tab === 0 && ["gross_revenue", "net_revenue"].includes(id) ? analysis.total.sales_records : id === "active_base" ? analysis.total.active_records : currentSnapshotMetrics.has(id) && s.tab === 6 ? analysis.total.current_records : ["new_clients", "conversion_rate"].includes(id) && s.tab === 0 ? analysis.total.growth_records : analysis.total.n || analysis.count)}
                    evidence={analysis.total}
                    compare={s.compare !== "none"}
                    warning={
                      id === "net_revenue" &&
                      health.sales?.defects.some(
                        (d) => d.field === "Price Excluding VAT In Currency",
                      )
                        ? "Source price values differ from collected payments. Net revenue uses Payment Value − Payment VAT."
                        : ["teaching_hours", "revenue_per_hour"].includes(id) &&
                            health.checkins?.defects.length
                          ? "Only sessions with valid recorded duration contribute to hours and hourly revenue."
                          : sourceProblem
                            ? "Source could not load."
                            : undefined
                    }
                    onDrill={() => {
                      main.current
                        ?.querySelector("#main-register")
                        ?.scrollIntoView({ behavior: "smooth" });
                      if (recordGroups.length || currentSnapshotMetrics.has(id) || s.tab === 0 && ["gross_revenue", "net_revenue"].includes(id))
                        setDrill({
                          id: "all",
                          label: metrics[id].label + " in scope",
                          path: [],
                          source: s.tab === 9 && ["complimentary_visits", "session_complimentary_rate"].includes(id) ? "sessions" : s.tab === 0 && ["gross_revenue", "net_revenue"].includes(id) ? "sales" : s.tab === 0 && ["new_clients", "conversion_rate", "active_base"].includes(id) ? "new" : bp.source,
                          filters: currentSnapshotMetrics.has(id) ? { ...s.filters, from: "", to: "" } : s.filters,
                          metrics: [id],
                          predicate: id === "active_base" ? "lifecycle='Active'" : ["new_clients", "conversion_rate"].includes(id) ? "is_new" : id === "active_memberships" ? `status='Active' AND start_date<='${today()}' AND (end_date IS NULL OR end_date>='${today()}')` : id === "dormant_actives" ? `status='Active' AND start_date<='${today()}' AND (end_date IS NULL OR end_date>='${today()}') AND days_absent>21` : id === "revenue_at_risk_30d" ? `TRY_CAST(end_date AS DATE) BETWEEN DATE '${today()}' AND DATE '${today()}'+INTERVAL 30 DAY` : undefined,
                          values: analysis.total,
                          children: [],
                        });
                    }}
                  />
                ))}
              </div>
              <PinnedInsights page={s.tab} />
              <SavedElements page={s.tab} version={version} />
              {s.tab === 0 && <Pulse data={analysis} />}
              {s.tab === 6 && (
                <>
                  <RenewalCohorts version={version} onDrill={setDrill} />
                  <RetentionWorklists version={version} />
                </>
              )}
              {s.tab !== 0 && (
                <Register
                  index="02"
                  title={bp.chartTitle}
                  subtitle={
                    s.tab === 4
                      ? "Separate purchase volume from collection value · click a day to inspect it"
                      : s.tab === 2
                      ? "Observed weekly fill, in the selected period"
                      : "Compare the shape, then inspect the detail"
                  }
                >
                  {s.tab === 2 ? (
                    <div className="chart-surface">
                      <Heatmap rows={analysis.heat} schedule />
                    </div>
                  ) : (
                    <Chart tab={s.tab} data={analysis} salesActivity={s.tab === 4} />
                  )}
                </Register>
              )}
              {s.tab === 0 && (
                <Register
                  index="02"
                  title="What changed session revenue"
                  subtitle="Session-attributed revenue · attendance × realised yield; separate from payments collected"
                >
                  <SessionRevenueChange data={analysis} />
                </Register>
              )}
              <div id="main-register">
                <Register
                  index="03"
                  title={
                    s.tab === 2
                      ? "Schedule decision register"
                      : s.tab === 0
                        ? "Session performance by studio"
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
              <div className={`two-up ${s.tab === 0 ? "overview-decision-pair" : ""}`}>
                {s.tab === 0 ? <OverviewAttention signals={signals} total={analysis.total}/> : <Rankings
                  key={s.tab}
                  rows={analysis.groups}
                  groups={groups}
                  columns={configuredTab === s.tab ? columns : bp.columns}
                  onDrill={(r) =>
                    onDrill({
                      id: String(r.g0),
                      label: String(r.g0),
                      path: [{ field: groups[0], value: String(r.g0) }],
                      values: r,
                      children: [],
                    })
                  }
                />}
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
              {s.tab === 8 ? <LeadStageScorecard version={version} onDrill={setDrill} /> : includeWeeklyPattern && analysis.heat.length > 0 ? <Register
                index="05"
                title={
                  includeWeeklyPattern && analysis.heat.length
                    ? weeklyTitle
                    : "Data pattern spotlight"
                }
                subtitle={
                  includeWeeklyPattern && analysis.heat.length
                    ? "Day × time / Click a cell to scope the workspace"
                    : "Alternative view based on available source coverage"
                }
                actions={
                  includeWeeklyPattern && analysis.heat.length ? (
                    <div className="segmented heat-metric-switch">
                      {heatOptions.slice(0, 6).map((id) => (
                        <button
                          key={id}
                          className={heatMetric === id ? "active" : ""}
                          onClick={() => setHeatMetric(id)}
                        >
                          {metrics[id].label}
                        </button>
                      ))}
                      {heatOptions.length > 6 && (
                        <select
                          aria-label="More heatmap metrics"
                          value={heatMetric}
                          onChange={(e) => setHeatMetric(e.target.value)}
                        >
                          {heatOptions.map((id) => (
                            <option key={id} value={id}>
                              {metrics[id].label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ) : undefined
                }
              >
                {includeWeeklyPattern && analysis.heat.length ? (
                  <div className="chart-surface">
                    <Heatmap
                      rows={analysis.heat}
                      metric={heatMetric}
                    />
                  </div>
                ) : (
                  <Chart tab={s.tab} data={analysis} />
                )}
              </Register> : null}
              {/* Session metrics describe the class; these describe who the
                  instructor's first-visit members became. */}
              {s.tab === 3 && <AcquisitionTableView kind="trainers" version={version} />}
              {s.tab === 3 && <InstructorEconomics version={version} />}
              {s.tab === 14 && <FormatComparison version={version} />}
              <MoMTable version={workspaceVersion} ids={bp.columns.slice(0, 9)} />
              {s.tab === 4 && <SalesScorecards version={version} onDrill={setDrill} />}
              {s.tab === 5 && <AcquisitionMainTables version={version} />}
              <Register
                index="07"
                title="Go one level deeper"
                subtitle="Focused operational registers"
              >
                {s.tab === 5 && <AcquisitionDeepDive version={version} />}
                {s.tab === 8 && <WebsiteLeadPeriods version={version} />}
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
          <div className="print-insights" style={s.view === "kra" ? {display: "none"} : undefined}>
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
        {s.view !== "kra" && <SignalRail items={signals} onDismiss={dismiss} />}
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
                          view: v.view || "",
                          transient: [],
                          density: "compact",
                        });
                        setModal("");
                      }}
                    >
                      <span>{v.name}</span>
                      <span className="small">{v.view === "kra" ? "Passcode protected · Jun–Nov 2026" : tabs[v.tab]}</span>
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
