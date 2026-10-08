import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { ArrowUpRight, Check, Copy, Download, LayoutDashboard, GitCompareArrows, Pin, ChartNoAxesCombined, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { ChatAnswer } from "./ChatAnswer";
import { InstructorName } from "./InstructorAvatar";
import { exportCSV } from "./exports";
import { fmt, formatField } from "../semantics/formats";
import { metrics } from "../semantics/metrics";
import { tabs, useStore } from "../state/store";

type Action = { type: "open_tab" | "set_compare" | "build_element" | "export_csv" | "pin_insight"; label: string; tab: number | null; compare: string | null; prompt: string | null; evidence: number | null; scope_json: string | null };
export type Presentation = {
  headline: string;
  answer: string;
  highlights: { label: string; value: string; change: string | null; tone: "positive" | "negative" | "neutral" }[];
  chart: { type: string; title: string; evidence: number; x: string; series: string[] } | null;
  table_evidence: number | null;
  caveats: string[];
  follow_ups: string[];
  actions: Action[];
  unverified?: string[];
};

const signed = (n: number, digits: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}${unit}`;
/** Analysis tools return columns like attendance_a, fill_rate_change_pp or share_of_change; format them by their base metric. */
export function cellValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Number.isFinite(n)) {
    if (/(_|^)(change_pct|share_of_change|vs_peer_avg)$/.test(key)) return signed(n * 100, 1, "%");
    if (/(_|^)change_pp$/.test(key)) return signed(n, 1, "pp");
    if (key === "percentile") return `${Math.round(n * 100)}th`;
    // Driver contributions are in the unit of the metric being explained, not the payroll "contribution" metric.
    if (key === "contribution" || key === "change") return signed(n, Number.isInteger(n) ? 0 : 1, "");
    const base = key.replace(/_(a|b|change|latest|baseline|scenario)$/, "");
    if (metrics[base]) return /_change$/.test(key) && metrics[base].format === "percent" ? signed(n * 100, 1, "pp") : (/_change$/.test(key) && n > 0 ? "+" : "") + fmt(base, n, true);
  }
  return formatField(key, value);
}
const label = (key: string) => key.replaceAll("_", " ").replace(/\b(a|b)$/, (m) => (m === "a" ? "(A)" : "(B)"));
const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function ReplyChart({ chart, rows }: { chart: NonNullable<Presentation["chart"]>; rows: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !rows.length) return;
    const instance = echarts.init(ref.current, undefined, { renderer: "svg" });
    const accent = css("--accent", "#7c5cff"), accent2 = css("--accent-2", "#22c1c3"), text = css("--text-3", "#8a8f98"), line = css("--hairline", "rgba(128,128,128,.18)");
    const palette = [accent, accent2, "#f59e0b", "#ef4466"];
    const series = chart.series.filter((s) => rows.some((r) => Number.isFinite(Number(r[s])))).slice(0, 4);
    const cats = rows.map((r) => String(r[chart.x] ?? "—"));
    const horizontal = chart.type === "horizontal_bar";
    const axisLabel = { color: text, fontSize: 10 };
    const valueAxis = { type: "value" as const, axisLabel: { ...axisLabel, formatter: (v: number) => cellValue(series[0] ?? "", v) }, splitLine: { lineStyle: { color: line } } };
    const catAxis = { type: "category" as const, data: cats, axisLabel: { ...axisLabel, width: horizontal ? 110 : 80, overflow: "truncate" as const, interval: horizontal ? 0 : "auto" as const }, axisLine: { lineStyle: { color: line } }, axisTick: { show: false }, ...(horizontal ? { inverse: true } : {}) };
    instance.setOption(
      chart.type === "donut"
        ? {
            color: palette.concat(["#10b981", "#6366f1"]),
            tooltip: { trigger: "item", valueFormatter: (v: unknown) => cellValue(series[0], v) },
            legend: { bottom: 0, textStyle: { color: text, fontSize: 10 }, type: "scroll" },
            series: [{ type: "pie", radius: ["48%", "72%"], center: ["50%", "44%"], itemStyle: { borderRadius: 6, borderColor: css("--surface-1", "#fff"), borderWidth: 2 }, label: { show: false }, data: rows.map((r) => ({ name: String(r[chart.x]), value: Number(r[series[0]]) })) }],
          }
        : {
            color: palette,
            grid: { left: 8, right: 12, top: series.length > 1 ? 28 : 10, bottom: 4, containLabel: true },
            legend: series.length > 1 ? { top: 0, textStyle: { color: text, fontSize: 10 }, data: series.map(label) } : undefined,
            tooltip: { trigger: "axis", axisPointer: { type: chart.type === "line" ? "line" : "shadow" } },
            xAxis: horizontal ? valueAxis : catAxis,
            yAxis: horizontal ? catAxis : valueAxis,
            series: series.map((s, i) => ({
              name: label(s),
              type: chart.type === "line" ? "line" : "bar",
              stack: chart.type === "stacked_bar" ? "total" : undefined,
              smooth: true,
              symbolSize: 6,
              barMaxWidth: 26,

              areaStyle: chart.type === "line" && series.length === 1 ? { opacity: 0.12 } : undefined,
              tooltip: { valueFormatter: (v: unknown) => cellValue(s, v) },
              // Round the outer end of each bar, which is the left / bottom end for negative values.
              data: rows.map((r) => {
                if (r[s] == null) return null;
                const v = Number(r[s]);
                const radius = chart.type === "stacked_bar" || chart.type === "line" ? 0 : horizontal ? (v < 0 ? [5, 0, 0, 5] : [0, 5, 5, 0]) : v < 0 ? [0, 0, 5, 5] : [5, 5, 0, 0];
                return { value: v, itemStyle: { borderRadius: radius } };
              }),
              z: 2 + i,
            })),
          },
    );
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(ref.current);
    return () => { resize.disconnect(); instance.dispose(); };
  }, [chart, rows]);
  const height = chart.type === "horizontal_bar" ? Math.max(160, Math.min(420, rows.length * 26 + 30)) : 220;
  return (
    <figure className="agent-reply-chart">
      <figcaption>{chart.title}</figcaption>
      <div ref={ref} style={{ height }} role="img" aria-label={chart.title} />
    </figure>
  );
}

function ReplyTable({ rows }: { rows: any[] }) {
  const keys = Object.keys(rows[0] || {}).filter((k) => !/_material$/.test(k)).slice(0, 9);
  return (
    <div className="chat-result agent-reply-table">
      <table>
        <thead><tr>{keys.map((k) => <th key={k}>{label(k)}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 25).map((row, n) => (
            <tr key={n}>{keys.map((k) => <td key={k} className={Number.isFinite(Number(row[k])) && row[k] !== "" && typeof row[k] !== "boolean" ? "num" : undefined}>{["trainer", "instructor"].includes(k) && row[k] ? <InstructorName name={String(row[k])} /> : cellValue(k, row[k])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > 25 && <p className="small">First 25 of {rows.length} rows · export for all.</p>}
    </div>
  );
}

const icons = { open_tab: LayoutDashboard, set_compare: GitCompareArrows, build_element: ChartNoAxesCombined, export_csv: Download, pin_insight: Pin };
const filterKeys = ["from", "to", "location", "trainer", "format", "day", "time", "source", "category"] as const;

async function saveDoc(doc: object) {
  const r = await fetch("/api/intelligence/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not save.");
  window.dispatchEvent(new Event("p57-documents"));
  return data;
}

export function AgentReply({ message, question, onAsk, onBuild, latest }: { message: any; question: string; onAsk: (text: string) => void; onBuild: (prompt: string) => void; latest: boolean }) {
  const p: Presentation | undefined = message.presentation;
  const evidence: any[] = message.evidence || [];
  const [done, setDone] = useState<Record<string, string>>({});
  const [rating, setRating] = useState<"up" | "down" | null>(message.rating ?? null);
  const [correction, setCorrection] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const note = (key: string, text: string) => setDone((d) => ({ ...d, [key]: text }));

  const run = async (a: Action, i: number) => {
    const key = "a" + i;
    try {
      const store = useStore.getState();
      if (a.type === "open_tab" && a.tab != null) {
        let scope: Record<string, unknown> = {};
        try { scope = a.scope_json ? JSON.parse(a.scope_json) : message.scope || {}; } catch { scope = message.scope || {}; }
        const picked = Object.fromEntries(filterKeys.filter((k) => scope[k] != null).map((k) => [k, scope[k]]));
        store.set({ tab: a.tab, filters: { ...store.filters, ...picked } });
        note(key, "Opened");
      } else if (a.type === "set_compare" && a.compare) {
        store.set({ compare: a.compare });
        note(key, "Compare on");
      } else if (a.type === "build_element" && a.prompt) {
        onBuild(a.prompt);
      } else if (a.type === "export_csv" && a.evidence != null && evidence[a.evidence]) {
        exportCSV(a.label.replace(/^export\s*/i, "") || "agent-result", evidence[a.evidence].result || []);
        note(key, "Exported");
      } else if (a.type === "pin_insight" && a.prompt) {
        const page = a.tab ?? (store.tab === 13 ? 0 : store.tab);
        await saveDoc({ kind: "insight", title: a.label.replace(/^pin\s*/i, "").slice(0, 100) || "Agent finding", page, body: { text: a.prompt, severity: "watch", source: "agent" } });
        note(key, `Pinned to ${tabs[page]}`);
      }
    } catch (e) {
      note(key, (e as Error).message);
    }
  };

  const sendCorrection = async () => {
    try {
      await saveDoc({ kind: "memory", title: ("Correction: " + question).slice(0, 100), page: 13, body: { text: `When asked "${question.slice(0, 300)}", the earlier answer was wrong. Correct approach: ${correction.trim()}`, source: "feedback" } });
      setFeedbackOpen(false);
      note("feedback", "Saved to agent memory — future answers will use it.");
    } catch (e) {
      note("feedback", (e as Error).message);
    }
  };

  const chartRows = p?.chart ? evidence[p.chart.evidence]?.result || [] : [];
  const tableRows = p?.table_evidence != null ? evidence[p.table_evidence]?.result || [] : [];
  return (
    <div className="agent-reply">
      {p ? (
        <>
          <p className="agent-reply-headline">{p.headline}</p>
          {!!p.highlights?.length && (
            <div className="agent-reply-highlights">
              {p.highlights.slice(0, 4).map((h, i) => (
                <div key={i} className={`agent-reply-kpi ${h.tone}`}>
                  <span>{h.label}</span>
                  <strong>{h.value}</strong>
                  {h.change && <small>{h.change}</small>}
                </div>
              ))}
            </div>
          )}
          {p.answer && <ChatAnswer text={p.answer} />}
          {p.chart && chartRows.length > 0 && <ReplyChart chart={p.chart} rows={chartRows} />}
          {tableRows.length > 0 && <ReplyTable rows={tableRows} />}
          {(p.caveats?.length > 0 || p.unverified?.length) && (
            <ul className="agent-reply-caveats">
              {p.caveats?.map((c, i) => <li key={i}>{c}</li>)}
              {!!p.unverified?.length && <li className="warn"><TriangleAlert size={12} /> Not matched to a query result: {p.unverified.join(", ")}</li>}
            </ul>
          )}
          {!!p.actions?.length && (
            <div className="agent-reply-actions">
              {p.actions.map((a, i) => {
                const Icon = icons[a.type] || ArrowUpRight;
                return (
                  <button key={i} className="agent-action" onClick={() => void run(a, i)} title={a.type === "open_tab" && a.tab != null ? `Open ${tabs[a.tab]}` : undefined}>
                    {done["a" + i] ? <Check size={13} /> : <Icon size={13} />}
                    <span>{done["a" + i] || a.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {latest && !!p.follow_ups?.length && (
            <div className="agent-followups" aria-label="Suggested follow-up questions">
              {p.follow_ups.map((f) => (
                <button key={f} onClick={() => onAsk(f)}>{f}<ArrowUpRight size={12} /></button>
              ))}
            </div>
          )}
        </>
      ) : (
        <ChatAnswer text={message.content} />
      )}
      <div className="agent-reply-footer">
        <button aria-label="Copy answer" title="Copy" onClick={() => { void navigator.clipboard?.writeText(message.content); note("copy", "Copied"); }}>
          {done.copy ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button aria-label="Helpful" title="Helpful" aria-pressed={rating === "up"} onClick={() => { setRating("up"); setFeedbackOpen(false); note("feedback", "Thanks — noted."); }}>
          <ThumbsUp size={13} />
        </button>
        <button aria-label="Not right" title="Not right — teach the agent" aria-pressed={rating === "down"} onClick={() => { setRating("down"); setFeedbackOpen(true); }}>
          <ThumbsDown size={13} />
        </button>
        {done.feedback && <span className="agent-reply-note">{done.feedback}</span>}
        {message.model && <span className="agent-reply-model">{message.model}</span>}
      </div>
      {feedbackOpen && (
        <div className="agent-feedback">
          <textarea autoFocus rows={2} value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="What was wrong, or what is the right definition / answer? e.g. “class average should exclude hosted events”" />
          <div>
            <button className="button" onClick={() => setFeedbackOpen(false)}>Cancel</button>
            <button className="button" disabled={!correction.trim()} onClick={() => onAsk(`That was not right: ${correction.trim()}. Please redo the analysis.`)}>Retry with this</button>
            <button className="button primary" disabled={!correction.trim()} onClick={() => void sendCorrection()}>Save to agent memory</button>
          </div>
        </div>
      )}
    </div>
  );
}
