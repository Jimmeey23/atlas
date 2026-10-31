import { useEffect, useState } from 'react';

/** The reference contains historical studio figures, so load it through the authenticated API. */
export function MetricDefinitionReader() {
  const [files, setFiles] = useState<{html: string; markdown: string} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const makeUrl = (content: string, type: string) => {
      const url = URL.createObjectURL(new Blob([content], { type }));
      urls.push(url);
      return url;
    };
    void (async () => {
      const names = ['metric-definitions.html', 'metric-definitions.md', 'metric-consistency.json', 'sample-size-comparison.md'];
      const responses = await Promise.all(names.map(name => fetch(`/api/reference/${name}`)));
      if (responses.some(response => !response.ok)) throw new Error('The metric reference could not be loaded.');
      const [html, markdown, consistency, comparison] = await Promise.all(responses.map(response => response.text()));
      const consistencyUrl = makeUrl(consistency, 'application/json');
      const comparisonUrl = makeUrl(comparison, 'text/markdown');
      const markdownUrl = makeUrl(markdown, 'text/markdown');
      const safeHtml = html.replaceAll('href="metric-consistency.json"', `href="${consistencyUrl}"`)
        .replaceAll('href="sample-size-comparison.md"', `href="${comparisonUrl}"`)
        .replaceAll('href="metric-definitions.md"', `href="${markdownUrl}"`);
      const next = { html: makeUrl(safeHtml, 'text/html'), markdown: markdownUrl };
      if (active) setFiles(next);
      else urls.forEach(url => URL.revokeObjectURL(url));
    })().catch(e => { if (active) setError(String(e.message || e)); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  return <div className="metric-definition-reader">
    <p className="small">Find a metric to see what it means and how it is calculated. Expand “Source and calculation details” for the exact rules. {files && <><a href={files.html} target="_blank" rel="noopener noreferrer">Open full reference</a> · <a href={files.markdown} download="metric-definitions.md">Download document</a></>}</p>
    {error ? <p role="alert">{error}</p> : !files ? <p role="status">Loading reference…</p> : <iframe title="Atlas metric definition document" src={files.html} style={{ width: '100%', height: '70vh', minHeight: 420, border: '1px solid var(--border, #ddd)', borderRadius: 8, background: 'white' }} />}
  </div>;
}
