# Advanced analysis controls

Open **Advanced analysis** beneath the heading of any workspace, or find it in the command palette. The workbench can use any available source without changing the tab’s existing dashboards. Sources load on demand.

| Category | Controls |
| --- | --- |
| Dates | Day/week/month/quarter grain; rolling-day ranges; complete periods; equal elapsed-day comparisons; matching weekdays; custom comparison dates; calendar-month versus elapsed-day conversion/return windows. |
| Filters | Existing searchable multi-selects plus nested AND/OR groups; include/exclude values; numeric ranges; missing/present values; saved presets; global and section-specific scopes. |
| Tables | Reorder columns by dragging or keyboard buttons; resize by dragging or numeric width; pin left/right; multiple sort priorities; searchable column chooser; expandable groups; subtotal toggle; period sparklines; source-recomputed selected-row aggregates. |
| Calculations | Governed metrics and weighted rates; raw count/distinct/sum/median/average; additive share of total; source-recomputed cumulative values; percentage-point and relative change; per-session/per-member normalization. |
| Charts | Trends, columns, heatmaps and denominator scatterplots; multi-point selections; date brushes; zoom; comparison overlays; count/rate metric shortcuts; denominators; inspection through the corresponding table value. |
| Navigation | Back/undo and forward/redo for scope/navigation; drill-down breadcrumbs; section-only reset; command palette; recent analyses; saved analyses; analysis links preserving non-identifying scopes. |
| Exports | Visible analytical page, all filtered analytical rows, all filtered source records, or a complete analysis JSON including totals, comparisons, scope, definitions and refresh metadata. |

Global advanced conditions also apply to AI query scopes. Legacy charts keep their existing controls; chart reset now resets its own view without clearing global cross-filters. Existing tables remain available; the complete advanced table toolset is in the shared workbench.

## Calculation boundaries

- Aggregates, weighted rates, cumulative prefixes and combined row selections are calculated from source facts. Overlapping member IDs are not added from subgroup distinct counts.
- Matching-weekday and elapsed comparisons rebase observations onto the current time axis before grouping, including ranges crossing month boundaries.
- Current snapshot metrics cannot be presented as historical series. Payroll only supports monthly or quarterly grain.
- Shares and per-unit normalization reject incompatible rate/median calculations. Missing fields and zero denominators are unavailable rather than invented values.
- Timed outcomes use mature newcomer records and observed source coverage. Missing visit coverage is unavailable. Known conversions missing purchase dates are unavailable in timed conversion rates. Return analysis needs member identifiers.
- Subtotals are suppressed during text search; selected-row aggregation recalculates the searched population.
- Table search, sorting, visibility and pagination are presentation controls. “All filtered analytical rows” exports the complete queried population; “visible page” exports displayed leaf rows. Source-record export is distinct from either.
- Full source-record export has no hidden row limit. Large populations can require additional browser memory.
- Presets, recent analyses, saved analyses and table layouts persist in this browser. Share links rerun the saved query against the recipient’s available current sources; they are not immutable data snapshots.

## Verification

Regression coverage includes nested-filter validation and quoting, complete-period boundaries, comparison alignment, source-recomputed weighted rates/distinct selections, timed cohort eligibility, missing coverage, and export provenance/formula protection. Live Sales checks reconcile the workbench total and selected-row total with dashboard collections, and exercise grouped rows and subtotal controls.
