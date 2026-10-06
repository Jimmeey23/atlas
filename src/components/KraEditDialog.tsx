import {useEffect,useRef,useState} from 'react';
import {acquisitionPeriodLabel} from '../data/acquisition';
export type KraEdit={current:string|null;lastYear:string|null;preceding:string|null;yoy:number|null;previousGrowth:number|null;status:string|null;explanation:string|null;note:string;annotation:string;updatedAt:string;basis:string};
export type KraInfo={id:string;area:string;target:string;weight:number;kind:string;manual?:boolean;targetEdited?:boolean};
export type EditResult={key:string;record:KraEdit;info:Omit<KraInfo,'id'|'kind'>;history:KraHistory[]};
export type KraHistory={id:string;key:string;updatedAt:string;before:KraEdit|null;after:KraEdit;info:Omit<KraInfo,'id'|'kind'>};
const empty={current:'',lastYear:'',preceding:'',yoy:'',previousGrowth:'',status:'',explanation:'',note:'',annotation:''};
export function KraEditDialog({period,definition,saved,source,onSaved,onClose}:{period:string;definition:KraInfo;saved?:KraEdit;source:{current:string;lastYear:string;preceding:string;status:string;explanation:string};onSaved:(result:EditResult)=>void;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null),[info,setInfo]=useState({area:definition.area,target:definition.target,weight:String(definition.weight)});
 const [form,setForm]=useState({...empty,...Object.fromEntries(Object.keys(empty).map(key=>[key,key==='yoy'||key==='previousGrowth'?saved?.[key]!=null?String(Number(saved[key])*100):'':saved?.[key as keyof KraEdit]??'']))}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();return()=>{ref.current?.close();};},[]);
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{
   const data={...form,current:form.current.trim()||null,lastYear:form.lastYear.trim()||null,preceding:form.preceding.trim()||null,status:form.status||null,explanation:form.explanation.trim()||null,yoy:form.yoy.trim()?Number(form.yoy)/100:null,previousGrowth:form.previousGrowth.trim()?Number(form.previousGrowth)/100:null};
   const response=await fetch('/api/kra/scorecard/'+period+'/'+definition.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({info:{...info,weight:Number(info.weight)},data,expectedUpdatedAt:saved?.updatedAt??null})});
   const result=await response.json();if(!response.ok)throw Error(result.error);onSaved(result);onClose();
 }catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}}
 const field=(key:keyof typeof empty,label:string,placeholder?:string,type='text')=><label>{label}<input aria-label={label} type={type} step={type==='number'?'any':undefined} value={form[key]} placeholder={placeholder} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>;
 return <dialog ref={ref} className="kra-edit-dialog" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <header><div><span className="kra-eyebrow">{period==='review'?'Full KRA review':acquisitionPeriodLabel(period)} · saved edits</span><h3>Edit KRA & notes</h3></div><button aria-label="Close KRA editor" disabled={busy} onClick={onClose}>×</button></header>
  <form onSubmit={save}><div className="kra-edit-grid">
   <label>KRA name<input aria-label="KRA name" required maxLength={200} value={info.area} onChange={event=>setInfo({...info,area:event.target.value})}/></label>
   <label>Weight (%)<input aria-label="KRA weight" type="number" min="0" max="100" step="any" required value={info.weight} onChange={event=>setInfo({...info,weight:event.target.value})}/></label>
   <label className="kra-wide">Target / KRA information<textarea aria-label="KRA target" rows={2} maxLength={2000} value={info.target} onChange={event=>setInfo({...info,target:event.target.value})}/></label>
   {field('current','Current achievement',source.current)}{field('lastYear','Last-year achievement',source.lastYear)}{field('preceding','Preceding achievement',source.preceding)}
   {field('yoy','Growth vs last year (%)','Source comparison','number')}{field('previousGrowth','Growth vs preceding (%)','Source comparison','number')}
   <label>Status<select aria-label="Edited KRA status" value={form.status} onChange={event=>setForm({...form,status:event.target.value})}><option value="">Use source status · {source.status}</option>{['On track','Lagging','In progress','Completed','Not started','Not recorded','Baseline needed','Review needed','Upcoming'].map(status=><option key={status}>{status}</option>)}</select></label>
   <label className="kra-wide">Explanation<textarea aria-label="Edited KRA explanation" rows={2} maxLength={6000} value={form.explanation} placeholder={source.explanation} onChange={event=>setForm({...form,explanation:event.target.value})}/></label>
   <label className="kra-wide">Notes<textarea aria-label="KRA notes" rows={3} maxLength={10000} value={form.note} placeholder="Add context, decisions, owners or follow-up actions…" onChange={event=>setForm({...form,note:event.target.value})}/></label>
   <label className="kra-wide">Annotations<textarea aria-label="KRA annotations" rows={2} maxLength={10000} value={form.annotation} placeholder="Annotate a figure, comparison or source record…" onChange={event=>setForm({...form,annotation:event.target.value})}/></label>
  </div><p className="small">Name, target and weight apply to every period. Achievements, notes and annotations apply to this period. Blank fields use source values; when changing achievements, enter growth and status explicitly. Saved changes survive refreshes and app restarts.</p>
  {error&&<p role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>setForm({...form,current:'',lastYear:'',preceding:'',yoy:'',previousGrowth:'',status:'',explanation:''})}>Use source figures</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button kra-save" disabled={busy}>{busy?'Saving…':'Save KRA & notes'}</button></footer>
  </form>
 </dialog>;
}
