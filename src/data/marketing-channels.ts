const google = new Set(["google", "google ads", "googleads", "adwords", "google adwords", "google paid ads"]);
const meta = new Set(["meta", "facebook", "fb", "instagram", "ig", "facebook-instagram", "facebook/instagram", "facebook instagram", "meta ads", "facebook ads", "instagram ads", "paid meta ads (fb/instagram)", "social - instagram", "social - facebook"]);
const clean = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g," ");

/** Explicit channel labels only. 'Website' and 'Social' do not prove an ad channel. */
export function marketingChannel(source: unknown, utmSource: unknown): string {
  const s=clean(source), u=clean(utmSource);
  const utm = google.has(u) ? "Google" : meta.has(u) ? "Meta" : null;
  const origin = google.has(s) ? "Google" : meta.has(s) ? "Meta" : null;
  if(utm && origin && utm!==origin) return "Conflicting channel tags";
  if(utm || origin) return (utm || origin)!;
  if(/referral/.test(s)) return "Referrals";
  if(/hosted|influencer|event|outdoor class/.test(s)) return "Partnerships & events";
  if(/website|abandoned checkout/.test(s)) return "Website · channel unassigned";
  if(/walk.?in|dashboard/.test(s)) return "Direct & walk-in";
  if(/call|sms|whatsapp|message|enquiry on call/.test(s)) return "Calls & messaging";
  if(s==="social"||s==="social media") return "Social · platform unassigned";
  return "Other / unassigned";
}

const sqlQuote = (value: string) => `'${value.replaceAll("'","''")}'`;
export function metaScope(from: string, to: string, selected: Record<string,string>) {
  const terms = [from ? `date>=${sqlQuote(from)}` : "",to ? `date<=${sqlQuote(to)}` : "",...Object.entries(selected).filter(([field,v])=>["account_id","campaign_id","publisher_platform","objective"].includes(field)&&v).map(([field,v])=>`${field}=${sqlQuote(v)}`)].filter(Boolean);
  return terms.length ? " WHERE "+terms.join(" AND ") : "";
}
