import { useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { loadReport, saveReport } from "../../report/storage";
import type { ReportModel } from "../../report/model";
import { ReportDeck } from "./deck/ReportDeck";
import { PoppedNotes } from "./deck/SpeakerDrawer";
import "../../design/report-page.css";

/** A saved report in its own tab, presented as pages; it never loads the dashboard around it. */
export function ReportPage() {
  const [model, setModel] = useState<ReportModel | null>(null);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const loadedId = useRef("");
  const params = new URLSearchParams(location.search);
  const [draftId] = useState(() => params.get("draft") || crypto.randomUUID());
  const notesOnly = params.get("notes") === "1";

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const showId = (id: string) => { const url = new URL(location.href); url.searchParams.delete("draft"); url.searchParams.set("id", id); history.replaceState(null, "", url); };
    async function open(id?: string) {
      try {
        setError("");
        if (id) {
          if (loadedId.current === id) return;
          loadedId.current = id;
          const saved = await loadReport(id, controller.signal);
          if (!live || loadedId.current !== id) return;
          setModel(saved); setStorageError(""); showId(id);
          return;
        }
        const raw = sessionStorage.getItem(`atlas-report-page:${draftId}`);
        if (!raw) throw new Error("This report snapshot is unavailable. Open the report again from the report builder or use a saved report link.");
        const snapshot = JSON.parse(raw) as ReportModel;
        if (!snapshot.scope || !snapshot.chapters || !snapshot.narratives) throw new Error("This report snapshot is incomplete.");
        if (snapshot.id) { loadedId.current = snapshot.id; if (live) { setModel(snapshot); showId(snapshot.id); } return; }
        // Publish the exact frozen snapshot once, so a shared link loads identical figures and prose.
        let saved = snapshot;
        try { saved = await saveReport(snapshot, controller.signal); }
        catch (e) { if (live) setStorageError((e as Error).message); }
        if (!live) return;
        setModel(saved);
        if (saved.id) { loadedId.current = saved.id; sessionStorage.setItem(`atlas-report-page:${draftId}`, JSON.stringify(saved)); showId(saved.id); }
      } catch (e) { if (live && !controller.signal.aborted) { loadedId.current = ""; setError((e as Error).message); } }
    }
    const listener = (event: Event) => { void open((event as CustomEvent<string>).detail); };
    window.addEventListener("p57-present-report", listener);
    void open(params.get("id") || undefined);
    return () => { live = false; controller.abort(); window.removeEventListener("p57-present-report", listener); };
  }, [draftId]);

  if (!model) return <div className="report-page deck-loading-page" role="status">
    {error ? <><TriangleAlert size={22}/><h1>Report could not be opened</h1><p>{error}</p></> : <><Loader2 size={22} className="rb2-spin"/><h1>Opening your report…</h1></>}
  </div>;
  if (notesOnly) return <PoppedNotes model={model} />;
  return <ReportDeck key={model.id ?? draftId} initial={model} storageError={storageError} />;
}
