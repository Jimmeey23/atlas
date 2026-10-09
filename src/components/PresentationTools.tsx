import { DropdownField } from "./ui/DropdownField";
import { useEffect, useRef, useState } from 'react';
import { Music2, Radio, X, Play, Pause, Square, Copy, Hand, PenLine, MousePointer2 } from 'lucide-react';
import { useStore } from '../state/store';
import { PresenterToolkit, initialPresenter, type PresenterState } from './PresenterToolkit';
import { soundClips } from '../data/soundClips';
import '../design/presentation.css';

type Stroke = {points: [number,number][]; color:string; width?:number; tool?:'pen'|'highlight'|'rectangle'|'arrow'|'text'; text?:string};
type SharedState = {context: {tab:number;view:string;filters:ReturnType<typeof useStore.getState>['filters'];compare:string;transient:{field:string;value:string}[]}; scroll:number; reportId:string; annotations:Stroke[]; presenter?:PresenterState};
type Room = {code:string;name:string;paused:boolean;state:SharedState;participants:{id:string;name:string;hand:boolean}[]};
async function request(path:string,method='GET',body?:unknown,token?:string) {
  const response=await fetch('/api/presentations'+path,{method,headers:{'Content-Type':'application/json',...(token?{'X-Host-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'Session unavailable.'),{status:response.status});return result;
}
function context() {const {tab,view,filters,compare,transient}=useStore.getState();return {tab,view,filters,compare,transient};}
const canvas=()=>document.querySelector<HTMLElement>('main.canvas, main#main, .canvas');

export function PresentationTools() {
  const [panel,setPanel]=useState<'audio'|'session'|null>(null);
  const [search,setSearch]=useState(''),[playing,setPlaying]=useState(''),[paused,setPaused]=useState(false),[volume,setVolume]=useState(.6);
  const audio=useRef<HTMLAudioElement>();
  const [room,setRoom]=useState<Room|null>(null),[role,setRole]=useState<'host'|'viewer'|null>(null);
  const [name,setName]=useState(''),[code,setCode]=useState(new URLSearchParams(location.search).get('session')||'');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[follow,setFollow]=useState(true),[hand,setHand]=useState(false),[draw,setDraw]=useState(false),[copied,setCopied]=useState(false);
  const [strokes,setStrokes]=useState<Stroke[]>([]),[draft,setDraft]=useState<Stroke|null>(null),[bounds,setBounds]=useState({left:0,top:0,width:1,height:1,scroll:0});
  const [presenter,setPresenter]=useState<PresenterState>(initialPresenter);
  const [inkTool,setInkTool]=useState<NonNullable<Stroke['tool']>|'eraser'>('pen'),[inkColor,setInkColor]=useState('#e5aa29'),[inkWidth,setInkWidth]=useState(4),[inkText,setInkText]=useState(''),[redo,setRedo]=useState<Stroke[]>([]);
  const token=useRef(''),participant=useRef('');
  const live=useRef({room,role,follow,hand,strokes,presenter});live.current={room,role,follow,hand,strokes,presenter};
  const lastApplied=useRef('');
  const snapshot=():SharedState=>({context:context(),scroll:canvas()?.scrollTop||0,reportId:document.querySelector('[data-report-id]')?.getAttribute('data-report-id')||'',annotations:live.current.strokes,presenter:live.current.presenter});
  useEffect(()=>{audio.current=new Audio();audio.current.preload='none'; const a=audio.current;a.onended=()=>{setPlaying('');setPaused(false);};a.onerror=()=>{setError('This sound clip could not be loaded.');setPlaying('');};if(code)setPanel('session');return()=>{a.pause();a.src='';};},[]);
  useEffect(()=>{if(audio.current)audio.current.volume=volume;},[volume]);
  async function play(src:string){setError('');const a=audio.current!;if(a.src===new URL(src,location.href).href&&!a.paused){a.pause();setPaused(true);return;}if(a.src!==new URL(src,location.href).href)a.src=src;try{await a.play();setPlaying(src);setPaused(false);}catch{setError('Playback was blocked. Select the clip again to play it.');}}
  function apply(r:Room) {
    setRoom(live.current.role==='host'?{...r,paused:live.current.room?.paused??r.paused}:r);
    if(live.current.role!=='viewer'||!live.current.follow||r.paused)return;
    const signature=JSON.stringify(r.state.context);
    if(lastApplied.current!==signature){useStore.getState().set(r.state.context);lastApplied.current=signature;}
    if(r.state.reportId)window.dispatchEvent(new CustomEvent('p57-present-report',{detail:r.state.reportId}));
    setStrokes(r.state.annotations||[]);
    if(r.state.presenter)setPresenter(r.state.presenter);
    const el=canvas();if(el&&Math.abs(el.scrollTop-r.state.scroll)>3)el.scrollTop=r.state.scroll;
  }
  useEffect(()=>{
    if(!role||!room)return;
    let cancelled=false;let timer:ReturnType<typeof setTimeout>;
    async function tick(){try{
      const current=live.current;
      const r=role==='host'?await request('/'+room!.code,'PUT',{state:snapshot(),paused:current.room?.paused},token.current):await request('/'+room!.code+'/heartbeat','POST',{participantId:participant.current,hand:current.hand});
      if(!cancelled){apply(r);setError('');}
    }catch(e){if(!cancelled){setError(String((e as Error).message));if((e as Error & {status?:number}).status===410){setRoom(null);setRole(null);setStrokes([]);setDraw(false);setPresenter(initialPresenter);}}}finally{if(!cancelled)timer=setTimeout(tick,1200);}}
    void tick();return()=>{cancelled=true;clearTimeout(timer);};
  },[role,room?.code]);
  useEffect(()=>{
    if(!role&&!presenter.active)return;
    const update=()=>{const el=canvas();if(!el)return;const b=el.getBoundingClientRect();setBounds({left:b.left,top:b.top,width:b.width,height:b.height,scroll:el.scrollTop});};
    update();const timer=setInterval(update,250);window.addEventListener('resize',update);return()=>{clearInterval(timer);window.removeEventListener('resize',update);};
  },[role,presenter.active]);
  async function host(){setBusy(true);setError('');try{const r=await request('','POST',{name:name||'Studio review',state:snapshot()});token.current=r.token;setRole('host');setRoom(r);setStrokes([]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function join(){setBusy(true);setError('');try{const value=code.trim().match(/[a-f0-9]{12}/)?.[0]||code.trim();const r=await request('/'+value+'/join','POST',{name:name||'Guest'});participant.current=r.participantId;setRole('viewer');live.current.role='viewer';apply(r);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function leave(){setBusy(true);try{await request('/'+room!.code+(role==='host'?'':'/leave'),role==='host'?'DELETE':'POST',role==='host'?undefined:{participantId:participant.current},token.current);setRoom(null);setRole(null);setDraw(false);setStrokes([]);setPresenter(initialPresenter);lastApplied.current='';}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const point=(e:React.PointerEvent):[number,number]=>[Number(((e.clientX-bounds.left)/bounds.width).toFixed(5)),Number((e.clientY-bounds.top+bounds.scroll).toFixed(1))];
  const canAnnotate=role==='host'||(!role&&presenter.active);
  const undoInk=()=>{const last=strokes.at(-1);if(last){setRedo([...redo,last]);setStrokes(strokes.slice(0,-1));}};
  return <>
    <PresenterToolkit state={presenter} onChange={setPresenter} viewer={role==='viewer'}/>
    {canAnnotate&&<div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">
      <button className="button" aria-pressed={!draw} onClick={()=>setDraw(false)}><MousePointer2 size={14}/>Navigate</button>
      {(['pen','highlight','rectangle','arrow','text','eraser'] as const).map(tool=><button className="button" key={tool} aria-pressed={draw&&inkTool===tool} onClick={()=>{setInkTool(tool);setDraw(true);}}>{tool}</button>)}
      <label>Ink <input aria-label="Annotation color" type="color" value={inkColor} onChange={e=>setInkColor(e.target.value)}/></label>
      <label>Width <DropdownField aria-label="Annotation width" value={inkWidth} onChange={e=>setInkWidth(Number(e.target.value))}>{[2,4,8,16].map(w=><option key={w}>{w}</option>)}</DropdownField></label>
      {inkTool==='text'&&<input aria-label="Annotation text" placeholder="Label then click report" maxLength={180} value={inkText} onChange={e=>setInkText(e.target.value)}/>}
      <button className="button" disabled={!strokes.length} onClick={undoInk}>Undo</button><button className="button" disabled={!redo.length} onClick={()=>{setStrokes([...strokes,redo.at(-1)!]);setRedo(redo.slice(0,-1));}}>Redo</button><button className="button" disabled={!strokes.length} onClick={()=>{setStrokes([]);setRedo([]);}}>Clear</button>
    </div>}

    <button className="button presentation-launch" aria-label="Sound clips" title="Sound clips" onClick={()=>setPanel(panel==='audio'?null:'audio')} aria-expanded={panel==='audio'}><Music2 size={14}/><span>Sound clips</span></button>
    <button className="button presentation-launch" aria-label={room?"Live session":"Host a session"} title={room?"Live session":"Host a session"} onClick={()=>setPanel(panel==='session'?null:'session')} aria-expanded={panel==='session'}><Radio size={14}/><span>{room?'Live session':'Host a session'}</span>{room&&<i className="session-live-dot"/>}</button>
    {panel&&<aside className="presentation-panel" aria-label={panel==='audio'?'Sound clips':'Live presentation'}>
      <div className="presentation-head"><div><small>PHYSIQUE 57 · PRESENTATION</small><h3>{panel==='audio'?'Sound clips':'Host a session'}</h3></div><button className="icon-button" aria-label="Close presentation tools" onClick={()=>setPanel(null)}><X size={16}/></button></div>
      {error&&<p className="presentation-error" role="alert">{error}</p>}
      {panel==='audio'?<>
        <p className="small">The reference’s soundtrack and sound effects. Select a clip to play.</p>
        <input type="search" aria-label="Search sound clips" placeholder="Find a sound…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="sound-player"><span>{soundClips.find(c=>c.src===playing)?.label||'Ready to play'}</span><button className="icon-button" aria-label={paused?'Resume clip':'Pause clip'} disabled={!playing} onClick={()=>{if(paused)void play(playing);else{audio.current?.pause();setPaused(true);}}}>{paused?<Play size={14}/>:<Pause size={14}/>}</button><button className="icon-button" aria-label="Stop clip" disabled={!playing} onClick={()=>{audio.current?.pause();if(audio.current)audio.current.currentTime=0;setPlaying('');setPaused(false);}}><Square size={14}/></button></div>
        <label className="sound-volume">Volume<input type="range" min="0" max="1" step=".05" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>
        <div className="sound-list">{soundClips.filter(c=>c.label.toLowerCase().includes(search.toLowerCase())).map(c=><button key={c.src} className={playing===c.src?'active':''} onClick={()=>void play(c.src)} aria-label={`Play ${c.label}`}><span>{c.label}</span>{playing===c.src&&!paused?<Pause size={14}/>:<Play size={14}/>}</button>)}</div>
      </>:!room?<>
        <p className="small">Present the current workspace or saved report. Guests follow your navigation, filters and annotations.</p>
        <label>Your name / review title<input value={name} maxLength={40} placeholder="Monthly studio review" onChange={e=>setName(e.target.value)}/></label>
        <button className="button primary" disabled={busy} onClick={()=>void host()}><Radio size={14}/>Host a session</button>
        <div className="session-join"><label>Join with an invite link or code<input value={code} onChange={e=>setCode(e.target.value)} placeholder="Paste invite link or session code"/></label><button className="button" disabled={busy||!code.trim()} onClick={()=>void join()}>Join session</button></div>
      </>:<>
        <div className="session-status"><i className="session-live-dot"/><strong>{room.name}</strong><span>{role==='host'?'Hosting':'Viewing'} · {room.paused?'Paused':'Live'}</span></div>
        <p className="small">Code: <strong>{room.code}</strong> · Session expires after 8 hours.</p>
        {role==='host'?<>
          <button className="button" onClick={async()=>{try{const url=new URL(location.href);url.searchParams.set('session',room.code);await navigator.clipboard.writeText(url.href);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError('Copy this session code to share the invite: '+room.code);}}}><Copy size={14}/>{copied?'Invite copied':'Copy invite link'}</button>
          <div className="session-tools"><button className="button" onClick={()=>setRoom({...room,paused:!room.paused})}>{room.paused?<Play size={14}/>:<Pause size={14}/>} {room.paused?'Resume sharing':'Pause sharing'}</button><button className="button" aria-pressed={draw} onClick={()=>setDraw(!draw)}>{draw?<PenLine size={14}/>:<MousePointer2 size={14}/>} {draw?'Pen enabled':'Annotate'}</button></div>
          <div className="session-tools"><button className="button" disabled={!strokes.length} onClick={()=>setStrokes(strokes.slice(0,-1))}>Undo annotation</button><button className="button" disabled={!strokes.length} onClick={()=>setStrokes([])}>Clear annotations</button></div>
        </>:<div className="session-tools"><button className="button" aria-pressed={follow} onClick={()=>setFollow(!follow)}>{follow?'Following host':'Explore independently'}</button><button className="button" aria-pressed={hand} onClick={()=>setHand(!hand)}><Hand size={14}/>{hand?'Lower hand':'Raise hand'}</button></div>}
        <h4>Viewers · {room.participants.length}</h4><ul className="session-roster">{room.participants.map(p=><li key={p.id}><span>{p.name}</span>{p.hand&&<span>✋ Hand raised</span>}</li>)}</ul>{!room.participants.length&&<p className="small">Share the invite to bring viewers into this review.</p>}
        <button className="button" disabled={busy} onClick={()=>void leave()}>{role==='host'?'End session':'Leave session'}</button>
      </>}
    </aside>}
    {(role||presenter.active)&&<svg className="presentation-ink" aria-label="Presentation annotations" style={{left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height,pointerEvents:draw&&canAnnotate?'auto':'none'}} onPointerDown={e=>{if(!draw)return;e.currentTarget.setPointerCapture(e.pointerId);setRedo([]);if(inkTool==='eraser'){const [x,y]=point(e);setStrokes(strokes.filter(s=>{const xs=s.points.map(p=>p[0]),ys=s.points.map(p=>p[1]);return !(x>=Math.min(...xs)-.015&&x<=Math.max(...xs)+.015&&y>=Math.min(...ys)-15&&y<=Math.max(...ys)+15);}));return;}if(inkTool==='text'){if(inkText.trim())setStrokes([...strokes,{points:[point(e)],color:inkColor,width:inkWidth,tool:inkTool,text:inkText.trim()}].slice(-30));return;}setDraft({points:[point(e)],color:inkColor,width:inkWidth,tool:inkTool});}} onPointerMove={e=>{if(draft)setDraft({...draft,points:['rectangle','arrow'].includes(draft.tool||'')?[draft.points[0],point(e)]:[...draft.points,point(e)].slice(-1000)});}} onPointerUp={()=>{if(draft){setStrokes([...strokes,{...draft,points:draft.points.filter((_,i)=>i % Math.max(1,Math.ceil(draft.points.length/100))===0 || i===draft.points.length-1)}].slice(-30));setDraft(null);}}} onPointerCancel={()=>setDraft(null)}><defs><marker id="ink-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>{[...strokes,...(draft?[draft]:[])].map((s,i)=>{const points=s.points.map(([x,y])=>[x*bounds.width,y-bounds.scroll]);const [a,b=a]=points;const width=s.width||4;if(s.tool==='text')return <text key={i} x={a[0]} y={a[1]} fill={s.color} fontSize={14+width} fontWeight="600">{s.text}</text>;if(s.tool==='rectangle')return <rect key={i} x={Math.min(a[0],b[0])} y={Math.min(a[1],b[1])} width={Math.abs(b[0]-a[0])} height={Math.abs(b[1]-a[1])} fill="none" stroke={s.color} strokeWidth={width}/>;return <polyline key={i} points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke={s.color} opacity={s.tool==='highlight'?.35:1} strokeWidth={s.tool==='highlight'?width*5:width} strokeLinecap="round" strokeLinejoin="round" markerEnd={s.tool==='arrow'?'url(#ink-arrow)':undefined}/>;})}</svg>}
  </>;
}
