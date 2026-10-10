import { useState } from 'react';
import { SlidersHorizontal, ChartNoAxesCombined, PanelsTopLeft, BookOpen, ChevronUp, ChevronDown, Check, Target, ScanLine, LayoutGrid, Layers3, Wand2, Lightbulb } from 'lucide-react';
import { DropdownField } from '../ui/DropdownField';
import { chapters } from '../../report/chapters';
import { definition } from '../../report/definitions';
import { FOCUS_OPTIONS, reportOptions } from '../../report/options';
import { INSIGHT_LENSES, type ReportAccent, type ReportCustomization } from '../../report/model';

const TARGET_METRICS = ['gross_revenue', 'fill_rate', 'session_complimentary_rate', 'conversion_rate', 'retention_rate', 'lead_conversion_rate', 'renewal_rate', 'booking_late_rate'];
const templates = [
  { id: 'executive', label: 'Executive review', chapters: ['executive-summary', 'revenue-performance', 'conversion-funnel', 'renewals', 'sessions', 'recommendations'] },
  { id: 'commercial', label: 'Commercial review', chapters: ['executive-summary', 'revenue-performance', 'leads', 'website-marketing', 'meta-marketing', 'conversion-funnel', 'renewals', 'recommendations'] },
  { id: 'operations', label: 'Studio performance', chapters: ['executive-summary', 'sessions', 'formats', 'instructors', 'instructor-outcomes', 'community-attendance', 'late-cancellations', 'recommendations'] },
  { id: 'complete', label: 'Complete review', chapters: chapters.map(c => c.id) },
];
/** One click sets the editorial and visual choices that belong together. */
const styles: { id: string; label: string; note: string; patch: Partial<ReportCustomization> }[] = [
  { id: 'board', label: 'Board pack', note: 'Editorial serif, elevated cards, priorities only', patch: { audience: 'Executive board', tone: 'Professional', detail: 'Concise', insightsPerChapter: 4, typography: 'editorial', cardStyle: 'elevated', accent: 'navy', density: 'comfortable', showGlance: true, showActionPlan: true, showAppendix: false, showDefinitions: false } },
  { id: 'leadership', label: 'Leadership review', note: 'Balanced depth with full evidence', patch: { audience: 'Studio leadership', tone: 'Analytical and direct', detail: 'Comprehensive', insightsPerChapter: 6, typography: 'modern', cardStyle: 'bordered', accent: 'navy', density: 'comfortable', showGlance: true, showActionPlan: true, showAppendix: true } },
  { id: 'huddle', label: 'Operations huddle', note: 'Compact, action-first, plain language', patch: { audience: 'Operations team', tone: 'Plain language', detail: 'Concise', insightsPerChapter: 4, typography: 'modern', cardStyle: 'minimal', accent: 'teal', density: 'compact', includeActions: true, showAppendix: false } },
  { id: 'deep', label: 'Deep-dive analysis', note: 'Every lens, definitions and sources', patch: { audience: 'Commercial team', tone: 'Analytical and direct', detail: 'Comprehensive', insightsPerChapter: 8, typography: 'classic', cardStyle: 'bordered', accent: 'graphite', density: 'comfortable', showDefinitions: true, showSources: true, showAppendix: true, lenses: INSIGHT_LENSES.map(l => l.id) } },
];
const ACCENTS: { id: ReportAccent; label: string; swatch: string }[] = [
  { id: 'navy', label: 'Navy', swatch: '#173656' }, { id: 'teal', label: 'Teal', swatch: '#087d86' }, { id: 'graphite', label: 'Graphite', swatch: '#3b475a' },
  { id: 'plum', label: 'Plum', swatch: '#6b2f6b' }, { id: 'forest', label: 'Forest', swatch: '#1f5f3f' }, { id: 'rose', label: 'Rose', swatch: '#a3324f' }, { id: 'amber', label: 'Amber', swatch: '#a8620a' },
];
const tabs = [{ id: 'style', label: 'Report style', icon: Wand2 }, { id: 'analysis', label: 'Analysis & insights', icon: ChartNoAxesCombined }, { id: 'appearance', label: 'Layout & design', icon: PanelsTopLeft }, { id: 'chapters', label: 'Chapters', icon: Layers3 }, { id: 'identity', label: 'Cover & identity', icon: BookOpen }] as const;

