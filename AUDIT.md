# Atlas — Audit: accuracy, conflicting data, static/mock content, and performance

**Scope:** whole repository (`Jimmeey23/atlas`) at `1409ee4`.
**Method:** static review plus *executed* verification — `npm install`, `npx tsc -b`, `npm test`, `npm run build`,
targeted DuckDB reproductions, and scripted cross-checks of the metric registry against blueprints, docs and
definition tables.

Every finding below is marked:

- **[V]** **Verified** — reproduced by running code, or by an exact diff/grep against files that cannot be ambiguous.
- **[R]** **Review** — read only; high confidence but not executed (mostly needs live Google Sheets or credentials).

---

## TL;DR

| Area | State | Headline |
|---|---|---|
| Type safety | ✅ | `tsc -b` passes clean (0 errors) |
| Test suite | ⚠️ | **367 / 371 pass — 4 are failing right now** |
| Metric registry | ✅ | 175 metrics, no duplicate IDs, no missing required fields, aggregation/format tags internally consistent |
| Metric *semantics* | ❌ | **Two different definitions of "trials completed" ship side by side** |
| Generated docs | ❌ | Committed `METRICS.md` / metric reference is **stale vs the registry** and leaks `{rate}` / `{today}` placeholders |
| Docs vs code | ❌ | Workspace count, source count, refresh interval and engine limit are all wrong in prose |
| Static / hardcoded | ⚠️ | 67 MB of committed media, 451 KB of captured reference HTML in the server bundle, hardcoded instructor photos |
| Load performance | ⚠️ | Up to **17 sequential queries per view render**; `dist` is **144 MB**; main JS chunk **2.34 MB** |
| Repo hygiene | ⚠️ | 40 MB `.git`, generated 2 MB docs tracked, ~60 MB of uncompressed PNGs |

The five things I would fix first: **#1** (trials double-definition), **#2** (agent session double-count),
**#3** (failing tests / stale assertion), **#8** (unresolved `{rate}` in every user-facing formula),
**#14** (`analyse()` fires 7–17 queries per render).

---

# A. Incorrect calculations & conflicting data

### A1 **[V] Two incompatible definitions of "trials completed" — the funnel undercounts**

Three places compute "trials completed" from **three different source columns**:

| Location | Expression | Reads |
|---|---|---|
| `src/semantics/registry.json` → `trials_completed` | `COUNT(*) FILTER (WHERE lower(trim(stage))='trial completed')` | `Leads.Stage Name` |
| `registry.json` → `website_trials`, `crm_trials` | `COUNT(*) FILTER (WHERE lower(trim(COALESCE(trial_status,'')))='trial completed')` | `Leads.Trial Status` |
| `src/data/performance-marketing.ts:33` `marketingMeasures.trials` | `trialPredicate` = `lower(trim(COALESCE(stage,'')))='trial completed'` | `Leads.Stage Name` |

`Stage Name` is a **current pipeline state that advances**; `Trial Status` is the recorded trial **outcome**.
A lead who completed a trial and was then sold a membership has `Stage = 'Membership Sold'`, so the
`stage`-based definition **silently drops everyone who progressed**.

**Proof** — `tests/performance-marketing.test.ts:36` fails today with `1 !== 2`. In its fixture, two leads have
`Trial Status = 'Trial Completed'` (one is at `Membership Sold`, one at `Client Unresponsive`) and one lead sits
*at* `Stage = 'Trial Completed'` with `Trial Status = 'Not Tried'`. The cards report **1** trial; the correct
answer for "trials completed" is **2**.

**Impact:** the Leads/website funnel undercounts trials, which also deflates `website_trial_rate` and
`website_trial_win_rate` denominators differently depending on which surface you read. Two cards on the same
filtered population can legitimately disagree.

**Fix:** make `Trial Status` the single source for trial outcomes. Change `trials_completed` and
`trialPredicate` to read `trial_status`, keep `stage` strictly for pipeline position
(`converted_leads`, `open_leads`, `lead_conversion_rate`), and re-run the test. Add a registry-level test that
fails when two metrics share a label concept but different source columns.

---

### A2 **[V] The AI agent double-counts sessions (4 instead of 2)**

`server/agent-metrics.mjs:22` sets `let facts = source` for `sessions`, with no de-duplication, and the
`sessions` metric is `SUM(sessions)`.

`tests/agent-metrics.test.ts:70` builds a table with `session_id` values `('s1','s1','s2',NULL)` and asserts the
answer is **2** distinct sessions. The code returns **4**. It fails today with `4n !== 2n`.

**Impact:** every GPT answer about session counts, and every metric that divides by sessions
(`revenue_per_session`, `avg_class_size_incl`, `empty_session_rate`, `gap_to_break_even`, …), is inflated whenever
the Sessions tab carries a repeated session identity — exactly the condition the dashboard path guards against
with `sessionFacts()`.

**Fix:** route the agent through the same `metricFacts()` / `sessionFacts()` helper the dashboard uses
(`src/data/analytics.ts:110-118`) instead of raw table names, so the two paths can never diverge. Add a
contract test that runs the same metric over the same fixture through both paths and asserts equality.

---

### A3 **[V] Report drill-downs resolve to the wrong chapter (wrong population)**

