import { relativePeriod } from '../src/data/periods.ts';
import { canonicalLocation } from '../src/data/normalise.ts';
/** Studio shortforms and nicknames → canonical location. Matched as whole words, case-insensitive. */
export const studioAliases = [
  [/^(?:kh|kc|kwality(?:\s+house)?|kemps(?:\s+corner)?)$/i, 'Kwality House, Kemps Corner'],
  [/^(?:shq|supreme(?:\s+hq)?|bandra|supreme\s+hq,?\s+bandra)$/i, 'Supreme HQ, Bandra'],
  [/^(?:kk|kenkere(?:\s+house)?|blr|bangalore|bengaluru)$/i, 'Kenkere House'],
  [/^(?:c\+c|cnc|copper(?:\s*(?:\+|and|&)\s*cloves)?|the studio by copper \+ cloves)$/i, 'The Studio by Copper + Cloves'],
  [/^(?:plash(?:\s+pilates)?)$/i, 'Plash'],
  [/^(?:pop[ -]?up)$/i, 'Pop-up'],
];
const studioPattern = /(?<![\w+])(kh|kc|kwality(?:\s+house)?|kemps(?:\s+corner)?|shq|supreme(?:\s+hq)?(?:,?\s+bandra)?|bandra|kk|kenkere(?:\s+house)?|blr|bangalore|bengaluru|c\+c|cnc|(?:the studio by )?copper(?:\s*(?:\+|and|&)\s*cloves)?|plash(?:\s+pilates)?|pop[ -]?up|mumbai)(?![\w+])/gi;
const studioFor = (text) => studioAliases.find(([pattern]) => pattern.test(text.trim()))?.[1];
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const monthWord = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const monthIndex = (word) => months.findIndex(m => m.startsWith(word.toLowerCase().slice(0,3)));
const iso = (y, m, d) => {
  const date = new Date(Date.UTC(y, m, d));
  return date.getUTCMonth() === m && date.getUTCDate() === d ? date.toISOString().slice(0,10) : null;
};
/**
 * Day-level dates: "2026-07-27", "27/07/2026" (day first), "July 27th", "27 July 2026",
 * "July 27-31", "27th and 31st July". A date without its own year takes the last year
 * written in the question, then the fallback. Returns the spanned range, or null.
 */
