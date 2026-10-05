# Atlas performance and verification

Measured locally against real workbook data on 5 October 2026. Results are environment-specific, with reduced motion enabled. No generated business records were used.

## Startup

| Scenario | Measured time | Qualification |
|---|---:|---|
| Empty browser profile, saved server source snapshots | 3.70s | Reads only Sessions and New; includes engine startup and normalisation |
| Reload in the same browser profile | 1.40s | Uses IndexedDB Parquet snapshots |
| Existing verification profile | 1.34s | The legacy JSON field is named coldInteractiveMs; this was a persistent profile, not a fresh Google-only load |
| First contentful paint in full-workspace run | 348ms | Browser paint timing |

A previous full-source Google-backed run recorded 154.18s to become interactive. It is not directly comparable to the saved-data scenarios above. The new loader opens only the active workspace's dependencies and exposes old snapshots with explicit timestamps while refreshing. A completely uncached live load still depends on upstream Google latency and has not been rebenchmarked here.

## Original budget assessment

| Budget | Result | Assessment |
|---|---|---|
| First contentful paint <1.2s | 348ms | Met in recorded run |
| Overview interactive <2.5s | Empty browser 3698ms; reload 1398ms | Reload met; empty-browser saved-data load exceeds budget |
| Tab switch <250ms | Median 244ms; sampled p95 579ms; maximum 6126ms; 24/48 below 250ms | Not consistently met; source loading and background ingestion can delay first visits |
| Filter apply <400ms | Scoped operator flow verified, timing not isolated | Not established |
| Sort 10k rows <120ms | Scoped table sort verified, 10k-row case not measured | Not established |
| Row expand <100ms | 58ms | Met in one recorded expansion |
| Chart re-render <200ms | Functional rendering verified, timing not isolated | Not established |
| Peak memory <400MB | Main-thread heap 25MB initially, 111MB after workspaces | Whole-worker/process peak not established |

Tab timings include browser navigation and readiness checks. These are a small set of observations, not a controlled production latency distribution. Larger sources still take time on first ingestion; the build also reports a large chart chunk. These are remaining performance limits, not acceptance claims.

## Verified behaviour

- All 12 workspaces captured at 1600px and 1280px in Matte and Gloss: 48 screenshots, zero captured browser errors.
- Initial Overview requested exactly Sessions and New; other sources load on demand.
- Retention lists generated from actual membership, newcomer and attended-checkin records: 130 members · 1–25 shown, 422 members · 1–25 shown, 301 members · 1–25 shown, 82 members · 1–25 shown. Counts depend on current source snapshots and scope.
- Member source fields opened from their recorded snapshot version; filtered worklist CSV downloaded.
- Follow-up UI saved, reopened, routed a member concern and closed it after an outcome. These writes used isolated browser test state; real member notes were not changed.
- API tests independently verified on-disk persistence through a new route/server instance, revision history, concurrent saves and closure validation, using temporary files.
- Failed refresh retained displayed metrics and exposed retry. A source failure without any saved snapshot rendered unavailable state and no metric cards.
- SQL edge cases returned effective attendance 0.5 despite overlapping adverse flags, attended complimentary share 1/3, and membership utilisation 0.7 while excluding invalid entitlement balances.
- Production build passes; 14 unit/API tests pass.

Evidence: `PERFORMANCE.json`, `UPGRADES-VERIFICATION.json`, `screenshots/`, `tests/`.

The dev server remains at http://localhost:5174. Follow-up data persists in `.floor/retention-followups.json`, independently of analytical `.cache/` files. Back up that directory for operational use. Source defects such as net-of-VAT exceeding gross and damaged duration remain explicitly flagged; no upstream workbook values were silently changed.

## Atlas verification scope

The startup numbers above describe earlier local runs and are historical, not new Atlas timing guarantees. The Atlas browser check covers eight themes, relative periods, studio filters, independent monthly history, renewal cohort reconciliation, late-cancellation counts, a viewport-contained metric-definition portal, chart controls, persisted page preferences and the floating assistant. Query ingestion now uses batched NDJSON, one native DuckDB thread, a 384 MB engine limit and a disk spill directory. A real September bookings query succeeds with 6,241 rows and 718 late cancellations; raw data stays excluded from Git. API calls and Supabase writes are exercised with offline adapters in tests; live provider authentication and database connectivity require credentials.
