import { useState, useRef, useEffect, forwardRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { metrics } from "../../semantics/metrics";
import { simpleMetricDefinitions } from "../../semantics/metric-simple-definitions";
import "./MetricInfoHint.css";

export interface MetricFormulaInfo {
  id: string;
  label: string;
  formula: string;
  calculation?: string;
  sources?: string[];
}

const CUSTOM_METRIC_FORMULAS: Record<string, { label: string; formula: string; calculation?: string; sources?: string[] }> = {
  composite_score: {
    label: "Composite score",
    formula: "ROUND(100 * (RANK(fill_rate) + RANK(avg_class_size) + RANK(revenue_per_session) + RANK(conversion_rate) + RANK(1 - empty_share) + RANK(1 - booking_late_rate)) / 6)",
    calculation: "Evenly weighted percentile rank across fill rate, class size, revenue per class, conversion, session occupancy and low late cancellations.",
    sources: ["Sessions", "New", "Bookings"],
  },
  mom_growth: {
    label: "Collections MoM change",
    formula: "(gross_revenue - LAG(gross_revenue)) / NULLIF(LAG(gross_revenue), 0)",
    calculation: "Percentage change in gross collections compared to the preceding calendar month.",
    sources: ["Sales"],
  },
  arpu: {
    label: "Average spend (Sales / member)",
    formula: "SUM(revenue) / NULLIF(COUNT(DISTINCT member_id), 0)",
    calculation: "Total Sales collections divided by unique buying members from Sales sheet.",
    sources: ["Sales.PaymentValue", "Sales.MemberID"],
  },
  aov: {
    label: "Average order value",
    formula: "SUM(revenue) / NULLIF(COUNT(DISTINCT sale_id), 0)",
    calculation: "Eligible Sales collections divided by different known Sale IDs.",
    sources: ["Sales.PaymentValue", "Sales.SaleID"],
  },
  purchase_frequency: {
    label: "Purchases / member",
    formula: "COUNT(DISTINCT sale_id) / NULLIF(COUNT(DISTINCT member_id), 0)",
    calculation: "Total orders divided by unique buying members.",
    sources: ["Sales.SaleID", "Sales.MemberID"],
  },
  product_breadth: {
    label: "Products sold",
    formula: "COUNT(DISTINCT product)",
    calculation: "Number of distinct products purchased in the selected scope.",
    sources: ["Sales.Product"],
  },
  top_product: {
    label: "Top product · sales",
    formula: "ARG_MAX(product, gross_revenue)",
    calculation: "Product generating the highest gross collections.",
    sources: ["Sales.Product", "Sales.PaymentValue"],
  },
  bottom_product: {
    label: "Bottom product · sales",
    formula: "ARG_MIN(product, gross_revenue)",
    calculation: "Product generating the lowest gross collections.",
    sources: ["Sales.Product", "Sales.PaymentValue"],
  },
  discount_value: {
    label: "Discount value",
    formula: "SUM(discount)",
    calculation: "Sum of discount amounts applied to purchases.",
    sources: ["Sales.Discount"],
  },
  discount_rate: {
    label: "Discount rate",
    formula: "SUM(discount) / NULLIF(SUM(gross_revenue + discount), 0)",
    calculation: "Total discount value divided by total gross sales before discount.",
    sources: ["Sales.Discount", "Sales.PaymentValue"],
  },
  discount_penetration: {
    label: "Discounted sale share",
    formula: "COUNT(DISTINCT sale_id) FILTER (WHERE discount > 0) / NULLIF(COUNT(DISTINCT sale_id), 0)",
    calculation: "Proportion of sales that included at least one discount.",
    sources: ["Sales.Discount", "Sales.SaleID"],
  },
  discounted_lines: {
    label: "Discounted lines",
    formula: "COUNT(*) FILTER (WHERE discount > 0)",
    calculation: "Count of line items with positive discount amount.",
    sources: ["Sales.Discount"],
  },
  payment_lines: {
    label: "Payment lines",
    formula: "COUNT(*)",
    calculation: "Total recorded payment line items.",
    sources: ["Sales"],
  },
  transactions: {
    label: "Sales / Transactions",
    formula: "COUNT(DISTINCT sale_id)",
    calculation: "Count different recorded Sale IDs.",
    sources: ["Sales.SaleID"],
  },
  buyers: {
    label: "Members / Buyers",
    formula: "COUNT(DISTINCT member_id)",
    calculation: "Count different recorded buyer Member IDs.",
    sources: ["Sales.MemberID"],
  },
  purchase_count: {
    label: "Purchases",
    formula: "COUNT(*)",
    calculation: "Count of recorded purchase lines.",
    sources: ["Sales"],
  },
  non_empty_sessions: {
    label: "Non-empty classes",
    formula: "COUNT(DISTINCT session_id) FILTER (WHERE checked_in > 0)",
    calculation: "Number of sessions with at least one checked-in attendee.",
    sources: ["Sessions.CheckedIn"],
  },
  empty_sessions: {
    label: "Empty classes",
    formula: "COUNT(DISTINCT session_id) FILTER (WHERE checked_in = 0)",
    calculation: "Number of sessions with zero attendance.",
    sources: ["Sessions.CheckedIn"],
  },
  new_visitors: {
    label: "New members",
    formula: "COUNT(*) FILTER (WHERE is_new)",
    calculation: "Count of new member records.",
    sources: ["New.IsNew"],
  },
  converted: {
    label: "Converted",
    formula: "COUNT(*) FILTER (WHERE is_new AND conversion = 'Converted')",
    calculation: "Newcomers whose latest recorded outcome is Converted.",
    sources: ["New.Conversion"],
  },
  retained: {
    label: "Retained",
    formula: "COUNT(*) FILTER (WHERE is_new AND retention = 'Retained')",
    calculation: "Newcomers whose latest recorded outcome is Retained.",
    sources: ["New.Retention"],
  },
  late_cancelled: {
    label: "Late cancelled",
    formula: "COUNT(*) FILTER (WHERE late_cancelled > 0)",
    calculation: "Bookings cancelled after the cancellation cut-off window.",
    sources: ["Bookings.LateCancelled"],
  },
  booking_late_rate: {
    label: "Booking late-cancel rate",
    formula: "COUNT(*) FILTER (WHERE late_cancelled > 0) / NULLIF(COUNT(*), 0)",
    calculation: "Proportion of total bookings that were late cancellations.",
    sources: ["Bookings.LateCancelled"],
  },
  cohort_rows: {
    label: "Clients / trials",
    formula: "COUNT(*)",
    calculation: "Total trial/first-visit cohort records.",
    sources: ["New"],
  },
  unique_members: {
    label: "Unique members",
    formula: "COUNT(DISTINCT member_id)",
    calculation: "Distinct member IDs in the cohort.",
    sources: ["New.MemberID"],
  },
  newcomers: {
    label: "New clients",
    formula: "COUNT(*) FILTER (WHERE is_new)",
    calculation: "Unique clients identified as new.",
    sources: ["New.IsNew"],
  },
  converted_members: {
    label: "Converted records (all visit types)",
    formula: "COUNT(*) FILTER (WHERE conversion = 'Converted')",
    calculation: "Cohort records with Conversion Status = Converted.",
    sources: ["New.Conversion"],
  },
  retained_members: {
    label: "Retained records (all visit types)",
    formula: "COUNT(*) FILTER (WHERE retention = 'Retained')",
    calculation: "Cohort records with Retained Status = Retained.",
    sources: ["New.Retention"],
  },
  converted_30: {
    label: "Same-month converted",
    formula: "COUNT(*) FILTER (WHERE is_new AND converted_same_month)",
    calculation: "Newcomers who purchased a membership in their first calendar month.",
    sources: ["New", "Sales"],
  },
  retained_30: {
    label: "Same-month converted & retained",
    formula: "COUNT(*) FILTER (WHERE is_new AND retained_same_month)",
    calculation: "Newcomers who converted and remained active in their first calendar month.",
    sources: ["New", "Sales"],
  },
  mature_30: {
    label: "Calendar-month cohort members",
    formula: "COUNT(*) FILTER (WHERE month < CURRENT_MONTH)",
    calculation: "Cohort members whose first-visit month has completed.",
    sources: ["New"],
  },
  conversion_30_rate: {
    label: "Same-month conversion rate",
    formula: "COUNT(*) FILTER (WHERE is_new AND converted_same_month) / NULLIF(COUNT(*) FILTER (WHERE is_new), 0)",
    calculation: "Percentage of newcomers converting within the same calendar month.",
    sources: ["New", "Sales"],
  },
  retention_30_rate: {
    label: "Same-month retained rate",
    formula: "COUNT(*) FILTER (WHERE is_new AND retained_same_month) / NULLIF(COUNT(*) FILTER (WHERE is_new), 0)",
    calculation: "Percentage of newcomers retained within the same calendar month.",
    sources: ["New", "Sales"],
  },
  avg_ltv: {
    label: "Average LTV",
    formula: "AVG(ltv)",
    calculation: "Sum of member lifetime spend divided by cohort members.",
    sources: ["New.LTV"],
  },
  total_ltv: {
    label: "Total LTV",
    formula: "SUM(ltv)",
    calculation: "Total cumulative spend recorded across cohort members.",
    sources: ["New.LTV"],
  },
  avg_spend: {
    label: "Average spend / purchase",
    formula: "SUM(spend) / NULLIF(COUNT(DISTINCT purchase_id), 0)",
    calculation: "Total purchase value divided by number of purchases.",
    sources: ["Sales.PaymentValue"],
  },
  first_purchase: {
    label: "Average first purchase",
    formula: "AVG(first_purchase)",
    calculation: "Average initial membership/pack spend of converted newcomers.",
    sources: ["New.FirstPurchase"],
  },
  post_trial_ltv: {
    label: "Average post-trial LTV",
    formula: "AVG(post_trial_ltv)",
    calculation: "Average spend after the initial trial purchase.",
    sources: ["New.PostTrialLTV"],
  },
  conversion_span: {
    label: "Conversion span",
    formula: "AVG(days_to_convert)",
    calculation: "Average days elapsed between first visit and first membership purchase.",
    sources: ["New.DaysToConvert"],
  },
  median_span: {
    label: "Median conversion span",
    formula: "MEDIAN(days_to_convert)",
    calculation: "Median days elapsed between first visit and first membership purchase.",
    sources: ["New.DaysToConvert"],
  },
  visits_post: {
    label: "Average post-trial visits",
    formula: "AVG(visits_post)",
    calculation: "Average attendance visits taken after trial completion.",
    sources: ["New.VisitsPost"],
  },
  purchases_post: {
    label: "Average post-trial purchases",
    formula: "AVG(purchases_post)",
    calculation: "Average number of repeat purchases made after initial conversion.",
    sources: ["New.PurchasesPost"],
  },
  source_visits: {
    label: "Recorded visit count",
    formula: "COUNT(visit_id)",
    calculation: "Total visits recorded across the cohort.",
    sources: ["New.Visits"],
  },
  converted_same_month: {
    label: "First-month converted",
    formula: "COUNT(*) FILTER (WHERE converted_same_month)",
    calculation: "First-month conversions from first-visit date.",
    sources: ["New", "Sales"],
  },
  retained_same_month: {
    label: "First-month retained",
    formula: "COUNT(*) FILTER (WHERE retained_same_month)",
    calculation: "First-month retentions from first-visit date.",
    sources: ["New", "Sales"],
  },
  revenue_per_session: {
    label: "Earned revenue / class",
    formula: "SUM(revenue) / NULLIF(COUNT(DISTINCT session_id), 0)",
    calculation: "Earned revenue from Sessions divided by total sessions.",
    sources: ["Sessions.Revenue", "Sessions.SessionID"],
  },
  checkin_revenue: {
    label: "Earned check-in revenue",
    formula: "SUM(revenue) FILTER (WHERE attended)",
    calculation: "Earned revenue attributed to attended check-ins from Checkins sheet.",
    sources: ["Checkins.Paid"],
  },
  revenue_per_checkin: {
    label: "Earned revenue / check-in",
    formula: "SUM(revenue) FILTER (WHERE attended) / NULLIF(COUNT(*) FILTER (WHERE attended), 0)",
    calculation: "Earned revenue per attended check-in from Checkins sheet.",
    sources: ["Checkins.Paid", "Checkins.CheckedIn"],
  },
  touches: {
    label: "Recorded touches",
    formula: "AVG(touches)",
    calculation: "Average recorded follow-up touchpoints per lead.",
    sources: ["Leads.Touches"],
  },
  response_time_hours: {
    label: "Response time (hrs)",
    formula: "AVG(response_time_minutes) / 60",
    calculation: "Average hours between lead creation and first recorded outreach.",
    sources: ["Leads.ResponseTime"],
  },
  due: {
    label: "Total due",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status IN ('Renewed', 'Expired', 'Frozen', 'Grace period'))",
    calculation: "Total unique members due for renewal in expiry month across ongoing paid memberships.",
    sources: ["Lapsed.Status", "Lapsed.MemberID"],
  },
  renewed: {
    label: "Renewed",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Renewed')",
    calculation: "Members who renewed their membership upon expiry.",
    sources: ["Lapsed.Status"],
  },
  lapsed: {
    label: "Expired / lapsed",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Expired' AND churn_days >= 30)",
    calculation: "Members whose membership expired and churn date is at least 30 days old.",
    sources: ["Lapsed.Status", "Lapsed.ChurnedDate"],
  },
  frozen: {
    label: "Frozen",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Frozen')",
    calculation: "Members with an active membership freeze or suspension.",
    sources: ["Lapsed.Status"],
  },
  pending: {
    label: "Grace period (<30 days)",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Grace period' OR churn_days < 30)",
    calculation: "Members expired within the past 30 days still in grace period.",
    sources: ["Lapsed.Status", "Lapsed.ChurnedDate"],
  },
  renewal_rate: {
    label: "Renewal rate",
    formula: "COUNT(renewed) / NULLIF(COUNT(total_due), 0)",
    calculation: "Percentage of memberships due that renewed successfully.",
    sources: ["Lapsed.Status"],
  },
};

