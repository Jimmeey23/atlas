import { useState } from "react";
import { Check, Copy, SearchCode } from "lucide-react";
import { askAtlas } from "../../../report/brief";
import type { ReportModel } from "../../../report/model";

/**
 * The questions this chapter raises, rather than the conclusions it has already drawn.
 * Each is offered only where the chapter holds the figures that would answer it, and each
 * carries the method to use — so the prompt can go straight into the analysis workspace.
 */
export function AskAtlas({ model, chapter, ids }: { model: ReportModel; chapter: string; ids: string[] }) {
  const [copied, setCopied] = useState("");
  const questions = askAtlas(model, chapter, ids);
  if (!questions.length) return null;
  const copy = async (question: string) => {
    try {
      await navigator.clipboard?.writeText(question);
      setCopied(question);
      setTimeout(() => setCopied(current => current === question ? "" : current), 2000);
    } catch { setCopied(""); }
  };
  return <section className="dk-ask" aria-label="Ask Atlas">
    <div className="dk-quality-head">
      <span className="deck-eyebrow"><SearchCode size={12}/>Ask Atlas</span>
      <span className="dk-portfolio-axis">{model.scope.studio} · {model.scope.month} · questions this chapter raises</span>
    </div>
    <ul>
      {questions.map(item => <li key={item.q}>
        <span className="dk-ask-q"><b>{item.q}</b><small>{item.hint}</small></span>
        <button type="button" className="dk-ask-copy" onClick={() => void copy(item.q)} aria-label={`Copy question: ${item.q}`}>
          {copied === item.q ? <><Check size={12}/>Copied</> : <><Copy size={12}/>Copy question</>}
        </button>
      </li>)}
    </ul>
    <p className="dk-bridge-note">Take a question into the analysis workspace and answer it against the live source. Nothing here is a claim about the month — these are the investigations the figures point at next.</p>
  </section>;
}
