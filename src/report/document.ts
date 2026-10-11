import { chapters, type ChapterSpec } from "./chapters";
import { definition } from "./definitions";
import { scenariosFor } from "./brief";
import type { ChapterData, ChapterNarrative, GroupTable, InsightCard, InsightLens, ReportModel } from "./model";

/**
 * A chapter written as a long-form report: numbered sections that each argue
 * one point in prose, with the charts and tables that prove it and the full
 * rows behind a fold; then numbered recommendations and a method note. The AI
 * writes the prose and chooses the exhibits; every exhibit is drawn from the
 * frozen figures, never from the model.
 */
export interface DocExhibit {
  /** A ref from the chapter's exhibit catalogue, e.g. `sessions/group/time`. */
  ref: string;
  view: "chart" | "table";
  /** What the exhibit shows, as a sentence-case title. */
  caption: string;
  /** What the reader should see in it. */
  note: string;
  /** Row labels the prose names, emphasised in the exhibit. */
  highlight: string[];
}
export interface DocSection {
  title: string;
  /** The section's thesis in one sentence, printed under the heading. */
  sub: string;
  lens?: InsightLens;
  priority?: "high" | "medium" | "low";
  paragraphs: string[];
  callout: { title: string; body: string } | null;
  exhibits: DocExhibit[];
  /** The full table behind the argument, folded. */
  evidence: { title: string; ref: string; note: string } | null;
}
export interface DocRecommendation { title: string; owner: string; horizon?: string; reasoning: string; impact: string }
export interface ChapterDocument {
  sections: DocSection[];
  recommendations: DocRecommendation[];
  /** Method and limitations, as paragraphs. */
  method: string[];
}

export type ExhibitKind = "kpis" | "trend" | "group" | "movers" | "scenarios";
export interface ExhibitDef { ref: string; chapter: string; kind: ExhibitKind; key?: string; describe: string }

const label = (id: string) => definition(id)?.label ?? id;
const groupKey = (g: GroupTable) => g.id ?? g.field;
const hasSeries = (data: ChapterData, id: string) => data.history.filter(row => row[id] != null && Number.isFinite(Number(row[id]))).length >= 3;

export function parseRef(ref: string): { chapter: string; kind: ExhibitKind; key?: string } | null {
  const [chapter, kind, key] = ref.split("/");
  if (!chapter || !["kpis", "trend", "group", "movers", "scenarios"].includes(kind)) return null;
  return { chapter, kind: kind as ExhibitKind, key };
}

/** Everything one chapter can show, from its own frozen figures. */
function ownExhibits(model: ReportModel, spec: ChapterSpec, wide: boolean): ExhibitDef[] {
  const data = model.chapters[spec.id];
  if (!data || spec.derived) return [];
  const out: ExhibitDef[] = [];
  const at = (kind: ExhibitKind, describe: string, key?: string) => out.push({ ref: [spec.id, kind, key].filter(Boolean).join("/"), chapter: spec.id, kind, key, describe });
  const metrics = spec.metrics.filter(id => definition(id) && data.total[id] != null);
  if (metrics.length) at("kpis", `${spec.title}: headline measures for the month against the previous month, the same month last year and year to date (${metrics.slice(0, 6).map(label).join(", ")}).`);
  const series = [...new Set([...spec.history, ...metrics])].filter(id => definition(id) && hasSeries(data, id));
  for (const id of wide ? series.slice(0, 2) : series) at("trend", `${label(id)} by month across the trailing ${data.history.length} months, with the same month last year visible.`, id);
  for (const g of wide ? data.groups.slice(0, 2) : data.groups) {
    const key = groupKey(g);
    at("group", `${g.title}: ${g.rows.length} rows by ${(g.fields ?? [g.field]).join(" + ")}; measures ${g.columns.map(label).join(", ")}${g.compare ? `; change vs previous month and last year on ${label(g.compare)}` : ""}.`, key);
    const a = g.analysis;
    if (!wide && a?.metric && ((a.gainers?.length ?? 0) + (a.decliners?.length ?? 0)) >= 2) at("movers", `${g.title}: the rows that gained and lost the most ${label(a.metric)} against the previous month.`, key);
  }
  if (spec.history.length && scenariosFor(spec, data, model.scope.month).length) at("scenarios", `${spec.title}: conditional next-month arithmetic per measure (flat, repeat last month's movement, three-month run rate, last year's seasonality). Not forecasts.`);
  return out;
}