`src/report/drilldown.ts:12-22`. `supports()` only accepts a chapter if the metric is in that chapter's declared
metric list or if `spec.source === metricTable(metric)`.

The **Recurring** chapter (`src/report/chapters.ts:106-112`) reports `sessions: 12`, but declares
`recurring_sessions` — not `sessions`. So drilling on "sessions" from Recurring falls through to the home-chapter
fallback and lands on the **Sessions** chapter.

`tests/report-drilldown.test.ts:14` fails today with `expected 'recurring', actual 'sessions'`.

**Impact:** a user inspecting the Recurring chapter's session figure is shown timetable session records, not
recurring-class records. The drill-down looks authoritative but is from a different population.

**Fix:** teach `resolveRecordSelection` about the alias map already defined in `src/semantics/metrics.ts:25-36`
(`recurring_sessions`, `payroll_sessions` are aliases of `sessions`). Resolve `sessions` → `recurring_sessions`
when the requesting chapter's source is `recurring`.

---

### A4 **[V] Unresolved `{rate}` / `{today}` placeholders in every user-facing formula**

`src/semantics/metrics.ts:20-24` substitutes `{rate}` and `{today}` **only inside `sql(ctx)`**. But the raw
registry `expression` is exposed directly as `description` and rendered verbatim in four user/agent surfaces:

| Surface | File | Output |
|---|---|---|
| Metric dictionary (repo) | `METRICS.md:117-122,137` | `SUM(sessions)*{rate}` |
| In-app reference (2.1 MB HTML + 1.8 MB MD) | `public/reference/metric-definitions.*` | `{rate}`, `{today}` |
| Table cell tooltip | `src/semantics/cells.ts:46` | `Formula: {…} * {rate}` |
| GPT tool output | `server/agent-metrics.mjs:34`, `server/intelligence.mjs:1241` | `expression: "SUM(sessions)*{rate}"` |

Worse, `src/components/ui/MetricInfoHint.tsx:365` has a fallback that substitutes **the wrong values**:

```ts
formula: m.description || m.sql({ rate: 1000, today: "TODAY" }),
```

`1000` is not the configured default (`1200`, `src/state/store.ts:194`) and ignores the user's own rate
assumption entirely; `today: "TODAY"` splices a nonsense literal into displayed SQL.

**Fix:** give `MetricDef` a `template` (raw) and a `render(ctx)` (resolved) and **only ever display resolved
output**. Delete the `rate: 1000` fallback. Add a CI check that greps the generated reference for `{` placeholders.

---

### A5 **[V] Committed generated documentation is already stale relative to the registry**

Running `npm run build` (whose `prebuild` runs `npm run docs:metrics`) modified three **tracked** files:

```
 METRICS.md                               |  10 +-
 public/reference/metric-definitions.html | 760 ++++++++---
 public/reference/metric-definitions.md   | 776 ++++++++---
 3 files changed, 1380 insertions(+), 166 deletions(-)
```

Five labels had drifted, e.g. `revenue_per_session` was documented as `Revenue / session` while the registry now
says `Earned revenue / session`. (I reverted these; the tree is clean.)

Root cause: the generator embeds **full source-code excerpts** in the HTML appendix — the diff literally contains
lines of `server/agent-metrics.mjs`. So a 2.1 MB tracked file churns on every code change, and it is guaranteed to
be stale whenever someone edits the registry without rebuilding.

**Fix:** add `public/reference/metric-definitions.*` to `.gitignore` and generate them in CI/`prebuild` (they
already are generated). Keep `METRICS.md` as a *thin* summary regenerated by a CI job that fails the build if the
committed copy differs. Never embed source excerpts in a tracked file.

---

### A6 **[R] Metrics silently depend on a different table than their blueprint declares**

A scripted cross-check of all 17 blueprints against `metricTable()` found 15 metrics whose source table differs
from the blueprint's `source`:

```
[overview]  source=sessions  but gross_revenue, net_revenue  -> sales
[overview]  source=sessions  but new_clients, conversion_rate, active_base -> new
[overview]  source=sessions  but lapsed_members -> lapsed
[payroll]   source=payroll   but attendance, empty_sessions -> sessions
[checkins]  source=checkins  but complimentary_visits, session_complimentary_rate -> sessions
[sessions]  source=sessions  but trainers -> teacher_recurring
```

These are *currently correct* only because of hard-coded `if (tab === 0)` / `if (tab === 9)` / `if (tab === 6)`
branches in `performAnalysis` and the `session_payroll` view. That coupling is invisible from the blueprint and
unprotected by any test.

**Fix:** add a `crossSource` declaration to the blueprint (e.g. `joins: { sales: '…' }`) and drive the
special-case blocks from data instead of tab-number literals. Add a test asserting every blueprint metric is
either native to `source` or explicitly declared as cross-source.

---

### A7 **[R] Blueprint/source coupling hazards in the registry**

11 metrics read more than one sheet. `metricTable()` resolves them to the **first** matching title, which is a
silent choice:

| Metric | Sources | Resolves to | Note |
|---|---|---|---|
| `unused_session_liability` | Lapsed **+ Sales** | `lapsed` | Sales columns (`classes_left`, `rev_credit`) may be absent on `lapsed` |
| `new_late_cancels` | New **+ Bookings** | `new` | Uses a correlated subquery over `bookings`; already blocked in the agent path |
| `pipeline_value`, `website_pipeline_value` | Leads **+ New** | `leads` | |
| `payroll_cost`, `contribution*`, `empty_session_cost`, `payroll_pct_of_revenue` | Payroll **+ Settings** | `payroll` | `Settings` is not a sheet — a pseudo-source |
| `break_even_class_size`, `gap_to_break_even` | Sessions **+ Settings** | `sessions` | |

