import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Database } from 'lucide-react';
import type { GroupTable, ReportModel } from '../../../report/model';
import { chapters } from '../../../report/chapters';
import { definition } from '../../../report/definitions';
import { monthLabel } from '../../../report/period';
import { resolveRecordSelection, type RecordSelection } from '../../../report/drilldown';
export type { RecordSelection } from '../../../report/drilldown';
import { DataExplorer } from './DataExplorer';
const RecordContext = createContext<((selection: RecordSelection) => void) | null>(null);
export const useRecordDrilldown = () => useContext(RecordContext);
export function RecordDrilldownProvider({ model, chapterId, children }: { model: ReportModel; chapterId: string; children: ReactNode }) {
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<RecordSelection | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null);
  const selectedId=selection?.chapterId ?? chapterId;
  const spec = chapters.find(c => c.id === selectedId) ?? (selectedId==='attendance' ? {id:'attendance',nav:'Community attendance',title:'Attended source records',eyebrow:'Member practice',deck:'',source:'checkins',metrics:['checkins','unique_attendees','visits_per_member','checkin_revenue'],groups:[],history:['checkins']} : undefined);
  useEffect(() => { if (selection || error) dialog.current?.showModal(); }, [selection, error]);
  const close = () => { dialog.current?.close(); setSelection(null); setError(''); trigger.current?.focus(); };
  return <RecordContext.Provider value={value => { trigger.current = document.activeElement as HTMLElement; try { setError(''); setSelection(resolveRecordSelection(model, value, chapterId)); } catch (cause) { setSelection(null); setError((cause as Error).message); } }}>
    {children}
    {(selection || error) && <dialog ref={dialog} className="deck-record-dialog" onCancel={close} aria-label="Item-level source records" data-export="omit">
      <header><div><span className="deck-eyebrow"><Database size={13}/>Item-level source records</span><h2>{[selection?.metric && definition(selection?.metric)?.label, selection?.group].filter(Boolean).join(" · ") || spec?.nav}</h2><p>{spec?.nav} · {model.scope.studio} · {monthLabel(selection?.month ?? model.scope.month)} · {selection?.month && selection.month !== model.scope.month ? (model.recordSnapshots?.[spec?.source ?? '']?.[selection.month] ? 'archived report snapshot' : 'live source · may differ from report') : model.sourceRecords?.[spec?.source ?? ''] ? 'frozen source snapshot' : 'live source · may differ from report'}</p></div><button className="icon-button" aria-label="Close source records" onClick={close}><X size={18}/></button></header>
      {error ? <p className="notice" role="alert">{error}</p> : spec ? <DataExplorer key={JSON.stringify(selection)} model={model} spec={spec} selection={selection ?? undefined} /> : <p className="notice">No source is linked to this chapter.</p>}
    </dialog>}
  </RecordContext.Provider>;
}
