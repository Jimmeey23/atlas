/** Choose the largest complete one/two-row grid that fits real available measures. */
export function completeMetricGrid(available: number, width: number) {
  const capacity = Math.max(1, Math.min(4, Math.floor((width + 12) / 212)));
  let best = { columns: 1, count: Math.min(available, 2) };
  for (let columns = 1; columns <= Math.min(capacity, available); columns++) {
    const count = columns * Math.min(2, Math.floor(available / columns));
    if (count > best.count || (count === best.count && columns > best.columns)) best = { columns, count };
  }
  return best;
}
const stop = new Set('the and for with this that from have what now into then here month report are our'.split(' '));
export const speechWords = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
/** Require distinctive overlap and a clear lead; ambiguous speech must not change pages. */
export function matchSpeech(text: string, candidates: { key: string; text: string }[], current: string) {
  const words = new Set(speechWords(text));
  const scores = candidates.map(c => {
    const terms = new Set(speechWords(c.text));
    const hits = [...words].filter(w => terms.has(w)).length;
    return { key: c.key, hits, score: hits / Math.max(1, words.size) };
  }).sort((a, b) => b.score - a.score || (a.key === current ? -1 : 1));
  const best = scores[0], second = scores[1];
  return best && best.hits >= 3 && best.score >= .55 && (!second || best.score - second.score >= .15) ? best.key : null;
}