**Fix:** make `Settings` an explicit sentinel rather than a source-string, and add a registry test that fails when
a metric lists two real sheets without an explicit `computedOn` field.

---

# B. Documentation that contradicts the code

| # | Doc says | Code says | File |
|---|---|---|---|
| B1 | "**Twelve** workspaces cover Overview, Classes, Slots, …" | `tabs[]` has **17** entries; `navigationOrder` has 13 | `README.md` vs `src/state/store.ts:7-25` |
| B2 | "reads the **ten** supplied tabs" / "Data health loads all **ten** sources" / "all **seven** source workbooks" | `server/sheets.json` defines **11** sources (incl. `teacher_recurring`, `meta`); `duckdb.init()` creates 11 tables | `README.md`, `DECISIONS.md:2` vs `server/sheets.json` |
| B3 | "the active workspace checks `/api/sheets/freshness **each minute**" | `setInterval(…, 5 * 60000)` — **every 5 minutes** | `README.md` vs `src/App.tsx:311` |
| B4 | "one native DuckDB thread, a **384 MB** engine limit and a disk spill directory" | `memory_limit: "512MB"`, `threads: "1"` | `PERFORMANCE.md` vs `server/intelligence.mjs:226-232` |
| B5 | "**14** unit/API tests pass" | `npm test` runs **371** tests (367 pass) | `PERFORMANCE.md` vs `tests/` |
| B6 | "All **12 workspaces** captured … 48 screenshots" | 17 workspaces exist | `PERFORMANCE.md` |
| B7 | Startup table presented as current | "The startup numbers above describe earlier local runs and are **historical**" (self-contradicting two sections down) | `PERFORMANCE.md` |

**Fix:** generate the volatile parts of the README from code (workspace list from `tabs`, source list from
`sheets.json`, test count from the runner) so prose cannot drift. At minimum, correct B1–B6.

---

### B8 **[V] Three different defaults for the theme — the first `T` keypress does nothing**

| Source | Theme |
|---|---|
| `index.html` | `data-theme="matte"` |
| `src/state/store.ts:184` | `localStorage.getItem("floor-theme") \|\| "matte"` |
| `src/main.tsx:7` | `localStorage.getItem("floor-theme") \|\| "gloss"` |

`writeState` (`store.ts:231`) only runs on a store *change*, so on a fresh load the DOM is **gloss** while the
store believes it is **matte**. Pressing `T` (`src/App.tsx:468`) flips `matte → gloss`, i.e. no visible change.

Compounding this, `src/App.tsx:341-345` is a dead effect that re-applies theme/density with `[]` deps — it runs
once and never again, duplicating what `writeState` already does.

**Fix:** delete the `main.tsx` line and the dead effect; let the store own the attribute. Read the theme from a
single exported constant.

---

# C. Static, mock and hardcoded data

### C1 **[V] ~67 MB of committed media, mostly unoptimised**

```
public/report-assets/   18 PNGs, 2.6–4.0 MB each  ≈ 60 MB   (no WebP/AVIF, no responsive sizes)
public/audio/           fiz-zeek-fifty-seven.mp3   4.6 MB    (a meme soundboard clip)
public/audio/sfx/       32 meme SFX clips          ~2.4 MB
public/reference/       metric-definitions.html    2.1 MB    (generated — see A5)
                        metric-definitions.md      1.8 MB    (generated)
```

`.git` is **40 MB** for 564 tracked source files. Every clone and CI checkout pays for the soundboard.

**Fix:** convert the report heroes to WebP/AVIF at 2–3 widths (≈85 % smaller), downsample the MP3 or drop it,
and move the remaining large media to Git LFS or an external bucket.

### C2 **[V] 630 KB of captured reference HTML is parsed on every server start**

`src/report/reference-templates.json` (**451 KB**) and `src/report/reference-contracts.json` (**186 KB**) are
static extracts of three previously generated reports (`docs/report-reference-standards/`). Both are imported at
**module load**:

- `server/intelligence.mjs:3` → `reference-templates.json`
- `src/report/reference-standard.mjs:2` → `reference-contracts.json`

They account for roughly two-thirds of the **1.0 MB** `api/_app.mjs` serverless bundle, so every cold start of
every route parses them — including sheet-snapshot requests that never touch reports.

**Fix:** `await import()` them lazily inside the report-reference code path, or precompile to a compact derived
form. Also consider moving them to `@duckdb`-style external storage.

### C3 **[V] 16 unreachable duplicate metric definitions**

`src/components/ui/MetricInfoHint.tsx:15+` holds `CUSTOM_METRIC_FORMULAS` with **56** hand-written entries.
Lookup order (`getMetricFormulaInfo`) checks the registry **first**, so the 16 entries whose keys already exist in
`registry.json` are dead:

```
arpu, aov, purchase_frequency, product_breadth, discount_value, discount_rate, transactions,
buyers, empty_sessions, booking_late_rate, avg_ltv, revenue_per_session, checkin_revenue,
revenue_per_checkin, touches, response_time_hours
```

