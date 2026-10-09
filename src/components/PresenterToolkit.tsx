import { DropdownField } from "./ui/DropdownField";
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize, X, Play, Pause, RotateCcw, Monitor, EyeOff, Lightbulb } from 'lucide-react';
export type PresenterState = { active:boolean; blackout:boolean; spotlight:boolean; zoom:number; chapter:string };
export const initialPresenter:PresenterState={active:false,blackout:false,spotlight:false,zoom:1,chapter:''};
export function PresenterToolkit({state,onChange,viewer=false}:{state:PresenterState;onChange:(s:PresenterState)=>void;viewer?:boolean}) {
  const [sections,setSections]=useState<{id:string;title:string}[]>([]),[notes,setNotes]=useState(''),[showNotes,setShowNotes]=useState(false);
  const [elapsed,setElapsed]=useState(0),[running,setRunning]=useState(false),[target,setTarget]=useState(20),[full,setFull]=useState(false);
  const live=useRef({state,onChange});live.current={state,onChange};
  useEffect(()=>{const handler=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',handler);return()=>document.removeEventListener('fullscreenchange',handler);},[]);
  useEffect(()=>{if(!state.active)setRunning(false);},[state.active]);
  useEffect(()=>{if(!running)return;const id=setInterval(()=>setElapsed(n=>n+1),1000);return()=>clearInterval(id);},[running]);
  useEffect(()=>{if(!state.active)return;const find=()=>setSections(Array.from(document.querySelectorAll<HTMLElement>('.r-section[id]')).map(el=>({id:el.id,title:el.querySelector('.r-section-topic, h2, h3')?.textContent || el.id.replaceAll('-',' ')})));find();const observer=new MutationObserver(find);observer.observe(document.getElementById('main')!,{childList:true,subtree:true});return()=>observer.disconnect();},[state.active]);
  useEffect(()=>{document.documentElement.dataset.presenting=String(state.active);const report=document.querySelector<HTMLElement>('.report-doc');if(report)report.style.setProperty('zoom',String(state.zoom));return()=>{delete document.documentElement.dataset.presenting;report?.style.removeProperty('zoom');};},[state.active,state.zoom]);
  useEffect(()=>{if(state.chapter)document.getElementById(state.chapter)?.scrollIntoView({block:'start',behavior:'instant'});else if(state.active)document.getElementById('main')?.scrollTo({top:0});},[state.chapter,state.zoom,state.active]);
  function move(direction:number){const index=sections.findIndex(s=>s.id===live.current.state.chapter);const next=sections[Math.max(0,Math.min(sections.length-1,index+direction))];if(next)onChange({...live.current.state,chapter:next.id});}
  useEffect(()=>{if(!state.active||viewer)return;const handler=(e:KeyboardEvent)=>{if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return;if(e.key==='Escape'){onChange({...live.current.state,active:false,blackout:false});return;}if(['ArrowRight','PageDown','ArrowLeft','PageUp','b','B'].includes(e.key)){e.preventDefault();if(e.key.toLowerCase()==='b')onChange({...live.current.state,blackout:!live.current.state.blackout});else move(['ArrowRight','PageDown'].includes(e.key)?1:-1);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[state.active,viewer,sections]);
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{/* Focus mode remains available when fullscreen is unsupported. */}}
  if(!state.active)return viewer?null:<button className="button presentation-launch" aria-label="Present" title="Present" onClick={()=>onChange({...state,active:true})}><Monitor size={14}/><span>Present</span></button>;
  return <>
    {state.blackout&&<div className="presenter-blackout" aria-label="Presentation screen blanked"/>}
    {state.spotlight&&!state.blackout&&<div className="presenter-spotlight" onPointerMove={e=>{e.currentTarget.style.setProperty('--spot-x',e.clientX+'px');e.currentTarget.style.setProperty('--spot-y',e.clientY+'px');}}/>}
    {!viewer&&<div className="presenter-toolbar" role="toolbar" aria-label="Presenter toolkit">
      <strong>Presenter</strong>
      <button className="icon-button" aria-label="Previous chapter" disabled={!sections.length} onClick={()=>move(-1)}><ChevronLeft size={18}/></button>
      <DropdownField aria-label="Presentation chapter" value={state.chapter} onChange={e=>onChange({...state,chapter:e.target.value})}><option value="">Report cover</option>{sections.map((s,i)=><option key={s.id} value={s.id}>{i+1}. {s.title}</option>)}</DropdownField>
      <button className="icon-button" aria-label="Next chapter" disabled={!sections.length} onClick={()=>move(1)}><ChevronRight size={18}/></button>
      <label>Zoom <DropdownField aria-label="Presentation zoom" value={state.zoom} onChange={e=>onChange({...state,zoom:Number(e.target.value)})}>{[.75,1,1.25,1.5,2].map(n=><option key={n} value={n}>{n*100}%</option>)}</DropdownField></label>
      <button className="button" aria-pressed={state.blackout} onClick={()=>onChange({...state,blackout:!state.blackout})}><EyeOff size={14}/>Blank</button>
      <button className="button" aria-pressed={state.spotlight} onClick={()=>onChange({...state,spotlight:!state.spotlight})}><Lightbulb size={14}/>Spotlight</button>
      <button className="button" aria-pressed={showNotes} onClick={()=>setShowNotes(!showNotes)}>Notes & timer</button>
      <button className="icon-button" aria-label="Toggle fullscreen" onClick={()=>void fullscreen()}>{full?<Minimize size={16}/>:<Maximize size={16}/>}</button>
      <button className="icon-button" aria-label="Exit presentation" onClick={()=>{onChange({...state,active:false,blackout:false,spotlight:false});if(document.fullscreenElement)void document.exitFullscreen();}}><X size={18}/></button>
    </div>}
    {!viewer&&showNotes&&<aside className="presenter-notes"><h3>Private presenter notes</h3><p className="small">Visible on this screen only. Keep notes closed when sharing your entire screen.</p><textarea aria-label="Presenter notes" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Talking points, decisions, questions…"/><div className="session-tools"><strong className={elapsed>=target*60?'warn':''}>{Math.floor(elapsed/60).toString().padStart(2,'0')}:{(elapsed%60).toString().padStart(2,'0')}</strong><button className="icon-button" aria-label={running?'Pause timer':'Start timer'} onClick={()=>setRunning(!running)}>{running?<Pause size={16}/>:<Play size={16}/>}</button><button className="icon-button" aria-label="Reset timer" onClick={()=>{setElapsed(0);setRunning(false);}}><RotateCcw size={16}/></button><label>Target minutes <input type="number" min="1" max="180" value={target} onChange={e=>setTarget(Math.max(1,Number(e.target.value)))}/></label></div></aside>}
  </>;
}
