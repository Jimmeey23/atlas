import type { ReportModel, ReportEvidenceBlock } from './model';
import type { ReportEditOperation } from './source-edit';
import { chapters } from './chapters';
import { definition } from './definitions';

export interface DocumentEdits {
  hidden: string[];
  titles: Record<string, string>;
  metrics: Record<string, { metricId: string; dataChapterId: string }[]>;
  blocks: Record<string, ReportEvidenceBlock[]>;
}
export const hiddenReportElement = (model: ReportModel, chapter: string, element: string) => model.documentEdits?.hidden.includes(`${chapter}:${element}`) ?? false;
export function applyGeneratedOperation(model: ReportModel, op: ReportEditOperation) {
  const edits = model.documentEdits ??= { hidden: [], titles: {}, metrics: {}, blocks: {} };
  const narrative = model.narratives[op.chapterId];
  if (!narrative && !model.chapters[op.chapterId]) throw new Error(`Chapter ${op.chapterId} was not found.`);
  const hide = (element: string) => { const key = `${op.chapterId}:${element}`; if (!edits.hidden.includes(key)) edits.hidden.push(key); };
  if (!op.sectionId && op.element.startsWith('metric:')) {
    const metricId = op.element.slice(7);
    if (!definition(metricId)) throw new Error('Choose a governed metric.');
    if (op.action === 'delete') { hide(`metric:${metricId}`); edits.metrics[op.chapterId] = (edits.metrics[op.chapterId] ?? []).filter(metric => metric.metricId !== metricId); return; }
    const data = model.chapters[op.text];
    if (data?.total[metricId] == null || !Number.isFinite(Number(data.total[metricId]))) throw new Error('Choose a measured metric from an available report dataset.');
    edits.hidden = edits.hidden.filter(key => key !== `${op.chapterId}:metric:${metricId}`);
    const metrics = edits.metrics[op.chapterId] ??= [];
    const index = metrics.findIndex(metric => metric.metricId === metricId);
    const reference = { metricId, dataChapterId: op.text };
    if (index < 0) metrics.push(reference); else metrics[index] = reference;
    return;
  }
  if (!op.sectionId && op.action === 'delete') {
    const ids = model.customization?.chapterIds ?? chapters.filter(chapter => model.narratives[chapter.id] || model.chapters[chapter.id]).map(chapter => chapter.id);
    if (ids.length <= 1) throw new Error('Keep at least one report chapter.');
    model.customization = { ...model.customization, chapterIds: ids.filter(id => id !== op.chapterId) } as ReportModel['customization']; return;
  }
  if (op.action === 'set' && !op.sectionId) {
    if (op.element === 'title') { edits.titles[op.chapterId] = op.text; return; }
    if (op.element === 'summary' && narrative) { narrative.summary = op.text; return; }
  }
  if (narrative && op.sectionId === 'commentary' && op.blockId) {
    const index = Number(op.blockId.replace('commentary-', ''));
    if (!Number.isInteger(index) || !narrative.metricCommentary?.[index]) throw new Error('Choose an existing metric commentary item.');
    if (op.action === 'delete') { narrative.metricCommentary.splice(index, 1); return; }
    if (op.action === 'set' && op.element === 'text') { narrative.metricCommentary[index].text = op.text; return; }
  }
  if (narrative && ['briefing','decision','performers'].includes(op.sectionId) && op.action === 'set') {
    const allowed: Record<string,string[]> = { briefing:['whatChanged','whyItMoved','whereItSits','whatHeldUp','outlook','soWhat'], decision:['call','rationale','expectedImpact','successMeasure','risks','alternative','owner','horizon'], performers:['leaders','laggards','pattern'] };
    const section = narrative[op.sectionId as 'briefing'|'decision'|'performers'];
    if (section && allowed[op.sectionId].includes(op.element)) { (section as unknown as Record<string,unknown>)[op.element] = op.text; return; }
  }
  if (['tables','trends'].includes(op.sectionId) && op.blockId && op.action === 'set' && op.element === 'title') { edits.titles[`${op.chapterId}:${op.sectionId}:${op.blockId}`] = op.text; return; }
  if (op.sectionId === 'findings' && op.blockId && narrative) {
    const cards = narrative.cards;
    cards.forEach((card, index) => { card.id ??= `finding-${index}`; });
    const index = cards.findIndex(card => card.id === op.blockId);
    if (index >= 0) {
      if (op.action === 'delete') { if (cards.length <= 1) throw new Error('Keep the chapter verdict or remove the chapter.'); cards.splice(index, 1); return; }
      if (op.action === 'set' && ['headline','meaning','evidence','driver','concentration','offset','trend','action','recommendation','watch','impact','ownerArea','horizon'].includes(op.element)) { (cards[index] as unknown as Record<string, unknown>)[op.element] = op.text; return; }
    }
  }
  const blocks = edits.blocks[op.chapterId] ??= [];
  const index = blocks.findIndex(block => block.id === op.blockId);
  if (index >= 0) {
    if (op.action === 'delete') { blocks.splice(index, 1); return; }
    if (op.action === 'replace' && op.block) { blocks[index] = { ...op.block, id: op.blockId }; return; }
    if (op.action === 'set' && ['title','text','description'].includes(op.element)) { (blocks[index] as unknown as Record<string, unknown>)[op.element] = op.text; return; }
  }
  if (op.action === 'replace' && op.block && ['tables','trends'].includes(op.sectionId) && op.blockId) { hide(`${op.sectionId}:${op.blockId}`); blocks.push({ ...op.block, id: op.blockId }); return; }
  if (op.action === 'add' && op.block) {
    if (blocks.some(block => block.id === op.block!.id)) throw new Error('Element ID already exists.');
    blocks.push(op.block); return;
  }
  if (op.action === 'delete' && ['summary','metrics','findings','tables','trends','decision','briefing','performers','commentary','source'].includes(op.sectionId)) { hide(op.blockId ? `${op.sectionId}:${op.blockId}` : op.sectionId); return; }
  throw new Error('Choose an existing report element, finding field, metric reference or a new evidence block.');
}