export function getMetricFormulaInfo(idOrName: string, labelOverride?: string): MetricFormulaInfo {
  const clean = idOrName?.trim() || "";
  
  // 1. Direct registry metric check
  if (metrics[clean]) {
    const m = metrics[clean];
    const simple = simpleMetricDefinitions[clean];
    return {
      id: clean,
      label: labelOverride || m.label,
      formula: m.description || m.sql({ rate: 1000, today: "TODAY" }),
      calculation: simple?.calculation || simple?.meaning,
      sources: m.sources,
    };
  }

  // 2. Custom metric dictionary check
  if (CUSTOM_METRIC_FORMULAS[clean]) {
    const c = CUSTOM_METRIC_FORMULAS[clean];
    return {
      id: clean,
      label: labelOverride || c.label,
      formula: c.formula,
      calculation: c.calculation,
      sources: c.sources,
    };
  }

  // 3. Search registry by label match (case-insensitive)
  const byLabel = Object.values(metrics).find(
    (m) => m.label.toLowerCase() === clean.toLowerCase() || m.id.toLowerCase() === clean.toLowerCase()
  );
  if (byLabel) {
    const simple = simpleMetricDefinitions[byLabel.id];
    return {
      id: byLabel.id,
      label: labelOverride || byLabel.label,
      formula: byLabel.description,
      calculation: simple?.calculation || simple?.meaning,
      sources: byLabel.sources,
    };
  }

  // 4. Default fallback
  const formatted = labelOverride || clean.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: clean,
    label: formatted,
    formula: `SUM(${clean})`,
    calculation: `Aggregated metric for ${formatted}.`,
  };
}

