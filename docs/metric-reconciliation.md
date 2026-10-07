# Metric reconciliation — 5 October 2026

Scope: the saved source-sheet snapshots in `.cache`, with September 2026 as the control period. These checks establish calculations against those snapshots; they do not establish fresh upstream data or independent business-policy approval.

| Verified defect | Affected views | Correction |
| --- | --- | --- |
| Sales price excluding VAT was repeated at sale grain and summed as collected net | Sales KPI, register, charts, monthly table | Collected payment value minus payment VAT on the same lines |
| Sale-level discounts repeated on individual item rows | Sales discount metrics and scorecards | Unit item discount × quantity |
| Unattended rows inflated attributed attendance revenue | Attendance revenue, revenue per check-in, monthly table | Include checked-in rows in both numerator and denominator |
| Calendar-month cards compared to an equal-length day window rather than the previous whole month | KPI comparisons across tabs | Whole months compare to whole months; arbitrary ranges retain equal-length comparison |
| Some acquisition measures mixed newcomers with other first-visit records | Acquisition retention, LTV and purchase metrics | Use explicit newcomer populations; paid-purchase averages and ratios use the same converted paid cohort |
| Enquiries pipeline estimates depended on whether New had previously loaded | Enquiries | Load the dependent New source and apply the same scope to the purchase-value estimate |
| Membership balance repeated across payment rows | Deferred balance | Count each membership balance once within the selected sale cohort |
| Instructor filtering removed other instructors from the slot baseline | Instructor draw premium | Compute the slot baseline before narrowing to the selected instructor |
| Time strings and one studio's spelling differed across sheets | Global time/location filters | Canonical clock values and consistent studio identity |
| Teaching duration repeated on attendee rows | Recorded teaching hours and revenue per hour | Count valid attended session duration once; retain unavailable damaged durations |
| Current active/expiry measures were restricted to a historic expiry cohort | Retention KPI cards | Current snapshot scope across all dates, clearly labeled and without historical comparisons |
| Overlapping booking flags were stacked as independent outcomes | Booking chart | One outcome per booking with precedence late cancellation, cancellation, no-show, attended, pending |
| Acquisition funnel implied that retained members were a subset of converted members | Acquisition chart | Show the overlapping reported outcomes as separate bars |
| Non-cartesian charts received Cartesian axis settings and crashed | Enquiries chart | Apply axis preferences only to Cartesian charts |

## September control totals

| Basis | Reconciled result |
| --- | ---: |
| Sessions | 860 |
| Attendees — Sessions and attended Check-ins | 4,653 |
| Available seats | 10,925 |
| Weighted fill | 42.6% |
| Earned revenue and attended check-in revenue | ₹40,54,923.3 |
| Payroll's rounded monthly attributed revenue | ₹40,54,927 |
| Successful non-voided cash collection | ₹59,54,184.9 |
| Payment VAT | ₹2,84,261 |
| Collected net of VAT | ₹56,69,924 |
| Item-level discounts | ₹5,20,468.8 |
| Discount rate | 8.0% |
| Newcomers | 387 |
| Converted newcomers | 42 |
| Trial conversion | 10.9% |

Cash revenue belongs to payment dates; attributed earned revenue belongs to session dates. These different bases should not be forced to equal one another. Payroll reports whole monthly totals with rounded amounts; partial-month selections include the corresponding payroll months. Retention registers use expiry cohorts; current-stock cards explicitly use the latest snapshot instead. Current membership balances and lifecycle statuses do not provide historical stock balances. Source duration damage remains unavailable. Opportunity and pipeline values remain labeled estimates.

Metric-card drill-downs now use the card's own source and population, including newcomer cohorts and current active-access snapshots. Older browser snapshots are invalidated after normalization changes.

Regression coverage is in `tests/metric-reconciliation.test.ts`. Rendered verification covers source-backed KPI totals, calendar comparison dates, calculation evidence, source row drill-downs, and the single-row filter layout at desktop/mobile sizes.
