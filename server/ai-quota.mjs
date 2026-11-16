// Per-user limits on the routes that spend money on the AI provider. Every signed-in user
// shares one API key, so without this one account (or one stuck browser tab) could run up
// an unbounded bill.
//
// Two buckets, because a report run makes many short calls (one per chapter) while chat is
// one call per question. Limits are configurable and 0 disables a limit:
//   ATLAS_AI_CHAT_PER_MINUTE (12)  ATLAS_AI_CHAT_PER_DAY (300)
//   ATLAS_AI_REPORT_PER_MINUTE (60) ATLAS_AI_REPORT_PER_DAY (1500)
// Counters live in memory per server instance. On serverless each warm instance counts
// separately, so the effective ceiling is the limit times the number of live instances;
// pair this with a spend limit on the provider account.

export const AI_ROUTES = {
  chat: ["/api/intelligence/chat", "/api/intelligence/ask", "/api/intelligence/build"],
  report: ["/api/reports/narrative", "/api/reports/verify", "/api/reports/edit-plan", "/api/reports/component", "/api/reports/speaker-notes"],
};
const DEFAULTS = { chat: { minute: 12, day: 300 }, report: { minute: 60, day: 1500 } };
const kolkataDay = (now) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(now));

export function aiQuota({ env = process.env, now = () => Date.now() } = {}) {
  const limit = (bucket, unit) => {
    const raw = env[`ATLAS_AI_${bucket.toUpperCase()}_PER_${unit.toUpperCase()}`];
    const value = raw == null || raw === "" ? DEFAULTS[bucket][unit] : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULTS[bucket][unit];
  };
  const minutes = new Map(); // key -> timestamps within the last minute
  const days = new Map(); // key -> { day, count }
  return (bucket) => (req, res, next) => {
    const who = req.atlasUser?.id || req.atlasUser?.email || req.ip || "anonymous";
    const key = `${bucket}:${who}`;
    const t = now();
    const perMinute = limit(bucket, "minute"), perDay = limit(bucket, "day");
    const recent = (minutes.get(key) || []).filter((at) => t - at < 60000);
    const today = kolkataDay(t);
    const daily = days.get(key)?.day === today ? days.get(key) : { day: today, count: 0 };
    if (perMinute && recent.length >= perMinute) {
      const retry = Math.max(1, Math.ceil((60000 - (t - recent[0])) / 1000));
      res.set("Retry-After", String(retry));
      return res.status(429).json({ error: `Too many AI requests. Try again in ${retry} seconds.` });
    }
    if (perDay && daily.count >= perDay)
      return res.status(429).json({ error: "Today's AI allowance for this account is used up. It resets at midnight India time." });
    recent.push(t); minutes.set(key, recent);
    daily.count += 1; days.set(key, daily);
    if (minutes.size > 5000) for (const [k, v] of minutes) if (!v.some((at) => t - at < 60000)) minutes.delete(k);
    next();
  };
}