/** The exhibits a chapter may cite: its own, or for a derived chapter, a selection across the report. */
export function exhibitCatalog(model: ReportModel, spec: ChapterSpec): ExhibitDef[] {
  const own = ownExhibits(model, spec, false);
  // The overview and the derived chapters read across the whole report.
  if (!spec.derived && spec.id !== "executive-summary") return own;
  const sources = chapters.filter(c => !c.derived && c.id !== spec.id && model.chapters[c.id]);
  return [...own, ...sources.flatMap(c => ownExhibits(model, c, true).filter(e => spec.id === "predictions" ? e.kind !== "group" : e.kind !== "scenarios"))];
}

export const exhibitRefs = (model: ReportModel, spec: ChapterSpec) => exhibitCatalog(model, spec).map(e => e.ref);

/** A document from the model's answer, with unknown refs dropped and missing parts filled safe. */
export function cleanDocument(raw: unknown, refs: string[]): ChapterDocument | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const list = (v: unknown) => Array.isArray(v) ? v : [];
  const known = new Set(refs);
  const exhibit = (e: Record<string, unknown>): DocExhibit | null => known.has(text(e?.ref)) ? { ref: text(e.ref), view: e.view === "table" ? "table" : "chart", caption: text(e.caption), note: text(e.note), highlight: list(e.highlight).map(text).filter(Boolean).slice(0, 4) } : null;
  const sections = list(r.sections).map((s: Record<string, unknown>): DocSection | null => {
    const title = text(s?.title), paragraphs = list(s?.paragraphs).map(text).filter(Boolean);
    if (!title || !paragraphs.length) return null;
    const c = s.callout as Record<string, unknown> | null;
    const ev = s.evidence as Record<string, unknown> | null;
    return {
      title, sub: text(s.sub), paragraphs,
      lens: (["win", "risk", "driver", "opportunity", "watch", "next_step"] as const).find(l => l === s.lens),
      priority: (["high", "medium", "low"] as const).find(p => p === s.priority),
      callout: c && text(c.body) ? { title: text(c.title), body: text(c.body) } : null,
      exhibits: list(s.exhibits).map(exhibit).filter((e): e is DocExhibit => !!e).slice(0, 3),
      evidence: ev && known.has(text(ev.ref)) ? { title: text(ev.title) || "Evidence", ref: text(ev.ref), note: text(ev.note) } : null,
    };
  }).filter((s): s is DocSection => !!s);
  if (!sections.length) return undefined;
  const recommendations = list(r.recommendations).map((x: Record<string, unknown>) => ({ title: text(x?.title), owner: text(x?.owner), horizon: text(x?.horizon) || undefined, reasoning: text(x?.reasoning), impact: text(x?.impact) })).filter(x => x.title);
  return { sections, recommendations, method: list(r.method).map(text).filter(Boolean) };
}

/** Cards for the parts of the app that summarise chapters (cover, glance, exports), read off the document. */
export function cardsFromDocument(doc: ChapterDocument, verdict: InsightCard, recsChapter: boolean): InsightCard[] {
  const focusOf = (s: DocSection) => {
    const p = parseRef(s.exhibits[0]?.ref ?? s.evidence?.ref ?? "");
    return p?.kind === "group" || p?.kind === "movers" ? p.key! : p?.kind === "trend" ? "trend" : "cross";
  };
  const sections = doc.sections.slice(1).map((s): InsightCard => ({
    section: s.title, headline: s.sub || s.title, meaning: s.paragraphs[0] ?? "", evidence: s.exhibits.map(e => e.note).filter(Boolean).join(" ") || s.paragraphs[1] || "",
    action: "", focus: focusOf(s), lens: s.lens ?? "driver", priority: s.priority ?? "medium", impact: s.callout?.body, highlight: s.exhibits[0]?.highlight ?? [],
  }));
  const recs = doc.recommendations.map((r): InsightCard => ({
    headline: r.title, meaning: r.reasoning, evidence: r.reasoning, action: r.title, recommendation: r.reasoning, impact: r.impact,
    ownerArea: r.owner, horizon: r.horizon, lens: "next_step", focus: "cross", priority: "medium",
  }));
  return [{ ...verdict, focus: "kpis" }, ...(recsChapter ? recs : sections)];
}

const firstSentence = (text: string) => (text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text).trim();
const clip = (text = "") => text.trim();

