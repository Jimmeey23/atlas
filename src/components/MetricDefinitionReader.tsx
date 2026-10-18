/** The same plain-language reference in the toolbar and Data quality; no source load is required. */
export function MetricDefinitionReader() {
  return <div className="metric-definition-reader">
    <p className="small">Find a metric to see what it means and how it is calculated. Expand “Source and calculation details” for the exact rules. <a href="/reference/metric-definitions.html" target="_blank" rel="noopener noreferrer">Open full reference</a> · <a href="/reference/metric-definitions.md" download>Download document</a></p>
    <iframe title="Atlas metric definition document" src="/reference/metric-definitions.html" style={{ width: '100%', height: '70vh', minHeight: 420, border: '1px solid var(--border, #ddd)', borderRadius: 8, background: 'white' }} />
  </div>;
}
