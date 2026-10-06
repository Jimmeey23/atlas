export type Cell = string | number | boolean | null;
export interface Defect {
  source: string;
  row: number;
  field: string;
  issue: string;
}
export interface SourceData {
  key: string;
  title: string;
  id: string;
  columns: string[];
  rows: Cell[][];
  status: string;
  error?: string;
  fetchedAt: number | null;
  loadMs: number;
  mode?: string;
  stale?: boolean;
  refreshError?: string;
  missing?: string[];
}
export const number = (v: unknown): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
export const boolean = (v: unknown): boolean | null =>
  v == null || v === "" || v === "-"
    ? null
    : /^(true|yes|1)$/i.test(String(v))
      ? true
      : /^(false|no|0)$/i.test(String(v))
        ? false
        : null;
export function date(v: unknown): string | null {
  if (v == null || v === "" || v === "-") return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
  if (m)
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}${m[4]}`;
  m = s.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if (m)
    return `${m[1]}-${String(+m[2] + 1).padStart(2, "0")}-${m[3].padStart(2, "0")} ${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}`;
  return /^\d{4}-\d\d-\d\d/.test(s) ? s.replace(",", "") : null;
}
/**
 * The three studio formats. PowerCycle and Strength Lab name themselves in the
 * class name; everything else on the timetable is Barre.
 */
export const formatGroup = (name: unknown): string => {
  const text = String(name ?? "");
  if (/powercycle/i.test(text)) return "PowerCycle";
  if (/strength\s*lab/i.test(text)) return "Strength Lab";
  return "Barre";
};
export function month(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d\d/.test(s)) return s.slice(0, 7);
  const m = s.match(/([A-Za-z]+)[ -](\d{4})/);
  const i = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(m?.[1].slice(0, 3).toLowerCase() || "");
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, "0")}` : null;
}
export function percent(v: unknown, percentColumn = true): number | null {
  const n = number(String(v ?? "").replace("%", ""));
  return n == null
    ? null
    : String(v).includes("%") || percentColumn
      ? n / 100
      : n;
}
export function topTrainers(v: unknown) {
  return [...String(v ?? "").matchAll(/([^,]+)\s+\(([\d.]+)\)/g)]
    .map((m) => ({ name: m[1].trim(), attendance: +m[2] }))
    .sort((a, b) => b.attendance - a.attendance);
}
export const contactable = (v: unknown) =>
  !!v &&
  !/^noemail\+/i.test(String(v)) &&
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v));
export const canonicalLocation = (v: unknown) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (/kwality|kemps/i.test(s)) return "Kwality House, Kemps Corner";
  if (/supreme|bandra/i.test(s)) return "Supreme HQ, Bandra";
  if (/^pop[ -]?up$/i.test(s)) return "Pop-up";
  if (/kenkere/i.test(s)) return "Kenkere House";
  if (/plash/i.test(s)) return "Plash Pilates";
  if (/copper.*cloves/i.test(s)) return "The Studio by Copper + Cloves";
  return s || "Unknown location";
};
export const shortLocation = (v: string) =>
  v === "Kwality House, Kemps Corner"
    ? "Kemps Corner"
    : v === "Kenkere House"
      ? "Kenkere"
      : v === "Plash Pilates"
        ? "Plash"
        : v;
