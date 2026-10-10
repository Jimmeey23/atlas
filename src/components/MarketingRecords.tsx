import { DropdownField } from "./ui/DropdownField";
import { useMemo, useState } from "react";
import { query, quote } from "../data/duckdb";
import { marketingDimensionOptions, websiteColumns, metaColumns } from "../data/performance-marketing";
import { useGroupFields } from "../data/group-registry";
import { fmt, formatField } from "../semantics/formats";
import { exportCSV } from "./exports";
import type { TreeRow } from "./NestedTable";
import { marketingDrill, MarketingStatus, MarketingTable, useMarketingRows } from "./MarketingAnalytics";

const leadFields = [
  ["date","Created"], ["member","Community member"], ["member_id","Member ID"], ["email","Email"], ["phone","Phone"],
  ["location","Studio"], ["format","Signature experience"], ["utm_campaign","Campaign"], ["utm_source","UTM source"], ["utm_medium","Medium"],
  ["stage","Stage"], ["status","Status"], ["trial_status","Trial"], ["conversion","Conversion"], ["retention","Retention"],
  ["touches","Follow-ups"], ["response_hours","First response (h)"], ["visits","Visits"], ["purchases","Purchases"], ["ltv","LTV"], ["newcomer_purchase_journey","Latest newcomer purchase journey"], ["associate","Associate"],
];
const metaFields = [
  ["date","Reporting date"], ["account_name","Account"], ["account_id","Account ID"], ["campaign_name","Campaign"], ["campaign_id","Campaign ID"],
  ["objective","Objective"], ["publisher_platform","Platform"], ["adset_name","Ad set"], ["adset_id","Ad set ID"], ["ad_name","Ad"], ["ad_id","Ad ID"],
  ["spend","Spend"], ["impressions","Impressions"], ["reach","Row reach"], ["clicks","Clicks"], ["inline_link_clicks","Link clicks"],
  ["meta_leads","Meta leads"], ["on_facebook_lead","On-Facebook leads"], ["meta_purchases","Purchases"], ["purchase_value","Purchase value"],
  ["add_to_cart","Add to cart"], ["initiate_checkout","Checkout initiated"],
];

