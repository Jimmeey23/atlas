# Studio intelligence: answers and saved elements

The chat has two explicit functions. `/api/intelligence/ask` reads data and answers questions; it has no saving tool. `/api/intelligence/build` queries data, validates artifact SQL, and persists requested elements. `/chat` remains compatible with existing insight generation. Conversation history is optional; answering does not require cloud persistence. Saved elements do require it.

Explicit named studios, months, years and supported relative periods replace dashboard scope unless the question asks to retain current filters. Aliases use the same location normalization as the dashboard. Multiple studios and periods are supported. Query tools also accept validated scope overrides for more complex requests. Explicit reporting scopes are pinned to saved artifacts; changing dashboard dates therefore does not change their reporting period.

Simple cash sales questions use a deterministic SQL calculation. GPT comparisons and trends use the governed `query_sales` tool. Both use successful, non-voided payment item rows, exclude imports by default, sum payment values for gross sales, and subtract paired payment VAT for net sales. Missing boolean flags are not equivalent to false and must not become extra exclusion predicates. Missing values or no matching rows are reported as unavailable, not fabricated zeroes. Source snapshots and SQL results are accessible in chat evidence.

## Verified example

For “howmuch sales did kwality house do in april 2026?”, with a conflicting September dashboard scope:

- Gross payments: **₹50,01,387.7**.
- Net payments less VAT: **₹47,64,223.3**.
- 421 eligible sale item rows, with 322 distinct recorded sale IDs. Six rows lack a sale ID, so that count is not a complete transaction count.
- Basis: payment dates April 1–30, 2026, successful and non-voided, imports excluded.
- Source: sales sheet snapshot fetched October 5, 2026, 16:41:07 UTC. An independent original-row sum reconciled to the native query result.

Automated regression tests cover conflicting dates, alias resolution, multiple studios and periods, leap years, gross/net payment totals, null void flags, unknown-data handling, question tool permissions, and validated creation with pinned dates. Live GPT comparison returned the same April totals. Live GPT creation was verified using a temporary database adapter, avoiding test artifacts in the shared cloud workspace. Browser verification covered actual source-backed answering, source result tables, independent Build controls, and mobile positioning.

## Follow-up accuracy changes

Standard KPI questions now use `query_metrics`, which compiles the same registry expressions as the dashboard, validates the source, and supplies calculation definitions alongside the results. It prepares the same distinct-session and membership-balance fields needed by teaching hours and deferred balances. Current snapshot metrics clear historical dates and are explicitly marked as snapshots. Unsupported metrics are reported rather than estimated.

Conversation scope is recovered before a query, including temporary conversations. “What about May?” after the April Kwality House question retains that studio and resolves May 2026. Live GPT verification returned ₹24,28,385.7 gross collections for that follow-up. A separate September 2026 attendance question returned 2,090 visits and 45.4% weighted fill for Kwality House, using the shared attendance and fill-rate definitions.

Business overview now displays gross and net collections from Sales alongside a clearly separate Session revenue card. Its payment pulse uses daily payment dates, while the attendance/yield bridge and session registers are labeled as session attribution. These cash totals reconcile with Revenue & sales for the same filter scope.

Chart tooltips, chart data previews, original-row inspectors and generated/evidence tables use shared numeric formatters. Display precision is limited to one decimal; source data, identifiers and export precision remain intact. Percent series retain percentage formatting and financial series retain currency formatting.
