import { forwardRef } from 'react';
import type { ReportModel } from '../../report/model';
import { deckTabs } from '../../report/deck';
import { findingsFor, ledger } from '../../report/findings';
import { reportOptions } from '../../report/options';
import { ContinuousReport } from './deck/ContinuousReport';
import { SourceReportChapter } from './deck/SourceReportChapter';

/** Export uses the same chapter renderer as the reader, with all supporting evidence mounted. */
export const ReportDocument = forwardRef<HTMLElement, { model: ReportModel; theme: 'light' | 'dark'; pending?: string[] }>(function ReportDocument({ model, theme }, ref) {
  const options = reportOptions(model.customization);
  return <article ref={ref} className="report-doc r2 deck deck-doc cr-export" data-report-theme={theme} data-accent={options.accent} data-surface={options.surface} data-report-layout={options.layout} data-typography={options.typography} data-density={options.density} data-page-breaks={options.pageBreaks}>
    {model.importedChapters?.length ? model.importedChapters.map(c => <SourceReportChapter key={c.id} model={model} chapterId={c.id}/>) : <ContinuousReport model={model} tabs={deckTabs(model)} ranked={ledger(findingsFor(model))} onNavigate={() => undefined} exporting withNavigation/>}
  </article>;
});
