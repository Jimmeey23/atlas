import { ArrowUp, ArrowUpRight, Sparkles, MessageSquare, ChartNoAxesCombined, Check, Database, Pencil, Trash2, Paperclip, Mic, Square } from "lucide-react";
import { fmt, formatField } from "../semantics/formats";
import { metrics } from "../semantics/metrics";
import { ChatAnswer } from "./ChatAnswer";
import { ChartControls } from "./ChartControls";
import { AgentSettings } from "./AgentSettings";
import { usePreferences, hydratePreferences } from "../state/preferences";
import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { tabs, useStore } from "../state/store";
import { DataInsightAction } from "./DataInsightAction";
type Doc = { id: string; kind: string; title: string; page: number; body: any };
async function api(url: string, options: RequestInit = {}) {
  const r = await fetch("/api/intelligence/" + url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
const changed = () => window.dispatchEvent(new Event("p57-documents"));
export function useDocuments(kind: string) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      api("status")
        .then((status) => {
          if (!status.supabase)
            throw new Error(
              "Connect Supabase to save insights, elements and memory.",
            );
          return api("documents?kind=" + kind);
        })
        .then((d) => {
          if (active) {
            setDocs(d);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    window.addEventListener("p57-documents", load);
    return () => {
      active = false;
      window.removeEventListener("p57-documents", load);
    };
  }, [kind]);
  return { docs, error };
}
export function CloudSettings() {
  const store = useStore();
  const loaded = useRef(false);
  const docId = useRef<string>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const onPreferences = () => setRevision((r) => r + 1);
    window.addEventListener("p57-preferences", onPreferences);
    return () => window.removeEventListener("p57-preferences", onPreferences);
  }, []);
  useEffect(() => {
    let active = true;
    api("status")
      .then(async (status) => {
        if (!status.supabase) return;
        const docs: Doc[] = await api("documents?kind=settings");
        if (!active) return;
        const doc = docs.find((d) => d.title === "Workspace settings");
        if (doc) {
          docId.current = doc.id;
          const b = doc.body;
          // Cloud settings are shared presentation preferences. A filter chosen
          // in another tab/session can exclude every row here. Query scope comes
          // from the current URL and explicit filter/view actions instead.
          useStore.getState().set({
            theme: b.theme || "matte",
            density: b.density || "compact",
            rate: Number(b.rate) || 1200,
            compare: b.compare || "prior",
          });
          for (const [key, value] of Object.entries(b.localPreferences || {}))
            if (
              /^(floor-(views|threshold|dismiss)|atlas-preferences)/.test(key)
            )
              localStorage.setItem(key, String(value));
        }
        loaded.current = true;
        setRevision((r) => r + 1);
        window.dispatchEvent(new Event("p57-settings-hydrated"));
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => {
      const localPreferences = Object.fromEntries(
        Object.keys(localStorage)
          .filter((k) =>
            /^(floor-(views|threshold|dismiss)|atlas-preferences)/.test(k),
          )
          .map((k) => [k, localStorage.getItem(k)]),
      );
      api("documents", {
        method: "POST",
        body: JSON.stringify({
          ...(docId.current ? { id: docId.current } : {}),
          kind: "settings",
          title: "Workspace settings",
          page: 0,
          body: {
            theme: store.theme,
            density: store.density,
            rate: store.rate,
            compare: store.compare,
            localPreferences,
          },
        }),
      })
        .then((d) => {
          docId.current = d.id;
          setError("");
        })
        .catch((e) => setError(e.message));
    }, 700);
    return () => clearTimeout(timer);
  }, [
    store.theme,
    store.density,
    store.rate,
    store.compare,
    revision,
  ]);
  return error ? (
    <p className="small warn" role="alert">
      Cloud settings: {error}
    </p>
  ) : null;
}
export function InsightEditor() {
  const { docs, error } = useDocuments("insight");
  const page = useStore((s) => s.tab);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState("watch");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ruleKey, setRuleKey] = useState<string>();
  const [composerOpen, setComposerOpen] = useState(false);
  useEffect(() => {
    const handler = (event: Event) => {
      const item = (event as CustomEvent).detail;
      setEditing(null);
      setRuleKey(item.rule + ":" + item.entity);
      setTitle(item.title);
      setText(item.template);
      setSeverity(item.severity);
      setComposerOpen(true);
    };
    window.addEventListener("p57-edit-insight", handler);
    return () => window.removeEventListener("p57-edit-insight", handler);
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await api("documents", {
        method: "POST",
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          kind: "insight",
          title,
          page,
          body: {
            text,
            severity,
            origin: "manual",
            ...(ruleKey ? { ruleKey } : {}),
          },
        }),
      });
      changed();
      setEditing(null);
      setTitle("");
      setText("");
      setRuleKey(undefined);
      setNotice("Saved to Supabase.");
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    try {
      await api("chat", {
        method: "POST",
        body: JSON.stringify({
          message:
            "Query the data in this scope and save exactly three high-value insights on this page. Each insight must include: what happened, why it matters now, the business impact context, one concrete recommendation, and denominator/freshness caveats when relevant. Use clear executive language and avoid generic advice.",
          filters: {
            ...useStore.getState().filters,
            cross: useStore.getState().transient,
          },
          page,
        }),
      });
      changed();
      setNotice("Generated insights saved.");
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="insight-editor">
      <h3>Saved insights</h3>
      {error && <p className="small muted">{error}</p>}
      {docs
        .filter((d) => !d.body.hidden && (page === 0 || d.page === page))
        .map((d) => (
          <article className="insight" key={d.id}>
            <h3>{d.title}</h3>
            <p>{d.body.text}</p>
            <div className="insight-actions-row">
              <button
                className="insight-action"
                onClick={() =>
                  useStore.getState().set({
                    tab: d.page,
                    transient: Array.isArray(d.body.linkFilters)
                      ? d.body.linkFilters
                      : useStore.getState().transient,
                  })
                }
              >
                Inspect evidence <ArrowUpRight size={11} />
              </button>
              <DataInsightAction
                compact
                subject={d.title}
                detail={d.body.text}
                buttonLabel="Insight summary"
              />
            </div>
            <div className="insight-icon-actions">
              <button
                className="ai-insight-btn"
                aria-label={`Edit ${d.title}`}
                title="Edit insight"
                onClick={() => {
                  setEditing(d);
                  setTitle(d.title);
                  setText(d.body.text || "");
                  setSeverity(d.body.severity || "watch");
                  setComposerOpen(true);
                }}
              >
                <Pencil size={11} />
              </button>
              <button
                className="ai-insight-btn"
                aria-label={`Delete ${d.title}`}
                title="Delete insight"
                onClick={() =>
                  void api("documents/" + d.id, { method: "DELETE" })
                    .then(changed)
                    .catch((e) => setNotice(e.message))
                }
              >
                <Trash2 size={11} />
              </button>
            </div>
          </article>
        ))}
      <div className="insight-composer-bar">
        <button
          className="button"
          aria-expanded={composerOpen}
          onClick={() => setComposerOpen(!composerOpen)}
        >
          {composerOpen ? "Close composer" : "+ New insight"}
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void generate()}
        >
          <Sparkles size={13} /> Generate AI insights
        </button>
      </div>
      {composerOpen && (
        <div className="insight-composer">
          <label>
            Insight title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="A crisp, decision-oriented headline…"
            />
          </label>
          <label>
            Evidence, member voice or recommendation
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What changed, why it matters, and what to do next…"
            />
          </label>
          <div className="insight-composer-meta">
            <span className="small">{text.length} characters</span>
            {ruleKey && <span className="small">Linked to a rule insight</span>}
          </div>
          <div
            className="severity-pills"
            role="radiogroup"
            aria-label="Priority"
          >
            {[
              "watch",
              "critical",
              "attention",
              "opportunity",
              "context",
              "positive",
            ].map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={severity === v}
                className={`severity-pill ${severity === v ? "active" : ""}`}
                onClick={() => setSeverity(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="insight-composer-bar">
            <button
              className="button primary"
              disabled={busy || !title.trim() || !text.trim()}
              onClick={() => void save()}
            >
              {editing ? "Save changes" : "Create insight"}
            </button>
            {editing && (
              <button
                className="button"
                onClick={() => {
                  setEditing(null);
                  setTitle("");
                  setText("");
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="small">
          {notice}
        </p>
      )}
    </section>
  );
}
const displayValue = formatField;

function Element({ doc, version }: { doc: Doc; version: number }) {
  const filters = useStore((s) => s.filters);
  const page = useStore((s) => s.tab);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setError("");
    api("query", {
      method: "POST",
      body: JSON.stringify({
        sql: doc.body.sql,
        filters: doc.body.pinnedScope || { ...filters, lateOnly: page === 12 },
      }),
    })
      .then((d) => {
        if (active) setRows(d.rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [doc, filters, version, page]);
  useEffect(() => {
    if (
      !ref.current ||
      !["bar", "line", "pie", "scatter"].includes(doc.body.type) ||
      !rows.length
    )
      return;
    const chart = echarts.init(ref.current);
    const { x, y, type } = doc.body;
    chart.setOption({
      tooltip: { trigger: type === "pie" ? "item" : "axis", valueFormatter: (value: unknown) => displayValue(y, value) },
      xAxis: {
        type: type === "scatter" ? "value" : "category",
        data: rows.map((r) => r[x]),
      },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => displayValue(y, value) } },
      series: [
        {
          type,
          data:
            type === "pie"
              ? rows.map((r) => ({ name: r[x], value: Number(r[y]) }))
              : type === "scatter"
                ? rows.map((r) => [Number(r[x]), Number(r[y])])
                : rows.map((r) => Number(r[y])),
          smooth: type === "line",
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [rows, doc]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc);
  const [notice, setNotice] = useState("");
  return (
    <article className="panel intelligence-panel">
      <div className="panel-headline">
        <h3>{doc.title}</h3>
        <DataInsightAction
          compact
          subject={doc.title}
          detail="Saved chart/table artifact using the current workspace scope."
        />
      </div>
      <ChartControls rows={rows} title={doc.title} />
      <div className="small">
        Live query · {doc.body.pinnedScope ? `fixed scope: ${doc.body.pinnedScope.from || "all dates"} → ${doc.body.pinnedScope.to || "latest"}` : "inherits dashboard filters"} · saved in Supabase
      </div>
      <button className="button" onClick={() => setEditing(!editing)}>
        Edit / move
      </button>{" "}
      <button
        className="button"
        onClick={() =>
          void api("documents/" + doc.id, { method: "DELETE" })
            .then(changed)
            .catch((e) => setNotice(e.message))
        }
      >
        Delete
      </button>
      {editing && (
        <>
          <input
            aria-label="Element title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <select
            aria-label="Destination page"
            value={draft.page}
            onChange={(e) =>
              setDraft({ ...draft, page: Number(e.target.value) })
            }
          >
            {tabs.map((t, i) => (
              <option key={t} value={i}>
                {t}
              </option>
            ))}
          </select>
          <textarea
            aria-label="Data query"
            value={draft.body.sql}
            onChange={(e) =>
              setDraft({
                ...draft,
                body: { ...draft.body, sql: e.target.value },
              })
            }
          />
          <button
            className="button"
            onClick={() =>
              void api("documents", {
                method: "POST",
                body: JSON.stringify({
                  id: draft.id,
                  kind: draft.kind,
                  title: draft.title,
                  page: draft.page,
                  body: draft.body,
                }),
              })
                .then(() => {
                  changed();
                  setEditing(false);
                })
                .catch((e) => setNotice(e.message))
            }
          >
            Save element
          </button>
        </>
      )}
      {(error || notice) && <p role="alert">{error || notice}</p>}
      {["bar", "line", "pie", "scatter"].includes(doc.body.type) ? (
        <div className="chart" ref={ref} style={{ height: 300 }} />
      ) : (
        <div className="intelligence-table">
          <table>
            <thead>
              <tr>
                {Object.keys(rows[0] || {}).map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {Object.keys(rows[0] || {}).map((k) => (
                    <td key={k}>{displayValue(k, r[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
export function SavedElements({
  page,
  version,
}: {
  page: number;
  version: number;
}) {
  const { docs } = useDocuments("artifact");
  return (
    <div className="saved-elements">
      {docs
        .filter((d) => d.page === page)
        .map((d) => (
          <Element key={d.id} doc={d} version={version} />
        ))}
    </div>
  );
}
export function IntelligenceWorkspace({
  compact = false,
}: { compact?: boolean } = {}) {
  const s = useStore();
  const prefs = usePreferences((s) => s.preferences);
  const [controls, setControls] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [mode, setMode] = useState<"ask" | "build">("ask");
  const end = useRef<HTMLDivElement>(null);
  const { docs: history } = useDocuments("conversation");
  const { docs: memories } = useDocuments("memory");
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<any[]>([]);
  const [question, setQuestion] = useState("");
  const [page, setPage] = useState(s.tab === 13 ? 0 : s.tab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; note: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordStart = useRef(0);
  const attachFiles = async (files: FileList | null) => {
    if (!files) return;
    const next = [...attachments];
    for (const file of Array.from(files).slice(0, 5)) {
      if (/^(text\/|application\/(json|csv))/i.test(file.type) || /\.(csv|txt|md|json)$/i.test(file.name)) {
        const text = (await file.text()).slice(0, 8000);
        next.push({ name: file.name, note: `Attached file ${file.name}:\n${text}` });
      } else if (file.type.startsWith("audio/")) {
        next.push({ name: file.name, note: `[Audio note attached: ${file.name}, ${(file.size / 1024).toFixed(0)} KB — audio transcription is not configured, so treat this as a verbal note reference.]` });
      } else {
        next.push({ name: file.name, note: `[File attached: ${file.name} (${file.type || "unknown type"}) — binary content not readable as text.]` });
      }
    }
    setAttachments(next);
  };
  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      recordStart.current = Date.now();
      rec.onstop = () => {
        const seconds = Math.round((Date.now() - recordStart.current) / 1000);
        setAttachments((a) => [
          ...a,
          { name: `Voice note (${seconds}s)`, note: `[Voice note recorded in the studio workspace, ${seconds}s — audio transcription is not configured, treat as a verbal instruction reference.]` },
        ]);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      rec.start();
      setRecording(true);
    } catch (e) {
      setError("Microphone unavailable: " + String(e));
    }
  };
  useEffect(() => {
    api("status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const reload = () =>
      api("status")
        .then(setStatus)
        .catch((e) => setError(e.message));
    window.addEventListener("atlas-provider", reload);
    return () => window.removeEventListener("atlas-provider", reload);
  }, []);
  useEffect(() => { end.current?.scrollIntoView({block:"nearest"}); }, [messages, busy]);
  const send = async () => {
    const base = question.trim();
    const message = [base, ...attachments.map((a) => a.note)]
      .filter(Boolean)
      .join("\n\n");
    if (!message || busy) return;
    setBusy(true);
    setError("");
    setQuestion("");
    setAttachments([]);
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      const result = await api(mode, {
        method: "POST",
        body: JSON.stringify({
          message,
          conversationId,
          history: prefs.chatSaveHistory && status?.supabase
            ? []
            : messages.slice(-10).map((m) => ({
                role: m.role,
                content: m.content.slice(0, 6000),
                scope: m.scope,
              })),
          maxTokens: prefs.chatTokens,
          saveHistory: prefs.chatSaveHistory && !!status?.supabase,
          page,
          rate: s.rate,
          filters: { ...s.filters, cross: s.transient },
        }),
      });
      setConversationId(result.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: result.answer,
          evidence: result.evidence,
          saved: result.saved,
          scope: result.scope,
          model: result.model,
        },
      ]);
      changed();
    } catch (e) {
      setError(String(e));
      setQuestion(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={"intelligence-panel studio-chat " + (compact ? "compact" : "expanded")}>
      <div className="agent-heading">
        <h2>Atlas Intelligence</h2>
        <button className="button" onClick={() => setControls(!controls)}>
          Agent settings
        </button>
      </div>
      {controls && <AgentSettings />}
      <div className="chat-modes" role="group" aria-label="Assistant function">
        <button aria-pressed={mode === "ask"} onClick={() => setMode("ask")}><MessageSquare size={15}/> Ask a question</button>
        <button aria-pressed={mode === "build"} onClick={() => setMode("build")}><ChartNoAxesCombined size={16}/> Build an element</button>
      </div>
      <p className="chat-scope"><Database size={13}/><span>{s.filters.location?.join(" · ") || "All studios"} · {s.filters.from} → {s.filters.to}</span></p>
      <p className="chat-scope-hint">Name a studio or period to query that scope directly.</p>
      <div className="agent-layout">
        <aside>
          <details open={!compact}>
            <summary>History & agent memory</summary>
            <h3>Conversations</h3>
            <button
              className="button"
              onClick={() => {
                setConversationId(undefined);
                setMessages([]);
                setError("");
              }}
            >
              New conversation
            </button>
            {history.map((d) => (
              <button
                key={d.id}
                className="agent-history"
                onClick={() => {
                  setConversationId(d.id);
                  setMessages(d.body.messages || []);
                }}
              >
                {d.title}
              </button>
            ))}
            <h3>Agent memory</h3>
            {memories.map((d) => (
              <p key={d.id}>
                {d.body.text}
                <button
                  aria-label={"Delete memory " + d.title}
                  onClick={() =>
                    void api("documents/" + d.id, { method: "DELETE" })
                      .then(changed)
                      .catch((e) => setError(e.message))
                  }
                >
                  ×
                </button>
              </p>
            ))}
            <input
              aria-label="Memory to remember"
              value={memoryText}
              placeholder="Remember a business preference"
              onChange={(e) => setMemoryText(e.target.value)}
            />
            <button
              className="button"
              disabled={!memoryText.trim() || !status?.supabase}
              onClick={() =>
                void api("documents", {
                  method: "POST",
                  body: JSON.stringify({
                    kind: "memory",
                    title: memoryText.slice(0, 100),
                    page: 13,
                    body: { text: memoryText },
                  }),
                })
                  .then(() => {
                    changed();
                    setMemoryText("");
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Save memory
            </button>
          </details>
        </aside>
        <div className="chat-main">
          <div className="agent-messages" aria-live="polite">
            {!messages.length && (
              <div className="chat-welcome">
                <span className="chat-orb"><Sparkles size={26}/></span>
                <h3>{mode === "ask" ? "Clarity, from your numbers." : "Turn a question into a view."}</h3>
                <p>{mode === "ask" ? "Explore performance with answers grounded in your source sheets." : "Create a chart, table or insight and save it to your workspace."}</p>
                <div className="chat-suggestions">
                  {(mode === "ask" ? ["How much sales did Kwality House do in April 2026?", "Compare studio attendance this month"] : ["Build a table of monthly sales by studio for 2026", "Create a chart of late cancellations by instructor"]).map(text => <button key={text} onClick={() => setQuestion(text)}>{text}<span>↗</span></button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <article key={i} className={"agent-message " + m.role}>
                <strong>
                  {m.role === "user" ? "You" : "Atlas Intelligence"}
                </strong>
                <ChatAnswer text={m.content}/>
                {m.scope && <p className="chat-answer-scope">{m.scope.location?.join(" · ") || "All studios"} · {m.scope.from || "All dates"}{m.scope.to ? " → " + m.scope.to : ""}</p>}
                {m.saved?.filter((doc: any) => typeof doc === "object" && doc?.id).map((doc: Doc) => <button className="chat-saved" key={doc.id} onClick={() => useStore.getState().set({tab:doc.page})}><Check size={15}/><span>Saved: {doc.title}<small>{tabs[doc.page]}</small></span><span>↗</span></button>)}
                {prefs.chatEvidence && m.evidence?.length > 0 && (
                  <details>
                    <summary>{m.evidence.length} verified {m.evidence.length === 1 ? "query" : "queries"} · View sources</summary>
                    {m.evidence.map((e: any, j: number) => (
                      <div key={j}>
                        {e.result?.length > 0 && <div className="chat-result"><table><thead><tr>{Object.keys(e.result[0]).map(k => <th key={k}>{k.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{e.result.map((row: any, n: number) => <tr key={n}>{Object.keys(e.result[0]).map(k => <td key={k}>{displayValue(k,row[k])}</td>)}</tr>)}</tbody></table></div>}
                        <pre>{e.sql}</pre>
                        {e.provenance?.filter((p: any) => p.url).map((p: any) => <a className="chat-source-link" key={p.source} href={p.url} target="_blank" rel="noreferrer">{p.title || p.source} source sheet ↗</a>)}
                        <p>
                          {e.provenance
                            ?.map(
                              (p: any) =>
                                `${p.source}: ${p.rows} rows (${new Date(p.fetchedAt).toLocaleString()})`,
                            )
                            .join(" · ")}
                        </p>
                      </div>
                    ))}
                  </details>
                )}
              </article>
            ))}
            {busy && <div className="chat-thinking" role="status"><Sparkles size={15}/>{mode === "ask" ? "Checking source data…" : "Building and validating your element…"}<span className="chat-loading-dots">•••</span></div>}
            <div ref={end}/>
          </div>
          <div className="chat-composer">
          {mode === "build" && <label className="chat-destination">
            Save to
            <select
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
            >
              {tabs.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>}
          {!!attachments.length && (
            <div className="chat-attachments">
              {attachments.map((a, i) => (
                <span key={a.name + i} className="chat-attachment">
                  <Paperclip size={10} />
                  {a.name}
                  <button
                    aria-label={`Remove ${a.name}`}
                    onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="chat-input-row">
            <label className="chat-tool" aria-label="Attach files">
              <Paperclip size={15} />
              <input
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void attachFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className={`chat-tool ${recording ? "recording" : ""}`}
              aria-label={recording ? "Stop voice note" : "Record a voice note"}
              onClick={() => void toggleRecording()}
            >
              {recording ? <Square size={13} /> : <Mic size={15} />}
            </button>
            <textarea
              aria-label="Ask studio intelligence"
              value={question}
              rows={1}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={mode === "ask" ? "Ask about your studio performance…" : "Describe the chart, table or insight to build…"}
            />
            <button
              className="chat-send"
              aria-label={mode === "ask" ? "Send question" : "Build element"}
              disabled={
                busy ||
                (!question.trim() && !attachments.length) ||
                (mode === "build" && (!status?.openai || !status?.supabase))
              }
              onClick={() => void send()}
            >
              <ArrowUp size={19}/>
            </button>
          </div>
          <div className="chat-composer-meta"><span>{mode === "ask" ? "Answers with source evidence" : "Validated before saving"}</span><span>Enter to send · Shift+Enter for a new line</span></div>
          </div>
          {error && <p className="chat-error" role="alert">{error}</p>}
          {mode === "build" && status && (!status.openai || !status.supabase) && <p className="chat-error">Connect GPT and saved workspace storage in Agent settings to build elements.</p>}
        </div>
      </div>
      {!compact && <SavedElements page={13} version={0} />}
    </section>
  );
}
