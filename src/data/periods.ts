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

export function comparisonDates(from: string, to: string, mode: string) {
  if (mode === "none" || !from || !to) return { from, to };
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  if (mode === "year") {
    const shift = (date: Date) => new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), Math.min(date.getUTCDate(), new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth() + 1, 0)).getUTCDate())));
    return {from: shift(start).toISOString().slice(0,10), to: shift(end).toISOString().slice(0,10)};
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
