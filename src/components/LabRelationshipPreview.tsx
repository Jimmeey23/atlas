import { useEffect, useRef, useState } from "react";
import { query } from "../data/duckdb";
import { ensureSource } from "../data/loader";
import { assertField, labId, type LabRelationship } from "../data/data-lab";
export function LabRelationshipPreview({
  relationship: r,
}: {
  relationship: LabRelationship;
}) {
  const [preview, setPreview] = useState<{
    source: Record<string, any>;
    target: Record<string, any>;
    samples: Record<string, any>[];
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++;
    setPreview(null);
    setError("");
    setBusy(false);
    return () => {
      sequence.current++;
    };
  }, [r.from, r.fromKey, r.to, r.toKey, r.join]);
  async function inspect() {
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      assertField({ source: r.from, column: r.fromKey });
      assertField({ source: r.to, column: r.toKey });
      await Promise.all([ensureSource(r.from), ensureSource(r.to)]);
      const source = labId(r.from),
        target = labId(r.to),
        left = labId(r.fromKey),
        right = labId(r.toKey);
      const s = await query(
        `SELECT COUNT(*) AS records, COUNT(${left}) AS populated, COUNT(DISTINCT ${left}) AS unique_keys, COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM ${target} t WHERE f.${left}=t.${right})) AS matched FROM ${source} f`,
      );
      const t = await query(
        `SELECT COUNT(*) AS records, COUNT(${right}) AS populated, COUNT(DISTINCT ${right}) AS unique_keys FROM ${target}`,
      );
      const samples = await query(
        `SELECT f.${left} AS matching_key, COUNT(*) AS source_rows, MAX(COALESCE(t.target_rows,0)) AS target_matches FROM ${source} f LEFT JOIN (SELECT ${right}, COUNT(*) AS target_rows FROM ${target} WHERE ${right} IS NOT NULL GROUP BY ${right}) t ON f.${left}=t.${right} WHERE f.${left} IS NOT NULL GROUP BY f.${left} ORDER BY source_rows DESC LIMIT 5`,
      );
      if (request === sequence.current)
        setPreview({ source: s[0], target: t[0], samples });
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  const unique = (p: Record<string, any>) =>
    Number(p.populated) === Number(p.unique_keys);
  return (
    <div className="lab-merge-preview">
      <div className="lab-merge-equation">
        <strong>
          {r.from}.{r.fromKey}
        </strong>
        <span>=</span>
        <strong>
          {r.to}.{r.toKey}
        </strong>
      </div>
      <button onClick={() => void inspect()} disabled={busy}>
        {busy ? "Checking keys…" : "Preview relationship"}
      </button>
      {error && (
        <p role="alert" className="lab-error">
          {error}
        </p>
      )}
      {preview && (
        <div role="status">
          <p>
            <b>
              {unique(preview.source) ? "One" : "Many"} →{" "}
              {unique(preview.target) ? "one" : "many"}
            </b>{" "}
            · {Number(preview.source.matched).toLocaleString()} of{" "}
            {Number(preview.source.records).toLocaleString()} source records
            match.
          </p>
          <p>
            Source:{" "}
            {Number(preview.source.records) - Number(preview.source.populated)}{" "}
            missing keys. Target:{" "}
            {Number(preview.target.records) - Number(preview.target.populated)}{" "}
            missing keys;{" "}
            {Number(preview.target.populated) -
              Number(preview.target.unique_keys)}{" "}
            duplicate-key rows.
          </p>
          {!unique(preview.target) && (
            <p>
              Multiple matches expand into separate rows in Merged table. For
              summaries and pivots, choose Latest record or Earliest record
              under Duplicate matches to keep one complete target record per
              key.
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>Sample key</th>
                <th>Source rows</th>
                <th>Target matches</th>
              </tr>
            </thead>
            <tbody>
              {preview.samples.map((v, i) => (
                <tr key={i}>
                  <td>{String(v.matching_key)}</td>
                  <td>{String(v.source_rows)}</td>
                  <td>{String(v.target_matches)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Key coverage uses all loaded records. Global filters apply when the
            table runs.
          </p>
        </div>
      )}
    </div>
  );
}
