import { Fragment, type ReactNode } from "react";

// The model answers in Markdown. Rendering it as paragraphs loses the shape of
// the analysis, so each construct gets its own element: sections, key-figure
// grids, ranked findings and right-aligned numeric tables.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\n]+\*(?!\w))/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("**") ? <b key={i}>{part.slice(2, -2)}</b>
      : part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code>
      : part.startsWith("*") ? <em key={i}>{part.slice(1, -1)}</em>
      : <Fragment key={i}>{part}</Fragment>,
    );
}
const numeric = (value: string) =>
  /^[₹+\-(]?\s*[\d,.]+\s*(?:%|pp|×|x|L|Cr|d|days?|hrs?)?\)?$/i.test(value.trim());
const cells = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isTable = (lines: string[]) =>
  lines.length > 1 && lines[0].includes("|") && /^\s*\|?[\s:|-]+\|\s*$/.test(lines[1]);
// "**Gross revenue:** ₹59.5L" reads as a figure, not a sentence.
const FIGURE = /^\s*[-*]?\s*\*\*([^*]+?):?\*\*[:\s]+(.+)$/;

function Block({ lines }: { lines: string[] }) {
  if (isTable(lines)) {
    const head = cells(lines[0]);
    const body = lines.slice(2).map(cells);
    const align = head.map((_, i) => body.length && body.every((r) => !r[i] || numeric(r[i])));
    return (
      <div className="chat-result">
        <table>
          <thead>
            <tr>{head.map((c, j) => <th key={j} className={align[j] ? "num" : undefined}>{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) =>
                  j === 0
                    ? <th scope="row" key={j}>{inline(c)}</th>
                    : <td key={j} className={align[j] ? "num" : undefined}>{inline(c)}</td>,
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (lines.every((line) => /^\s*>\s?/.test(line)))
    return <blockquote className="chat-callout">{inline(lines.map((l) => l.replace(/^\s*>\s?/, "")).join(" "))}</blockquote>;
  if (lines.length && lines.every((line) => FIGURE.test(line))) {
    return (
      <dl className="chat-figures">
        {lines.map((line, i) => {
          const [, label, value] = line.match(FIGURE)!;
          return (
            <div key={i}>
              <dt>{label}</dt>
              <dd className={numeric(value) ? "num" : undefined}>{inline(value)}</dd>
            </div>
          );
        })}
      </dl>
    );
  }
  if (lines.every((line) => /^\s*\d+[.)]\s/.test(line)))
    return (
      <ol className="chat-ranked">
        {lines.map((line, j) => <li key={j}>{inline(line.replace(/^\s*\d+[.)]\s/, ""))}</li>)}
      </ol>
    );
  if (lines.every((line) => /^\s*[-*]\s/.test(line)))
    return <ul>{lines.map((line, j) => <li key={j}>{inline(line.replace(/^\s*[-*]\s/, ""))}</li>)}</ul>;
  if (lines.every((line) => /^\s*(?:[-*_]\s*){3,}$/.test(line))) return <hr />;
  return <p>{inline(lines.join(" "))}</p>;
}

export function ChatAnswer({ text }: { text: string }) {
  // Split on headings first so a section keeps its blocks together, then on
  // blank lines within each section.
  const sections: { heading?: string; level: number; body: string[][] }[] = [];
  let current: (typeof sections)[number] = { level: 0, body: [] };
  let block: string[] = [];
  const flush = () => {
    if (block.length) current.body.push(block);
    block = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      if (current.heading || current.body.length) sections.push(current);
      current = { heading: heading[2].replace(/:$/, ""), level: heading[1].length, body: [] };
    } else if (!raw.trim()) flush();
    else block.push(raw);
  }
  flush();
  if (current.heading || current.body.length) sections.push(current);

  return (
    <div className="chat-answer">
      {sections.map((section, i) => (
        <section className="chat-section" key={i} data-level={section.level || undefined}>
          {section.heading && (
            section.level <= 2
              ? <h3>{inline(section.heading)}</h3>
              : <h4>{inline(section.heading)}</h4>
          )}
          {section.body.map((lines, j) => <Block key={j} lines={lines} />)}
        </section>
      ))}
    </div>
  );
}
