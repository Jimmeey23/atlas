import { Check, LayoutTemplate, ArrowUpRight } from 'lucide-react';
import { REPORT_TEMPLATES, reportTemplate, type ReportTemplate } from '../../report/templates';

/** A schematic of the template's real masthead, metric and chapter arrangement; contains no invented data. */
function LayoutThumbnail({ id }: { id: ReportTemplate }) {
  return <span className="rt-mini" data-template={id} aria-hidden="true">
    <span className="rt-mini-rail"><i/><i/><i/><i/></span>
    <span className="rt-mini-page">
      <span className="rt-mini-head"><span>PHYSIQUE 57</span><b>Monthly<br/>review.</b><i/></span>
      <span className="rt-mini-metrics"><i/><i/><i/></span>
      <span className="rt-mini-section"><b>01</b><i/></span>
      <span className="rt-mini-columns"><span><i/><i/><i/><em/></span><span><i/><i/><i/><em/></span></span>
    </span>
  </span>;
}

export function ReportLayoutPicker({ value, onChange, disabled }: { value?: string; onChange: (id: ReportTemplate) => void; disabled: boolean }) {
  const selected = reportTemplate(value);
  return <section className="rs-card rt-picker" aria-labelledby="report-layout-heading">
    <header className="rs-card-head"><span className="rs-step">02</span><div><h3 id="report-layout-heading">Choose your report layout</h3><p>Choose a document structure, from a concise board pack to a spacious editorial review.</p></div><span className="rt-count"><LayoutTemplate size={14}/>10 layouts</span></header>
    <fieldset className="rt-options" disabled={disabled}><legend className="sr-only">Report layout</legend>
      {REPORT_TEMPLATES.map((template, i) => <label className="rt-option" key={template.id} data-selected={selected.id === template.id}>
        <input type="radio" name="report-template" value={template.id} checked={selected.id === template.id} onChange={() => onChange(template.id)} aria-label={`${template.name} report layout`}/>
        <LayoutThumbnail id={template.id}/>
        <span className="rt-option-copy"><span><b>{template.name}</b><span className="rt-selection">{selected.id === template.id ? <Check size={13}/> : String(i + 1).padStart(2, '0')}</span></span><small>{template.category}</small><span className="rt-option-structure">{template.structure}</span></span>
      </label>)}
    </fieldset>
    <div className="rt-detail" aria-live="polite"><span className="rt-detail-icon"><LayoutTemplate size={20}/></span><div><b>{selected.name} <span>Selected layout</span></b><p>{selected.description}</p><small>{selected.structure}</small></div><ArrowUpRight size={18} aria-hidden="true"/></div>
    <p className="rt-footnote">Layout previews are illustrative. Your figures, analysis and chapters stay intact. You can change layouts after generation. Save changes to retain your selected design.</p>
  </section>;
}
