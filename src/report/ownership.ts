import { unsupportedReportMetrics } from "./policy";
import { chapters, type ChapterSpec } from "./chapters";
import { metrics } from "../semantics/metrics";
import { metricTable } from "../semantics/catalogue";
import { renewalMeasures } from "../data/renewals";

/**
 * Every measure is reported in exactly one chapter per population, so a figure
 * never appears twice in a report. Chapters that read the same population
 * (Schedule, Instructors and Formats all read Sessions) would otherwise repeat
 * attendance, fill and yield in each. Chapters on different populations
 * (Sessions versus Recurring, Leads versus Website leads) legitimately show
 * similarly named measures, because the numbers are different.
 */
const HOME_FIRST = ["sessions"];
const NEVER_OWN = new Set(["executive-summary", "recommendations", "predictions"]);

/** Chapters reading the same rows share a key. */
export const populationKey = (spec: ChapterSpec) =>
  `${spec.renewal ? "renewal" : spec.source}${spec.website ? "+website" : ""}${spec.network ? "+network" : ""}`;

/** The registry table a chapter's app tab reads; recurring chapters reuse the Sessions measures on lifetime facts. */
const tabSource = (spec: ChapterSpec) => (spec.source === "recurring" ? "sessions" : spec.source);

/** Everything the app tab's month-on-month table lists for this chapter's source. */
export function tabMetricIds(spec: ChapterSpec): string[] {
  if (spec.derived || NEVER_OWN.has(spec.id)) return [];
  if (spec.renewal) return Object.keys(renewalMeasures);
  const source = tabSource(spec);
  return Object.keys(metrics).filter(id => id !== "records" && !(spec.source === "recurring" && id === "draw_premium_pp") && metricTable(id) === source
    && (spec.website ? id.startsWith("website_") : !id.startsWith("website_"))).map(id => spec.source === "recurring" && id === "sessions" ? "recurring_sessions" : id);
}

const explicit = (spec: ChapterSpec) => [...new Set([...spec.metrics, ...spec.history, ...spec.groups.flatMap(g => g.columns)])];

/** The chapter that is the home of a population: the one that reports its complete tab. */
export function homeChapter(spec: ChapterSpec): ChapterSpec {
  const same = chapters.filter(c => !NEVER_OWN.has(c.id) && !c.derived && populationKey(c) === populationKey(spec));
  return [...same].sort((a, b) => {
    const rank = (c: ChapterSpec) => HOME_FIRST.includes(c.id) ? 0 : 1;
    return rank(a) - rank(b);
  })[0] ?? spec;
}

/**
 * The measures this chapter reports in its register, month-on-month table and
 * metric cards. A home chapter reports its whole app tab; a sibling reports
 * only what the home does not.
 */
export function ownedMetricIds(spec: ChapterSpec): string[] {
  if (spec.derived || NEVER_OWN.has(spec.id)) return [];
  const home = homeChapter(spec);
  const homeSet = new Set([...tabMetricIds(home), ...explicit(home)]);
  const mine = home.id === spec.id ? [...tabMetricIds(spec), ...explicit(spec)] : explicit(spec).filter(id => !homeSet.has(id));
  return [...new Set(mine)].filter(id=>!unsupportedReportMetrics.has(id));
}

/** True when another chapter of the same population reports this measure. */
export const reportedElsewhere = (spec: ChapterSpec, id: string) => !spec.derived && !NEVER_OWN.has(spec.id) && !ownedMetricIds(spec).includes(id);

/** Where a measure is reported, for the pointer a sibling chapter shows. */
export function ownerOf(spec: ChapterSpec, id: string): ChapterSpec | undefined {
  const home = homeChapter(spec);
  return home.id !== spec.id && ownedMetricIds(home).includes(id) ? home : undefined;
}
