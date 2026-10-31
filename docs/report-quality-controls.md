# Report release and operational intelligence

New generated reports use one studio/month scope. Rebuild an older report to populate the operational appendix. Imported source documents remain historical evidence; they are not rewritten by the new calculator.

## Release controls

`npm run build` runs the report regression gate before TypeScript and bundling. Generation and the storage API both reject a failed/incomplete narrative. Export additionally checks rendered text for unresolved braces, failed-analysis messages and empty KPI values. Draft figures remain reviewable following a failed run but are not saved as a completed report.

The shared gate reconciles the same metric across equal population keys, current/prior/prior-year totals, group movement bridges and explicit attendance-movement prose. Different populations (sales/check-ins/sessions, network/studio, expiry/purchase cohorts) are not forced to agree. The existing numeric-evidence and independent narrative audits continue to apply; this is not a general natural-language proof checker.

The executive brief requires 3–5 verdicts with meaning, action and owner. Recommendations require an explicit ISO deadline, an impact range or evidence-gap explanation, a leading indicator and a previous-action result (or `Not recorded`). Duplicate actions fail release. Strict narrative schema v5 accepts these fields.

## Evidence contracts

- **Cohorts:** D7/D30/D60 are unavailable until the last date of the entire creation month has the full window. Conversion uses the first recorded post-trial purchase date and a recorded purchase count. Retention independently uses attended return visits in the final seven days of the window. Hosted, referral, trial and paid-first-visit populations remain separate; unknown entry types stay unknown. Rates show Wilson 95% intervals; fewer than 30 members is exploratory. Source coverage must be verified before a zero is interpreted.
- **Lead funnel:** consumes the Leads source. Current recorded trial status supports a labelled current-state funnel; it does not establish timestamped transitions. Converted leads without attendance evidence do not enter the attended→converted count.
- **Member base:** distinct paid member IDs with access at the opening/closing boundaries. Opening + new − churned + reactivated = closing. Logo churn is opening members without closing access / opening members. Reactivation/new status depends on complete historical entitlement coverage. Frequency bands use attended check-ins.
- **Risk:** active paid access and at least 14 days since the last known attended visit. Reuses the application's paid-intervention eligibility helper, excluding complimentary, zero-value, intro and 2-for-1 access. An absent attendance history is unknown.
- **Renewals:** the dashboard expiry cohort uses the current recorded status. Renewed and frozen remain separate; Lapsed is pending until the recorded churn date (or expiry fallback) is at least 30 days old, then lapsed. Due = renewed + lapsed + pending + frozen; the renewal rate is renewed / all due. KRA churn uses a different eligible cohort and excludes frozen, so the rates are not directly interchangeable. These are expiry cohorts, not whole-base logo churn; historical status changes cannot be reconstructed from the current snapshot.
- **Revenue:** canonical successful, non-voided payment scope. Explicit recurring tags are separated from other/unclassified payments. Annual/private exclusion is a disclosed sensitivity, not a claim that these sales are invalid. Discount = discount / (payment + discount). Concentration reports both payment-row grain and sale-ID groups when IDs are complete. Outlier sensitivity uses a common prior-12-month Q3 + 3×IQR threshold (minimum 30 sale-month groups) for both comparison months.
- **GST:** prefer explicit Payment GST/GST fields; retain legacy Payment VAT/Vat compatibility. No assumed rate is applied. A catalogue net-price residual is a control check because catalogue and collected prices may differ in grain.
- **Costs:** instructor payroll / payroll sessions allocated to matching instructor sessions; unknown matches remain unavailable. Slot ranking uses contribution before other studio costs, not fill. This is not fully loaded profit.
- **Demand:** attendance per observed operating day and per session; observed capacities stay format-specific. Other-studio benchmarks use the same format and month.
- **Uncertainty:** Wilson intervals for cohort proportions and exploratory 3-sigma trend limits with at least 12 prior observations, excluding the current point from the baseline. These limits are not seasonality-adjusted causal tests.

## Required evidence still absent from mapped sources

Do not fill these gaps with estimated historical facts:

1. Finance recognition ledger, opening/closing deferred balances and refund/adjustment entries. Session-attributed revenue is an earned proxy; collected minus attributed revenue is not a deferred balance.
2. Verified class-pack/drop-in marginal yield, incremental non-instructor costs, and approved fill targets by format. These are needed for a real break-even size and recoverable seat opportunity. Legacy average-revenue-per-visit valuations are suppressed.
3. Verified festival/closure calendar for seasonality adjustment. Same-month-last-year comparisons remain available; normalization by operating day is not full seasonality adjustment.
4. Lead transition timestamps and stable lead IDs for historical transition conversion rates.
5. Previous action IDs, deadlines and measured outcomes for last-month action review.

Missing inputs are listed in the appendix. Unset targets have Unrated status. No target or owner assignment is represented as approved without evidence.

## Verification

- `npm run check:report`: release failures, numeric reconciliation, censoring, member bridge, payroll contribution and uncertainty.
- `npm test`: shared application and report contracts.
- `node scripts/verify-report-quality.mjs`: isolated browser fixture for front-page verdicts/RAG, grey cohort windows, failed-release rejection and mobile table scrolling. It never calls production storage or OpenAI.

Live-source generation, provider responses, historical source coverage and a production deployment need separate verification. Existing frozen reports are not automatically regenerated.
