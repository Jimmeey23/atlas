import type { ReportModel } from "../../report/model";
import { useState } from "react";
import { SourceReportChapter } from "./deck/SourceReportChapter";
export function ImportedReport({ model }: { model: ReportModel }) {
  const [chapter, setChapter] = useState(model.importedChapters![0].id);
  return <><nav className="source-preview-tabs segmented" aria-label="Source chapter preview">{model.importedChapters!.map(c => <button key={c.id} className={c.id === chapter ? "active" : ""} onClick={() => setChapter(c.id)}>{c.title}</button>)}</nav><SourceReportChapter key={chapter} model={model} chapterId={chapter}/></>;
}
