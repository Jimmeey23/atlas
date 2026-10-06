import { forwardRef } from "react";
import { chapters, chapterNumber } from "../../report/chapters";
import { monthLabel } from "../../report/compute";
import { metrics } from "../../semantics/metrics";
import { fmt } from "../../semantics/formats";
import type { ReportModel } from "../../report/model";
import { GroupTableView, InsightPane, MetricCards, SectionHeader, TrendChart } from "./kit";

/**
 * The report document itself. It reads only the model it is handed, holds no
 * state and reaches for nothing outside `.report-doc`, so the same element
 * renders inside the dashboard and serialises into a standalone file.
 */
export const ReportDocument = forwardRef<HTMLElement, { model: ReportModel; theme: "light" | "dark" }>(
  function ReportDocument({ model, theme }, ref) {
    const built = new Date(model.builtAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const records = Object.values(model.chapters).reduce((sum, c) => sum + c.n, 0);
    const appendix = chapters.filter(
      (spec) => !spec.derived && (model.chapters[spec.id]?.history.length ?? 0) > 1,
    );
    return (
      <article className="report-doc" data-report-theme={theme} ref={ref}>
        <header className="r-hero">
          <div className="r-container r-hero-inner">
            <span className="r-eyebrow">Monthly performance report</span>
            <h1>{model.scope.studio}</h1>
            <p>
              {monthLabel(model.scope.month)} — the month on money, demand, the funnel and the
              membership base, with what the figures ask management to decide.
            </p>
            <div className="r-hero-meta">
              <span className="r-chip">
                Period <b>{monthLabel(model.scope.month)}</b>
              </span>
              <span className="r-chip">
                Studio <b>{model.scope.studio}</b>
              </span>
              <span className="r-chip">
                Evidence <b>{records.toLocaleString("en-IN")} records</b>
              </span>
              <span className="r-chip">
                Built <b>{built}</b>
              </span>
            </div>
          </div>
        </header>

        <nav className="r-container r-contents" aria-label="Report contents">
          {chapters.map((spec, index) => (
            <a href={`#${spec.id}`} key={spec.id}>
              {chapterNumber(index)} {spec.nav}
            </a>
          ))}
        </nav>

        <div className="r-container">
          {chapters.map((spec, index) => {
            const data = model.chapters[spec.id];
            const narrative = model.narratives[spec.id];
            const empty = !spec.derived && (!data || !data.n);
            return (
              <section className="r-section" id={spec.id} key={spec.id}>
                <SectionHeader
                  number={chapterNumber(index)}
                  eyebrow={spec.eyebrow}
                  title={spec.title}
                  deck={spec.deck}
                  id={`${spec.id}-title`}
                />
                {spec.derived && !narrative?.cards.length ? (
                  <p className="r-empty">
                    This chapter is written from the figures in the chapters above, and no
                    analysis was generated for it. Rebuild the report with the model available
                    to fill it; the figures it would draw on are unaffected.
                  </p>
                ) : empty ? (
                  <p className="r-empty">
                    No records for {model.scope.studio} in {monthLabel(model.scope.month)} on this
                    chapter's source. This is an absence of data, not a reading of zero.
                  </p>
                ) : (
                  <>
                    {data && (
                      <MetricCards
                        ids={spec.metrics}
                        total={data.total}
                        prior={data.prior}
                        priorYear={data.priorYear}
                      />
                    )}
                    <InsightPane title="What the figures say" narrative={narrative} />
                    {data && spec.history.length > 0 && (
                      <TrendChart
                        history={data.history}
                        ids={spec.history}
                        title={`${spec.nav} over the trailing year`}
                        note="Each series is indexed to its own range so measures on different scales share one frame. Exact values are in the appendix."
                      />
                    )}
                    {data?.groups.map((table) => (
                      <GroupTableView table={table} key={table.field} />
                    ))}
                  </>
                )}
              </section>
            );
          })}

          {appendix.length > 0 && (
            <section className="r-section r-appendix" id="appendix">
              <SectionHeader
                number="A"
                eyebrow="Appendix"
                title="Month on month"
                deck="Every chapter's headline figures across the trailing thirteen months, so a single month can be read against its own history."
                id="appendix-title"
              />
              {appendix.map((spec) => {
                const data = model.chapters[spec.id]!;
                const ids = spec.history.filter((id) =>
                  data.history.some((row) => row[id] != null),
                );
                if (!ids.length) return null;
                return (
                  <div className="r-table-wrap" key={spec.id}>
                    <div className="r-table-head">
                      <h4>{spec.title}</h4>
                      <p>Thirteen months to {monthLabel(model.scope.month)}.</p>
                    </div>
                    <table className="r-table">
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          {ids.map((id) => (
                            <th scope="col" key={id}>
                              {metrics[id]?.label ?? id}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.map((row) => (
                          <tr key={String(row.month)}>
                            <td>{String(row.month ?? "")}</td>
                            {ids.map((id) => (
                              <td className="r-num" key={id}>
                                {fmt(id, row[id])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          )}

          <footer className="r-footer">
            <p>
              <strong>{model.scope.studio}</strong> — {monthLabel(model.scope.month)}. Built{" "}
              {built} from the studio's own source snapshots. Comparisons are against the prior
              month and the same month a year earlier; figures carrying a Rule-based tag were
              written from thresholds, not analysis.
            </p>
          </footer>
        </div>
      </article>
    );
  },
);
