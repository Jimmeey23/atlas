import logo from "../../assets/report/logo.png";
import methodPhoto from "../../assets/report/method.jpg";
import portraitPhoto from "../../assets/report/portrait.jpg";
import { forwardRef } from "react";
import { chapters, chapterNumber } from "../../report/chapters";
import { monthLabel } from "../../report/compute";
import { definition } from "../../report/definitions";
import { reportFmt as fmt } from "../../report/definitions";
import type { ReportModel } from "../../report/model";
import { GroupTableView, InsightPane, MetricCards, SectionHeader, TrendChart, RankingBoard, MonthlyHistory } from "./kit";

/**
 * The report document itself. It reads only the model it is handed, holds no
 * state and reaches for nothing outside `.report-doc`, so the same element
 * renders inside the dashboard and serialises into a standalone file.
 */
export const ReportDocument = forwardRef<HTMLElement, { model: ReportModel; theme: "light" | "dark" }>(
  function ReportDocument({ model, theme }, ref) {
    const built = new Date(model.builtAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const available = chapters.filter(spec => model.chapters[spec.id] || model.narratives[spec.id]);
    const records = Object.values(model.chapters).reduce((sum, c) => sum + c.n, 0);
    const appendix = available.filter(
      (spec) => !spec.derived && (model.chapters[spec.id]?.history.length ?? 0) > 1,
    );
    const headlineIds = ['gross_revenue', 'new_clients', 'conversion_rate', 'fill_rate', 'renewal_rate', 'booking_late_rate'];
    const headlineData = ['revenue-performance', 'conversion-funnel', 'executive-summary', 'renewals', 'late-cancellations'].map(id => model.chapters[id]).filter(Boolean);
    const combine = (field: 'total' | 'prior' | 'priorYear') => Object.assign({}, ...headlineData.map(data => data[field]));
    const headlineHistory = Array.from(new Set(headlineData.flatMap(data => data.history.map(row => String(row.month))))).sort().map(month => Object.assign({month}, ...headlineData.map(data => data.history.find(row => row.month === month) ?? {})));
    return (
      <article className="report-doc" data-report-theme={theme} ref={ref}>
        <div className="r-page-frame" aria-hidden="true" />
        <div className="r-topbar">
          <a className="r-brand" href="#report-cover"><img src={logo} alt="Physique 57" /><span>{model.scope.studio} Pulse<small>Performance report · {monthLabel(model.scope.month)}</small></span></a>
          <nav aria-label="Chapter navigation">{available.map(spec => <a key={spec.id} href={`#${spec.id}`}>{spec.nav}</a>)}</nav>
        </div>
        <header className="r-hero" id="report-cover">
          <div className="r-container r-hero-inner">
            <div className="r-hero-topline"><span className="r-hero-badge"><img src={logo} alt="" />Senior management review · Physique 57 India</span><span className="r-period-mark">{model.scope.month.slice(5)} / {model.scope.month.slice(0,4)}</span></div>
            <h1>{model.scope.studio} studio performance for <span>{monthLabel(model.scope.month)}</span> — the commercial story and the community journey.</h1>
            <p className="r-hero-sub">A review of cash sales, newcomer conversion, membership continuity and studio demand. Every section connects the evidence to a management decision, with month-on-month and year-on-year context.</p>
            <div className="r-hero-media" aria-label="Physique 57 brand photography">
              <figure><img src={methodPhoto} alt="Physique 57 brand portrait with colourful movement artwork" /><figcaption>The Method · Movement in focus</figcaption></figure>
              <figure><img src={portraitPhoto} alt="Physique 57 brand portrait in black and white" /><figcaption>Strength · Power and presence</figcaption></figure>
            </div>
            <div className="r-hero-meta">
              <span className="r-chip">Reporting period <b>{monthLabel(model.scope.month)}</b></span>
              <span className="r-chip">Studio <b>{model.scope.studio}</b></span>
              <span className="r-chip">Contributing source rows <b>{records.toLocaleString("en-IN")} · chapters may overlap</b></span>
              <span className="r-chip">Snapshot built <b>{built}</b></span>
            </div>
            <MetricCards ids={headlineIds} total={combine('total')} prior={combine('prior')} priorYear={combine('priorYear')} history={headlineHistory} />
          </div>
        </header>

        <div className="r-container r-report-basis">
          <p>Physique 57 India · Internal management review</p>
          <p>{Object.values(model.narratives).filter(n => n.generated).length} of {available.length} chapters contain AI-assisted analysis grounded in the report snapshot. Findings distinguish recorded results from hypotheses and conditional outlooks.</p>
        </div>
        <nav className="r-container r-contents" aria-label="Report contents">
          {available.map((spec, index) => (
            <a href={`#${spec.id}`} key={spec.id}>
              <span>{chapterNumber(index)}</span><div><b>{spec.nav}</b><small>{spec.eyebrow}</small></div>
            </a>
          ))}
        </nav>

        <div className="r-container">
          {available.map((spec, index) => {
            const data = model.chapters[spec.id];
            const narrative = model.narratives[spec.id];
            const focused = narrative?.cards.some(card => card.focus);
            const pane = (focus: string) => narrative ? { ...narrative, summary: "", cards: narrative.cards.filter(card => card.focus === focus) } : undefined;
            const opening = narrative ? { ...narrative, cards: focused ? narrative.cards.filter(card => card.focus === "kpis") : narrative.cards.slice(0, 2) } : undefined;
            const closing = narrative ? { ...narrative, summary: "", cards: focused ? narrative.cards.filter(card => !["kpis", "trend", ...(data?.groups.map(g => g.id ?? g.field) ?? [])].includes(card.focus ?? "")) : narrative.cards.slice(2 + (data?.groups.length ?? 0)) } : undefined;
            const empty = !spec.derived && (!data || !data.n);
            return (
              <section className="r-section" id={spec.id} key={spec.id}>
                <SectionHeader
                  number={chapterNumber(index)}
                  eyebrow={spec.eyebrow}
                  title={narrative?.cards[0]?.headline || spec.title}
                  deck={narrative?.summary || spec.deck}
                  topic={spec.title}
                  total={available.length}
                  highlights={spec.metrics.slice(0,3).filter(id => data?.total[id] != null).map(id => ({ label: definition(id)?.label ?? id, value: fmt(id, data?.total[id]) }))}
                  id={`${spec.id}-title`}
                />
                {spec.derived && !narrative?.cards.length ? (
                  <p className="r-empty">
                    This chapter is written from the figures in the chapters above, and no
                    analysis was generated for it. {narrative?.error || "Use Rewrite insights to retry writing this chapter."}
                  </p>
                ) : (
                  <>
                    {empty && <p className="r-empty">
                      No records for {model.scope.studio} in {monthLabel(model.scope.month)} on this
                      chapter's source. This is an absence of data, not a reading of zero. Commentary may discuss available historical context.
                    </p>}
                    {data && spec.history.length > 0 && <MonthlyHistory data={data} ids={spec.history} title={spec.title} />}
                    {data && (
                      <MetricCards
                        ids={spec.metrics}
                        total={data.total}
                        prior={data.prior}
                        priorYear={data.priorYear}
                        history={data.history}
                      />
                    )}
                    <InsightPane title={`${spec.title} analysis`} narrative={opening ? { ...opening, summary: "" } : undefined} />
                    {data && spec.history.length > 0 && (
                      <div className="r-evidence-layout">
                      <TrendChart
                        history={data.history}
                        ids={spec.history}
                        title={`${spec.nav} over the trailing year`}
                        note="Fourteen months, actual units and independent axes. Gaps indicate unavailable observations; exact values appear in the appendix."
                      />
                      <InsightPane title="Trend interpretation" narrative={pane("trend")} />
                      </div>
                    )}
                    {data?.groups.map((table, groupIndex) => (
                      <div className={`r-evidence-layout ${table.columns.length > 4 ? "r-evidence-wide" : ""}`} key={table.id ?? table.field}>
                        {spec.groups.find(group => (group.id ?? group.field) === (table.id ?? table.field))?.tails
                          ? <RankingBoard table={table} criterion={spec.groups.find(group => (group.id ?? group.field) === (table.id ?? table.field))?.rankBy ?? table.columns[0]} />
                          : <GroupTableView table={table} />}
                        <InsightPane title={`${table.title} commentary`} narrative={focused ? pane(table.id ?? table.field) : narrative?.cards[2 + groupIndex] ? { ...narrative, summary: "", cards: [narrative.cards[2 + groupIndex]] } : undefined} />
                      </div>
                    ))}
                    <InsightPane title={`${spec.title} implications`} narrative={closing} />
                    {data?.notes?.map((note, i) => <p className="r-method" key={i}>{note}</p>)}
                    {data && <p className="r-method">Source: {spec.source} · {data.n.toLocaleString("en-IN")} contributing records. Comparisons use the previous month and the same month last year. Ranked breakdowns require at least three records; totals include all eligible groups. Unavailable values are shown as a dash.</p>}
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
                deck="Every chapter's headline figures across the trailing fourteen months, so a single month can be read against its own history."
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
                      <p>Fourteen months to {monthLabel(model.scope.month)}.</p>
                    </div>
                    <table className="r-table">
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          {ids.map((id) => (
                            <th scope="col" key={id}>
                              {definition(id)?.label ?? id}
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

          <section className="r-source-basis"><h3>Source and calculation basis</h3><p>Cash collections and session revenue describe different bases. Renewal cohorts follow the app’s paid membership extension rules, with a 30-day grace window. Instructor rankings use the stated criterion and minimum sample; payroll economics use the configured rate. Lead stages are recorded positions, not historical stage transitions. Newcomer outcomes may still mature. Current member snapshots describe the build date.</p>{model.sources?.map(source => <p key={source.key}><strong>{source.title}</strong> · {source.status}{source.stale ? " · stale snapshot" : ""} · {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"}) : "Refresh time unavailable"}</p>)}</section>
          <footer className="r-footer"><div className="r-footer-brand"><img src={logo} alt="Physique 57" /><strong>{model.scope.studio} Pulse</strong><span>Evidence · Interpretation · Action</span></div>
            <p>
              <strong>{model.scope.studio}</strong> — {monthLabel(model.scope.month)}. Built{" "}
              {built} from the studio's own source snapshots. Comparisons are against the prior
              month and the same month a year earlier. Data commentary is explicitly labelled when AI analysis is unavailable. Current member snapshots describe the build date, not a historical month.
            </p>
          </footer>
        </div>
      </article>
    );
  },
);
