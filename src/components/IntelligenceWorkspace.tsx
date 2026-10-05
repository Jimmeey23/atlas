import { ChartControls } from "./ChartControls";
import { AtlasSettings } from "./AtlasSettings";
import { usePreferences, hydratePreferences } from "../state/preferences";
import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { tabs, useStore } from "../state/store";
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
const initialURLHadFilters = new URLSearchParams(location.search).has("f");
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
          const { from: savedFrom, to: savedTo, ...savedScope } = b.filters || {};
          useStore.getState().set({
            theme: b.theme || "matte",
            density: b.density || "compact",
            rate: Number(b.rate) || 1200,
            compare: b.compare || "prior",
            ...(!initialURLHadFilters && b.filters
              ? { filters: { ...useStore.getState().filters, ...savedScope } }
              : {}),
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
            filters: store.filters,
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
    store.filters,
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
  useEffect(() => {
    const handler = (event: Event) => {
      const item = (event as CustomEvent).detail;
      setEditing(null);
      setRuleKey(item.rule + ":" + item.entity);
      setTitle(item.title);
      setText(item.template);
      setSeverity(item.severity);
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
            "Query the data in this scope, identify three actionable insights with evidence, and save them as insights on this page. Include recommendations, denominators and freshness.",
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
            <button
              className="button"
              onClick={() => {
                setEditing(d);
                setTitle(d.title);
                setText(d.body.text || "");
                setSeverity(d.body.severity || "watch");
              }}
            >
              Edit
            </button>{" "}
            <button
              className="button"
              onClick={() =>
                void api("documents/" + d.id, { method: "DELETE" })
                  .then(changed)
                  .catch((e) => setNotice(e.message))
              }
            >
              Delete
            </button>
          </article>
        ))}
      <label>
        Insight title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </label>
      <label>
        Member voice, evidence or recommendation
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label>
        Priority
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {[
            "watch",
            "critical",
            "attention",
            "opportunity",
            "context",
            "positive",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <button
        className="button"
        disabled={busy || !title.trim() || !text.trim()}
        onClick={() => void save()}
      >
        {editing ? "Save changes" : "Create insight"}
      </button>{" "}
      <button
        className="button"
        disabled={busy}
        onClick={() => void generate()}
      >
        Generate AI insights
      </button>
      {editing && (
        <button
          onClick={() => {
            setEditing(null);
            setTitle("");
            setText("");
          }}
        >
          Cancel edit
        </button>
      )}
      {notice && (
        <p role="status" className="small">
          {notice}
        </p>
      )}
    </section>
  );
}
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
        filters: { ...filters, lateOnly: page === 12 },
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
      tooltip: { trigger: "axis" },
      xAxis: {
        type: type === "scatter" ? "value" : "category",
        data: rows.map((r) => r[x]),
      },
      yAxis: { type: "value" },
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
      <h3>{doc.title}</h3>
      <ChartControls rows={rows} title={doc.title} />
      <div className="small">
        Live query · inherits global filters · saved in Supabase
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
                    <td key={k}>{r[k] == null ? "—" : String(r[k])}</td>
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
  const [conversationTitle, setConversationTitle] =
    useState("New conversation");
  const { docs: history } = useDocuments("conversation");
  const { docs: memories } = useDocuments("memory");
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<any[]>([]);
  const [question, setQuestion] = useState("");
  const [page, setPage] = useState(s.tab === 13 ? 0 : s.tab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [memoryText, setMemoryText] = useState("");
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
  const send = async () => {
    const message = question.trim();
    if (!message || busy) return;
    setBusy(true);
    setError("");
    setQuestion("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      const result = await api("chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          conversationId,
          history: prefs.chatSaveHistory
            ? []
            : messages.slice(-10).map((m) => ({
                role: m.role,
                content: m.content.slice(0, 6000),
              })),
          maxTokens: prefs.chatTokens,
          saveHistory: prefs.chatSaveHistory,
          page,
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
    <section className="intelligence-panel">
      <div className="agent-heading">
        <h2>Atlas Intelligence</h2>
        <button className="button" onClick={() => setControls(!controls)}>
          Agent settings
        </button>
      </div>
      {controls && <AtlasSettings />}
      <p>
        Ask about your studio community, investigate trends or request a custom
        table, chart or list. Specify where to save it. Global filters accompany
        every query.
      </p>
      {status && (
        <p className="cloud-status">
          Supabase: {status.supabase ? "Configured" : "Setup needed"} · GPT:{" "}
          {status.openai ? "Configured" : "Setup needed"} · Model:{" "}
          {status.model}
        </p>
      )}
      {status?.missing?.length > 0 && (
        <div className="empty-state">
          <h3>Connect your intelligence workspace</h3>
          <p>
            Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY to
            the server .env, run the included Supabase migration, then restart
            the server. Keys stay on the server.
          </p>
        </div>
      )}
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
        <div>
          <div className="agent-messages" aria-live="polite">
            {!messages.length && (
              <p className="muted">
                Try: “Compare renewals due and renewed by month” or “Create and
                save a chart of late cancellations by instructor on the Late
                cancellations page.”
              </p>
            )}
            {messages.map((m, i) => (
              <article key={i} className={"agent-message " + m.role}>
                <strong>
                  {m.role === "user" ? "You" : "Atlas Intelligence"}
                </strong>
                <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
                {prefs.chatEvidence && m.evidence?.length > 0 && (
                  <details>
                    <summary>Queries and source evidence</summary>
                    {m.evidence.map((e: any, j: number) => (
                      <div key={j}>
                        <pre>{e.sql}</pre>
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
          </div>
          <label>
            Save generated elements to
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
          </label>
          <textarea
            aria-label="Ask studio intelligence"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask a question or request a saved chart…"
          />
          <button
            className="button"
            disabled={
              busy ||
              !question.trim() ||
              !status?.openai ||
              (prefs.chatSaveHistory && !status?.supabase)
            }
            onClick={() => void send()}
          >
            {busy ? "Querying studio data…" : "Ask GPT"}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
      <SavedElements page={13} version={0} />
    </section>
  );
}