/**
 * The document a chapter is shown as. Reports written before documents
 * existed are re-read from their briefing and cards, so every saved report
 * prints in the same shape.
 */
export function documentFor(model: ReportModel, chapterId: string): ChapterDocument | null {
  const n: ChapterNarrative | undefined = model.narratives[chapterId];
  if (n?.document?.sections?.length) return n.document;
  const data = model.chapters[chapterId];
  const recsChapter = chapterId === "recommendations";
  if (!n && !data) return null;
  const cards = n?.cards ?? [];
  const verdict = cards.find(c => c.focus === "kpis") ?? cards[0];
  const tableOf = (focus?: string) => data?.groups.find(g => groupKey(g) === focus);
  const lead = (() => { const spec = chapters.find(c => c.id === chapterId); return spec ? [...spec.history, ...spec.metrics].find(id => data && hasSeries(data, id)) : undefined; })();
  const trendRef = (id?: string) => id ? `${chapterId}/trend/${id}` : null;
  const sections: DocSection[] = [];
  const b = n?.briefing;
  if (verdict || b) sections.push({
    title: "Start here", sub: clip(verdict?.headline), lens: verdict?.lens,
    paragraphs: [verdict?.meaning, b?.whatChanged, b?.whyItMoved, b?.whereItSits, b?.whatHeldUp].map(clip).filter(Boolean),
    callout: b?.soWhat ? { title: "The one-line version, if you read nothing else", body: b.soWhat } : null,
    exhibits: trendRef(lead) && data ? [{ ref: trendRef(lead)!, view: "chart", caption: `${label(lead!)}, month by month`, note: clip(verdict?.trend), highlight: [] }] : [],
    evidence: data && chapters.find(c => c.id === chapterId)?.metrics.length ? { title: "Evidence — the month's headline measures", ref: `${chapterId}/kpis`, note: "" } : null,
  });
  const used = new Set<string>();
  for (const card of cards) {
    if (card === verdict || recsChapter) continue;
    const table = tableOf(card.focus);
    if (table) used.add(groupKey(table));
    const metric = card.metrics?.find(id => data && hasSeries(data, id)) ?? (card.focus === "trend" ? lead : undefined);
    const ref = table ? `${chapterId}/group/${groupKey(table)}` : trendRef(metric);
    sections.push({
      title: clip(card.section) || table?.title || clip(card.headline).split(/[,:—]/)[0], sub: clip(card.headline), lens: card.lens, priority: card.priority,
      paragraphs: [card.meaning, card.driver || card.reasoning, card.concentration, card.offset, card.trend].map(clip).filter(Boolean),
      callout: card.impact ? { title: "What is at stake", body: card.impact } : null,
      exhibits: ref ? [{ ref, view: "chart", caption: table?.title ?? `${label(metric!)}, month by month`, note: "", highlight: card.highlight ?? [] }] : [],
      evidence: table ? { title: `Evidence — ${table.title.toLowerCase()}`, ref: `${chapterId}/group/${groupKey(table)}`, note: clip(card.evidence) } : null,
    });
  }
  // Breakdowns no finding used still belong in the document, read off the engine's own diagnostics.
  for (const g of data?.groups ?? []) {
    if (used.has(groupKey(g))) continue;
    const notes = [...(g.diagnostics ?? [])];
    sections.push({
      title: g.title, sub: firstSentence(notes[0] ?? g.deck), paragraphs: notes.length ? notes : [g.deck],
      callout: null, exhibits: [{ ref: `${chapterId}/group/${groupKey(g)}`, view: "chart", caption: g.title, note: g.minimum ?? "", highlight: [] }],
      evidence: { title: `Evidence — ${g.title.toLowerCase()}`, ref: `${chapterId}/group/${groupKey(g)}`, note: "" },
    });
  }
  const moves = (recsChapter ? cards : cards.filter(c => c !== verdict)).filter(c => c.action?.trim() || recsChapter);
  const recommendations = moves.map(c => ({
    title: recsChapter ? c.headline : firstSentence(c.action || c.headline), owner: c.ownerArea ?? "", horizon: c.horizon,
    reasoning: (recsChapter ? c.recommendation || c.driver || c.meaning : c.evidence || c.meaning) ?? "", impact: c.impact || c.watch || "",
  }));
  if (!sections.length && !recommendations.length) return null;
  return { sections, recommendations, method: [] };
}
