import {useState} from 'react';
import {SlidersHorizontal,ChartNoAxesCombined,PanelsTopLeft,BookOpen,ChevronUp,ChevronDown,Check,Target,Palette,ScanLine,LayoutGrid,Layers3} from 'lucide-react';
import {DropdownField} from '../ui/DropdownField';
import {chapters} from '../../report/chapters';
import {definition} from '../../report/definitions';
import {FOCUS_OPTIONS,reportOptions} from '../../report/options';
import type {ReportCustomization} from '../../report/model';
const TARGET_METRICS=['gross_revenue','fill_rate','session_complimentary_rate','conversion_rate','retention_rate','lead_conversion_rate','renewal_rate','booking_late_rate'];
const templates=[
 {id:'executive',label:'Executive review',chapters:['executive-summary','revenue-performance','conversion-funnel','renewals','sessions','recommendations']},
 {id:'commercial',label:'Commercial review',chapters:['executive-summary','revenue-performance','leads','website-marketing','meta-marketing','conversion-funnel','renewals','recommendations']},
 {id:'operations',label:'Studio performance',chapters:['executive-summary','sessions','formats','instructors','instructor-outcomes','community-attendance','late-cancellations','recommendations']},
 {id:'complete',label:'Complete review',chapters:chapters.map(c=>c.id)},
];
const tabs=[{id:'identity',label:'Report identity',icon:BookOpen},{id:'analysis',label:'Analysis & context',icon:ChartNoAxesCombined},{id:'appearance',label:'Layout & style',icon:PanelsTopLeft},{id:'chapters',label:'Chapters',icon:Layers3}] as const;
export function ReportSettings({value,patch,busy,onTarget,moveChapter}:{value:ReportCustomization;patch:(p:Partial<ReportCustomization>)=>void;busy:boolean;onTarget:(id:string,v:string)=>void;moveChapter:(id:string,d:number)=>void}) {
 const [active,setActive]=useState<string>('analysis');const options=reportOptions(value);
 const select=(key:keyof ReportCustomization,label:string,items:readonly string[]) => <label className="rb-field"><span>{label}</span><DropdownField value={String(value[key]??options[key as keyof typeof options]??'')} onChange={e=>patch({[key]:key==='historyMonths'?Number(e.target.value):e.target.value})}>{items.map(item=><option key={item} value={item}>{item}</option>)}</DropdownField></label>;
 return <fieldset disabled={busy} className="report-settings" data-export="omit"><legend><SlidersHorizontal size={17}/>Shape your report</legend>
  <div className="rb-settings-heading"><div><h3>A performance review, tailored to your audience</h3><p>Choose the emphasis, evidence and presentation. Every chapter uses the full available reporting context.</p></div><span className="rb-count"><Check size={13}/>{value.chapterIds.length} chapters</span></div>
  <div className="rb-tabs" role="group" aria-label="Report customization sections">{tabs.map(tab=><button key={tab.id} type="button" aria-pressed={active===tab.id} aria-controls={`rb-${tab.id}`} onClick={()=>setActive(tab.id)}><tab.icon size={15}/>{tab.label}</button>)}</div>
  <section className="rb-settings-panel" id="rb-identity" hidden={active!=='identity'} aria-label="Report identity">
   <div className="rb-fields">{(['title','subtitle','preparedFor','preparedBy'] as const).map(key=><label className="rb-field" key={key}><span>{{title:'Report title',subtitle:'Subtitle',preparedFor:'Prepared for',preparedBy:'Prepared by'}[key]}</span><input maxLength={160} value={value[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}</div>
  </section>
  <section className="rb-settings-panel" id="rb-analysis" hidden={active!=='analysis'} aria-label="Analysis and context">
   <div className="rb-fields">{select('audience','Audience',['Studio leadership','Executive board','Operations team','Commercial team'])}{select('tone','Writing style',['Professional','Analytical and direct','Plain language'])}{select('detail','Depth of interpretation',['Comprehensive','Concise'])}</div>
   <div className="rb-subheading"><ChartNoAxesCombined size={16}/><h4>Areas to explore more deeply</h4><span>Balanced if none selected</span></div>
   <div className="rb-focus-options">{FOCUS_OPTIONS.map(f=><label key={f.id}><input type="checkbox" checked={options.focusAreas.includes(f.id)} onChange={e=>patch({focusAreas:e.target.checked?[...options.focusAreas,f.id]:options.focusAreas.filter(id=>id!==f.id)})}/><span>{f.label}</span></label>)}</div>
   <label className="rb-field rb-instructions"><span>Questions the report should answer</span><textarea rows={3} maxLength={3000} value={value.instructions} onChange={e=>patch({instructions:e.target.value})} placeholder="For example: Is revenue growth supported by healthier demand? Which formats improved during the year, and what explains the change?"/></label>
   <details className="rb-targets"><summary><Target size={16}/>Optional performance targets<span>Compare the month with your benchmarks</span></summary><div className="rb-fields">{TARGET_METRICS.filter(id=>definition(id)).map(id=>{const pct=definition(id)!.format==='percent',target=value.targets?.[id];return <label className="rb-field" key={id}><span>{definition(id)!.label} {pct?'(%)':'(₹)'}</span><input type="number" min="0" max={pct?100:undefined} step="any" inputMode="decimal" value={target==null?'':pct?+(target*100).toFixed(2):target} onChange={e=>onTarget(id,e.target.value)}/></label>;})}</div><p>Blank targets use the recorded history. Targets do not change source figures.</p></details>
  </section>
  <section className="rb-settings-panel" id="rb-appearance" hidden={active!=='appearance'} aria-label="Layout and style">
   <div className="rb-fields">{select('density','Spacing',['compact','comfortable'])}{select('layout','Panel arrangement',['adaptive','full'])}{select('evidenceView','Initial evidence view',['auto','chart','table'])}{select('historyMonths','Visible history (months)',['6','12','14'])}{select('theme','Appearance',['light','dark'])}{select('accent','Accent',['navy','teal','graphite'])}</div>
   <p className="rb-help"><ScanLine size={15}/>Adaptive layout gives dense or tall panels the full width and pairs shorter panels evenly.</p>
   <div className="rb-toggles">{([{key:'showCover',label:'Branded cover'},{key:'showCharts',label:'Charts & sparklines'},{key:'showDefinitions',label:'Metric definitions'},{key:'showConfidence',label:'Interpretation confidence'},{key:'showSources',label:'Source & coverage notes'},{key:'showAppendix',label:'Full supporting detail'}] as const).map(item=><label key={item.key}><input type="checkbox" checked={options[item.key]} onChange={e=>patch({[item.key]:e.target.checked})}/><span>{item.label}</span></label>)}</div>
  </section>
  <section className="rb-settings-panel" id="rb-chapters" hidden={active!=='chapters'} aria-label="Chapter selection and order">
   <div className="rb-subheading"><LayoutGrid size={16}/><h4>Start with a review structure</h4></div><div className="rb-presets">{templates.map(t=><button type="button" key={t.id} onClick={()=>patch({chapterIds:[...t.chapters]})}>{t.label}<span>{t.chapters.length} chapters</span></button>)}</div>
   <div className="rb-subheading"><h4>Choose chapters & reading order</h4><button type="button" onClick={()=>patch({chapterIds:value.chapterIds.length===chapters.length?[]:chapters.map(c=>c.id)})}>{value.chapterIds.length===chapters.length?'Clear selection':'Select all'}</button></div>
   <div className="rb-chapters">{[...value.chapterIds,...chapters.map(c=>c.id).filter(id=>!value.chapterIds.includes(id))].flatMap(id=>{const chapter=chapters.find(c=>c.id===id);if(!chapter)return [];const index=value.chapterIds.indexOf(id);return [<div className="rb-chapter" data-selected={index>=0} key={id}><label><input type="checkbox" checked={index>=0} onChange={e=>patch({chapterIds:e.target.checked?[...value.chapterIds,id]:value.chapterIds.filter(c=>c!==id)})}/><span><b>{chapter.title}</b><small>{chapter.network?'Account-level context':chapter.derived?'Synthesis':chapter.source}</small></span></label>{index>=0&&<div className="rb-order"><span>{String(index+1).padStart(2,'0')}</span><button type="button" disabled={index===0} aria-label={`Move ${chapter.title} up`} onClick={()=>moveChapter(id,-1)}><ChevronUp size={14}/></button><button type="button" disabled={index===value.chapterIds.length-1} aria-label={`Move ${chapter.title} down`} onClick={()=>moveChapter(id,1)}><ChevronDown size={14}/></button></div>}</div>];})}</div>
   <p className="rb-help">Chapter selection changes the presentation. It does not restrict the AI’s access to the available reporting context.</p>
  </section>
 </fieldset>;
}