Editing those has zero effect — a classic maintenance trap. The other 40 keys are ad-hoc formulas that exist in
no registry at all.

**Fix:** delete the 16 duplicates; migrate the remaining 40 into `registry.json` as non-catalogue entries, or into
a single `overrides.ts` with a test that asserts no override shadows a registry ID.

### C4 **[R] Four parallel, hand-maintained definition sources**

| File | Size | Shape |
|---|---|---|
| `src/semantics/registry.json` | 62 KB | source of truth (175 metrics) |
| `src/semantics/metric-simple-definitions.ts` | 37 KB | `{meaning, calculation}` × 175 |
| `src/semantics/metric-business-definitions.ts` | 33 KB | business prose × 175 |
| `src/components/ui/MetricInfoHint.tsx` | 534 lines | `CUSTOM_METRIC_FORMULAS` × 56 |

I verified coverage is currently complete (175/175 in both definition tables, 0 orphans) **but nothing enforces
it** — there is no test that a new registry metric must appear in the other three.

**Fix:** make the registry the single source and fail the build if any definition table is missing an ID or
contains an orphan.

### C5 **[R] Hardcoded instructor photo map will silently drift**

`src/data/instructorPortraits.ts` is a hand-maintained 26-entry name→image map with spelling variants
(`"mrigakshi jaiswal"` *and* `"mrigakshi n jaiswal"`; `"maysaa nafis"` *and* `"mayasaa nafis"`). Any instructor
added to the workbook gets no photo, and the variant keys suggest real source-name inconsistency is being patched
over rather than normalised.

**Fix:** derive the key with the same normaliser used elsewhere, store the map in `public/instructors/sources.json`
(which already exists and records provenance URLs), and add a Data-health check for "instructor present in sheets
but absent from the photo manifest".

### C6 **[R] Non-deterministic UI copy from `Math.random()`**

`src/data/workspaceCopy.ts:196` picks page headlines with `Math.random()`. Cosmetic, but it makes the UI
non-reproducible for screenshot/visual-regression tests and re-rolls on remount.

**Fix:** seed from a stable key (tab + date) or rotate deterministically.

---

# D. Performance — measured

## D1 **[V] Bundle & build output

```
dist/                                         144 MB
├─ duckdb-mvp.wasm                            38 MB   ← only one of these two is ever used
├─ duckdb-eh.wasm                             33 MB   ←
├─ duckdb-browser-mvp.worker.js              844 KB
├─ duckdb-browser-eh.worker.js               773 KB
├─ assets/index-*.js                       2,335 KB   (gzip 613 KB)
├─ assets/charts-*.js                      1,129 KB   (gzip 379 KB)
├─ assets/ThreeEvidenceScene-*.js             550 KB   (gzip 138 KB)
├─ assets/index-*.css                         707 KB   (gzip 119 KB)
└─ assets/motion-*.js                         122 KB
```

**71 MB of `dist` is a second, unused DuckDB WASM bundle.** `selectBundle()` picks one at runtime; both are
emitted and shipped.

`src/design/` + `src/styles.css` total **764 KB of CSS** and are emitted as one `index-*.css`. The report CSS
alone is ~400 KB (`report-deck` 93 KB, `report-layouts` 45 KB, `report` 44 KB, `report-editorial` 37 KB,
`report-continuous` 27 KB, `report-source` 27 KB, `report-v2` 29 KB, `report-modern` 26 KB) — all of it loads on
every page, including workspaces that never render a report.

ECharts is imported wholesale in **9 components** (`import * as echarts from "echarts"`), which is why `charts`
is 1.13 MB.

**Fixes, in order of payoff:**
1. Emit only the selected DuckDB bundle, or lazy-load both and ship one → **−34 MB**.
2. Switch to `echarts/core` + explicit `use([BarChart, LineChart, …])` → **charts chunk −60–70 %**.
3. Split `report-*.css` into a chunk imported only by report routes; enable `cssCodeSplit` → **−400 KB CSS** on
   non-report pages.
4. Lazy-load `ThreeEvidenceScene` (already a separate chunk — ensure it is dynamically imported).
5. Route-split the 17 workspaces (`AnalysisWorkbench` 1556 lines, `StudioOperations` 1713 lines,
   `IntelligenceWorkspace` 1175 lines, `DataLab` 1237 lines are all eager today).

## D2 **[V] Up to 17 queries per view render, all serialised through one queue

`src/data/duckdb.ts:76-108` funnels **every** query through a single promise `queue`. One slow query stalls all
others — no concurrency at all.

`performAnalysis` (`src/data/analytics.ts:174-235`) then issues **7 queries** in one `Promise.all`:

1. total, 2. previous, 3. grouped rollup (`LIMIT 50000`), 4. previous groups, 5. trend, 6. heat, 7. raw 250 rows

…and then adds **more, in sequence**:
- `tab === 0` → **+7** (growth now/prior/monthly, active base, cash now/prior/monthly)
- `tab === 9` → **+3**
- `tab === 6` → **+2** (one of which is a `CROSS JOIN` of months × lapsed rows)

`insights()` adds **17 more** (`evaluateRules` maps all 17 rules through `Promise.allSettled`).

