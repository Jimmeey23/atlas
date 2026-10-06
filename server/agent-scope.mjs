import { relativePeriod } from '../src/data/periods.ts';
import { canonicalLocation } from '../src/data/normalise.ts';
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
export function resolveQuestionScope(message, dashboard = {}, history = []) {
  const previousUser = [...history].reverse().find(m => m.role === 'user' && typeof m.content === 'string');
  const previousAssistant = [...history].reverse().find(m => m.role === 'assistant' && m.scope);
  const followup = /^(?:and\b|what about\b|how about\b|same\b|also\b)|\b(that studio|same studio|there|net of vat)\b/i.test(message.trim());
  const prior = previousAssistant?.scope || (previousUser ? resolveQuestionScope(previousUser.content,dashboard).filters : dashboard);
  if (followup) dashboard = {...prior};
  const periods = [...message.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*,?\s*(20\d{2})?\b/gi)];
  const studios = [...message.matchAll(/\b(kwality(?:\s+house)?|kemps(?:\s+corner)?|kenkere(?:\s+house)?|plash(?:\s+pilates)?|(?:the studio by )?copper\s*(?:\+|and)\s*cloves|(?:supreme(?:\s+hq)?[,\s]*)?bandra|pop[ -]?up)\b/gi)];
  // Named periods/studios describe an independent question, unless the user explicitly retains the dashboard scope.
  const relative = message.match(/\b(this|last)\s+(month|week|quarter|year)\b/i);
  const yearOnly = !periods.length && message.match(/\b(?:in|for|during)\s+(20\d{2})\b/i);
  const explicit = !!(periods.length || studios.length || relative || yearOnly);
  const retain = /\b(current|dashboard|selected|filtered)\s+(scope|filters|selection)\b/i.test(message);
  const filters = explicit && !retain && !followup ? { imports: !!dashboard.imports } : { ...dashboard };
  if (periods.length) {
    const bounds = periods.map(period => {
      const month = months.findIndex(m => m.startsWith(period[1].toLowerCase().slice(0,3)));
      const year = Number(period[2] || dashboard.from?.slice(0,4) || new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric"}).format(new Date()));
      return {from:`${year}-${String(month + 1).padStart(2,'0')}-01`,to:`${year}-${String(month + 1).padStart(2,'0')}-${new Date(Date.UTC(year,month + 1,0)).getUTCDate()}`};
    });
    filters.from = bounds.map(p=>p.from).sort()[0];
    filters.to = bounds.map(p=>p.to).sort().at(-1);
  } else if (yearOnly) {
    filters.from = yearOnly[1] + '-01-01'; filters.to = yearOnly[1] + '-12-31';
  } else if (relative && relative[0].toLowerCase() !== 'last year') {
    Object.assign(filters,relativePeriod(relative[0][0].toUpperCase() + relative[0].slice(1).toLowerCase()));
  } else if (relative) {
    const year = Number(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric'}).format(new Date())) - 1;
    filters.from = year + '-01-01'; filters.to = year + '-12-31';
  }
  if (studios.length) filters.location = [...new Set(studios.map(studio => /copper/i.test(studio[0]) ? 'The Studio by Copper + Cloves' : /bandra/i.test(studio[0]) ? 'Supreme HQ, Bandra' : /pop/i.test(studio[0]) ? 'Pop-up' : canonicalLocation(studio[0])))];
  return { filters, explicit };
}
export function simpleSalesQuestion(message) {
  // Keep the verified shortcut deliberately narrow; qualified analytical questions go through GPT tools.
  const residue = message.toLowerCase()
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*20\d{2}\b/g,'')
    .replace(/\b(?:howmuch|how|much|what|total|were|was|are|is|did|do|does|at|in|for|during|the|sales|revenue|collections|net|gross|kwality|house|kemps|corner|kenkere|plash|pilates)\b/g,'')
    .replace(/[\s?,.!]+/g,'');
  if (residue) return false;
  return /(?:how\s*much|what|total)/i.test(message) && /\b(sales|revenue|collections)\b/i.test(message)
    && !/\b(compare|versus|vs|trend|chart|table|list|create|build|save|why|forecast|instructor|session|attendance|check.?in|average|per|growth|highest|lowest|breakdown|count|many|number|product|item|by|vat|tax|discount|refund|and|between|from)\b/i.test(message)
    && !/\b(?:20\d{2}-\d{2}|q[1-4]|year|week|quarter|today|yesterday|last|this)\b/i.test(message)
    && (message.match(/\b(?:jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\s*20\d{2}\b/gi)||[]).length <= 1;
}

export function toolScope(scope, defaults) {
  if (!scope) return defaults;
  const parsed = typeof scope === 'string' ? JSON.parse(scope) : scope;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Scope must be an object.');
  const result = {...defaults};
  for (const [key,value] of Object.entries(parsed)) {
    if (['from','to'].includes(key)) {
      if (value != null && (!/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value)) throw new Error('Scope dates must be YYYY-MM-DD or null.');
    } else if (['location','trainer','format','format_group','source','category','day','time'].includes(key)) {
      if (value != null && (!Array.isArray(value) || !value.every(v=>typeof v === 'string'))) throw new Error('Scope dimensions must be string arrays or null.');
    } else if (key === 'imports') {
      if (typeof value !== 'boolean') throw new Error('imports must be true or false.');
    } else throw new Error('Unsupported query scope field: ' + key);
    if (value == null) delete result[key];
    else result[key] = key === 'location' ? value.map(canonicalLocation) : value;
  }
  if (result.from && result.to && result.from > result.to) throw new Error("The reporting start must precede its end.");
  return result;
}
