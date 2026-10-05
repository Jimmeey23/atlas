import { useState } from "react";
import { Activity, ChevronLeft, X, ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import { useStore } from "../state/store";
import type { Insight } from "../insights/rules";
import { InsightEditor, useDocuments } from "./IntelligenceWorkspace";
import { fmt } from "../semantics/formats";
export function SignalRail({
  items,
  onDismiss,
}: {
  items: Insight[];
  onDismiss: (i: Insight) => void;
}) {
  const s = useStore();
  const { docs } = useDocuments("insight");
  const [saveError, setSaveError] = useState("");
  const relevant = (s.tab === 0 ? items : items.filter((i) => i.tab === s.tab))
    .filter(
      (i) => !docs.some((d) => d.body.ruleKey === i.rule + ":" + i.entity),
    )
    .slice(0, 7);
  return (
    <aside
      className={`signal-rail ${s.signalOpen ? "open" : ""}`}
      aria-label="Operational insights"
    >
      {!s.signalOpen ? (
        <button
          className="signal-toggle"
          onClick={() => s.set({ signalOpen: true })}
          aria-label={`Open ${relevant.length} insights`}
        >
          <Activity size={14} />
          <span>Insights</span>
          <span>{relevant.length}</span>
          <span className="dot warn" />
          <span className="dot negative" />
          <span className="dot positive" />
        </button>
      ) : (
        <>
          <div className="signal-header">
            <h2 className="icon">
              <Activity size={15} />
              Insights <span className="pill">{relevant.length}</span>
            </h2>
            <button
              className="icon-button"
              aria-label="Collapse insights"
              onClick={() => s.set({ signalOpen: false })}
            >
              <ChevronLeft size={14} />
            </button>
          </div>
          <div className="signal-body">
            <InsightEditor />
            {saveError && <p role="alert">{saveError}</p>}
            <p className="small" style={{ marginBottom: 18 }}>
              Prioritised by estimated rupee exposure. Decisions backed by the
              contributing rows.
            </p>
            {relevant.map((i) => (
              <article
                className={`insight ${i.severity}`}
                key={i.rule + i.entity}
              >
                <div className="insight-meta">
                  <span>
                    {i.severity[0].toUpperCase() + i.severity.slice(1)}
                  </span>
                  <button
                    aria-label={`Dismiss ${i.title} for 30 days`}
                    onClick={() => onDismiss(i)}
                  >
                    <X size={11} />
                  </button>
                </div>
                <h3>{i.title}</h3>
                <p>{i.template}</p>
                <div className="insight-meta" style={{ marginTop: 9 }}>
                  <span>{fmt("revenue", i.impactINR)} exposure / value</span>
                  <span>n = {i.n}</span>
                </div>
                <div className="insight-footer">
                  <button
                    className="insight-action"
                    onClick={() =>
                      s.set({ tab: i.tab, transient: i.linkFilters })
                    }
                  >
                    Inspect the evidence <ArrowUpRight size={12} />
                  </button>
                  <span className="insight-icon-actions">
                    <button
                      className="ai-insight-btn"
                      aria-label={`Edit ${i.title}`}
                      title="Edit insight"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("p57-edit-insight", { detail: i }),
                        )
                      }
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      className="ai-insight-btn"
                      aria-label={`Delete ${i.title}`}
                      title="Delete insight"
                      onClick={async () => {
                        try {
                          const response = await fetch(
                            "/api/intelligence/documents",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                kind: "insight",
                                title: i.title,
                                page: i.tab,
                                body: {
                                  hidden: true,
                                  ruleKey: i.rule + ":" + i.entity,
                                },
                              }),
                            },
                          );
                          const data = await response.json();
                          if (!response.ok) throw new Error(data.error);
                          window.dispatchEvent(new Event("p57-documents"));
                        } catch (error) {
                          setSaveError(String(error));
                        }
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                </div>
              </article>
            ))}
            {!relevant.length && (
              <p className="muted">
                No rules meet their evidence thresholds in this scope. This is
                not a guarantee of business health.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
