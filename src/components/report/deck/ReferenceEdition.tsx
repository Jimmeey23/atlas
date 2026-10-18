import { useEffect, useMemo, useRef } from 'react';
import type { ReportModel } from '../../../report/model';
import { referenceDocument, referenceTemplate } from '../../../report/reference-standard.mjs';

/** The source edition owns its styles; app themes cannot change its layout. */
export function ReferenceEdition({ model, chapterIds }: { model: ReportModel; chapterIds?: string[] }) {
  const ids = (chapterIds ?? model.customization?.chapterIds ?? []).filter(id => referenceTemplate(id));
  return <div className="reference-editions">{ids.map(id => <ReferenceFrame key={id} model={model} chapter={id}/>)}</div>;
}

function ReferenceFrame({ model, chapter }: { model: ReportModel; chapter: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => referenceDocument(model, [chapter]), [model, chapter]);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: ResizeObserver | undefined;
    const resize = () => {
      const body = element.contentDocument?.body;
      if (body) element.style.height = `${Math.max(600, body.scrollHeight + 2)}px`;
    };
    const ready = () => {
      observer?.disconnect(); resize();
      const body = element.contentDocument?.body;
      if (body) { observer = new ResizeObserver(resize); observer.observe(body); }
    };
    element.addEventListener('load', ready); ready();
    return () => { element.removeEventListener('load', ready); observer?.disconnect(); };
  }, [html]);
  return <section id={`chapter-${chapter}`} data-reader-chapter={chapter}>
    {model.narratives[chapter]?.error && <p className="notice" role="status">This reference edition is incomplete: {model.narratives[chapter].error}</p>}
    <iframe ref={frame} title={referenceTemplate(chapter)?.title} srcDoc={html} sandbox="allow-same-origin" style={{ width: '100%', height: 600, display: 'block', border: 0, background: '#f7f5f1' }}/>
  </section>;
}
