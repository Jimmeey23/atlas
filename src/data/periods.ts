const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const periods = [
  "This week",
  "Last week",
  "This month",
  "Last month",
  "Last 30 days",
  "This quarter",
  "Last quarter",
  "This year",
] as const;
export function relativePeriod(name: string, now = today()) {
  const end = new Date(now + "T00:00:00Z");
  const start = new Date(end);
  const dow = (end.getUTCDay() + 6) % 7;
  if (name === "This week") start.setUTCDate(start.getUTCDate() - dow);
  if (name === "Last week") {
    start.setUTCDate(start.getUTCDate() - dow - 7);
    end.setUTCDate(end.getUTCDate() - dow - 1);
  }
  if (name === "This month") start.setUTCDate(1);
  if (name === "Last month") {
    start.setUTCMonth(start.getUTCMonth() - 1, 1);
    end.setUTCDate(0);
  }
  if (name === "Last 30 days") start.setUTCDate(start.getUTCDate() - 29);
  if (name === "This quarter")
    start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3, 1);
  if (name === "Last quarter") {
    start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3 - 3, 1);
    end.setTime(
      new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0),
      ).getTime(),
    );
  }
  if (name === "This year") start.setUTCMonth(0, 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

/** Comparison choices offered in the toolbar. `custom:FROM:TO` carries its own dates. */
export const comparisonOptions: [mode: string, label: string, short: string][] = [
  ["none", "Off", ""],
  ["prior", "Previous period", "vs previous period"],
  ["month", "Previous month", "vs previous month"],
  ["quarter", "Previous quarter", "vs previous quarter"],
  ["year", "Same period last year", "vs last year"],
  ["year2", "Same period 2 years ago", "vs 2 years ago"],
  ["custom", "Custom range…", "vs custom range"],
];
export const comparisonLabel = (mode: string) =>
  comparisonOptions.find(([key]) => key === (mode.startsWith("custom:") ? "custom" : mode))?.[2] || "vs previous period";

export function comparisonDates(from: string, to: string, mode: string) {
  if (mode === "none" || !from || !to) return { from, to };
  const custom = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(mode);
  if (custom) return { from: custom[1], to: custom[2] };
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  // Same calendar position N months earlier, clamped to the end of shorter months.
  const shiftMonths = (date: Date, months: number) => {
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months + 1, 0)).getUTCDate();
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, Math.min(date.getUTCDate(), last)));
  };
  const back = { month: 1, quarter: 3, year: 12, year2: 24 }[mode];
  if (back) {
    const lastOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    // A selection ending on a month end keeps ending on a month end (Feb 28 → Jan 31).
    const shiftedEnd = shiftMonths(end, back);
    const endDate = end.getUTCDate() === lastOf(end) ? new Date(Date.UTC(shiftedEnd.getUTCFullYear(), shiftedEnd.getUTCMonth() + 1, 0)) : shiftedEnd;
    return { from: shiftMonths(start, back).toISOString().slice(0, 10), to: endDate.toISOString().slice(0, 10) };
  }
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  if (start.getUTCDate() === 1 && end.getUTCDate() === lastDay) {
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
    return {from: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - months, 1)).toISOString().slice(0,10), to: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0)).toISOString().slice(0,10)};
  }
  const length = end.getTime() - start.getTime() + 86400000;
  return {from: new Date(start.getTime() - length).toISOString().slice(0,10), to: new Date(end.getTime() - length).toISOString().slice(0,10)};
}

/** Fixed completed-month history, preserving every non-date filter. */
export function historicalFilters<T extends { from: string; to: string }>(filters: T, now: string, months = 26): T {
  const date = new Date(now + "T00:00:00Z");
  return {
    ...filters,
    from: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0)).toISOString().slice(0, 10),
  };
}

export function historicalTransient<T extends { field: string }>(filters: T[]): T[] {
  return filters.filter(item => !["date", "month", "from", "to"].includes(item.field));
}