export const sqlTypes: Record<string, string> = {
  row_id: "DOUBLE",
  source_row: "DOUBLE",
  source_snapshot: "DOUBLE",
  date: "VARCHAR",
  month: "VARCHAR",
  location: "VARCHAR",
  trainer: "VARCHAR",
  trainer_id: "VARCHAR",
  format: "VARCHAR",
  format_group: "VARCHAR",
  day: "VARCHAR",
  time: "VARCHAR",
  member: "VARCHAR",
  member_id: "VARCHAR",
  email: "VARCHAR",
  phone: "VARCHAR",
  category: "VARCHAR",
  product: "VARCHAR",
  source: "VARCHAR",
  associate: "VARCHAR",
  status: "VARCHAR",
  lifecycle: "VARCHAR",
  conversion: "VARCHAR",
  retention: "VARCHAR",
  session_id: "VARCHAR",
  unique_id1: "VARCHAR",
  unique_id2: "VARCHAR",
  sale_id: "VARCHAR",
  membership_id: "VARCHAR",
  payment_method: "VARCHAR",
  capacity: "DOUBLE",
  checked_in: "DOUBLE",
  booked: "DOUBLE",
  late_cancelled: "DOUBLE",
  non_paid: "DOUBLE",
  revenue: "DOUBLE",
  net: "DOUBLE",
  vat: "DOUBLE",
  discount: "DOUBLE",
  discount_code: "VARCHAR",
  purchase_type: "VARCHAR",
  units: "DOUBLE",
  sessions: "DOUBLE",
  empty: "DOUBLE",
  non_empty: "DOUBLE",
  memberships: "DOUBLE",
  packages: "DOUBLE",
  intro: "DOUBLE",
  single: "DOUBLE",
  is_new: "BOOLEAN",
  entry_type: "VARCHAR",
  first_purchase_date: "VARCHAR",
  post_trial_ltv: "DOUBLE",
  avg_purchase_value: "DOUBLE",
  post_trial_purchases: "DOUBLE",
  purchase_journey: "VARCHAR",
  imported: "BOOLEAN",
  contactable: "BOOLEAN",
  cancelled: "BOOLEAN",
  no_show: "BOOLEAN",
  attended: "BOOLEAN",
  refunded: "BOOLEAN",
  complimentary: "BOOLEAN",
  voided: "BOOLEAN",
  ltv: "DOUBLE",
  first_purchase: "DOUBLE",
  visits_post: "DOUBLE",
  visits: "DOUBLE",
  days_absent: "DOUBLE",
  conversion_days: "DOUBLE",
  second_visit_days: "DOUBLE",
  purchases: "DOUBLE",
  classes_left: "DOUBLE",
  money_left: "DOUBLE",
  rev_credit: "DOUBLE",
  completed: "DOUBLE",
  session_limit: "DOUBLE",
  remaining: "DOUBLE",
  attendance_rate: "DOUBLE",
  cancel_rate: "DOUBLE",
  last_visit: "VARCHAR",
  first_visit: "VARCHAR",
  end_date: "VARCHAR",
  start_date: "VARCHAR",
  churned_date: "VARCHAR",
  duration: "DOUBLE",
  days_active: "DOUBLE",
  days_frozen: "DOUBLE",
  freeze_count: "DOUBLE",
  lead_time: "DOUBLE",
  response_hours: "DOUBLE",
  touches: "DOUBLE",
  converted: "DOUBLE",
  retained: "DOUBLE",
  new_count: "DOUBLE",
  teacher_dependency: "DOUBLE",
  trainer_depth: "DOUBLE",
  amount_paid: "DOUBLE",
  strength_sessions: "DOUBLE",
  cycle_sessions: "DOUBLE",
  barre_sessions: "DOUBLE",
  cycle_revenue: "DOUBLE",
  barre_revenue: "DOUBLE",
  strength_revenue: "DOUBLE",
  raw_json: "VARCHAR",
  class_no: "DOUBLE",
  stage: "VARCHAR",
  session_type: "VARCHAR",
  membership_sequence: "VARCHAR",
  membership_count: "DOUBLE",
};
export function normalise(
  data: SourceData,
  withRaw = true,
): { rows: Record<string, Cell>[]; defects: Defect[] } {
  const defects: Defect[] = [];
  const rows = data.rows.map((cells, i) => {
    const raw: Record<string, Cell> = {};
    data.columns.forEach((c, j) => {
      const v = cells[j];
      raw[c] = typeof v === "string" ? v.trim() : (v ?? null);
      if (raw[c] === "" || raw[c] === "-") raw[c] = null;
    });
    const g = (...keys: string[]) => {
      for (const k of keys) if (raw[k] != null) return raw[k];
      return null;
    };
    const n = (...keys: string[]) => number(g(...keys));
    const str = (...keys: string[]) =>
      g(...keys) == null ? null : String(g(...keys));
    const k = data.key;
    const roll = k === "recurring" || k === "teacher_recurring";
    const trainers = topTrainers(g("Top5Trainers"));
    const d =
      k === "payroll"
        ? `${month(g("Month Year"))}-01`
        : date(
            g(
              k === "sales"
                ? "Payment Date"
                : k === "new"
                  ? "First Visit Date"
                  : k === "lapsed"
                    ? "Purchase Date"
                    : k === "bookings"
                      ? "Session Date"
                      : k === "leads"
                        ? "Created At"
                        : "Date",
              "Date (IST)",
            ),
          );
    let duration = n("Duration (Minutes)");
    if (
      g("Duration (Minutes)") &&
      /^1900-/.test(String(g("Duration (Minutes)")))
    ) {
      duration = null;
      defects.push({
        source: k,
        row: i + 2,
        field: "Duration (Minutes)",
        issue: "Excel serial-date damage; duration unavailable.",
      });
    }
    const sessionDate = date(g("Session Date"));
    const saleDate = date(g("Sale Date"));
    const created = date(g("Created At"));
    const follow = date(g("Follow Up 1 Date"));
    const imported =
      /import/i.test(
        String(g("Payment Method", "Payment Method Name", "Sale Item", "First Visit Entity Name")),
      ) || g("Sale Item") === "Import Visits";
    const elapsed = (a: string | null, b: string | null) =>
      a && b
        ? (Date.parse(a.replace(" ", "T")) - Date.parse(b.replace(" ", "T"))) /
          86400000
        : null;
    if (
      k === "sales" &&
      n("Price Excluding VAT In Currency") != null &&
      n("Payment Value") != null &&
      n("Price Excluding VAT In Currency")! > n("Payment Value")! + 0.02
    )
      defects.push({
        source: k,
        row: i + 2,
        field: "Price Excluding VAT In Currency",
        issue: "Net-of-VAT source value exceeds gross payment value.",
      });
    const formatLabel =
      str(
        "Class",
        "Cleaned Class",
        "Class Type",
        "SessionName",
        "Session Name",
        "First Visit Entity Name",
      ) || "Unknown format";
    const r: Record<string, Cell> = {};
    Object.assign(r, {
      row_id: i,
      source_row: i + 2,
      source_snapshot: data.fetchedAt,
      date: d?.slice(0, 10) || null,
      month: month(d || g("Month Year")),
      location: canonicalLocation(
        g(
          "Location",
          "Calculated Location",
          "First Visit Location",
          "Primary Location",
          "Location Name",
          "Center",
          "Home Location",
        ),
      ),
      trainer: str("Trainer", "Teacher Name", "Trainer Name"),
      trainer_id: str("TrainerID", "Teacher ID", "Trainer Id"),
      format: formatLabel,
      format_group: formatGroup(formatLabel),
      day:
        str("Day", "Day Of Week", "Day of Week", "First Visit Day") ||
        (d
          ? new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString(
              "en-US",
              { weekday: "long", timeZone: "UTC" },
            )
          : null),
      time: (() => {
        const clock = str("Time", "Time Slot", "First Visit Time Slot");
        const actual = clock?.match(/^(\d{1,2}):(\d{2})/) || d?.slice(11).match(/^(\d{1,2}):(\d{2})/);
        return actual ? `${actual[1].padStart(2, "0")}:${actual[2]}` : clock;
      })(),
      member:
        str("Customer Name", "Member Name", "Full Name") ||
        [str("First Name"), str("Last Name")].filter(Boolean).join(" ") ||
        null,
      member_id: str("Member ID", "Member Id"),
      email: str("Customer Email", "Member Email", "Email", "Teacher Email"),
      phone: str("Phone Number", "Member Phone"),
      category: str(
        "Cleaned Category",
        "Membership Name",
        "Channel",
        "First Visit Type",
      ),
      product: str(
        "Cleaned Product",
        "Membership Name",
        "Sale Item",
        "First Purchase Post Trial",
      ),
      source: str("Source", "Source Name", "Payment Source"),
      associate: str("Sold By", "Associate"),
      status: str("Status", "Payment Status"),
      lifecycle: str("Lifecycle Status"),
      conversion: str("Conversion Status"),
      retention: str("Retention Status"),
      session_id: str("SessionID", "Session ID"),
      unique_id1: str("UniqueID1"),
      unique_id2: str("UniqueID2"),
      sale_id: str("Sale ID", "Sale Id"),
      membership_id: str("Sec. Membership ID"),
      payment_method: str("Payment Method", "Payment Method Name"),
      capacity: n(roll ? "TotalCapacitySum" : "Capacity"),
      checked_in:
        k === "checkins"
          ? boolean(g("Checked In")) == null
            ? null
            : boolean(g("Checked In"))
              ? 1
              : 0
          : n(roll ? "TotalCheckedInSum" : "CheckedIn", "Total Customers"),
      booked: n("Booked"),
      late_cancelled:
        k === "bookings" || k === "checkins"
          ? boolean(g("Late Cancelled", "Is Late Cancelled")) == null
            ? null
            : boolean(g("Late Cancelled", "Is Late Cancelled"))
              ? 1
              : 0
          : n("LateCancelled", "Late Cancellations"),
      non_paid: n("NonPaid"),
      revenue: n(
        roll
          ? "TotalRevenueSum"
          : k === "sales"
            ? "Payment Value"
            : k === "payroll"
              ? "Total Paid"
              : k === "bookings"
                ? "Sale Value"
                : k === "checkins"
                  ? "Paid"
                  : k === "lapsed"
                    ? "Amount Paid"
                    : "Revenue",
      ),
      net: n("Price Excluding VAT In Currency"),
      vat: n("Payment VAT", "Vat"),
      discount: k === "sales"
        ? n("Sale Item Unit Discount Value") != null && n("Sale Item Quantity") != null
          ? n("Sale Item Unit Discount Value")! * n("Sale Item Quantity")!
          : null
        : n("Discount Value In Currency", "Discount Value"),
      units: n("Sale Item Quantity"),
      discount_code: str("Discount Code"),
      purchase_type: str("Purchase Type"),
      sessions: roll
        ? n("TotalSessions", "Classes")
        : k === "payroll"
          ? n("Total Sessions")
          : 1,
      empty: roll
        ? n("EmptySessions")
        : k === "payroll"
          ? n("Total Empty Sessions")
          : n("CheckedIn") == null
            ? null
            : n("CheckedIn") === 0
              ? 1
              : 0,
      non_empty: roll
        ? n("NonEmptySessions")
        : n("CheckedIn") != null && n("CheckedIn")! > 0
          ? 1
          : 0,
      memberships: n("Memberships"),
      packages: n("Packages"),
      intro: n("IntroOffers"),
      single: n("SingleClasses"),
      // Any Is New label containing the word new is a trial. Labels that name a
      // known non-trial visit are explicitly false so the existing-member filter
      // can use them; anything unrecognised stays null rather than guessing.
      is_new: (() => {
        const label = g("Is New");
        if (label == null) return null;
        const text = String(label).trim();
        if (/^not\b/i.test(text)) return false;
        if (/\bnew\b/i.test(text)) return true;
        if (/^(existing|returning|repeat|staff|family)/i.test(text)) return false;
        return boolean(text);
      })(),
      entry_type: str("Is New"),
      first_purchase_date: date(g("First Purchase Date"))?.slice(0, 10) || null,
      post_trial_ltv: n("Ltv Post Trial"),
      avg_purchase_value: n("Avg Purchase Value Post Trial"),
      post_trial_purchases: n("Purchase Count Post Trial"),
      purchase_journey: str("Memberships Bought Post Trial"),
      imported,
      contactable: contactable(g("Email", "Customer Email", "Member Email")),
      cancelled: boolean(g("Cancelled")),
      no_show: boolean(g("No Show")),
      attended: boolean(g("Attended", "Checked In")),
      refunded: boolean(g("Refunded")),
      complimentary: boolean(g("Complementary", "Complimentary")),
      voided: boolean(g("Sec. Is Voided")),
      ltv: n("Ltv"),
      first_purchase: n("First Purchase Value"),
      visits_post: n("Visits Post Trial"),
      visits: n("No of Visits", "Total Sessions"),
      days_absent: n("Days Since Last Visit"),
      conversion_days: n("Conversion Span (Days)"),
      second_visit_days: n("Days To Second Visit"),
      purchases: n("Total Purchases All Time"),
      classes_left: n("Sec. Membership Classes Left"),
      money_left: n("Sec. Membership Money Left"),
      rev_credit: n(
        "Sec. Membership Revenue Per Event Credit Incl VAT",
        "Revenue Per Session",
      ),
      completed: n("Completed Sessions", "Total Sessions Completed"),
      session_limit: n("Sessions Limit", "Sec. Membership Total Classes"),
      remaining: n("Remaining Sessions"),
      attendance_rate: percent(g("Attendance Rate %")),
      cancel_rate: percent(
        g("Cancellation Rate %", "Late Cancel Rate Post Trial"),
      ),
      last_visit:
        date(g("Most Recent Visit Date", "Last Visit Date"))?.slice(0, 10) ||
        null,
      first_visit: date(g("First Visit Date"))?.slice(0, 10) || null,
      end_date:
        date(g("End Date", "Sec. Membership End Date"))?.slice(0, 10) || null,
      start_date:
        date(g("Start Date", "Sec. Membership Start Date"))?.slice(0, 10) ||
        null,
      churned_date: date(g("Churned Date"))?.slice(0, 10) || null,
      duration,
      days_active: n("Days Active"),
      days_frozen: n("Days Frozen"),
      freeze_count: n("Membership Freeze Count"),
      lead_time: imported ? null : elapsed(sessionDate, saleDate),
      response_hours:
        elapsed(follow, created) == null
          ? null
          : elapsed(follow, created)! * 24,
      touches: [1, 2, 3, 4].filter((j) => g(`Follow Up ${j} Date`) != null)
        .length,
      converted: n("Converted"),
      retained: n("Retained"),
      new_count: n("New"),
      teacher_dependency: trainers.length
        ? trainers[0].attendance /
          trainers.reduce((s, t) => s + t.attendance, 0)
        : null,
      trainer_depth: trainers.length || null,
      amount_paid: n("Amount Paid"),
      cycle_sessions: n("Cycle Sessions"),
      barre_sessions: n("Barre Sessions"),
      strength_sessions: n("Strength Sessions"),
      cycle_revenue: n("Cycle Paid"),
      barre_revenue: n("Barre Paid"),
      strength_revenue: n("Strength Paid"),
      session_type: /hosted|partnership| x /i.test(
        String(g("Class", "SessionName", "First Visit Entity Name")) + " " + String(g("Is New")),
      )
        ? "Hosted"
        : "Regular",
      membership_sequence: g("Membership Used")
        ? JSON.stringify(
            String(g("Membership Used"))
              .split(",")
              .map((s) => s.trim()),
          )
        : null,
      membership_count: g("Membership Used")
        ? String(g("Membership Used")).split(",").length
        : null,
      stage: str("Stage Name"),
      class_no: n("Class No"),
      raw_json: withRaw ? JSON.stringify(raw) : null,
    });
    if (r.response_hours != null && +r.response_hours < 0) {
      defects.push({
        source: k,
        row: i + 2,
        field: "Follow Up 1 Date",
        issue: "Follow-up predates lead creation; excluded from response time.",
      });
      r.response_hours = null;
    }
    return Object.fromEntries(Object.entries(r).filter(([, v]) => v != null));
  });
  return { rows, defects };
}
