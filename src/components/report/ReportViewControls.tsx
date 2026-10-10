import { DropdownField } from '../ui/DropdownField';
import { reportOptions } from '../../report/options';
import { chapters } from '../../report/chapters';
import type { ReportCustomization, ReportModel } from '../../report/model';

/** Appearance is a viewer preference: original saved figures and prose are unchanged. */
export function ReportViewControls({ model, onChange }: { model: ReportModel; onChange: (model: ReportModel) => void }) {
  const options = reportOptions(model.customization);
  function patch(value: Partial<ReportCustomization>) {
    const customization: ReportCustomization = { title:'', subtitle:'', preparedFor:'', preparedBy:'', audience:'Studio leadership', tone:'Professional', detail:'Comprehensive', instructions:'', chapterIds:chapters.filter(c => model.chapters[c.id] || model.narratives[c.id]).map(c => c.id), theme:'light', ...model.customization, ...value };
    onChange({ ...model, customization });
  }
  return <div className="report-view-controls" aria-label="Report appearance">
    <label>Layout<DropdownField aria-label="Report layout" value={options.layout} onChange={e => patch({layout:e.target.value as ReportCustomization['layout']})}>
      <option value="adaptive">Side-by-side</option><option value="full">Reading</option><option value="grid">Card grid</option>
    </DropdownField></label>
    <label>Theme<DropdownField aria-label="Report theme" value={`${model.customization?.theme || 'light'}:${options.surface}`} onChange={e => { const [theme,surface] = e.target.value.split(':'); patch({theme:theme as ReportCustomization['theme'],surface:surface as ReportCustomization['surface']}); }}>
      <option value="light:paper">Crisp paper</option><option value="light:warm">Warm parchment</option><option value="light:mist">Cool mist</option><option value="dark:paper">Midnight</option><option value="dark:warm">Dark espresso</option><option value="dark:mist">Deep ocean</option>
    </DropdownField></label>
    <label>Colour<DropdownField aria-label="Report accent" value={options.accent} onChange={e => patch({accent:e.target.value as ReportCustomization['accent']})}>
      {['navy','teal','graphite','plum','forest','rose','amber','indigo','copper'].map(id => <option key={id} value={id}>{id[0].toUpperCase()+id.slice(1)}</option>)}
    </DropdownField></label>
  </div>;
}