**Fixes:**
- Collapse the 7 base queries into **one** SQL statement using CTEs + `GROUPING_ID` and split the result in JS.
  DuckDB is fast; the round-trip and queue serialisation are the cost.
- Skip the `previous` query entirely when `compare === 'none'` (today it still runs with `mode = 'prior'` —
  `analytics.ts:97`).
- Replace the tab-6 `CROSS JOIN` month × lapsed fan-out with a single windowed pass.
- Consider `Promise.all` over 2–3 connections rather than one global queue, keeping writes serialised.

## D3 **[V] `options()` does 7 sequential full scans of all 10 tables

```ts
// src/data/analytics.ts:238-262
for (const field of [location, trainer, format, source, category, day, time]) {
  const result = await query(`SELECT … FROM (${10 tables UNION ALL}) …`);   // awaited, one at a time
}
```

Seven `await`s × a `UNION ALL` over 10 tables = **70 full table scans, strictly serialised**, run on every tab
change and after every data version bump (debounced 500 ms).

**Fix:** one query returning all seven fields — unpivot with `UNION ALL` of 7 `(field, value)` selects inside a
single statement, or use `SELECT location, trainer, … FROM …` and count in JS. Expected: 7× fewer scans.

## D4 **[V] `thresholds()` hits `localStorage` + `JSON.parse` per row, per rule

```ts
// src/insights/thresholds.ts:23-31
export function thresholds(): Thresholds {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem("floor-thresholds") || "{}") }; }
  catch { return { ...defaults }; }
}
```

Called **10 times** inside `src/insights/rules.ts` `test()`/`build()`, i.e. once per candidate row per rule — with
17 rules and grouped result sets that is **hundreds of synchronous `localStorage` reads and JSON parses per
insight refresh**. `localStorage` is a blocking, disk-backed API.

**Fix:** resolve thresholds **once** in `evaluateRules()` and pass the object into `test`/`build` (or memoize
behind the existing `p57-settings-hydrated` event).

## D5 **[V] `writeState` runs `localStorage.setItem` ×3 + `history.replaceState` on *every* store change

`src/state/store.ts:229-272`, wired via `useStore.subscribe(writeState)`.

Every filter keystroke, every step of the **Payroll rate slider**, every cross-filter chip, and every
group/column drag triggers three synchronous `localStorage` writes, a `JSON.stringify` of the URL params, and a
`history.replaceState`. Dragging the rate slider can produce hundreds of these.

**Fix:** debounce (~150 ms) or `requestIdleCallback`; split the cheap `data-theme`/`data-density` attribute updates
(keep those synchronous) from the expensive persistence and URL sync.

## D6 **[V] 31 components subscribe to the entire store

`grep -c "useStore()"` → **31** occurrences across `App.tsx`, `Charts.tsx`, `AnalysisWorkbench.tsx`,
`StudioOperations.tsx`, `NestedTable.tsx`, `Filters.tsx`, `MetricCard.tsx`, and 24 more. With no selector,
Zustand re-renders each of them on **any** state change — including the rate slider and transient chips.

**Fix:** `useStore(s => s.field)` (or `useShallow` for small objects). Highest-value targets: `MetricCard`,
`NestedTable`, `Charts`, `Filters`.

## D7 **[V] Ingest writes a Parquet snapshot synchronously inside the serialised queue

`src/data/duckdb.ts:186-206` (`persist`) runs `COPY … TO parquet` → `copyFileToBuffer` → IndexedDB `put` —
**inside** `ingestSource`, which is itself inside `exclusive()`. So each of the 11 sources, one at a time, pays a
full Parquet encode + IndexedDB write before the next can begin. `src/data/cache.ts` also **opens and closes** the
IndexedDB connection on every single call (11 opens on boot, 11 closes).

**Fix:** move `persist` off the critical path — enqueue it after the table is live and `measureFields` has run.
Keep the IndexedDB connection open for the session.

## D8 **[V] Cache eviction is FIFO, not LRU; caches are small and unbounded in key size

- `resultCache` caps at **80** entries, deleting `keys().next().value` — the *oldest inserted*, not the
  least-recently-used. A hot query reused for minutes can be evicted by 80 cold ones. Keys are full SQL strings
  (multi-KB each).
- `analysisCache` caps at **40** with the same FIFO behaviour, and keys are `JSON.stringify` of the full filter
  state.
- Any non-`SELECT` statement calls `resultCache.clear()` wholesale (`duckdb.ts:74`).

**Fix:** true LRU (`Map` delete+re-set on hit), and key caches on a hash of the SQL rather than the SQL itself.

## D9 **[R] Browser DuckDB is created with no memory limit or spill directory

`src/data/duckdb.ts:163-172`:

```ts
database = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
```

No `memoryLimit`, no `query.query_memory_limit`, no temp directory — while the *server* engine is carefully
configured with `memory_limit: "512MB"` and a spill path (`server/intelligence.mjs:226-232`). Bookings alone is
reported at ~350 MB uncompressed server-side.

**Fix:** pass a configuration object with an explicit `memoryLimit` and surface engine OOM as a source error
rather than a silent worker crash.

## D10 **[V] Static assets served with no compression and no caching headers

```ts
// server/app.mjs:359
app.use(express.static(path.join(root, "dist")));
```

No `maxAge`, no `etag` tuning, no `compression()` middleware. Every reload re-downloads 2.3 MB JS + 707 KB CSS
(and potentially 38 MB of WASM if the browser cache is cold).