export function MarketingRecords({ source, scope, version, onDrill }: {
  source: "leads" | "meta"; scope: string; version: string | number; onDrill: (entry: TreeRow) => void;
}) {
  const [search,setSearch] = useState("");
  const [group,setGroup] = useState("");
  const [page,setPage] = useState(0);
  const [exporting,setExporting] = useState(false);
  const [exportError,setExportError] = useState("");
  const registry = useGroupFields(source, group ? [group] : []);
  const dimensions = useMemo(() => marketingDimensionOptions(source, registry), [source, registry]);
  const fields = source === "meta" ? metaFields : leadFields;
  const ids = source === "meta" ? metaColumns : websiteColumns;
  const needle = search.trim().toLowerCase();
  // Search all matching records before pagination, never only the loaded page.
  const searchFields = source === "meta" ? ["account_name","campaign_name","campaign_id","adset_name","ad_name","publisher_platform","objective"] : ["member","email","phone","member_id","utm_campaign","stage","status","location","associate"];
  const filteredScope = scope + (needle ? `${scope ? " AND " : " WHERE "}(${searchFields.map(f=>`contains(lower(COALESCE(${f},'')),${quote(needle)})`).join(" OR ")})` : "");
  const pageKey = `${filteredScope}:${version}`;
  const [lastPageKey,setLastPageKey] = useState(pageKey);
  // Reset pagination synchronously when a different source scope is selected.
  if (lastPageKey!==pageKey) { setLastPageKey(pageKey); setPage(0); }
  const recordFacts = source==="meta" ? `"meta"${filteredScope}` : `(SELECT l.*,n.purchase_journey AS newcomer_purchase_journey FROM (SELECT * FROM leads${filteredScope}) l LEFT JOIN (SELECT member_id,purchase_journey FROM "new" WHERE member_id IS NOT NULL AND trim(member_id) NOT IN ('','-') QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id ORDER BY date DESC,source_row DESC)=1) n ON l.member_id=n.member_id) records`;
  const data = useMarketingRows(`SELECT * FROM ${recordFacts} ORDER BY date DESC,source_row DESC LIMIT 50 OFFSET ${page*50}`,version,!group);
  const count = useMarketingRows(`SELECT COUNT(*) AS n FROM "${source}"${filteredScope}`,version,!group);
  const total = Number(count.rows[0]?.n || 0);
  async function exportRecords() {
    setExporting(true); setExportError("");
    try {
      const rows = await query(`SELECT ${fields.map(([key])=>`"${key}"`).join(",")},source_row FROM ${recordFacts} ORDER BY date DESC,source_row DESC`);
      exportCSV(`marketing-${source}-records`,rows,filteredScope || "All source records");
    } catch(e) { setExportError(String(e)); } finally { setExporting(false); }
  }
  return <div data-marketing-records={source}>
    <div className="pm-controls">
      <label>Search <input aria-label={`Search ${source} records`} value={search} onChange={e=>setSearch(e.target.value)} placeholder={source==="meta"?"Campaign, ID, platform…":"Name, email, campaign, stage…"}/></label>
      <label>Group records <DropdownField aria-label={`Group ${source} records`} value={group} onChange={e=>setGroup(e.target.value)}><option value="">Individual source records</option>{dimensions.map(d=><option key={d.field} value={d.field}>{d.label}</option>)}</DropdownField></label>
      {!group && <button className="button" disabled={exporting||data.loading||!total} onClick={()=>void exportRecords()}>{exporting ? "Exporting…" : `Export all ${total.toLocaleString("en-IN")} matching records`}</button>}
    </div>
    {exportError && <p role="alert">{exportError}</p>}
    {group ? <MarketingTable key={group} title={`${source} records`} source={source} scope={filteredScope} initialGroups={[group]} storageKey={`marketing:${source}:records:${group}`} ids={ids} version={version} onDrill={onDrill}/> : <>
      <MarketingStatus loading={data.loading||count.loading} error={data.error||count.error} empty={!total}/>
      {!data.loading && data.rows.length>0 && <div className="pm-table table-scroll"><table><thead><tr><th>Details</th>{fields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead>
        <tbody>{data.rows.map(row=><tr key={String(row.source_row)}><td><button className="pm-cell" aria-label={`Inspect ${source} source row ${row.source_row}`} onClick={()=>onDrill(marketingDrill(source,filteredScope,source==="meta"?`${row.campaign_name} · ${row.date}`:`${row.member} · ${row.date}`,source==="meta"?["meta_spend","meta_leads","meta_cpl","meta_purchases"]:["leads","website_trials","website_members","website_retained"],`source_row=${Number(row.source_row)}`))}>Open</button></td>{fields.map(([key])=><td className="pm-wrap" title={String(row[key]??"")} key={key}>{["spend","purchase_value","ltv"].includes(key) ? fmt("revenue",row[key]) : key==="response_hours" ? fmt("touches",row[key]) : formatField(key,row[key])}</td>)}</tr>)}</tbody>
      </table></div>}
      <div className="pm-controls pm-pagination"><span>{total ? `${page*50+1}–${Math.min(total,(page+1)*50)} of ${total.toLocaleString("en-IN")} matching source records` : "0 matching records"}</span><button className="button" disabled={!page||data.loading} onClick={()=>setPage(p=>p-1)}>Previous</button><button className="button" disabled={(page+1)*50>=total||data.loading} onClick={()=>setPage(p=>p+1)}>Next</button></div>
      {source==="leads" && <p className="pm-note">Purchase journey joins the latest newcomer record by known member ID. It does not change the lead's recorded conversion status.</p>}
    </>}
  </div>;
}
