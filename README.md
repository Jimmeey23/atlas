# Atlas

A local, source-backed analytics environment for Physique 57 India. Twelve workspaces cover Overview, Classes, Slots, Trainers, Sales, Acquisition, Retention, Bookings, Leads, Attendance, Payroll and Data health. The application reads the ten supplied tabs; it contains no demo records or generated business numbers.

## Run

```bash
npm install
npm run dev
```

Development starts the frontend on port 5173 and the Sheets gateway on port 8787. If either port is occupied, the server selects the next available port and prints its URL. The frontend API proxy automatically follows the selected gateway port. Set `PORT` for the preferred gateway port and `VITE_PORT` (or `npm run dev -- --port 5175`) for the preferred frontend port. Node 20 or newer is required.

```bash
npm run build
npm run start
```

The production server serves `dist/` and the same API on localhost:8787. This is a local operator application, not a deployed, authenticated multi-user service.

## Google Sheets configuration

The supplied workbooks were publicly readable during implementation. Public read mode is enabled for these configured source IDs only. It requests the named tab and verifies its schema; it rejects mismatches rather than quietly treating the first sheet as the requested source.

Public reads run first. When fetching or parsing a public Sheet fails, the gateway retries through Sheets API v4 using server-only OAuth credentials. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` in `.env` and restart the gateway. The refresh token must grant Sheets read access. These values never enter the browser bundle.

A service account is also supported as an authenticated fallback when OAuth credentials are absent:

1. Enable the Google Sheets API in a Google Cloud project.
2. Create a service account and keep its JSON key outside the repository.
3. Share all seven source workbooks with that service account's `client_email` as a Viewer.
4. Copy `.env.example` to `.env` and set `GOOGLE_APPLICATION_CREDENTIALS` to the key's absolute path.
5. Set `ALLOW_PUBLIC_SHEETS=false` if public reads should be disabled.
6. Restart the gateway.

The gateway fetches workbook metadata, matches titles case-insensitively and reads the matched title's `A:ZZ` range. No unreliable reference gid is used. Credentials remain on the server; no `VITE_*` credential is used. `.env`, `.env.local`, credential files, caches and build outputs are ignored.

Official API documentation: [workbook metadata](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get), [reading ranges](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get). DuckDB ingestion follows its [official browser ingestion APIs](https://duckdb.org/docs/clients/wasm/data_ingestion).

## Refresh and provenance

Sources load on demand for the selected workspace. Overview needs Sessions and New; Retention needs Lapsed, New and Checkins. Data health loads all ten sources, with at most three concurrent reads. Existing disk snapshots or schema-versioned IndexedDB Parquet snapshots appear first, even after their 15-minute freshness window. Old snapshots carry timestamps and an explicit saved-snapshot label while a live refresh runs. The active workspace checks freshness each minute and refreshes sources after the 15-minute window. A failed refresh preserves the last successful snapshot and displays the source error and retry control; unavailable sources do not render fabricated metrics.

Manual refresh reloads the active workspace's dependencies. Data health's Refresh all reloads all ten. DuckDB reads and table replacements share a serial queue; replacements roll back on failure. Original source rows are read from the exact version used by the displayed records. Versioned original snapshots stay in `.cache/snapshots/`; no retention cleanup policy is configured yet.

Original source rows stay in the gateway cache and load on demand for drill details and CSV exports. This avoids keeping hundreds of thousands of duplicate original JSON records in the browser. Workbook positions remain attached to each fact as `source_row`.

Data health exposes source status, header drift, key completeness, original-column completeness, referential integrity, attendance reconciliation, financial anomalies, duplicate identities and corrupted durations.

## Use

- Filters start collapsed. Choose dates, comparison, location, instructor, format, source, membership/category, new/returning, day/time, session type, room size and import handling.
- Drag the grouping chips or change their dropdowns to reorder the drill hierarchy. Expand chevrons, sort headers, resize columns, choose columns and search entities.
- Click a table value or entity to inspect contributing source records. Drill-downs show every original source column in a paginated item-level table, 50 rows per page, with page CSV export and source links to original worksheet rows.
- Chart bars and heatmap cells create visible dashed cross-filter chips. Clear a chip or clear all filters to widen scope.
- Top and bottom lists share a scale and exclude samples below their metric's declared minimum.
- Monthly registers show 14 months, including a prior-year comparison month; missing observations remain unavailable. Switch values, change or index views and click a month to filter.
- Saved views persist locally and sync to Supabase when configured. Four named operating presets provide starting workspaces. Share filters through the URL.
- Payroll's rate slider and Settings change the cost assumption and recompute margins. Settings also edits rule thresholds.
- Retention includes month-on-month expiry cohorts: due, renewed, lapsed, grace and upcoming. Global dates use membership expiry; all global filters apply to worklists. Use “Review 14 months globally” for a longer comparison. Renewal windows and absence thresholds are editable. Source-backed reasons, member IDs, access and actual attendance are available for each member. Renewals focus on paid ongoing access. Personal cadence requires at least three positive attendance gaps over 180 days. Missing IDs are excluded; contacts never merge identities.
- Member follow-ups store owner, status, next date, member-stated contact preference, verbatim concern, action/outcome and separate staff observations. Records and up to 100 revisions persist in `.floor/retention-followups.json`, surviving browser and gateway restarts. Back up `.floor/` separately; clearing analytical `.cache/` does not remove follow-up records. Closed follow-ups leave the default Open list; closure requires an outcome. Closures are tied to their renewal or attendance episode; new access terms and new attendance gaps return to the relevant worklist with previous history preserved. Contact availability does not imply consent, and saving sends no message. This remains a local application without multi-user authentication.
- Source CSV exports preserve source values. Register CSV exports carry filters and cost assumptions. Charts export PNG at 2×. Print/save PDF includes filter context and written insights.

Keyboard: `1`–`9` and `0` change workspaces; `F` filters; `S` signals; `D` density; `T` theme; `C` comparison; `/` or `Cmd/Ctrl+K` search; table arrows expand/collapse and move rows; `Enter` drills; `Space` selects; `Esc` closes. Interactive data has table alternatives. Reduced motion disables transitions.

## Architecture

React 18 + strict TypeScript + Vite; DuckDB-WASM executes SQL in its worker; TanStack Table and Virtual handle grouping and large expansions; visx renders the Pulse; ECharts renders analytical charts; Framer Motion handles the drill sheet; Zustand owns URL-synchronised view state.

- `server/sheets.json`: exact source IDs, titles and expected headers.
- `src/data/normalise.ts`: type, date, null, currency, percentage and identity normalisation.
- `src/data/duckdb.ts`: batched ingestion, SQL execution, result caches and local snapshots.
- `src/data/views.sql`: explicit joins, including validated composite booking identity.
- `src/semantics/registry.json` and `metrics.ts`: single metric registry and SQL definitions.
- `src/data/blueprints.ts`: tab definitions, source, hierarchy and metric selection.
- `src/design/`: the Matte and Gloss materials, density, typography and colour ramps.
- `src/insights/`: declarative evidence thresholds, impact sorting, deduplication and dismissals.

## Add a metric or workspace

Add a metric to `registry.json` with original sheet columns, a SQL expression, format, aggregation, direction and minimum sample. Normalise any required new input once in `normalise.ts` and increment the snapshot schema version. Add its ID to the relevant blueprint. Cards, tables, rankings and monthly registers share that definition.

Add a workspace blueprint with its actual source, ordered hierarchy, KPI IDs, table columns and focused registers. Add its name to the tab registry and any genuinely different chart query to the chart component. Use the shared table, formatting, filter and drill contracts rather than duplicating metric formulas.

## Validation and artifacts

```bash
npm test
npm run build
FLOOR_URL=http://localhost:5174 npm run verify
```

`npm run verify` loads real sources, captures all workspaces at 1600px and 1280px in both themes, exercises the scoped Slots drill journey and writes `PERFORMANCE.json`. Screenshots are in `screenshots/`. `METRICS.md` is the generated implemented dictionary. `DECISIONS.md` records source and design assumptions. `PERFORMANCE.md` reports measured limits, not inferred acceptance from a successful build.

Upgrade verification: `node scripts/verify-upgrades.mjs` checks selected-source loading, snapshot startup, retention worklists, original-row viewing, follow-up interaction, CSV download and failed-refresh recovery. UI follow-up writes use isolated test state; persistence tests use temporary files. Results are in `UPGRADES-VERIFICATION.json`.

## GPT and Supabase workspace

Run `supabase/migrations/20261005000100_studio_intelligence.sql` in your Supabase project SQL editor. Copy `.env.example` to `.env`, replace the placeholders for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`, and restart `npm run dev`. Leave optional `GOOGLE_APPLICATION_CREDENTIALS` unset unless you have a service account file. All secret keys stay in Express; `.env` is ignored. The default GPT model is `gpt-4.1`, configurable with `OPENAI_MODEL`.

