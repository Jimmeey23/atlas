import { validateContentBlock } from './content-import';
import { applyGeneratedOperation } from './generated-edits';
import { monthLabel } from './period';
import { definition } from './definitions';
import type { ReportEvidenceBlock, ReportModel } from './model';
/** Structural edits target stable IDs, so deletion never shifts another operation's target. */
export interface ReportEditOperation {
  action: 'set' | 'add' | 'replace' | 'delete';
  chapterId: string; sectionId: string; blockId: string; element: string; text: string;
  block: ReportEvidenceBlock | null;
}
export function applyReportOperations(model: ReportModel, operations: ReportEditOperation[]): ReportModel {
  const next = structuredClone(model);
  if (!operations.length || operations.length > 50) throw new Error('Choose between 1 and 50 changes.');
  for (const op of structuredClone(operations)) {
    if(op.block) {
      const block=op.block;
      for(const key of Object.keys(block))if((block as unknown as Record<string,unknown>)[key]==null)delete (block as unknown as Record<string,unknown>)[key];
      if (block.attachment) validateContentBlock(block);
      else if(block.kind!=='text') {
        const data=next.chapters[block.dataChapterId ?? ''];if(!data)throw new Error('Chart/table requires a governed dataset.');
        const group=block.groupField && block.groupField!=='month'?data.groups.find(g=>(g.id ?? g.field)===block.groupField) ?? data.groups.find(g=>g.field===block.groupField):null;
        if(block.groupField && block.groupField!=='month' && !group)throw new Error('Choose an existing evidence grouping.');
        const sourceRows=block.groupField==='month'?data.history:group?.rows ?? [data.total];
        block.rows=sourceRows;
        if(!block.columns?.length)block.columns=block.groupField==='month'?['month',block.metricId!]:group?['g',...group.columns]:Object.keys(data.total).filter(k=>k!=='n'&&!k.includes('__'));
        if(block.columns.some(c=>!sourceRows.some(r=>c in r)))throw new Error('Evidence fields must exist in the frozen dataset.');
        if(block.metricId && !sourceRows.some(r=>r[block.metricId!]!=null))throw new Error('The selected chart metric is not present.');
      }
    }
    if(!op.chapterId && op.action==='set' && ['title','subtitle'].includes(op.element)){next.customization={...next.customization,[op.element]:op.text} as ReportModel['customization'];continue;}
    if (!next.importedChapters?.length) { applyGeneratedOperation(next, op); continue; }
    const chapters = next.importedChapters;
    const ci = chapters.findIndex(c => c.id === op.chapterId);
    if(ci<0 && op.action==='add' && op.element==='chapter' && !op.sectionId) {
      if(!/^[a-z0-9-]+$/.test(op.chapterId))throw new Error('Use a unique chapter identifier.');
      chapters.push({id:op.chapterId,title:op.text,summary:'',filename:'AI-authored addition',sha256:'ai',html:'',tables:0,charts:0,metrics:[],sections:op.block?[{id:op.block.id,title:op.block.title,html:'',tables:0,charts:0,blocks:[op.block]}]:[]});continue;
    }
    if (ci < 0) throw new Error(`Chapter ${op.chapterId} was not found.`);
    const chapter = chapters[ci];
    if (!op.sectionId) {
      if(op.element.startsWith('metric:')) {
        const metricId=op.element.slice(7),dataChapterId=op.text, data=next.chapters[dataChapterId];
        chapter.metrics ??=[];
        if(op.action==='delete'){chapter.metrics=chapter.metrics.filter(m=>m.metricId!==metricId);continue;}
        if(!data || data.total[metricId]==null || !Number.isFinite(Number(data.total[metricId])))throw new Error('Select a measured report metric.');
        const m={label:definition(metricId)?.label ?? metricId,value:String(data.total[metricId]),note:monthLabel(model.scope.month),metricId,dataChapterId};
        const mi=chapter.metrics.findIndex(m=>m.metricId===metricId);if(mi>=0)chapter.metrics[mi]=m;else chapter.metrics.push(m);continue;
      }
      if (op.action === 'delete') { chapters.splice(ci, 1); continue; }
      if (op.element === 'title' || op.element === 'summary' || op.element === 'scopeNote') { chapter[op.element] = op.text; continue; }
      if (op.action === 'add') { chapter.sections ??= []; const id=op.block?.id || `section-${Date.now()}-${chapter.sections.length}`; if(chapter.sections.some(s=>s.id===id)) throw new Error('Section ID already exists.'); chapter.sections.push({id,title:op.text || 'New section',html:'',tables:0,charts:0,blocks:op.block?[op.block]:[]});continue; }
      throw new Error('Choose a chapter title, summary, or section.');
    }
    const sections=chapter.sections ?? []; const si=sections.findIndex(s=>s.id===op.sectionId);
    if(si<0) throw new Error(`Section ${op.sectionId} was not found.`);
    const section=sections[si];
    if(!op.blockId) {
      if(op.action==='delete'){sections.splice(si,1);continue;}
      if(op.action==='set' && op.element==='title'){section.title=op.text;continue;}
      if(op.action==='add' && op.block){section.blocks ??=[];if(section.blocks.some(b=>b.id===op.block!.id))throw new Error('Block ID already exists.');section.blocks.push(op.block);continue;}
      throw new Error('Choose a section title or block.');
    }
    const blocks=section.blocks ?? [];const bi=blocks.findIndex(b=>b.id===op.blockId);
    if(bi<0 && section.html && typeof DOMParser!=='undefined') {
      const doc=new DOMParser().parseFromString(section.html,'text/html');
      const node=Array.from(doc.querySelectorAll('[data-source-element]')).find(el=>el.getAttribute('data-source-element')===op.blockId);
      if(!node)throw new Error(`Element ${op.blockId} was not found.`);
      if(op.action==='delete')node.remove();
      else if(op.action==='set'){const target=node.tagName==='FIGURE'?node.querySelector('figcaption') || node:node;target.textContent=op.text;}
      else if(op.block && (op.action==='replace'||op.action==='add')){const marker=doc.createElement('div');marker.setAttribute('data-report-block',op.block.id);if(op.action==='replace')node.replaceWith(marker);else node.after(marker);section.blocks ??=[];section.blocks.push(op.block);}
      else throw new Error('Choose an element change.');
      section.html=doc.body.innerHTML;continue;
    }
    if(bi<0)throw new Error(`Element ${op.blockId} was not found.`);
    if(op.action==='delete'){blocks.splice(bi,1);continue;}
    if(op.action==='replace' && op.block){blocks[bi]={...op.block,id:op.blockId};continue;}
    if(op.action==='set' && ['title','text','description'].includes(op.element)){(blocks[bi] as unknown as Record<string,unknown>)[op.element]=op.text;continue;}
    throw new Error('Unsupported report change.');
  }
  for(const chapter of next.importedChapters ?? []){chapter.tables=chapter.sections?.reduce((n,s)=>n+(s.html?.match(/<table\b/g)?.length ?? 0)+(s.blocks?.filter(b=>b.kind==='table').length ?? 0),0) ?? 0;chapter.charts=chapter.sections?.reduce((n,s)=>n+(s.html?.match(/<figure\b/g)?.length ?? 0)+(s.blocks?.filter(b=>b.kind==='chart'||b.kind==='heatmap').length ?? 0),0) ?? 0;}
  return next;
}
/** Every visible block and every governed dataset is included, without silent truncation. */
export function reportEditorContext(model:ReportModel, selection?:unknown) {
 const compact=(rows:Record<string,unknown>[])=>{const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))];return {columns,values:rows.map(r=>columns.map(c=>r[c] ?? null))};};
 const datasets=Object.fromEntries(Object.entries(model.chapters).map(([id,d])=>[id,{...d,history:compact(d.history),groups:d.groups.map(g=>({...g,rows:compact(g.rows)}))}]));
 const chapters=model.importedChapters?.map(({html,...c})=>{
   const sections=c.sections?.map(({html,...section})=>{
     const blocks=section.blocks?.map(({rows,...block})=>{
       const data=model.chapters[block.dataChapterId ?? ''];
       const origin=block.groupField==='month'?data?.history:data?.groups.find(g=>g.field===block.groupField)?.rows;
       return {...block,...(rows ? JSON.stringify(rows)===JSON.stringify(origin)?{rowSource:{dataset:block.dataChapterId,groupField:block.groupField}}:{rows:compact(rows)}:{})};
     });
     const sourceText=html?html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():undefined;
     const sourceElementIds=html?[...html.matchAll(/data-source-element="([^"]+)"/g)].map(match=>match[1]):undefined;
     return {...section,blocks,sourceText,sourceElementIds};
   });
   return {...c,sections};
 });
 const metricDefinitions=Object.fromEntries([...new Set(Object.values(model.chapters).flatMap(d=>Object.keys(d.total)))].filter(k=>definition(k)).map(k=>[k,definition(k)]));
 const context=JSON.stringify({scope:model.scope,audit:model.dataAudit,selection,customization:model.customization,chapters:chapters ?? Object.entries(model.narratives).map(([id,narrative])=>({id,title:model.documentEdits?.titles[id] ?? id,summary:narrative.summary,sections:[{id:'findings',blocks:narrative.cards.map((card,index)=>({...card,id:card.id ?? `finding-${index}`}))},{id:'commentary',blocks:narrative.metricCommentary?.map((item,index)=>({...item,id:`commentary-${index}`}))},{id:'tables',blocks:model.chapters[id]?.groups.map(group=>({id:group.id ?? group.field,title:group.title,columns:group.columns,field:group.field,fields:group.fields}))}],briefing:narrative.briefing,decision:narrative.decision,metricCommentary:narrative.metricCommentary})),documentEdits:model.documentEdits,replacements:model.replacements,builtAt:model.builtAt,intelligence:model.intelligence,signals:model.signals,sources:model.sources,additionalContext:model.additionalContext,datasets,metricDefinitions});
 if(context.length>1000000)throw new Error('This report exceeds the editor context limit. The complete document must fit the report editor’s context budget.');
 return context;
}
