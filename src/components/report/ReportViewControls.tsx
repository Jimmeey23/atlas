import '../../design/report-builder-studio.css';
import '../../design/report-customizer.css';
import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { DropdownField } from '../ui/DropdownField';
import { reportOptions } from '../../report/options';
import { chapters } from '../../report/chapters';
import { ReportLayoutPicker } from './ReportLayoutPicker';
import type { InsightCard, ReportCustomization, ReportModel } from '../../report/model';

const CONTENT_OPTIONS = [
  ['showContents', 'Chapter contents'], ['showCharts', 'Trend charts'],
  ['showInlineEvidence', 'Evidence beside findings'], ['includeActions', 'Recommended moves'],
  ['showActionPlan', 'Closing action plan'], ['showAppendix', 'Evidence appendix'],
  ['showSources', 'Sources and interpretation limits'],
] as const;
const FINDING_FIELDS = [
  ['headline','Headline'], ['meaning','Why it matters'], ['evidence','Supporting evidence'],
  ['driver','Driver / explanation'], ['action','Recommended move'], ['recommendation','Recommendation'],
  ['impact','Conditional value at stake'], ['ownerArea','Proposed owner'], ['horizon','Review date'], ['watch','Signal to watch'],
] as const;

/** Local document revisions; shared persistence continues through the reader's protected Save. */
export function ReportViewControls({ model, onChange }: { model: ReportModel; onChange: (model: ReportModel) => void }) {
  const [panel, setPanel] = useState('layout');
  const options = reportOptions(model.customization);
  const available = chapters.filter(c => model.chapters[c.id] || model.narratives[c.id]);
  const selected = model.customization?.chapterIds ?? available.map(c => c.id);
  const [chapterId, setChapterId] = useState(() => selected[0] ?? available[0]?.id ?? '');
  const currentChapter = available.find(c => c.id === chapterId) ?? available[0];
  const narrative = currentChapter && model.narratives[currentChapter.id];
  function patch(value: Partial<ReportCustomization>) {
    if (value.chapterIds?.includes('executive-summary')) value = { ...value, chapterIds: ['executive-summary', ...value.chapterIds.filter(id => id !== 'executive-summary')] };
    const customization: ReportCustomization = { title:'', subtitle:'', preparedFor:'', preparedBy:'', audience:'Studio leadership', tone:'Professional', detail:'Comprehensive', instructions:'', chapterIds:available.map(c => c.id), theme:'light', ...model.customization, ...value };
    onChange({ ...model, customization });
  }
  function reviseSummary(text: string) {
    if (!currentChapter || !narrative) return;
    onChange({ ...model, narratives: { ...model.narratives, [currentChapter.id]: { ...narrative, summary: text } } });
  }
  function reviseCard(index: number, key: keyof InsightCard, text: string) {
    if (!currentChapter || !narrative) return;
    onChange({ ...model, narratives: { ...model.narratives, [currentChapter.id]: { ...narrative, cards: narrative.cards.map((card, i) => i === index ? { ...card, [key]: text } : card) } } });
  }
  function move(id: string, step: number) {
    const next = [...selected], index = next.indexOf(id), target = index + step;
    if (index < 0 || target < 0 || target >= next.length || id === 'executive-summary' || next[target] === 'executive-summary') return;
    [next[index], next[target]] = [next[target], next[index]]; patch({chapterIds:next});
  }
  return <div className="report-view-controls report-customizer" aria-label="Customize generated report">
    <p className="report-customizer-intro">Refine this report</p><p>Changes appear immediately. Save changes to keep this version; export includes your current edits.</p>
    <div className="report-customizer-tabs" role="group" aria-label="Report editing sections">{[['layout','Layout'],['style','Style'],['content','Content']].map(([id,label]) => <button type="button" key={id} aria-pressed={panel === id} onClick={() => setPanel(id)}>{label}</button>)}</div>
    {panel === 'layout' && <ReportLayoutPicker value={options.reportTemplate} onChange={reportTemplate => patch({reportTemplate})} disabled={false}/>}
    {panel === 'style' && <div className="report-customizer-fields">
      <label>Panel arrangement<DropdownField aria-label="Report panel arrangement" value={options.layout} onChange={e => patch({layout:e.target.value as ReportCustomization['layout']})}><option value="adaptive">Follow document design</option><option value="full">Single column</option><option value="grid">Evidence grid</option></DropdownField></label>
      <label>Theme<DropdownField aria-label="Report theme" value={model.customization?.theme ?? 'light'} onChange={e => patch({theme:e.target.value as ReportCustomization['theme']})}><option value="light">Light</option><option value="dark">Dark</option></DropdownField></label>
      <label>Paper<DropdownField aria-label="Report paper" value={options.surface} onChange={e => patch({surface:e.target.value as ReportCustomization['surface']})}><option value="paper">White paper</option><option value="warm">Warm paper</option><option value="mist">Cool mist</option></DropdownField></label>
      <label>Spacing<DropdownField aria-label="Report spacing" value={options.density} onChange={e => patch({density:e.target.value as ReportCustomization['density']})}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></DropdownField></label>
      <label>Card treatment<DropdownField aria-label="Report card treatment" value={options.cardStyle} onChange={e => patch({cardStyle:e.target.value as ReportCustomization['cardStyle']})}><option value="bordered">Fine border</option><option value="elevated">Elevated</option><option value="minimal">Open / unboxed</option></DropdownField></label>
    </div>}
    {panel === 'content' && <div className="report-customizer-content">
      <label>Report title<input aria-label="Report title" value={model.customization?.title ?? ''} onChange={e => patch({title:e.target.value})}/></label>
      <fieldset><legend>Included sections</legend>{CONTENT_OPTIONS.map(([key,label]) => <label className="report-customizer-toggle" key={key}><input type="checkbox" checked={options[key]} onChange={e => patch({[key]:e.target.checked})}/>{label}</label>)}</fieldset>
      {!model.importedChapters?.length && <>
        <fieldset><legend>Chapters · include and reorder</legend><p className="report-customizer-note">The overview stays first when included.</p>{[...selected, ...available.map(c => c.id).filter(id => !selected.includes(id))].map(id => {
          const chapter = available.find(c => c.id === id); if (!chapter) return null;
          const index = selected.indexOf(id), included = index >= 0;
          return <div key={id} className="report-chapter-option"><label><input type="checkbox" checked={included} disabled={included && selected.length <= 1} onChange={e => patch({chapterIds:e.target.checked ? [...selected,id] : selected.filter(value => value !== id)})}/>{chapter.nav}</label><button type="button" aria-label={`Move ${chapter.nav} up`} disabled={!included || index === 0 || id === 'executive-summary' || selected[index-1] === 'executive-summary'} onClick={() => move(id,-1)}><ArrowUp size={15}/></button><button type="button" aria-label={`Move ${chapter.nav} down`} disabled={!included || index === selected.length-1 || id === 'executive-summary'} onClick={() => move(id,1)}><ArrowDown size={15}/></button></div>;
        })}</fieldset>
        <label>Edit chapter<DropdownField aria-label="Edit report chapter" value={currentChapter?.id ?? ''} onChange={e => setChapterId(e.target.value)}>{available.map(c => <option key={c.id} value={c.id}>{c.nav}</option>)}</DropdownField></label>
        {narrative && <><label>Chapter summary<textarea aria-label="Chapter summary" rows={5} value={narrative.summary} onChange={e => reviseSummary(e.target.value)}/></label>
          {narrative.cards.map((card,index) => <details className="report-finding-editor" key={card.id ?? index}><summary>Finding {index+1} · {card.headline || 'Untitled'}</summary>{FINDING_FIELDS.map(([key,label]) => <label key={key}>{label}<textarea aria-label={`Finding ${index+1}: ${label}`} rows={key === 'headline' || key === 'ownerArea' || key === 'horizon' ? 2 : 3} value={card[key] ?? ''} onChange={e => reviseCard(index,key,e.target.value)}/></label>)}</details>)}
          <p className="report-customizer-note">Figures remain tied to the saved evidence. Edited prose must still pass the report quality checks when saved or exported.</p>
        </>}
      </>}
      {!!model.importedChapters?.length && <p>Use Edit in the report toolbar to revise the imported chapter text and elements.</p>}
    </div>}
  </div>;
}
