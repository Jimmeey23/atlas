/**
 * The seven chapters a studio report is made of, in the order the template
 * prints them: money, then demand, then the funnel, then retention, then what
 * to do about it. The order is shared by the document, the side rail, the nav
 * and the contents list, so it lives here once.
 *
 * `metrics` are the ids the chapter's card row reads, `source` the table its
 * figures come from, and `groups` the breakdowns its tables print. Nothing in
 * this file is studio-specific — the studio and month arrive through the
 * ReportScope, so two reports differ only in their data.
 */
export interface GroupSpec {
  /** Column in the source table to group by. */
  field: string;
  /** Heading printed above the table. */
  title: string;
  /** Sentence under the heading. */
  deck: string;
  /** Metric ids shown as columns, in order. */
  columns: string[];
  /** Rows kept, ranked by the first column. */
  limit?: number;
}
export interface ChapterSpec {
  id: string;
  /** Short label for the top nav and side rail. */
  nav: string;
  /** "01 Executive Summary" — the number is printed from the index. */
  title: string;
  eyebrow: string;
  deck: string;
  /** Table the chapter's figures are aggregated from. */
  source: string;
  /** Metric ids for the chapter's card row. */
  metrics: string[];
  /** Breakdown tables, rendered in order. */
  groups: GroupSpec[];
  /** Metric ids plotted in the month-on-month appendix grid. */
  history: string[];
  /**
   * Chapters written entirely from figures the other chapters already
   * computed. They run no queries of their own.
   */
  derived?: boolean;
}
export const chapters: ChapterSpec[] = [
  {
    id: "executive-summary",
    nav: "Overview",
    title: "Executive Summary",
    eyebrow: "The month at a glance",
    deck: "Where the month landed on money, demand and membership — and which of the three moved the others.",
    source: "sessions",
    metrics: [
      "revenue",
      "attendance",
      "sessions",
      "fill_rate",
      "avg_class_size_incl",
      "empty_sessions",
      "rev_pas",
      "lost_revenue",
    ],
    groups: [
      {
        field: "format_group",
        title: "Where the month was earned",
        deck: "Each format's contribution to attendance and session-attributed revenue.",
        columns: ["sessions", "attendance", "fill_rate", "revenue", "rev_pas"],
      },
    ],
    history: ["revenue", "attendance", "fill_rate", "avg_class_size_incl"],
  },
  {
    id: "revenue-performance",
    nav: "Revenue",
    title: "Revenue & Sales Performance",
    eyebrow: "What the studio took in",
    deck: "Gross to net, what was sold, who bought it, and what discounting cost.",
    source: "sales",
    metrics: [
      "gross_revenue",
      "net_revenue",
      "vat",
      "transactions",
      "units",
      "aov",
      "buyers",
      "arpu",
      "discount_value",
      "discount_rate",
      "membership_rev_share",
      "deferred_revenue",
    ],
    groups: [
      {
        field: "category",
        title: "Revenue by category",
        deck: "What sold, and at what average value.",
        columns: ["net_revenue", "transactions", "units", "aov", "discount_rate"],
      },
      {
        field: "product",
        title: "Top products",
        deck: "The individual SKUs carrying the month.",
        columns: ["net_revenue", "transactions", "units", "aov"],
        limit: 12,
      },
      {
        field: "payment_method",
        title: "Payment mix",
        deck: "How members paid, and whether any channel is drifting.",
        columns: ["net_revenue", "transactions", "aov"],
      },
    ],
    history: ["net_revenue", "transactions", "aov", "discount_rate"],
  },
  {
    id: "conversion-funnel",
    nav: "Funnel",
    title: "New Client Conversion Funnel",
    eyebrow: "First visit to paying member",
    deck: "How many arrived, how many came back, how many bought — and how long each step took.",
    source: "new",
    metrics: [
      "new_clients",
      "conversion_rate",
      "second_visit_rate",
      "zero_return_rate",
      "avg_conversion_span",
      "median_conversion_span",
      "avg_first_purchase",
      "avg_ltv",
      "ltv_to_first_purchase",
      "visits_post_trial",
    ],
    groups: [
      {
        field: "source",
        title: "Acquisition source",
        deck: "Where new clients came from, and which source converts rather than merely arrives.",
        columns: [
          "new_clients",
          "conversion_rate",
          "second_visit_rate",
          "avg_first_purchase",
          "avg_ltv",
        ],
      },
      {
        field: "trainer",
        title: "First-visit trainer",
        deck: "Who takes the first class, and what happens to those clients afterwards.",
        columns: ["new_clients", "conversion_rate", "second_visit_rate", "avg_ltv"],
        limit: 12,
      },
    ],
    history: ["new_clients", "conversion_rate", "second_visit_rate", "avg_ltv"],
  },
  {
    id: "sessions",
    nav: "Sessions",
    title: "Sessions & Class Performance",
    eyebrow: "The timetable, judged",
    deck: "Which classes earn their slot, which run near-empty, and what the empty seats cost.",
    source: "sessions",
    metrics: [
      "sessions",
      "capacity",
      "booked",
      "attendance",
      "fill_rate",
      "show_up_rate",
      "late_cancel_rate",
      "no_show_rate",
      "empty_sessions",
      "empty_session_rate",
      "unsold_seats",
      "revenue_per_session",
    ],
    groups: [
      {
        field: "format",
        title: "Format performance",
        deck: "Every format on the timetable, ranked by attended seats.",
        columns: [
          "sessions",
          "attendance",
          "fill_rate",
          "avg_class_size_incl",
          "revenue_per_session",
          "lost_revenue",
        ],
        limit: 15,
      },
      {
        field: "trainer",
        title: "Trainer performance",
        deck: "Draw and reliability by teacher, minimum five sessions.",
        columns: [
          "sessions",
          "attendance",
          "fill_rate",
          "avg_class_size_incl",
          "revenue_per_session",
        ],
        limit: 15,
      },
      {
        field: "day",
        title: "Day of week",
        deck: "The weekly rhythm — where the timetable is dense and where it is thin.",
        columns: ["sessions", "attendance", "fill_rate", "empty_sessions", "revenue"],
      },
    ],
    history: ["sessions", "fill_rate", "empty_sessions", "revenue_per_session"],
  },
  {
    id: "lapsed",
    nav: "Retention",
    title: "Lapsed Memberships Deep Dive",
    eyebrow: "Who is slipping away",
    deck: "Active memberships, the ones going unused, and the revenue standing behind the members at risk.",
    source: "lapsed",
    metrics: [
      "active_memberships",
      "churn_rate",
      "utilisation",
      "zero_usage_memberships",
      "dormant_actives",
      "revenue_at_risk_30d",
      "memberships_count",
      "remaining_sessions",
      "days_absent",
    ],
    groups: [
      {
        field: "product",
        title: "Membership products",
        deck: "Which products are used, and which are bought and then forgotten.",
        columns: [
          "memberships_count",
          "utilisation",
          "zero_usage_memberships",
          "remaining_sessions",
          "revenue_at_risk_30d",
        ],
        limit: 12,
      },
      {
        field: "status",
        title: "Membership status",
        deck: "The standing position across the base.",
        columns: ["memberships_count", "utilisation", "days_absent"],
      },
    ],
    history: ["active_memberships", "churn_rate", "utilisation", "revenue_at_risk_30d"],
  },
  {
    id: "recommendations",
    nav: "Actions",
    title: "Strategic Recommendations",
    eyebrow: "What to do about it",
    deck: "Ranked by the money or the risk behind them, each with a named owner and a figure to move.",
    source: "sessions",
    metrics: [],
    groups: [],
    history: [],
    derived: true,
  },
  {
    id: "predictions",
    nav: "Outlook",
    title: "Predictions & Forward View",
    eyebrow: "Where next month lands",
    deck: "A projection from the trailing trend, with the assumptions it rests on stated rather than hidden.",
    source: "sessions",
    metrics: [],
    groups: [],
    history: [],
    derived: true,
  },
];
export const chapterById = Object.fromEntries(chapters.map((c) => [c.id, c]));
/** "01", "02", … printed beside the chapter title. */
export const chapterNumber = (index: number) => String(index + 1).padStart(2, "0");