export interface MetricInfoHintProps {
  id: string;
  label?: string;
  className?: string;
  warning?: string;
  onClick?: (e: MouseEvent) => void;
}

export const MetricInfoHint = forwardRef<HTMLSpanElement, MetricInfoHintProps>(function MetricInfoHint(
  { id, label, className = "", warning, onClick },
  forwardedRef,
) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, placeAbove: true });
  const internalRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iconRef = (node: HTMLSpanElement | null) => {
    internalRef.current = node;
    if (typeof forwardedRef === "function") {
      forwardedRef(node);
    } else if (forwardedRef) {
      (forwardedRef as React.MutableRefObject<HTMLSpanElement | null>).current = node;
    }
  };

  const info = getMetricFormulaInfo(id, label);

  const updatePosition = () => {
    if (!internalRef.current) return;
    const rect = internalRef.current.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 110;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));

    const spaceAbove = rect.top;
    const placeAbove = spaceAbove >= tooltipHeight + 14;

    const top = placeAbove
      ? Math.max(8, rect.top - tooltipHeight - 6)
      : Math.min(window.innerHeight - tooltipHeight - 8, rect.bottom + 6);

    setPos({ left, top, placeAbove });
  };

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    updatePosition();
    setVisible(true);
  };

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 80);
  };

  useEffect(() => {
    if (!visible) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [visible]);

  return (
    <>
      <span
        ref={iconRef}
        className={`metric-info-hint ${warning ? "has-warning" : ""} ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          if (onClick) {
            onClick(e);
          } else {
            setVisible((v) => !v);
            updatePosition();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Formula and details for ${info.label}: ${info.formula}`}
        title={`Formula: ${info.formula}${info.calculation ? `\n${info.calculation}` : ""}${warning ? `\nNote: ${warning}` : ""}`}
      >
        <Info size={11} strokeWidth={2.2} aria-hidden="true" />
        {warning && <span className="metric-info-warning-dot" aria-hidden="true" />}
      </span>

      {visible &&
        createPortal(
          <div
            className="metric-formula-tooltip"
            style={{
              left: pos.left,
              top: pos.top,
            }}
            role="tooltip"
          >
            <div className="metric-formula-tooltip-head">
              <span className="metric-formula-tooltip-badge">Formula</span>
              <strong className="metric-formula-tooltip-title">{info.label}</strong>
            </div>
            <code className="metric-formula-tooltip-code">{info.formula}</code>
            {info.calculation && (
              <p className="metric-formula-tooltip-calc">{info.calculation}</p>
            )}
            {info.sources && info.sources.length > 0 && (
              <span className="metric-formula-tooltip-source">
                Source: {info.sources.join(", ")}
              </span>
            )}
          </div>,
          document.body
        )}
    </>
  );
});
