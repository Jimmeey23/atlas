import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Database } from 'lucide-react';
import type { GroupTable, ReportModel } from '../../../report/model';
import { chapters } from '../../../report/chapters';
import { definition } from '../../../report/definitions';
import { monthLabel } from '../../../report/period';
import { DataExplorer } from './DataExplorer';
export interface RecordSelection { chapterId?: string; month?: string; metric?: string; table?: GroupTable; group?: string }
const RecordContext = createContext<((selection: RecordSelection) => void) | null>(null);
export const useRecordDrilldown = () => useContext(RecordContext);
export function RecordDrilldownProvider({ model, chapterId, children }: { model: ReportModel; chapterId: string; children: ReactNode }) {
  const [selection, setSelection] = useState<RecordSelection | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null);
  const spec = chapters.find(c => c.id === (selection?.chapterId ?? chapterId));
  useEffect(() => { if (selection) dialog.current?.showModal(); }, [selection]);
  const close = () => { dialog.current?.close(); setSelection(null); trigger.current?.focus(); };
  return <RecordContext.Provider value={value => { trigger.current = document.activeElement as HTMLElement; const owner = value.table ? Object.values(model.chapters).find(data => data.groups.some(g => g.rows === value.table?.rows))?.id : undefined; setSelection({ ...value, chapterId: value.chapterId ?? owner ?? chapterId }); }}>
    {children}
    {selection && <dialog ref={dialog} className="deck-record-dialog" onCancel={close} aria-label="Item-level source records" data-export="omit">
      <header><div><span className="deck-eyebrow"><Database size={13}/>Item-level source records</span><h2>{[selection.metric && definition(selection.metric)?.label, selection.group].filter(Boolean).join(" · ") || spec?.nav}</h2><p>{spec?.nav} · {model.scope.studio} · {monthLabel(selection.month ?? model.scope.month)} · live source</p></div><button className="icon-button" aria-label="Close source records" onClick={close}><X size={18}/></button></header>
      {spec ? <DataExplorer key={JSON.stringify(selection)} model={model} spec={spec} selection={selection} /> : <p className="notice">No source is linked to this chapter.</p>}
    </dialog>}
  </RecordContext.Provider>;
}
