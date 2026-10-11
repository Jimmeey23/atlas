import { forwardRef } from "react";
import { deckTabs } from "../../../report/deck";
import type { ReportModel } from "../../../report/model";
import { ChapterReport } from "./ChapterReport";

/**
 * Every chapter as the document the deck shows, one after another, for the
 * downloaded and printed report. Live-only controls (record explorers, the
 * analytics drill-down) are left out; the evidence folds open natively.
 */
export const ChapterExport = forwardRef<HTMLElement, { model: ReportModel }>(function ChapterExport({ model }, ref) {
  const tabs = deckTabs(model);
  return <article ref={ref} className="cr-export">
    {tabs.map(tab => <ChapterReport key={tab.id} model={model} tab={tab} tabs={tabs} exporting />)}
  </article>;
});