The AI workspace uses the [OpenAI Responses API with function tools](https://developers.openai.com/api/docs/guides/function-calling). It can query normalized facts or original Sheets fields (`scoped_raw_<source>`), answer with SQL/freshness evidence, and save requested table, chart, list, summary, recommendation or insight components to any page. Data questions inherit global filters. Saved SQL components refresh from actual source snapshots and can be renamed, moved, edited or deleted. No generated JavaScript or HTML is executed. Queries are read-only, restricted to studio tables and capped at 500 result rows; the agent should aggregate before retrieval.

Supabase stores settings (theme, density, rate, comparison, filters, thresholds, saved views and dismissals), manual/AI insights, components, conversations, explicit agent memory and member follow-ups. Original Sheet snapshots remain in the analytical disk cache; they are queried on demand rather than copied into prompts in full. RLS prevents browser roles accessing the document table; the local server uses the service role. This remains a local application: add user authentication and authorization before sharing the gateway remotely.

Without provider credentials, analytics and local follow-ups continue to work. Cloud saves and GPT show a setup state; the app never pretends a local save is a Supabase save. Existing local follow-ups are retained on disk when cloud storage is activated; migrate them deliberately if you want historical records in the cloud. Live GPT and Supabase execution require configured credentials and are not covered by offline tests.

## Atlas customization and API key management

The top bar provides period shortcuts (Monday-based weeks, calendar months, trailing 30 days and quarters), multi-select studio buttons and eight themes. Last month is the default. Global filters apply across workspaces, source-backed chart queries and agent queries; month-on-month tables always show completed-month history independently of the selected dates while inheriting other filters.

Settings supports page labels, headings, descriptions, accents, section headings/visibility, register columns/grouping/column widths, chart height, font size, radius, content width, motion, chart legends/grid and chatbot size/evidence/history/token controls. Three new light and three new dark themes include glass and soft neumorphic treatments. Preferences save immediately in the browser and sync into the Supabase settings record when connected.

Use Settings → GPT & agent controls to save or remove an OpenAI API key or change the GPT model. Keys are encrypted with AES-256-GCM in `.atlas/provider.enc`, with a separate server master key in `.atlas/master.key`; directory/file permissions are 0700/0600. These files are ignored by Git and are never served to the browser. Keep the entire `.atlas/` directory in a secure server backup to preserve decryptability. An environment key is used when no UI key is saved. The UI reports configuration, not a successful provider authentication check. Configure provider keys from the local workspace; this local build does not provide multi-user administration.

The floating Ask GPT button opens a compact assistant with expandable memory/history, query evidence, destination-page controls and settings. Supabase is required for saved history, memory and components; turning off saved history allows temporary GPT conversations with only a configured OpenAI key. Query results remain backed by the actual cached Sheets. Chart controls provide query data/CSV, zoom, reset and fullscreen; metric definitions render in a viewport-contained portal above the app.

Fresh sessions start with last month; shared URLs and saved views can restore explicit dates. Cloud hydration restores other scope settings without overriding that fresh-session date default.

Verification on 5 October 2026 passed 22 automated tests, the production build, browser UI checks and live Supabase document create/read/update/delete. The configured OpenAI environment key was rejected with HTTP 401; replace it through Ask GPT → Agent settings to enable live GPT. Offline agent tests cover query tools and saved elements using controlled fixtures.

Appearance and page customization live in app Settings. API keys, GPT model, evidence, conversation history and assistant width live exclusively in Ask GPT → Agent settings. Light themes use predominantly white surfaces and high-contrast accents; Ask GPT is anchored on the right. Revenue display uses Indian currency formatting with at most one decimal, including saved AI tables and chart labels. Studio shortcuts use all loaded source locations, and the Atlas mark loops gently with animation and reduced-motion preferences respected.

## Monthly management reports

The Monthly report workspace computes a frozen studio/month snapshot, prior-month and prior-year comparisons, ranked breakdowns and fourteen months of history. Missing historical months remain gaps. A dedicated `/api/reports/narrative` endpoint writes each chapter using structured OpenAI output, without the general chat agent's query shortcuts or scope inference. Chapter analysis is woven into the document as prose around the KPIs, charts and breakdown tables. AI failures are visible and never cached as successful analysis.

Generated reports automatically save immutable versions in the server-only `atlas_store` database table, using the existing `supabase/migrations/20261006000000_atlas_server_store.sql` migration. Supabase URL and service-role credentials must be configured on the server. The saved-report picker lists the latest 50 versions and restores the most recent report when the workspace reopens. Restoring a version retains its original figures and analysis; rebuilding creates a new version. Failed database saves remain visibly unsaved and can be retried.

Download HTML produces a self-contained light document with embedded styling and SVG charts. Export PDF opens the browser print dialog; choose Save as PDF and retain the report's landscape paper settings. Print styling repeats table headers, permits long tables to span pages, wraps column headings and keeps narrative text selectable. Exports omit dashboard controls and do not fetch external fonts or styles.