**Fix:** `compression()` + `express.static(dist, { maxAge: '1y', immutable: true })` for hashed assets and
`no-cache` for `index.html`.

## D11 **[V] `index.html` blocks first paint on a third-party font request

Three render-blocking `<link>`s to `fonts.googleapis.com` for Archivo, Instrument Sans and Newsreader. For an
app documented as a **local operator application**, this adds a hard external dependency, breaks offline use, and
leaks client IPs to Google.

**Fix:** self-host the fonts (or `font-display: swap` + `preload`), and keep a system-font fallback.

---

# E. Robustness & correctness smells worth fixing

| # | Finding | Location |
|---|---|---|
| E1 **[V]** Schema version `21` is hardcoded **twice** (`restoreSnapshot` and `persist`). Bump one and snapshots silently fail to restore. Export a single `SCHEMA_VERSION` const. | `src/data/duckdb.ts:126,190` |
| E2 **[R]** `ensureSource` returns early on `jobs.has(key)` **before** honouring `force`, so a forced refresh during an in-flight load is silently dropped. | `src/data/loader.ts:106` |
| E3 **[V]** The engine-init closure is duplicated **three times** in one file (`ensureEngine`, `ensureWorkspace`, `ensureSource`). | `src/data/loader.ts:76,84,102` |
| E4 **[R]** `analysisCache` is keyed on filters/transient/compare/rate but **not** on a data version. It relies entirely on `clearAnalyses()` being called on each ingest path — a missed call shows stale numbers over fresh data. | `src/data/analytics.ts:155-170` |
| E5 **[R]** On Vercel, `cacheRoot` becomes `/tmp/atlas` but follow-ups are wired to `root/.floor/…`, and `.floor` is only created when `!process.env.VERCEL`. Follow-up writes will fail on serverless. | `server/app.mjs:35,46,57`; `server/store.mjs:44` |
| E6 **[R]** `date()` in `normalise.ts` parses `d/m/yyyy` and assumes day-first with no comment or config. Any M/D/Y export is silently mis-dated by up to 11 months. Two-digit years are not handled at all (return `null`). | `src/data/normalise.ts:47-58` |
| E7 **[R]** The Sheets serial-date regex only matches years `18xx`–`1999` (`1[89]\d\d\|190\d`); `190\d` is redundant. A serial-formatted cell from 2000+ would fall through to `Number()`. | `src/data/normalise.ts:29` |
| E8 **[V]** `src/data/views.sql` is loaded and executed at init, but **none of its 7 views is referenced anywhere** in the query layer (verified by grep across `src/`, `server/`, `scripts/`). Dead SQL maintained as if live. *I verified DROP+CREATE of a view dependency is safe in DuckDB, so this is dead code, not a crash.* | `src/data/views.sql`, `src/data/loader.ts:4` |
| E9 **[V]** `risk_score` declares `aggregation: "avg"` for a weighted composite including a clamped `LEAST(days_absent/60,1)` term. Averaging per-member scores to a group total is not the same as recomputing the composite on group aggregates — the group number will not match the members that compose it. | `registry.json` |
| E10 **[V]** `teacher_dependency` and `trainer_depth` are `MAX(...)` expressions but declare `aggregation: "last"`. `metricDenominatorSQL` has no branch for `"last"`, so their denominators are `null`. | `registry.json`, `src/semantics/metrics.ts:63` |
| E11 **[R]** `metricDenominatorSQL` rewrites `AVG(x)`/`MEDIAN(x)` → `COUNT(x)` textually. For `risk_score` that yields `COUNT(100*(…))`, which counts non-null composites rather than members. | `src/semantics/metrics.ts:62` |

---

# F. Test-suite health

`npm test` → **371 tests, 367 pass, 4 fail**, 41 s. `tsc -b` → clean.

| Failing test | Kind | Assessment |
|---|---|---|
| `agent-metrics.test.ts:70` — sessions distinct IDs (4 vs 2) | **Real defect** | See A2 |
| `performance-marketing.test.ts:36` — website cohorts (1 vs 2) | **Real defect** | See A1 |
| `report-drilldown.test.ts:14` — cross-chapter source (`sessions` vs `recurring`) | **Real defect** | See A3 |
| `metric-consistency.test.ts:72` — scorecard minimum-sessions | **Stale test** | The test asserts on the *source text* of `FormatComparison.tsx`. The implementation was correctly improved to `HAVING COUNT(DISTINCT session_id)>=N` (`:49`) but the test still greps for the old `HAVING SUM(sessions)>=…` string. |

**F1 — brittle tests that assert on source text.** `metric-consistency.test.ts:72-79` reads
`PerformanceScorecard.tsx` and `FormatComparison.tsx` and regex-matches implementation strings
(`minimumSessions > 0 ? \` HAVING SUM(sessions)>=…\``). These protect nothing behavioural and break on any
refactor. Replace with behavioural assertions against generated SQL.

**F2 — no coverage for the paths that just broke.** Add: (a) a contract test running each metric through both the
dashboard `metricFacts()` path and the agent `compileMetricQuery()` path on one fixture; (b) a registry test
asserting every blueprint metric is native or explicitly cross-source (A6); (c) a build-output guard for
`{rate}` / `{today}` in generated docs (A4).

