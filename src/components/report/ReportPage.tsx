import { useEffect, useRef, useState } from "react";
import { FloatingReviewTools } from "../FloatingReviewTools";
import { ReportViewControls } from "./ReportViewControls";
import { Download, Printer, ArrowUp, FileText } from "lucide-react";
import { ReportDocument } from "./ReportDocument";
import { PresentationTools } from "../PresentationTools";
import { StickyNotes } from "../StickyNotes";
import { loadReport, saveReport } from "../../report/storage";
import { downloadReport, printReport } from "../../report/export";
import type { ReportModel } from "../../report/model";
import "../../design/report-page.css";

/** A frozen report with the same live review tools as the workspace, without loading source data. */
export function ReportPage() {
  const [model, setModel] = useState<ReportModel | null>(null);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [busy, setBusy] = useState(false);
  const documentRef = useRef<HTMLElement>(null);
  const loadedId = useRef("");
  const [draftId] = useState(()=>new URLSearchParams(location.search).get('draft') || crypto.randomUUID());

  useEffect(()=>{
    let live = true;
    const controller = new AbortController();
    async function open(id?: string) {
      try {
        setError("");
        if (id) {
          if (loadedId.current === id) return;
          loadedId.current = id;
          const saved = await loadReport(id, controller.signal);
          if (!live || loadedId.current !== id) return;
          setModel(saved); setStorageError("");
          const url = new URL(location.href); url.searchParams.delete('draft'); url.searchParams.set('id',id);
          history.replaceState(null,"",url);
          return;
        }
        const raw = sessionStorage.getItem(`atlas-report-page:${draftId}`);
        if (!raw) throw new Error("This report snapshot is unavailable. Open the report again from the report builder or use a saved report link.");
        const snapshot = JSON.parse(raw) as ReportModel;
        if (!snapshot.scope || !snapshot.chapters || !snapshot.narratives) throw new Error("This report snapshot is incomplete.");
        if (snapshot.id) {
          loadedId.current=snapshot.id;
          if (!live) return;
          setModel(snapshot);
          const url=new URL(location.href);url.searchParams.delete('draft');url.searchParams.set('id',snapshot.id);history.replaceState(null,"",url);
          return;
        }
        // Publish the exact frozen snapshot once, so an invite loads identical figures and prose.
        // Storage failures still leave the generated report and local tools accessible.
        let saved = snapshot;
        try { saved = await saveReport(snapshot,controller.signal); }
        catch (e) { if (live) setStorageError((e as Error).message); }
        if (!live) return;
        setModel(saved);
        if (saved.id) {
          loadedId.current=saved.id;
          sessionStorage.setItem(`atlas-report-page:${draftId}`,JSON.stringify(saved));
          const url = new URL(location.href); url.searchParams.delete('draft'); url.searchParams.set('id',saved.id);
          history.replaceState(null,"",url);
        }
      } catch (e) { if (live && !controller.signal.aborted) {loadedId.current="";setError((e as Error).message);} }
    }
    const listener=(event:Event)=>{void open((event as CustomEvent<string>).detail);};
    window.addEventListener('p57-present-report',listener);
    void open(new URLSearchParams(location.search).get('id') || undefined);
    return ()=>{live=false;controller.abort();window.removeEventListener('p57-present-report',listener);};
  },[draftId]);

  async function exportReport(print: boolean) {
    if (!model || !documentRef.current) return;
    setBusy(true);setError("");
    try { await (print ? printReport : downloadReport)(documentRef.current,model); }
    catch(e) {setError((e as Error).message);}
    finally {setBusy(false);}
  }

  return <div className="report-page" data-report-id={model?.id || ""}>
    <header className="report-page-header">
      <div className="report-page-heading"><FileText size={20}/><div><small>ATLAS · COLLABORATIVE REPORT REVIEW</small><h1>{model?.customization?.title || "Monthly performance report"}</h1></div></div>
      <div className="report-page-actions" aria-label="Report review controls">
        <FloatingReviewTools><PresentationTools standalone beforeHost={async()=>{if (!model?.id) throw new Error(storageError || "Wait for the saved report before hosting a shared review.");}}/>
        {model && <StickyNotes key={model.id || draftId} reportId={model.id || draftId}/>}</FloatingReviewTools>
        {model && <ReportViewControls model={model} onChange={setModel}/>}
        <button className="button" disabled={!model||busy} onClick={()=>void exportReport(false)}><Download size={14}/>Download</button>
        <button className="button" disabled={!model||busy} onClick={()=>void exportReport(true)}><Printer size={14}/>Print / PDF</button>
        <button className="button" aria-label="Back to report cover" onClick={()=>{window.dispatchEvent(new CustomEvent('p57-report-navigate',{detail:''}));document.getElementById('main')?.scrollTo({top:0,behavior:'smooth'});}}><ArrowUp size={14}/>Cover</button>
      </div>
    </header>
    {error && <p className="report-page-status" role="alert">{error}</p>}
    {storageError && <p className="report-page-status" role="status">This snapshot is open locally. Shared hosting requires a saved report. {storageError}</p>}
    <main id="main" className="canvas report-page-canvas" aria-label="Report content">
      {model ? <ReportDocument ref={documentRef} model={model} theme={model.customization?.theme || "light"}/> : <p role="status">{error ? "Report could not be opened." : "Opening your report…"}</p>}
    </main>
  </div>;
}
