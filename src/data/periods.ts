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
