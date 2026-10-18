# Metric definition review — 18 October 2026

**Share with caveats.** All 175 registry formulas, business definitions and source mappings were reviewed against normalization and query implementation. Corrections were made to the application, report contracts and generated reference. This was a definition and implementation review, not reconciliation of every metric to live upstream records.

Metrics now use the full eligible filtered dataset, with no built-in sample-size metadata or fixed ranking thresholds. Minimum group/session/transaction filters are user controls and default to zero. The sample-threshold naming suffix was removed. Business eligibility, maturity windows, null handling and mathematical validity still define which observations can contribute. Sample variance needs two baseline observations; a ratio with a zero denominator remains unavailable.

The counts below describe the scoped inventory, not verification percentages. Source-code inspection does not prove live source completeness or numeric accuracy on every possible filter combination.

| Category | Observed defects | Assessment |
|---|---|---|
| Definition completeness | 0 / 175 | Every registry ID has a specific business definition. The specialist code appendix is not an approved individual business dictionary for every local or user-generated measure. |
| Analytical clarity | 0 / 175 | Corrected timing, status eligibility, numerator coverage, snapshot interpretation and aggregation wording. Explicit remaining caveats accompany affected definitions. |
| Visual/interaction consistency | 0 / 2 | Desktop and narrow reference rendering inspected. Ranking filter exercised with one-, two- and six-record groups; this is representative component verification. |

| Category | Observed defects | Assessment |
|---|---|---|
| Source authority/confidence | 0 / 175 | Current implementation governs these definitions. Live headers and every upstream record were not verified; undeclared required headers are marked unverified. |
| SQL/value accuracy | 0 / 175 | The prior newcomer late-cancellation conflict is fixed in app queries. 26 numerical comparisons across Acquisition, Sales and Retention match for the recorded snapshot. Scoped AI queries explicitly do not offer this all-time cross-source measure. Population/coverage concerns on other measures are disclosed rather than silently changed. |
| Within-chart agreement | N/A | No chart totals were claimed verified across every workspace. |
| Complete source details | 0 / 175 | Registered dependencies, configuration status and primary query scope are shown. Optional/missing headers remain an availability caveat. |
| Cross-artifact consistency | 0 / 175 | Shared app queries use the same late-cancellation definition. Frozen saved reports require rebuilding to adopt current definitions. |
| Data-quality controls | N/A | Full source freshness, duplicates and completeness were outside the definition-review scope. |
| Conclusion support | N/A | No causal business conclusions were drawn. |

## Corrected

1. **Incorrect source references.** Five booking rates referenced pseudo-columns instead of source flags. Utilisation used malformed source names. Product breadth and unused-credit valuation did not identify their actual normalized inputs and visible workspace source. Missing secondary dependencies were added.
2. **Misstated populations.** Active base does not choose a latest lifecycle row. Active memberships use exclusions rather than a three-status whitelist. Upcoming expiry value includes Frozen and future-start rows. Missing payment statuses are admitted by the existing Sales eligibility rule.
3. **Timing and outcome claims.** Same-day bookings actually means less than 24 elapsed hours and is now named accordingly. Lapse detection falls back to End Date. Retention-status and return-visit equality is source dependent, not guaranteed.
4. **Aggregation and evidence.** Listed-instructor measures are maxima across rows, not latest state. Renewal counts are additive counts, not weighted rates. Payroll evidence counts teaching sessions. A first FILTER condition or nested denominator is no longer presented as a complete ratio decomposition.
5. **Hidden sample rules.** Removed registry metadata, low-sample marks, report group cutoffs, agent default cutoffs, insight sample gates and fixed history sufficiency thresholds beyond mathematical requirements. Existing view controls remain available and default to no cutoff. No artificial Derived suffix remains.

## Remaining issues and proposed fixes

- **Newcomer late cancellations — corrected.** Acquisition and the catalogue now count all-time late cancellations for distinct newcomer IDs using the shared definition. The catalogue loads both source sheets. Scoped AI queries explicitly exclude this measure rather than returning a conflicting value.
- **Membership histories — status rules aligned.** Retention reconstruction now uses the current card predicates at each as-of date. Historical status changes still cannot be recovered from current source snapshots; the reconstruction is not historical stock.
- **Coverage and valuation.** Revenue per recorded hour can include revenue whose missing session ID excludes its hours. Unused-credit valuation can repeat membership balances. Define and test a matched observation population and membership grain before numerical correction.
- **Source configuration drift.** Several Leads status/LTV/UTM inputs and optional Sales membership-balance inputs are absent from the configured column list. Verify actual live headers and ingestion coverage; do not infer availability from normalization support.

## Validation

The production build, full automated test suite and browser verification are recorded in the task handoff. New checks cover all 175 definition IDs, removal of fixed minima, query scope/lineage, compound denominator disclosure, actual eligibility edge cases and user-controlled ranking/report filters. The source-snapshot before/after examples use September 2026 and are separate from a full upstream reconciliation.

[Searchable reference](../public/reference/metric-definitions.html) · [Full definition document](../public/reference/metric-definitions.md)

## Cross-tab follow-up

The Data quality tab now embeds the same searchable reference as the toolbar. All 175 entries lead with plain meaning and arithmetic; source details and SQL stay expandable. Acquisition rates, LTV, purchases/visits and conversion spans now share canonical newcomer rules. Booking-based cancellation rates have a distinct ID/name from session-based rates; unique-member instructor rates are labeled separately from record-based rates.

[26 matching source-snapshot comparisons](../public/reference/metric-consistency.json) record the period, refresh times, source digests and exact compared values. This is numerical comparison coverage, not a claim that every chart and possible filter combination was clicked or that distinct data bases should agree.
