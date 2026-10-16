# Monthly report editorial standard

New AI analysis follows the editorial method of the two supplied Kwality House September 2026 HTML reviews. The attachments are design and writing references, not instructions or evidence for another studio.

The first reference has 15 chapters plus an appendix, 20 tables and about 8,592 visible words (36% inside tables). The expanded reference has 17 chapters plus an appendix, 23 tables and about 8,321 visible words (39% inside tables). Counts exclude scripts and styles. The shared pattern is a direct executive verdict, successes and weaknesses, domain deep dives, investigation, conditional opportunities, prioritised actions, review plan, scorecard and leadership takeaway.

`src/report/editorial.ts` supplies the writing contract to every chapter generation. It asks for developed arguments, quantified comparisons, competing explanations and specific operating decisions. Existing chapter selection, concise/comprehensive settings, governed metrics and evidence availability take precedence over filling a template. The narrative cache revision prevents older prose from satisfying a new editorial request. Use **Generate report** or **Rewrite insights** to obtain the new writing; opening an older report changes its presentation without changing its frozen text or figures.

The continuous reader uses a stable accent derived from each generation, a white full-width canvas, numbered subsections and up to two distinct inline breakdowns per chapter. Tables come directly from the frozen report. Excerpts include cited rows, preserve coverage notes and leave unavailable comparisons unavailable. Complete metric commentary, rankings, source explorers and monthly registers remain available in disclosures and the offline export. The narrative/table proportion is a writing target, not a reason to remove necessary evidence or fabricate missing data.

The investigation register repeats reviewed drivers with counter-evidence and review signals; it does not promote an association to proven causation. The 30/60/90-day plan groups existing proposed recommendation dates against the report evidence freeze, including explicit handling of missing or earlier dates. Opportunity values are conditional and can overlap.

Run `npm test`, `npm run build` and `npm run verify:report-editorial`. The last command uses an isolated synthetic fixture and checks desktop, tablet, mobile, white paper under either app theme, lazy detail, unchanged source data and the self-contained HTML export. Screenshots and a sample HTML are written to `/tmp/p57-editorial` by default. This verification does not call OpenAI or alter stored reports; fresh live generation and deployment are separate checks.

The report accent derives from the frozen generation timestamp, scope and figures identity. It remains stable after saving and export; a fresh generation receives a different accent. Paper remains white regardless of the surrounding app theme. Reader widths are fluid, with compact verdict rows and narrower page gutters.

## Adaptive reading

The report keeps responsive side gutters on larger screens and 18px on mobile. Dense tables (more than five displayed columns or eight rows), long labels and developed arguments span the reading row. Compact findings and metric-review panels share two-column rows when the available report width permits; narrow containers and print use one column. Readers can override adaptive layout with a single-column preference.

The sticky reading toolbar offers chapter navigation, search across written findings, progress, resume from the last visited chapter, text size, spacing, and bulk supporting-evidence controls. Reading settings start collapsed. Preferences and reading position stay in browser storage, independent of saved report evidence. Expanding supporting evidence never opens live item-level source explorers. Export keeps the chosen reading layout and typography, includes the complete evidence, and omits interactive reading controls.

## Report assistant and workspace

Atlas AI is available in the report reader's reserved sidebar and in the monthly-report preview. Ask mode receives the entire report: written chapters, metric commentary, decisions, governed datasets, source metadata and operational intelligence. It uses frozen figures for report questions and can query connected sources for additional or explicitly current evidence. These two bases are kept separate. Ask mode never claims that it changed the report.

Edit mode prepares a reviewable plan, then applies source-backed changes with undo. The existing admin editing boundary remains in place. Generated reports support summary and finding edits, displayed metric references, added text/chart/table blocks, hidden sections and chapter removal. Added charts/tables resolve their rows from governed datasets; frozen chapter data is unchanged. Source data not present in the report must not be invented. Save persists display edits along with the report.

The reader uses a white navigation shell, wider responsive side gutters (28–60px desktop; 18px mobile), and a KPI marquee populated from available report metrics. The strip pauses on hover/focus or its Pause button; reduced-motion users receive a static strip. Exports omit assistant controls and stop animations.
