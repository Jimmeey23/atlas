/** Preserve the author's words while separating paragraphs and explicitly authored lists. */
export function ReportProse({ text, className = '' }: { text?: string; className?: string }) {
  if (!text?.trim()) return null;
  const blocks = text.trim().split(/\n\s*\n/);
  return <div className={`rp-prose ${className}`}>{blocks.map((block, i) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    const list = lines.length > 0 && lines.every(line => /^(?:[-*•]\s+|\d+[.)]\s+)/.test(line));
    return list ? <ul key={i}>{lines.map((line, j) => <li key={j}>{line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '')}</li>)}</ul> : <p key={i}>{block}</p>;
  })}</div>;
}
