/** Exploratory individuals-chart limits. Excludes the selected/latest point from the baseline. */
export function controlLimits(values: (number|null)[], minimum=12) {
  const baseline=values.slice(0,-1).filter((v):v is number=>v!=null&&Number.isFinite(v));
  if(baseline.length<minimum)return null;
  const mean=baseline.reduce((s,v)=>s+v,0)/baseline.length;
  const sd=Math.sqrt(baseline.reduce((s,v)=>s+(v-mean)**2,0)/(baseline.length-1));
  return {mean,lower:mean-3*sd,upper:mean+3*sd,n:baseline.length};
}
