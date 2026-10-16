import { chapters } from "../../report/chapters";
import type { ReportModel } from "../../report/model";
import { PRICES_AS_OF, summariseUsage } from "../../report/usage";

const tokens = (n: number) => n.toLocaleString("en-IN");
const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(n < 1 ? 3 : 2)}`;
const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/** What writing this report cost: tokens, money and time, overall and per chapter. */
export function GenerationStats({ model }: { model: ReportModel }) {
  const narratives = model.narratives ?? {};
  if (!Object.values(narratives).some((n) => n.usage)) return null;
  const run = summariseUsage(narratives);
  const total = run.inputTokens + run.outputTokens;
  const perChapter = run.written ? run.costUsd / run.written : 0;
  const order = model.customization?.chapterIds ?? chapters.map((c) => c.id);
  const rows = order.filter((id) => narratives[id]).map((id) => ({ id, title: chapters.find((c) => c.id === id)?.nav ?? id, n: narratives[id] }));
  const stats: [string, string, string?][] = [
    ["Cost of this run", `${usd(run.costUsd)}${run.costIncomplete ? "+" : ""}`, run.costIncomplete ? "A model's price is unknown; its calls are not costed" : run.written ? `${usd(perChapter)} per written chapter` : "No chapters written in this run"],
    ["Tokens", tokens(total), `${tokens(run.inputTokens)} in · ${tokens(run.outputTokens)} out`],
    ["Cached input", tokens(run.cachedInputTokens), run.inputTokens ? `${((run.cachedInputTokens / run.inputTokens) * 100).toFixed(0)}% of input, billed at the cached rate` : "No input billed"],
    ["Reasoning", tokens(run.reasoningTokens), run.outputTokens ? `${((run.reasoningTokens / run.outputTokens) * 100).toFixed(0)}% of output tokens` : "No output billed"],
    ["Chapters", `${run.written} written`, `${run.fromCache} reused from cache · ${run.failed} failed · ${run.calls} provider calls`],
    ["Time", model.generation ? duration(model.generation.durationMs) : duration(run.providerMs), `${duration(run.providerMs)} waiting on the model`],
  ];
  return <section className="report-usage" data-export="omit" aria-label="Generation stats">
    <header><div><span className="eyebrow">Generation stats</span><p>Usage for this report run</p></div><strong className="report-usage-model">{run.models.join(", ") || "No billed calls: every chapter came from cache"}</strong></header>
    <dl>{stats.map(([label, value, note]) => <div key={label} data-metric={label === "Cost of this run" ? "cost" : undefined}><dt>{label}</dt><dd>{value}{note && <small>{note}</small>}</dd></div>)}</dl>
    <details><summary>Per-chapter breakdown</summary>
      <div className="report-usage-table"><table>
        <thead><tr><th>Chapter</th><th>Status</th><th>Calls</th><th>Input</th><th>Cached</th><th>Output</th><th>Reasoning</th><th>Time</th><th>Cost</th></tr></thead>
        <tbody>{rows.map(({ id, title, n }) => { const u = n.usage;
          const status = u?.fromCache ? "Cache" : n.error ? "Failed" : n.generated ? "Written" : "No call";
          const billed = u && !u.fromCache;
          return <tr key={id}><td>{title}</td><td><span className="report-usage-status" data-status={status.toLowerCase()}>{status}</span></td><td>{billed ? u.calls : "—"}</td><td>{billed ? tokens(u.inputTokens) : "—"}</td><td>{billed ? tokens(u.cachedInputTokens) : "—"}</td><td>{billed ? tokens(u.outputTokens) : "—"}</td><td>{billed ? tokens(u.reasoningTokens) : "—"}</td><td>{billed ? duration(u.durationMs) : "—"}</td><td>{billed ? (u.costUsd == null ? "Unpriced" : usd(u.costUsd)) : "$0"}</td></tr>; })}
        </tbody></table></div>
    </details>
    <details className="report-usage-pricing"><summary>How usage is calculated</summary><p className="small">Costs use OpenAI standard list prices as of {PRICES_AS_OF}. Your OpenAI invoice is the authority. Reasoning tokens are counted within output. Cached chapters cost nothing in this run. Figures and findings are computed locally and are free.</p></details>
  </section>;
}
