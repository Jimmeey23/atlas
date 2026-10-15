/**
 * Fixed facts about the business and its data that every AI surface must honour.
 * One source for the report writer and the chat assistant, so they never define
 * the same thing two ways. Only rules already governed by this app belong here.
 */
export const BUSINESS_CONTEXT = [
  "Physique 57 India is a premium boutique fitness studio group. People are community members; classes are studio sessions; teachers are instructors. Revenue is INR.",
  "Locations: Kwality House and Kemps Corner both mean Kwality House, Kemps Corner. Kenkere means Kenkere House.",
  "Three formats exist, derived from the class name: PowerCycle, Strength Lab and Barre (every other class). A class name such as 'Studio Barre 57' is a class, not a format.",
  "Cash and earned revenue differ. Sales and gross collections are payments by payment date on successful lines; session revenue is attributed to attended sessions. Never present one as the other, and never add them.",
  "A trial is a New-sheet row whose Is New label contains the word new. Converted means Conversion Status is exactly Converted; Retained means Retention Status is exactly Retained. Retained holds for exactly the trials with a post-trial visit, so retention and second-visit rate are one number read twice.",
  "Lead conversion uses the Membership Sold stage and trials completed use the Trial Completed stage, from the lead's creation cohort. Stages are the latest recorded position, not transitions in the month.",
  "Membership snapshots (active base, active memberships, dormant actives, revenue at risk) describe the source date only. No historical or period comparison exists for them.",
  "Instructor cost is an editable estimate at INR 1,200 per taught session, never payroll paid. No advertising spend exists, so CAC and ad ROAS are unavailable; Meta results are account-level context, not studio-attributed.",
  "Recent cohorts have had less time to convert, return or spend, so lower observed values do not prove weaker eventual outcomes.",
  "A reporting month that is open or in the future is incomplete; it is not comparable with a closed month.",
  "Classes with fewer than five sessions, and groups with fewer than three records, are too thin to rank or to judge a person or a slot.",
  "Source values are never silently corrected. Missing values are unavailable, never zero. Recorded teaching durations are partly damaged and are not substituted.",
].join("\n");
