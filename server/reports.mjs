import { randomUUID } from "node:crypto";
const PREFIX = ".floor/reports/";
const uuid = /^[a-f0-9-]{36}$/i;
export function reportRoutes(app, store, cloud) {
  const route = fn => async (req, res) => {
    try {
      if (!cloud) return res.status(503).json({ error: "Report database storage is not configured. Set Supabase server credentials; this report has not been saved." });
      res.set("Cache-Control", "no-store").json(await fn(req));
    } catch (error) {
      res.status(error.status || 500).json({ error: String(error.message).replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]") });
    }
  };
  app.get("/api/reports", route(async () => {
    const { data, error } = await cloud.from("atlas_store").select("key,updated_at")
      .like("key", `${PREFIX}%`).order("updated_at", { ascending: false }).limit(50);
    if (error) throw new Error(`Report history could not be read: ${error.message}`);
    return Promise.all(data.map(async row => {
      const report = await store.read(row.key);
      return { id: report.id, scope: report.scope, builtAt: report.builtAt,
        savedAt: report.savedAt, aiChapters: Object.values(report.narratives).filter(n => n.generated).length, chapterCount: Object.keys(report.narratives).length };
    }));
  }));
  app.get("/api/reports/:id", route(async req => {
    if (!uuid.test(req.params.id)) throw Object.assign(new Error("Invalid report ID."), { status: 400 });
    const report = await store.read(`${PREFIX}${req.params.id}.json`);
    if (!report) throw Object.assign(new Error("Saved report not found."), { status: 404 });
    return report;
  }));
  app.post("/api/reports", route(async req => {
    const report = req.body;
    if (!report?.scope || typeof report.scope.studio !== "string" || !report.scope.studio.trim()
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(report.scope.month)
      || !Number.isFinite(Date.parse(report.builtAt)) || typeof report.figuresHash !== "string"
      || !report.chapters || typeof report.chapters !== "object" || Array.isArray(report.chapters)
      || !report.narratives || typeof report.narratives !== "object" || Array.isArray(report.narratives))
      throw Object.assign(new Error("A complete report snapshot is required."), { status: 400 });
    for (const narrative of Object.values(report.narratives)) {
      if (!narrative || typeof narrative.summary !== "string" || typeof narrative.generated !== "boolean"
        || !Array.isArray(narrative.cards) || narrative.cards.some(card => !card ||
          ["headline", "meaning", "evidence", "action"].some(field => typeof card[field] !== "string")))
        throw Object.assign(new Error("Report analysis is malformed."), { status: 400 });
    }
    for (const chapter of Object.values(report.chapters)) {
      if (!chapter || !chapter.total || !chapter.prior || !chapter.priorYear || !Array.isArray(chapter.groups)
        || !Array.isArray(chapter.history) || !Number.isFinite(chapter.n))
        throw Object.assign(new Error("Report figures are malformed."), { status: 400 });
    }
    // Immutable versions preserve exactly the figures and prose reviewed/exported.
    const saved = { ...report, id: randomUUID(), savedAt: new Date().toISOString(), schemaVersion: report.schemaVersion || 2 };
    await store.write(`${PREFIX}${saved.id}.json`, saved);
    return saved;
  }));
}