export function dayRange(message, fallbackYear) {
  const text = String(message);
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]));
  const defaultYear = years.at(-1) ?? fallbackYear;
  const found = [];
  const add = (y, m, d) => { const value = iso(y, m, d); if (value) found.push(value); };
  for (const m of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) add(+m[1], +m[2] - 1, +m[3]);
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/g)) add(+(m[3].length === 2 ? '20' + m[3] : m[3]), +m[2] - 1, +m[1]);
  const ord = '(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)';
  const year = '(?:\\s*,?\\s*(20\\d{2})\\b)?';
  const join = '\\s*(?:-|–|to|and|till|until|through|thru)\\s*';
  // "July 27-31 2026", "July 27 to 31"
  for (const m of text.matchAll(new RegExp(`\\b(${monthWord})\\.?\\s+${ord}${join}${ord}(?!\\s*(?:${monthWord}))${year}`, 'gi'))) {
    const y = +(m[4] || defaultYear); add(y, monthIndex(m[1]), +m[2]); add(y, monthIndex(m[1]), +m[3]);
  }
  // "27-31 July", "27th and 31st July 2026"
  for (const m of text.matchAll(new RegExp(`\\b${ord}${join}${ord}\\s+(?:of\\s+)?(${monthWord})\\b${year}`, 'gi'))) {
    const y = +(m[4] || defaultYear); add(y, monthIndex(m[3]), +m[1]); add(y, monthIndex(m[3]), +m[2]);
  }
  // "July 27th", "July 27, 2026"
  for (const m of text.matchAll(new RegExp(`\\b(${monthWord})\\.?\\s+${ord}(?!\\s*:)${year}`, 'gi'))) add(+(m[3] || defaultYear), monthIndex(m[1]), +m[2]);
  // "27 July", "27th of July 2026"
  for (const m of text.matchAll(new RegExp(`\\b${ord}\\s+(?:of\\s+)?(${monthWord})\\b${year}`, 'gi'))) add(+(m[3] || defaultYear), monthIndex(m[2]), +m[1]);
  if (!found.length) return null;
  found.sort();
  return { from: found[0], to: found.at(-1) };
}
export function resolveQuestionScope(message, dashboard = {}, history = []) {
  const previousUser = [...history].reverse().find(m => m.role === 'user' && typeof m.content === 'string');
  const previousAssistant = [...history].reverse().find(m => m.role === 'assistant' && m.scope);
  const followup = /^(?:and\b|what about\b|how about\b|same\b|also\b)|\b(that studio|same studio|there|net of vat)\b/i.test(message.trim());
  const prior = previousAssistant?.scope || (previousUser ? resolveQuestionScope(previousUser.content,dashboard).filters : dashboard);
  if (followup) dashboard = {...prior};
  // "Sep 2026", "Sept'26", "sep-26": a two-digit year needs an apostrophe or hyphen so "Sept 26" (a day) is not misread.
  const periods = [...message.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b(?:\s*,?\s*(20\d{2})\b|\s*['’-]\s*(\d{2})\b)?/gi)].map(m => [m[0], m[1], m[2] || (m[3] ? '20' + m[3] : undefined)]);
  const quarter = message.match(/\b(?:q([1-4])|h([12]))(?:\s*['’-]?\s*(20\d{2}|\d{2}))?\b/i);
  const toDate = message.match(/\b(ytd|mtd|qtd|year to date|month to date|quarter to date)\b/i);
  const lastDays = message.match(/\blast\s+(\d{1,3})\s+days\b/i);
  const studios = [...message.matchAll(studioPattern)];
  const days = dayRange(message, Number(dashboard.from?.slice(0,4)) || Number(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric'}).format(new Date())));
  // Named periods/studios describe an independent question, unless the user explicitly retains the dashboard scope.
  const relative = message.match(/\b(this|last)\s+(month|week|quarter|year)\b/i);
  const yearOnly = !periods.length && message.match(/\b(?:in|for|during)\s+(20\d{2})\b/i);
  const explicit = !!(days || periods.length || studios.length || relative || yearOnly || quarter || toDate || lastDays);
  const retain = /\b(current|dashboard|selected|filtered)\s+(scope|filters|selection)\b/i.test(message);
  const filters = explicit && !retain && !followup ? { imports: !!dashboard.imports } : { ...dashboard };
  const todayISO = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if (days) {
    filters.from = days.from; filters.to = days.to;
  } else if (quarter) {
    const year = Number(quarter[3] ? (quarter[3].length === 2 ? '20' + quarter[3] : quarter[3]) : todayISO.slice(0,4));
    const [first, count] = quarter[1] ? [(Number(quarter[1]) - 1) * 3, 3] : [(Number(quarter[2]) - 1) * 6, 6];
    filters.from = `${year}-${String(first + 1).padStart(2,'0')}-01`;
    filters.to = new Date(Date.UTC(year, first + count, 0)).toISOString().slice(0,10);
  } else if (toDate) {
    const unit = toDate[1].toLowerCase()[0];
    const [y, m] = todayISO.split('-').map(Number);
    const startMonth = unit === 'y' ? 1 : unit === 'q' ? Math.floor((m - 1) / 3) * 3 + 1 : m;
    filters.from = `${y}-${String(startMonth).padStart(2,'0')}-01`; filters.to = todayISO;
  } else if (lastDays) {
    filters.to = todayISO;
    filters.from = new Date(Date.parse(todayISO + 'T00:00:00Z') - (Number(lastDays[1]) - 1) * 86400000).toISOString().slice(0,10);
  } else if (periods.length) {
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
  if (studios.length) filters.location = [...new Set(studios.flatMap(studio => /^mumbai$/i.test(studio[1]) ? ['Kwality House, Kemps Corner', 'Supreme HQ, Bandra'] : [studioFor(studio[1]) || canonicalLocation(studio[1])]))];
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

/**
 * Rank exact data values against a name, nickname, first name, initials or misspelling.
 * Whole-word and prefix hits count most, then initials ("kh" → Kwality House), then a
 * light character-overlap tiebreak so close misspellings still surface.
 */
export function rankEntities(values, text, limit = 6) {
  const needle = String(text || "").toLowerCase().replace(/[^a-z0-9+ ]/g, " ").trim();
  const tokens = needle.split(/\s+/).filter(Boolean);
  const compact = needle.replace(/\s/g, "");
  const initials = (v) => v.toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean).map((w) => w[0]).join("");
  const bigrams = (w) => new Set([...w].slice(1).map((c, i) => w[i] + c));
  const near = (a, b) => { const x = bigrams(a), y = bigrams(b); let hit = 0; for (const g of x) if (y.has(g)) hit++; return x.size && y.size ? (2 * hit) / (x.size + y.size) : 0; };
  const score = (value) => {
    const low = value.toLowerCase();
    const words = low.split(/[^a-z0-9+]+/).filter(Boolean);
    let s = low === needle ? 10 : 0;
    for (const t of tokens) {
      if (words.includes(t)) s += 4;
      else if (words.some((w) => w.startsWith(t))) s += 3;
      else if (low.includes(t)) s += 2;
      else s += Math.max(0, ...words.map((w) => near(t, w))) * 2.5;
    }
    if (compact.length >= 2 && compact.length <= 4 && initials(value).startsWith(compact)) s += 3.5;
    return Math.round(s * 100) / 100;
  };
  return values.map((value) => ({ value, score: score(value) })).filter((m) => m.score > 0.8).sort((a, b) => b.score - a.score).slice(0, limit);
}

// Words that are never names: question words, metrics, periods, formats and studio shortforms.
const nonNames = new Set(`a an the and or of for in on at to by with from vs versus which who what whom whose when where why how much many most least best worst top bottom highest lowest more less than this that these those last next previous current same per each every all any total avg average class classes slot slots session sessions studio studios instructor instructors trainer trainers teacher coach associate associates member members client clients newcomer newcomers lead leads sales sale revenue rev net gross fill rate rates attendance footfall booking bookings cancel cancels cancellations late no show shows conversion conv retention ret ltv aov churn lapsed renewal renewals month months week weeks quarter year years day days today yesterday ytd mtd qtd yoy mom wow qoq morning afternoon evening weekday weekend jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december compare comparison show list give tell me my our please sell sold sells selling buy bought teach taught teaches run ran did do does is was were are be been have has had performance perform performed doing done kh kc kk shq blr cnc mumbai kemps kwality bandra supreme kenkere copper cloves powercycle barre strength lab mat express hosted pc sl`.split(" "));
/**
 * Find likely names (people, classes, studios) in a question and resolve each to exact
 * data values with rankEntities. Only confident, unambiguous matches are returned.
 */
export function resolveMentions(message, lists) {
  const words = String(message).replace(/[^\p{L}\p{N}+' ]/gu, " ").split(/\s+/).filter(Boolean);
  const grams = [];
  for (let i = 0; i < words.length; i++) {
    for (const size of [2, 1]) {
      const part = words.slice(i, i + size);
      // Every word must be name-like (≥3 letters, not a common question / metric / period word).
      if (part.length !== size || part.some((w) => w.length < 3 || nonNames.has(w.toLowerCase()))) continue;
      grams.push(part.join(" "));
    }
  }
  const found = [];
  const taken = new Set();
  for (const gram of grams) {
    if ([...taken].some((t) => t.includes(gram.toLowerCase()))) continue;
    let best = null;
    for (const [kind, values] of Object.entries(lists)) {
      const [first, second] = rankEntities(values, gram, 2);
      // Confident: a whole-word / prefix hit (≥3) or a strong fuzzy match, clearly ahead of the runner-up.
      if (first && first.score >= 1.6 && (!second || first.score - second.score >= 0.6) && (!best || first.score > best.score))
        best = { mention: gram, kind, value: first.value, score: first.score, alternatives: second ? [second.value] : [] };
    }
    if (best) { found.push(best); taken.add(gram.toLowerCase()); }
  }
  return found;
}
