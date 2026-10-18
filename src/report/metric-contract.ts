import { businessDefinitions } from "../semantics/metric-business-definitions";
import { definition } from "./definitions";
import { currentSnapshotMetrics, metricNotes } from "../semantics/evidence";

/**
 * Measures the model is most likely to conflate. Each entry names a lookalike
 * and the reason it is a different population or calculation, so the contract
 * says what a metric is NOT as well as what it is.
 */
const NOT_THE_SAME_AS: Record<string, [string, string][]> = {
  revenue: [["gross_revenue", "session revenue is earned, attributed to attended sessions; gross revenue is cash collected on sales"]],
  gross_revenue: [["revenue", "cash collected by payment date, not revenue earned by attendance"], ["net_revenue", "gross includes recorded GST"]],
  net_revenue: [["gross_revenue", "net is payment value less recorded GST"]],
  payroll_revenue: [["revenue", "monthly instructor attribution from Payroll, rounded; not Sessions"]],
  fill_rate: [["booking_fill_rate", "fill counts attendance, booking fill counts reservations"], ["show_up_rate", "show-up divides by booked seats, not capacity"]],
  booking_fill_rate: [["fill_rate", "bookings include no-shows and late cancels"]],
  show_up_rate: [["fill_rate", "denominator is booked seats, not capacity"]],
  avg_class_size_incl: [["avg_class_size_excl", "this one counts empty sessions"]],
  avg_class_size_excl: [["avg_class_size_incl", "this one excludes empty sessions"]],
  lost_revenue: [["revenue", "a what-if at current yield, never lost sales or a forecast"]],
  retention_rate: [["second_visit_rate", "status-based retention and visit-count return rate can agree in a source snapshot but use different columns; verify agreement before claiming equality"]],
  second_visit_rate: [["retention_rate", "visit-count outcome rather than reported Retained status; equality depends on source consistency"]],
  conversion_rate: [["lead_conversion_rate", "this is newcomer-trial conversion; the other is lead-stage conversion on a different population"]],
  lead_conversion_rate: [["conversion_rate", "lead cohort by creation date, not newcomer trials"]],
  active_base: [["active_memberships", "members versus memberships; current cards differ from separately reconstructed access-date histories"]],
  active_memberships: [["active_base", "memberships versus distinct members"]],
  no_show_rate: [["late_cancel_rate", "no-shows exclude late cancellations; both divide by booked seats"]],
  late_cancel_rate: [["no_show_rate", "a late cancel is not a no-show"]],
  lapsed_members: [["churn_rate", "lapsed counts members by expiry period; do not assume the two agree"]],
  meta_leads: [["leads", "Meta-reported conversions are not CRM people; never add them to CRM leads"]],
  meta_roas: [["gross_revenue", "Meta-attributed purchase value, not CRM cash"]],
};

/** What population a measure describes, so a monthly cohort is never read as a snapshot or the reverse. */
function basis(id: string, domain: string, aggregation: string) {
  if (currentSnapshotMetrics.has(id)) return "current snapshot of source rows evaluated relative to the application date; standard card period comparisons are unavailable, and reconstructed workspace history uses a separate method";
  if (id.startsWith("meta_")) return "Meta account reporting, network context; not studio-attributed and not CRM people";
  if (["teacher_dependency", "trainer_depth"].includes(id)) return "maximum row-level value across selected recurring rows; not latest state";
  if (aggregation === "last") return "source-defined snapshot aggregation; see calculation";
  if (domain === "revenue" && id.startsWith("gross")) return "cash collected, by payment date";
  return "selected period";
}

const AGGREGATION: Record<string, string> = {
  sum: "additive across rows and groups",
  weighted: "ratio: recompute numerator ÷ denominator; never average, add or compare it with a mean of group rates",
  avg: "average of records; not additive and sensitive to small samples",
  median: "median of records; not additive",
  last: "latest value; not additive over time",
};

/**
 * One governed line per metric, built from the registry rather than hand-copied,
 * so every one of the registered measures arrives with its formula, direction
 * and aggregation rule. Direction is the part models most often guess wrong:
 * a rising no-show rate is adverse, a rising fill rate is not.
 */
export function metricContract(id: string): string {
  const def = definition(id);
  if (!def) return `${id}: unavailable.`;
  const note = metricNotes[id];
  const formula = String(def.description ?? "").replace(/\s+/g, " ");
  const lookalikes = (NOT_THE_SAME_AS[id] ?? []).filter(([other]) => definition(other));
  return [
    `${id} (${def.label}): ${note?.definition ?? businessDefinitions[id] ?? `Governed calculation ${formula.length > 220 ? formula.slice(0, 217) + "…" : formula}.`}`,
    note?.definition ? `Calculation: ${formula.length > 220 ? formula.slice(0, 217) + "…" : formula}.` : "",
    `Format ${def.format}. Basis: ${basis(id, def.domain, def.aggregation)}. Aggregation: ${["teacher_dependency", "trainer_depth"].includes(id) ? "maximum across scoped rows; not latest state" : AGGREGATION[def.aggregation] ?? def.aggregation}.`,
    `Direction: ${def.higherIsBetter ? "a rise is favourable" : "a rise is ADVERSE (lower is better)"}. Uses the full eligible filtered dataset; any group-size cutoff must be an explicit user filter.`,
    note?.caveat ? `Caveat: ${note.caveat}` : "",
    lookalikes.length ? "Not the same as: " + lookalikes.map(([other, why]) => `${other} (${definition(other)?.label}) — ${why}`).join("; ") + "." : "",
  ].filter(Boolean).join(" ");
}

/** The chapter-level reading rules: which movements are adverse, and which measures rest on too few records. */
export function readingGuide(ids: string[], _n: number): string {
  const known = ids.filter(id => definition(id));
  const adverse = known.filter(id => definition(id)!.higherIsBetter === false);

  return [
    adverse.length ? `Lower is better, so a rise is adverse: ${adverse.map(id => `${id} (${definition(id)!.label})`).join(", ")}. Every other measure here improves when it rises. Never call an adverse rise an improvement.` : "",
  ].filter(Boolean).join("\n");
}