**F3 — the suite does not gate anything.** There is no CI configuration in the repo. Four tests have been failing
with no signal. Add a GitHub Actions workflow running `tsc -b`, `npm test`, `npm run build` on every PR.

---

# G. Suggested improvements & new features

### Make load fast (biggest wins first)

1. **Parallelise the engine.** Today one promise queue serialises *all* reads (`duckdb.ts:76`). Use a small pool
   of connections: keep writes/`ingest` serialised, let reads run concurrently. This alone should cut the
   multi-query view render by 3–5×.
2. **One round trip per view.** Collapse the 7 (or 17) queries of `performAnalysis` into a single CTE statement
   with `GROUPING_ID`, and split in JS.
3. **Fix `options()`** — 7 awaited UNION-ALL scans → 1 query.
4. **Prefetch on intent.** `dependencies(tab)` already knows the next workspace's sources; warm them on
   hover/focus of the tab rather than after the click.
5. **Progressive render.** Paint KPI cards from the cheap `total` query first, then stream groups/trend/heat as
   they land, instead of one `setBusy(true)` gate.
6. **Ship one DuckDB bundle** and lazy-load the WASM after first paint.
7. **Route-split + tree-shake** (D1). Target: main chunk < 500 KB, CSS < 150 KB on non-report pages.
8. **Move `persist()` off the ingest critical path** and keep IndexedDB open (D7).

### Make it more accurate

9. **One definition per concept.** Add a `concept` tag to registry metrics (`trial_completed`, `sessions`,
   `revenue`) and fail the build if two metrics share a concept but differ in source column or filter. This is the
   structural fix for A1/A2.
10. **Reconciliation panel.** Promote `scripts/check-metric-consistency.ts` from a script into a Data-health
    section: for each concept, show every surface's value side by side (dashboard vs agent vs report vs MoM
    table) and flag divergence.
11. **Formula provenance in the UI.** Every card tooltip should show the *resolved* SQL and the actual row count,
    not a template (A4).
12. **Row-count guard, not sample gates.** The registry deliberately has no minimum-sample rules (a good
    decision). Instead, add a confidence badge on each card derived from `n` and source completeness.
13. **Cross-source metric declarations** in blueprints (A6/A7) so `metricTable` is never a silent guess.

### New capabilities

14. **Materialised aggregates.** Persist a pre-aggregated fact table per (month × location × format × day × time)
    at ingest time. Most views only ever group on those keys; this would turn full-table scans into small
    rollup reads.
15. **Incremental ingest.** Today `ingestSource` drops and rebuilds the entire table even when one row changed
    (the gateway already computes a content `hash`). Upsert by `source_row` when the hash delta is small.
16. **Server-side query cache with the content hash as the key.** Identical filters across users/tabs hit one
    cached result instead of re-running DuckDB in each browser.
17. **Streaming snapshot responses.** `sendSnapshot` already chunks JSON (`jsonChunks`); use
    `read_json_auto` on the stream to start querying before the last byte arrives.
18. **Explain/plan panel** for the AI agent and Data Lab: show the SQL, rows scanned and elapsed ms so users can
    judge an answer's weight.
19. **Anomaly detection on ingest** — run the Data-health checks as a post-ingest job and surface a
    "source changed structurally" banner when header drift or a new null-spike appears.
20. **Accessibility & keyboard parity** for the drill sheet and the report deck; the main app documents extensive
    shortcuts but the report reader does not.

---

# H. Prioritised plan

**P0 — correctness, this week**
1. A1: unify "trials completed" on `Trial Status`; fix the failing test.
2. A2: route agent metrics through `metricFacts()`; fix the failing test.
3. A3: alias-aware `resolveRecordSelection`; fix the failing test.
4. A4: never display unresolved `{rate}`/`{today}`; delete the `rate: 1000` fallback.
5. F1: replace the source-text assertion; add a CI workflow so failures are visible.

**P1 — trust and weight, next two weeks**
6. B1–B8: correct the doc contradictions; generate volatile README sections.
7. A5: untrack the generated metric reference; regenerate in CI.
8. D2/D3/D4: collapse the per-render query fan-out; memoize thresholds.
9. D1: single DuckDB bundle, ECharts tree-shaking, CSS code-splitting.
10. C2/C3: lazy-load the reference templates; delete the 16 dead formula overrides.

**P2 — structural, next month**
11. D1: route-split the 17 workspaces. D5/D6: debounce `writeState`, add Zustand selectors.
12. C1: media diet (WebP/AVIF, LFS). D9/D10/D11: engine limits, compression/caching headers, self-hosted fonts.
13. G14–G17: materialised aggregates, incremental ingest, shared server-side query cache.
14. E1–E11: schema-version constant, `.floor` on serverless, date-parsing config, retire `views.sql`, fix
    `risk_score` rollup and the `"last"` aggregation.

---

## Appendix — commands used

```bash
npm install                 # 317 packages, clean
npx tsc -b                  # 0 errors
npm test                    # 371 tests · 367 pass · 4 fail · 41 s
npm run build               # succeeds in 28.7 s; dist = 144 MB
node .tmp/check1.mts        # blueprint × metricTable cross-check  → A6
node .tmp/check2.mts        # registry vs definition tables        → C4 (coverage OK today)
node .tmp/check3.mjs        # DuckDB view dependency on DROP TABLE → E8 (safe, not a bug)
git diff after `npm run build`                                     → A5
```

