import { metricSQL, metrics, type QueryContext } from "../semantics/metrics";

export const WEBSITE = "Website";
// Exact source equality: Website Form and other Website-prefixed sources are
// separate sources. Always apply this, even if source coverage is missing.
export const websitePredicate = "lower(trim(source))='website'";
export const trialPredicate = "lower(trim(COALESCE(trial_status,'')))='trial completed'";
export const memberPredicate = "lower(trim(COALESCE(conversion,'')))='converted'";
export const retainedPredicate = "lower(trim(COALESCE(retention,'')))='retained'";
export const marketingMeasures = `COUNT(*) AS leads,
  COUNT(*) FILTER (WHERE touches>0) AS contacted,
  COUNT(*) FILTER (WHERE ${trialPredicate}) AS trials,
  COUNT(*) FILTER (WHERE ${memberPredicate}) AS members,
  COUNT(*) FILTER (WHERE ${trialPredicate} AND ${memberPredicate}) AS trial_members,
  COUNT(*) FILTER (WHERE ${retainedPredicate}) AS retained,
  AVG(touches) AS touches,
  AVG(response_hours) FILTER (WHERE response_hours>=0) AS response_hours,
  AVG(ltv) FILTER (WHERE ${memberPredicate} AND ltv>0) AS ltv_per_member`;

export function websiteScope(scope: string) {
  return `${scope}${scope ? " AND " : " WHERE "}${websitePredicate}`;
}

// The general Leads workspace reports current stages. Marketing reports
// recorded outcomes for the creation-date cohort, consistently in every table.
export function marketingMetricSQL(ids: string[], ctx: QueryContext) {
  const overrides = new Set(["trials_completed", "converted_leads", "lead_conversion_rate", "untouched_leads", "open_leads", "pipeline_value"]);
  return ids.map(id => {
    if (!overrides.has(id)) return metricSQL([id], ctx);
    const expression = metrics[id].sql(ctx)
      .replaceAll("lower(trim(stage))='trial completed'", trialPredicate)
      .replaceAll("lower(trim(stage))='membership sold'", memberPredicate)
      .replaceAll("lower(trim(COALESCE(stage,'')))<>'membership sold'", `NOT (${memberPredicate})`);
    return `${expression} AS "${id}"`;
  }).join(", ");
}

