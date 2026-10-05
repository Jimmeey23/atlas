import { useState } from "react";
import { Sparkles, X, ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import { useStore, tabs } from "../state/store";
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
          <Sparkles size={15} />
          <span>Insights</span>
          <span>{relevant.length}</span>
          <span className="dot warn" />
          <span className="dot negative" />
          <span className="dot positive" />
        </button>
      ) : (
        <>
          <div className="signal-header">
            <div><h2 className="icon">
              <Sparkles size={16} />
              Insights <span className="pill">{relevant.length}</span>
            </h2><p className="signal-scope">{tabs[s.tab]}</p></div>
            <button
              className="icon-button"
              aria-label="Collapse insights"
              onClick={() => s.set({ signalOpen: false })}
            >
              <X size={16} />
            </button>
          </div>
          <div className="signal-body">
            <p className="signal-intro">
              Prioritised by rupee exposure. Explore the evidence behind each signal.
            </p>
            <InsightEditor />
            {saveError && <p role="alert">{saveError}</p>}
            <h3 className="signal-section-label">Scope signals</h3>
            {relevant.map((i) => (
              <article
                className={`insight ${i.severity}`}
                key={i.rule + i.entity}
              >
                <div className="insight-meta">
                  <span className="insight-severity">
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
                <div className="insight-meta insight-impact">
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
