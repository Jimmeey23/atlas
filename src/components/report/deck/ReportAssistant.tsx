import { ImportedContentElement } from './ImportedContentElement';
import { ChatAnswer } from '../../ChatAnswer';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Undo2, Check, Loader2, ChevronRight } from 'lucide-react';
import type { ReportModel } from '../../../report/model';
import { applyReportOperations, reportEditorContext, type ReportEditOperation } from '../../../report/source-edit';
import { adminToken, generateReportEdits, importReportContent } from '../../../report/storage';
import { monthBounds } from '../../../report/period';
import { ReportProse } from './ReportProse';

type Message = { role: 'user' | 'assistant'; content: string };
const signature = (model: ReportModel) => JSON.stringify([model.narratives, model.customization, model.importedChapters, model.replacements, model.documentEdits]);
export function ReportAssistant({ model, onChange, canEdit, inline = false, onOpen }: { model: ReportModel; onChange: (model: ReportModel) => void; canEdit?: boolean; inline?: boolean; onOpen?: () => void }) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState<'ask' | 'edit' | 'import'>('ask');
  const [question, setQuestion] = useState(''), [messages, setMessages] = useState<Message[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState<{ summary: string; operations: ReportEditOperation[]; base: string } | null>(null);
  const [undo, setUndo] = useState<{ model: ReportModel; applied: string } | null>(null);
  const [content,setContent] = useState(''), [file,setFile] = useState<File|null>(null), [chapterId,setChapterId] = useState(''), [sectionId,setSectionId] = useState('');
  const destinations = model.importedChapters?.map(c=>({id:c.id,title:c.title,sections:c.sections ?? []})) ?? Object.keys(model.narratives).map(id=>({id,title:model.documentEdits?.titles[id] ?? id,sections:[] as {id:string;title:string}[]}));
  const abort = useRef<AbortController | null>(null), input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { const show = () => { setOpen(true); onOpen?.(); setTimeout(() => input.current?.focus(), 0); }; window.addEventListener('p57-open-report-assistant', show); return () => window.removeEventListener('p57-open-report-assistant', show); }, [onOpen]);
  useEffect(() => { abort.current?.abort(); setMessages([]); setDraft(null); setUndo(null); setError(''); setBusy(false); setContent(''); setFile(null); setChapterId(''); setSectionId(''); }, [model.id, model.builtAt]);
  async function send() {
    const prompt = question.trim(); if ((mode === 'import' ? !content.trim() && !file : !prompt) || busy) return;
    if (mode !== 'ask' && !(canEdit ?? !!adminToken())) { setError('Unlock report editing to prepare changes. Questions remain available.'); window.dispatchEvent(new CustomEvent('p57-unlock-report')); return; }
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); setDraft(null); setQuestion('');
    setMessages(current => [...current, { role: 'user', content: prompt || `Import ${file?.name ?? 'pasted content'}` }]);
    try {
      const context = reportEditorContext(model);
      if (mode !== 'ask') {
        let upload: {name:string;base64:string}|undefined;
        if (mode === 'import' && file) {
          if(file.size > 3000000) throw new Error('Upload a file up to 3 MB.');
          const base64 = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read the file.'));reader.readAsDataURL(file);});
          upload={name:file.name,base64};
        }
        const result = mode === 'import' ? await importReportContent({context,prompt,text:content,chapterId,sectionId,file:upload},controller.signal) : await generateReportEdits(context, prompt, controller.signal);
        if (controller.signal.aborted) return;
        applyReportOperations(model, result.operations);
        setDraft({ ...result, base: signature(model) });
        setMessages(current => [...current, { role: 'assistant', content: result.summary }]);
      } else {
        const response = await fetch('/api/intelligence/ask', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: prompt, reportContext: context, history: messages.slice(-12), filters: { ...monthBounds(model.scope.month), location: [model.scope.studio] }, saveHistory: false, page: 15, maxTokens: 5000 }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The report assistant could not answer.');
        setMessages(current => [...current, { role: 'assistant', content: result.answer || 'No answer was returned.' }]);
      }
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (abort.current === controller) setBusy(false); }
  }
  function apply() {
    if (!draft) return;
    try {
      if (!(canEdit ?? !!adminToken())) throw new Error('Unlock report editing before applying changes.');
      if (draft.base !== signature(model)) throw new Error('The report changed after this plan was prepared. Prepare the changes again.');
      const next = applyReportOperations(model, draft.operations); setUndo({ model, applied: signature(next) }); onChange(next); setDraft(null);
      setMessages(current => [...current, { role: 'assistant', content: 'Changes applied to this report. Use Save to store this version.' }]);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <aside className={`p57-report-agent${inline ? ' p57-agent-inline' : ''}`} data-open={open} data-mode={mode} aria-label="Report AI assistant" data-export="omit">
    <button className="p57-agent-launch" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) { onOpen?.(); setTimeout(() => input.current?.focus(), 0); } }}><Sparkles size={17}/><span>Atlas AI</span><ChevronRight size={14}/></button>
    {open && <div className="p57-agent-panel"><header><div><span>REPORT INTELLIGENCE</span><h2>Ask. Explore. Refine.</h2><p>All report chapters · connected sources</p></div><button type="button" aria-label="Close report assistant" onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="p57-agent-modes" role="group" aria-label="Report assistant mode"><button aria-pressed={mode === 'ask'} onClick={() => setMode('ask')}>Ask the report</button><button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Edit the report</button><button aria-pressed={mode === 'import'} onClick={() => setMode('import')}>Import content</button></div>
      <p className="p57-agent-scope">{model.scope.studio} · {model.scope.month}<br/>Frozen report first. Additional source queries are identified separately.</p>
      <div className="p57-agent-messages" role="log" aria-label="Report assistant conversation" aria-live="polite">
        {!messages.length && mode !== 'import' && <div className="p57-agent-starters"><p>What would you like to explore?</p>{['Explain the biggest drivers across all chapters', 'Which findings need stronger evidence?', 'Compare revenue quality and attendance'].map(prompt => <button key={prompt} onClick={() => { setMode('ask'); setQuestion(prompt); input.current?.focus(); }}>{prompt} ↗</button>)}</div>}
        {messages.map((message, index) => <article key={index} data-role={message.role}><span>{message.role === 'user' ? 'YOU' : 'ATLAS AI'}</span>{message.role === 'assistant' ? <ChatAnswer text={message.content}/> : <ReportProse text={message.content}/>}</article>)}
        {busy && <p role="status"><Loader2 size={14} className="rb2-spin"/>{mode === 'ask' ? 'Reading the report and checking evidence…' : 'Preparing report changes…'}</p>}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {draft && <section className="p57-agent-plan" aria-label="Proposed report changes"><b>{draft.operations.length} proposed changes</b><ol>{draft.operations.map((operation, index) => <li key={index}>{operation.block?.kind ?? operation.action} · {operation.chapterId || 'Report'} · {operation.element || operation.block?.title || operation.blockId || operation.sectionId}</li>)}</ol>{draft.operations.filter(op=>op.block?.attachment).map(op=><ImportedContentElement key={op.block!.id} block={op.block!}/>)}<button onClick={apply}><Check size={14}/>Apply changes</button><button onClick={() => setDraft(null)}>Discard plan</button></section>}
      {undo && <button className="p57-agent-undo" onClick={() => { if (signature(model) !== undo.applied) { setError('The report changed after the AI edit. Undo is unavailable to protect later changes.'); return; } onChange(undo.model); setUndo(null); }}><Undo2 size={13}/>Undo last AI edit</button>}
      {mode === 'import' && <div className="p57-import-fields">
        <label>Source content<textarea rows={6} maxLength={120000} value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste text, HTML or JSON…"/></label>
        <label>Or attach a document<input type="file" accept=".txt,.pdf,.docx,.html,.htm,.json" onChange={e=>setFile(e.target.files?.[0] ?? null)}/></label>
        <small>PDF, DOCX, HTML, JSON or TXT · up to 3 MB. Text-based PDFs only.</small>
        <label>Destination chapter<select value={chapterId} onChange={e=>{setChapterId(e.target.value);setSectionId('');}}><option value="">AI chooses relevant chapters</option>{destinations.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        {!!destinations.find(c=>c.id===chapterId)?.sections.length && <label>Destination section<select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">AI chooses relevant sections</option>{destinations.find(c=>c.id===chapterId)?.sections.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
      </div>}
      <form onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor={`p57-report-prompt-${inline ? 'preview' : 'reader'}`}>{mode === 'ask' ? 'Question about this report' : mode === 'import' ? 'Instructions (optional)' : 'Describe a report change'}</label><textarea ref={input} id={`p57-report-prompt-${inline ? 'preview' : 'reader'}`} rows={3} maxLength={mode !== 'ask' ? 2000 : 12000} value={question} onChange={event => setQuestion(event.target.value)} placeholder={mode === 'ask' ? 'Ask about any chapter, metric or source…' : mode === 'import' ? 'For example: create a revenue table and chart in Sales…' : 'Add, change or remove an element or metric…'}/><div><span>{mode !== 'ask' ? 'Preview changes · apply · Save' : 'Answers grounded in report evidence'}</span><button type="submit" disabled={busy || (mode === 'import' ? !content.trim() && !file : !question.trim())}><Send size={14}/>{mode === 'ask' ? 'Ask' : mode === 'import' ? 'Process content' : 'Prepare'}</button>{busy && <button type="button" onClick={() => abort.current?.abort()}>Stop</button>}</div></form>
    </div>}
  </aside>;
}