export interface MarketingDimension { label: string; sql: string }
const tag = (field: string) => `CASE WHEN ${field} LIKE 'Expired or Invalid%' THEN 'Attribution unavailable' ELSE COALESCE(NULLIF(NULLIF(trim(${field}),'-'),''),'Not tagged') END`;
export const leadDimensions: Record<string, MarketingDimension> = {
  acquisition_channel: { label: "Acquisition channel", sql: "COALESCE(acquisition_channel,'Other / unassigned')" },
  source: { label: "Lead source", sql: tag("source") },
  month: { label: "Creation month", sql: "COALESCE(month,'Unknown date')" },
  date: { label: "Creation date", sql: "COALESCE(date,'Unknown date')" },
  utm_campaign: { label: "UTM campaign", sql: tag("utm_campaign") },
  utm_source: { label: "UTM source", sql: tag("utm_source") },
  utm_medium: { label: "UTM medium", sql: tag("utm_medium") },
  utm_content: { label: "UTM content", sql: tag("utm_content") },
  location: { label: "Studio", sql: "COALESCE(location,'Unknown studio')" },
  format: { label: "Signature experience", sql: tag("format") },
  associate: { label: "Associate", sql: tag("associate") },
  stage: { label: "Lead stage", sql: tag("stage") },
  status: { label: "Lead status", sql: tag("status") },
  trial_status: { label: "Trial status", sql: tag("trial_status") },
  conversion: { label: "Conversion status", sql: tag("conversion") },
  retention: { label: "Retention status", sql: tag("retention") },
  cadence: { label: "Follow-up count", sql: "CASE WHEN touches IS NULL THEN 'Unknown' ELSE CAST(touches AS INTEGER)::VARCHAR || ' follow-ups' END" },
  speed: { label: "First response", sql: "CASE WHEN response_hours IS NULL THEN 'No response date recorded' WHEN response_hours<1 THEN 'Within 1 hour' WHEN response_hours<24 THEN '1–24 hours' WHEN response_hours<72 THEN '1–3 days' ELSE 'Over 3 days' END" },
};
export const metaDimensions: Record<string, MarketingDimension> = {
  campaign: { label: "Campaign", sql: "COALESCE(campaign_name,'Unnamed campaign') || ' [' || COALESCE(campaign_id,'No ID') || ']'" },
  account: { label: "Account", sql: "COALESCE(account_name,'Unnamed account') || ' [' || COALESCE(account_id,'No ID') || ']'" },
  publisher_platform: { label: "Platform", sql: tag("publisher_platform") },
  objective: { label: "Objective", sql: tag("objective") },
  month: { label: "Reporting month", sql: "COALESCE(month,'Unknown date')" },
  date: { label: "Reporting date", sql: "COALESCE(date,'Unknown date')" },
  adset: { label: "Ad set", sql: "CASE WHEN adset_id IS NULL THEN 'Not supplied' ELSE COALESCE(adset_name,'Unnamed ad set') || ' [' || adset_id || ']' END" },
  ad: { label: "Ad", sql: "CASE WHEN ad_id IS NULL THEN 'Not supplied' ELSE COALESCE(ad_name,'Unnamed ad') || ' [' || ad_id || ']' END" },
};
export const websiteKPIs = ["leads", "website_trials", "website_members", "website_win_rate", "website_retained", "response_time_hours", "touches", "website_untouched", "website_open", "website_pipeline_value", "website_contact_rate", "website_trial_rate"];
export const websiteColumns = ["leads", "website_contacted", "website_trials", "website_trial_rate", "website_members", "website_win_rate", "website_trial_win_rate", "website_retained", "response_time_hours", "touches", "website_ltv"];
export const metaKPIs = ["meta_spend", "meta_leads", "meta_cpl", "meta_purchases", "meta_cpa", "meta_roas", "meta_impressions", "meta_clicks", "meta_ctr", "meta_reach", "meta_cpc", "meta_cpm"];
export const metaColumns = ["meta_spend", "meta_impressions", "meta_reach", "meta_clicks", "meta_link_clicks", "meta_ctr", "meta_cpc", "meta_cpm", "meta_leads", "meta_instant_leads", "meta_cpl", "meta_purchases", "meta_purchase_value", "meta_cpa", "meta_roas", "meta_add_to_cart", "meta_checkout"];

export function marketingGroupSQL(source: "leads" | "meta", scope: string, groups: string[], ids: string[], ctx: QueryContext) {
  const dimensions = source === "meta" ? metaDimensions : leadDimensions;
  if (!groups.length || groups.length > 3 || groups.some(g => !dimensions[g]) || new Set(groups).size !== groups.length)
    throw new Error("Choose one to three distinct grouping dimensions.");
  const aliases = groups.map((_,i) => `g${i}`).join(",");
  return `SELECT ${groups.map((g,i) => `${dimensions[g].sql} AS g${i}`).join(",")},${metricSQL(ids,ctx)},COUNT(*) AS n,GROUPING(${aliases}) AS level FROM "${source}"${scope} GROUP BY ROLLUP(${aliases}) HAVING GROUPING(${aliases})<${2**groups.length-1} ORDER BY ${aliases}`;
}

export function marketingContributor(id: string) {
  const filters: Record<string,string> = {
    website_trials: trialPredicate, website_trial_rate: trialPredicate,
    website_members: memberPredicate, website_win_rate: memberPredicate,
    website_trial_members: `(${trialPredicate}) AND (${memberPredicate})`,
    website_trial_win_rate: `(${trialPredicate}) AND (${memberPredicate})`,
    website_retained: retainedPredicate, website_contacted: "touches>0", website_contact_rate: "touches>0",
    website_ltv: `(${memberPredicate}) AND ltv>0`, response_time_hours: "response_hours>=0",
    meta_leads: "meta_leads>0", meta_instant_leads: "on_facebook_lead>0", meta_purchases: "meta_purchases>0",
    meta_spend: "spend IS NOT NULL", meta_impressions: "impressions IS NOT NULL", meta_reach: "reach IS NOT NULL",
    crm_google_leads: "acquisition_channel='Google'", crm_meta_leads: "acquisition_channel='Meta'",
    crm_trials: trialPredicate, crm_members: memberPredicate, crm_win_rate: memberPredicate, crm_retained: retainedPredicate,
  };
  return filters[id];
}