---

# Resolution log

Applied on branch `arena/aec10e52-atlas`. Every change below keeps `npx tsc -b` clean and
`npm test` green (**379 tests, 0 failures**; `verify:definitions` **8/8**; the report gate
**12/12**).

## Fixed

**A1** — Leads outcomes now read `Trial Status` / `Conversion Status` instead of the
advancing pipeline stage. Locked in by `tests/metric-definitions.test.ts`.
**A2** — The agent counts session *identity* (`COUNT(DISTINCT session_id)`) through a
declared `overrides` argument to `metricSQL`; registers keep `SUM(sessions)`.
**A3** — `src/report/drilldown.ts` resolves aliases through `chapterMetricId()`, so drilling
"sessions" from Recurring lands on the Recurring chapter.
**A4** — Placeholder tokens renamed to the self-describing `{cost_rate}` / `{today_ist}`; new
`describeMetric()` / `displayContext()` in `src/semantics/metrics.ts` resolve every
placeholder before a formula reaches a reader, a tooltip, the generated docs or the model.
**A5** — The two large generated reference files are untracked (regenerated by `prebuild`);
`npm run dev` now generates them too, so they are never missing locally.
**B8** — One `DEFAULT_THEME` export; the theme effect tracks the store instead of running once.
**C2** — `reference-templates.json` (451 KB) loads on demand; esbuild code splitting cut the
serverless cold-start path from **1.03 MB to 633 KB**.
**C3** — 16 unreachable `CUSTOM_METRIC_FORMULAS` keys removed; the remainder moved to
`src/semantics/metric-formula-overrides.ts` where a test can police them.
**D1** — One DuckDB-WASM build is shipped instead of both: **dist 144 MB → 106 MB**
(`DUCKDB_BUNDLE=mvp` opts back in). `manualChunks` is now path-based, and ReportPage /
KraPerformance are route-split.
**D3** — `options()` is one unpivoted scan instead of 7 serialised scans of the same union.
**D4** — Thresholds resolve once and are invalidated on write, not read per rule per row.
**D9** — The browser engine declares the same 512 MB budget and spill path as the server.
**D10** — `compression()` plus immutable caching for hashed assets, `no-cache` for
`index.html`, and a clear error instead of a blank page when `dist` is missing.
**D11** — Webfonts no longer block first paint; every font stack names a system fallback.
**E1** — One `SCHEMA_VERSION` const, read on both write and restore.
**E2** — A forced refresh waits out the in-flight load instead of being silently dropped.
**E3** — The engine-init closure is defined once instead of three times.
**E4** — `analysisCache` is keyed on `dataVersion()`, so a missed invalidation cannot serve
numbers computed from replaced rows.
**E5** — Durable follow-ups follow `cacheRoot` on serverless, and create their directory.
**E6/E7** — `date()` takes a configurable month/day order and handles two-digit years; the
serial-date guard accepts any four-digit year (it stopped at 1999).
**E8** — `src/data/views.sql` deleted; none of its views was referenced.
**F1** — The brittle source-text test is now behavioural, backed by two new pure config
modules (`src/data/format-comparison.ts`, `src/data/scorecard-config.ts`).
**F2** — `tests/metric-definitions.test.ts` (8 guards) covers the paths that broke.
**F3** — `.github/workflows/ci.yml` runs types, tests, guards, the report gate and a build.

## A defect found while fixing E9

DuckDB's `LEAST` / `GREATEST` **ignore NULL** and return the non-null argument. `risk_score`
contained `LEAST(days_absent/60, 1)`, so a member with no recorded absence was scored the
**full 35-point absence penalty** — the worst possible risk — and the `COALESCE` fallback to
`attendance_rate` directly below it could never fire, for the same reason. Unknown inputs now
resolve to a stated neutral midpoint (0.5 of each term's range), matching the fallback the
metric already used for utilisation. Verified against DuckDB. A registry-wide guard now fails
if any clamped term can collapse a NULL to its bound.

## Measured, not fixed

**ECharts tree-shaking.** Rebuilt on `echarts/core` with only the six series types and the
components this app uses. Output was **byte-identical in size** (1,129 kB) — ECharts modules
carry top-level side effects, so the `echarts/charts` barrel cannot be shaken. The change was
reverted: it added a manual registration list to maintain and a real risk of a missing chart
type at runtime, in exchange for no measurable gain. The remaining lever is lazy-loading the
`charts` chunk, which needs a UX decision about when the chart should appear.

## Still open

**B1–B7** — Remaining prose drift in `README.md` / `PERFORMANCE.md` beyond the counts and
intervals corrected above.
**C1** — ~60 MB of un-optimised `public/report-assets/*.png`, a 4.6 MB MP3, 32 SFX.
**D2** — All reads still serialise through one promise queue in `src/data/duckdb.ts`; a small
pool or a dedicated read connection is the largest remaining latency win.
**D5/D6** — `writeState` is still synchronous on every mutation; ~20 components still take a
whole-slice subscription.
**D8** — CSS is one 674 kB bundle.
**E11** — Not a defect: `COUNT(x)` and `AVG(x)` agree on population (both ignore NULLs), so
the derived sample size is correct. Documented rather than changed.