export function ReportSettings({ value, patch, busy, onTarget, moveChapter }: { value: ReportCustomization; patch: (p: Partial<ReportCustomization>) => void; busy: boolean; onTarget: (id: string, v: string) => void; moveChapter: (id: string, d: number) => void }) {
  const [active, setActive] = useState<string>('style'); const options = reportOptions(value);
  const select = (key: keyof ReportCustomization, label: string, items: readonly (string | [string, string])[]) => <label className="rb-field"><span>{label}</span><DropdownField value={String(value[key] ?? options[key as keyof typeof options] ?? '')} onChange={e => patch({ [key]: key === 'historyMonths' ? Number(e.target.value) : e.target.value })}>{items.map(item => { const [id, text] = Array.isArray(item) ? item : [item, item]; return <option key={id} value={id}>{text}</option>; })}</DropdownField></label>;
  const toggle = (items: readonly { key: keyof ReturnType<typeof reportOptions> & keyof ReportCustomization; label: string; note?: string }[]) => <div className="rb-toggles rb2-toggles">{items.map(item => <label key={item.key}><input type="checkbox" checked={!!options[item.key]} onChange={e => patch({ [item.key]: e.target.checked })}/><span><b>{item.label}</b>{item.note && <small>{item.note}</small>}</span></label>)}</div>;
  return <fieldset disabled={busy} className="report-settings rb2-settings" data-export="omit"><legend><SlidersHorizontal size={17}/>Shape your report</legend>
    <div className="rb-settings-heading"><div><h3>A performance review, tailored to your audience</h3><p>Pick a style, choose the insight lenses and evidence, then fine-tune design and chapters. Design changes restyle an open report instantly; analysis changes apply on the next Rewrite.</p></div><span className="rb-count"><Check size={13}/>{value.chapterIds.length} chapters · {options.insightsPerChapter} insights each</span></div>
    <div className="rb-tabs" role="group" aria-label="Report customization sections">{tabs.map(tab => <button key={tab.id} type="button" aria-pressed={active === tab.id} aria-controls={`rb-${tab.id}`} onClick={() => setActive(tab.id)}><tab.icon size={15}/>{tab.label}</button>)}</div>

    <section className="rb-settings-panel" id="rb-style" hidden={active !== 'style'} aria-label="Report style">
      <div className="rb2-style-grid">{styles.map(style => <button type="button" key={style.id} className="rb2-style" onClick={() => patch(style.patch)}
        data-active={Object.entries(style.patch).every(([k, v]) => JSON.stringify(value[k as keyof ReportCustomization] ?? options[k as keyof typeof options]) === JSON.stringify(v))}>
        <span className="rb2-style-preview" data-typography={style.patch.typography} data-card-style={style.patch.cardStyle} style={{ '--swatch': ACCENTS.find(a => a.id === style.patch.accent)?.swatch } as React.CSSProperties}><i/><i/><i/></span>
        <b>{style.label}</b><small>{style.note}</small></button>)}</div>
      <p className="rb-help"><Wand2 size={15}/>A style sets audience, depth, typography, cards and sections together. Adjust anything afterwards in the other tabs.</p>
    </section>

    <section className="rb-settings-panel" id="rb-analysis" hidden={active !== 'analysis'} aria-label="Analysis and insights">
      <div className="rb-fields">
        {select('audience', 'Audience', ['Studio leadership', 'Executive board', 'Operations team', 'Commercial team'])}
        {select('tone', 'Writing style', ['Professional', 'Analytical and direct', 'Plain language'])}
        {select('detail', 'Depth of interpretation', ['Comprehensive', 'Concise'])}
        {select('comparisonFocus', 'Lead comparison', [['balanced', 'Balanced (MoM, YoY, YTD)'], ['mom', 'Month on month'], ['yoy', 'Same month last year'], ['ytd', 'Year to date']])}
        <label className="rb-field"><span>Insights per chapter · {options.insightsPerChapter}</span><input type="range" min={3} max={8} step={1} value={options.insightsPerChapter} onChange={e => patch({ insightsPerChapter: Number(e.target.value) })}/></label>
      </div>
      <div className="rb-subheading"><Lightbulb size={16}/><h4>Insight lenses</h4><span>Each insight answers one of these questions</span></div>
      <div className="rb2-lenses">{INSIGHT_LENSES.filter(l => l.id !== 'next_step').map(lens => { const on = options.lenses.includes(lens.id); return <label key={lens.id} data-lens={lens.id} data-on={on}>
        <input type="checkbox" checked={on} onChange={e => { const next = e.target.checked ? [...options.lenses, lens.id] : options.lenses.filter(id => id !== lens.id); if (next.some(id => id !== 'next_step')) patch({ lenses: next }); }}/>
        <span><b>{lens.label}</b><small>{lens.question}</small></span></label>; })}</div>
      {toggle([{ key: 'includeActions', label: 'Recommended move on every insight', note: 'Plus the signal to watch next month' }, { key: 'quantifyImpact', label: 'Quantify what is at stake', note: 'Rupees, members, seats — with the arithmetic' }])}
      <div className="rb-subheading"><ChartNoAxesCombined size={16}/><h4>Areas to explore more deeply</h4><span>Balanced if none selected</span></div>
      <div className="rb-focus-options">{FOCUS_OPTIONS.map(f => <label key={f.id}><input type="checkbox" checked={options.focusAreas.includes(f.id)} onChange={e => patch({ focusAreas: e.target.checked ? [...options.focusAreas, f.id] : options.focusAreas.filter(id => id !== f.id) })}/><span>{f.label}</span></label>)}</div>
      <label className="rb-field rb-instructions"><span>Questions the report should answer</span><textarea rows={3} maxLength={3000} value={value.instructions} onChange={e => patch({ instructions: e.target.value })} placeholder="For example: Is revenue growth supported by healthier demand? Which formats improved during the year, and what explains the change?"/></label>
      <details className="rb-targets"><summary><Target size={16}/>Performance targets<span>Shown on the scorecard and beside every cited metric</span></summary><div className="rb-fields">{TARGET_METRICS.filter(id => definition(id)).map(id => { const pct = definition(id)!.format === 'percent', target = value.targets?.[id]; return <label className="rb-field" key={id}><span>{definition(id)!.label} {pct ? '(%)' : '(₹)'}</span><input type="number" min="0" max={pct ? 100 : undefined} step="any" inputMode="decimal" value={target == null ? '' : pct ? +(target * 100).toFixed(2) : target} onChange={e => onTarget(id, e.target.value)}/></label>; })}</div><p>Blank targets use the recorded history. Targets do not change source figures.</p></details>
    </section>

    <section className="rb-settings-panel" id="rb-appearance" hidden={active !== 'appearance'} aria-label="Layout and design">
      <div className="rb-subheading"><h4>Accent</h4></div>
      <div className="rb2-swatches" role="radiogroup" aria-label="Accent colour">{ACCENTS.map(a => <button type="button" role="radio" aria-checked={options.accent === a.id} key={a.id} onClick={() => patch({ accent: a.id })} style={{ '--swatch': a.swatch } as React.CSSProperties}><i/>{a.label}</button>)}</div>
      <div className="rb-fields">
        {select('theme', 'Appearance', [['light', 'Light'], ['dark', 'Dark']])}
        {select('typography', 'Typography', [['modern', 'Modern sans'], ['editorial', 'Editorial serif'], ['classic', 'Classic report']])}
        {select('cardStyle', 'Card style', [['bordered', 'Bordered'], ['elevated', 'Elevated'], ['minimal', 'Minimal']])}
        {select('density', 'Spacing', [['comfortable', 'Comfortable'], ['compact', 'Compact']])}
        {select('layout', 'Panel arrangement', [['adaptive', 'Adaptive two-column'], ['full', 'Full width']])}
        {select('evidenceView', 'Evidence pack opens as', [['auto', 'Automatic'], ['chart', 'Chart'], ['table', 'Table']])}
        {select('historyMonths', 'Visible history (months)', ['6', '12', '14'])}
      </div>
      <p className="rb-help"><ScanLine size={15}/>Choose what the report includes. Inline evidence places the cited metrics and the breakdown chart beside each insight.</p>
      {toggle([
        { key: 'showCover', label: 'Branded cover' }, { key: 'showGlance', label: 'At-a-glance scorecard', note: 'One page: verdict, area scorecard, wins, risks, decisions' },
        { key: 'showContents', label: 'Contents with verdicts' }, { key: 'showInlineEvidence', label: 'Inline evidence beside insights' },
        { key: 'showActionPlan', label: 'Action plan table' }, { key: 'showCharts', label: 'Charts & sparklines' },
        { key: 'showDefinitions', label: 'Metric definitions' }, { key: 'showConfidence', label: 'Confidence & priority tags' },
        { key: 'showSources', label: 'Source & coverage notes' }, { key: 'showAppendix', label: 'Evidence pack & history' },
        { key: 'pageBreaks', label: 'New page per chapter (PDF)' },
      ])}
    </section>

    <section className="rb-settings-panel" id="rb-chapters" hidden={active !== 'chapters'} aria-label="Chapter selection and order">
      <div className="rb-subheading"><LayoutGrid size={16}/><h4>Start with a review structure</h4></div><div className="rb-presets">{templates.map(t => <button type="button" key={t.id} onClick={() => patch({ chapterIds: [...t.chapters] })}>{t.label}<span>{t.chapters.length} chapters</span></button>)}</div>
      <div className="rb-subheading"><h4>Choose chapters & reading order</h4><button type="button" onClick={() => patch({ chapterIds: value.chapterIds.length === chapters.length ? [] : chapters.map(c => c.id) })}>{value.chapterIds.length === chapters.length ? 'Clear selection' : 'Select all'}</button></div>
      <div className="rb-chapters">{[...value.chapterIds, ...chapters.map(c => c.id).filter(id => !value.chapterIds.includes(id))].flatMap(id => { const chapter = chapters.find(c => c.id === id); if (!chapter) return []; const index = value.chapterIds.indexOf(id); return [<div className="rb-chapter" data-selected={index >= 0} key={id}><label><input type="checkbox" checked={index >= 0} onChange={e => patch({ chapterIds: e.target.checked ? [...value.chapterIds, id] : value.chapterIds.filter(c => c !== id) })}/><span><b>{chapter.title}</b><small>{chapter.network ? 'Account-level context' : chapter.derived ? 'Synthesis' : chapter.source}</small></span></label>{index >= 0 && <div className="rb-order"><span>{String(index + 1).padStart(2, '0')}</span><button type="button" disabled={index === 0} aria-label={`Move ${chapter.title} up`} onClick={() => moveChapter(id, -1)}><ChevronUp size={14}/></button><button type="button" disabled={index === value.chapterIds.length - 1} aria-label={`Move ${chapter.title} down`} onClick={() => moveChapter(id, 1)}><ChevronDown size={14}/></button></div>}</div>]; })}</div>
      <p className="rb-help">Chapter selection changes the presentation. It does not restrict the AI’s access to the available reporting context.</p>
    </section>

    <section className="rb-settings-panel" id="rb-identity" hidden={active !== 'identity'} aria-label="Cover and identity">
      <div className="rb-fields">{(['title', 'subtitle', 'preparedFor', 'preparedBy', 'confidentiality'] as const).map(key => <label className="rb-field" key={key}><span>{{ title: 'Report title', subtitle: 'Subtitle', preparedFor: 'Prepared for', preparedBy: 'Prepared by', confidentiality: 'Classification label' }[key]}</span><input maxLength={160} value={value[key] ?? (key === 'confidentiality' ? options.confidentiality : '')} onChange={e => patch({ [key]: e.target.value })}/></label>)}</div>
    </section>
  </fieldset>;
}
