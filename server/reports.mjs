import { randomUUID } from "node:crypto";
import { adminConfigured, requireAdmin, unlockAdmin, verifyAdmin } from "./report-admin.mjs";
const PREFIX = ".floor/reports/";
const PINS = ".floor/report-pins.json";
/** Only the latest generated reports are kept, plus every pinned one. */
export const KEEP_RECENT = 5;
const uuid = /^[a-f0-9-]{36}$/i;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function validate(report) {
  if (!report?.scope || typeof report.scope.studio !== "string" || !report.scope.studio.trim()
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(report.scope.month)
    || !Number.isFinite(Date.parse(report.builtAt)) || typeof report.figuresHash !== "string"
    || !report.chapters || typeof report.chapters !== "object" || Array.isArray(report.chapters)
    || !report.narratives || typeof report.narratives !== "object" || Array.isArray(report.narratives))
    throw fail("A complete report snapshot is required.");
  for (const narrative of Object.values(report.narratives)) {
    if (!narrative || typeof narrative.summary !== "string" || typeof narrative.generated !== "boolean"
      || !Array.isArray(narrative.cards) || narrative.cards.some(card => !card ||
        ["headline", "meaning", "evidence", "action"].some(field => typeof card[field] !== "string") || ["monthContext","yearContext","reasoning","recommendation","layout","concentration","offset"].some(field=>card[field]!=null && typeof card[field]!=="string")))
      throw fail("Report analysis is malformed.");
  }
  for (const chapter of Object.values(report.chapters)) {
    if (!chapter || !chapter.total || !chapter.prior || !chapter.priorYear || !Array.isArray(chapter.groups)
      || !Array.isArray(chapter.history) || !Number.isFinite(chapter.n))
      throw fail("Report figures are malformed.");
  }
  validateExtras(report);
}

const plainRecord = value => value == null || (typeof value === "object" && !Array.isArray(value));
function validateExtras(report) {
  if (report.importedChapters != null) {
    if (!Array.isArray(report.importedChapters) || report.importedChapters.length > 35) throw fail("Source chapters are malformed.");
    for (const chapter of report.importedChapters) {
      if (!chapter || ["id", "title", "filename", "sha256"].some(k => typeof chapter[k] !== "string") || !/^[a-z0-9-]+$/.test(chapter.id)) throw fail("Source chapter metadata is malformed.");
      if (chapter.sections != null && (!Array.isArray(chapter.sections) || chapter.sections.some(s => !s || typeof s.id !== "string" || typeof s.title !== "string" || typeof s.html !== "string" || /<(script|style|iframe|object|embed|form)\b|\son\w+\s*=|javascript:/i.test(s.html)))) throw fail("Source chapter evidence is malformed.");
      if(chapter.sections?.some(s=>s.blocks && (!Array.isArray(s.blocks) || s.blocks.some(b=>!b || !['text','chart','table'].includes(b.kind) || typeof b.id!=='string' || typeof b.title!=='string' || b.text!=null && typeof b.text!=='string' || b.rows!=null && !Array.isArray(b.rows)))))throw fail('Report elements are malformed.');
      if (chapter.metrics != null && (!Array.isArray(chapter.metrics) || chapter.metrics.some(m => !m || ["label", "value", "note"].some(k => typeof m[k] !== "string")))) throw fail("Source chapter metrics are malformed.");
    }
  }
  if (!plainRecord(report.replacements) || !plainRecord(report.presenterNotes) || !plainRecord(report.speakerNotes))
    throw fail("Report edits are malformed.");
  for (const [key, spec] of Object.entries(report.replacements ?? {}))
    if (key.length > 200 || !spec || typeof spec.kind !== "string" || typeof spec.title !== "string")
      throw fail("A replaced component is malformed.");
  for (const [key, note] of Object.entries(report.presenterNotes ?? {}))
    if (key.length > 200 || typeof note !== "string" || note.length > 20000) throw fail("Presenter notes are malformed.");
  for (const [key, note] of Object.entries(report.speakerNotes ?? {}))
    if (key.length > 200 || !note || typeof note.opener !== "string" || !Array.isArray(note.points)) throw fail("Speaker notes are malformed.");
}

export function reportRoutes(app, store, cloud, env = process.env) {
  const send = fn => async (req, res) => {
    try { res.set("Cache-Control", "no-store").json(await fn(req)); }
    catch (error) { res.status(error.status || 500).json({ error: String(error.message).replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]") }); }
  };
  const route = fn => send(async req => {
    if (!cloud) throw fail("Report database storage is not configured. Set Supabase server credentials; this report has not been saved.", 503);
    return fn(req);
  });
  const keyOf = id => `${PREFIX}${id}.json`;
  const idOf = key => key.slice(PREFIX.length, -".json".length);
  const pins = async () => { const saved = await store.read(PINS); return new Set(Array.isArray(saved) ? saved.filter(id => uuid.test(id)) : []); };
  async function keys() {
    const { data, error } = await cloud.from("atlas_store").select("key,updated_at")
      .like("key", `${PREFIX}%`).order("updated_at", { ascending: false }).limit(500);
    if (error) throw new Error(`Report history could not be read: ${error.message}`);
    return data.map(row => row.key).filter(key => key.endsWith(".json"));
  }
  /** Retention: the newest KEEP_RECENT unpinned reports survive; pinned reports always do. */
  async function prune(all, pinned) {
    if (typeof store.remove !== "function") return all;
    const unpinned = all.filter(key => !pinned.has(idOf(key)));
    const expired = unpinned.slice(KEEP_RECENT);
    for (const key of expired) { try { await store.remove(key); } catch { /* retried on the next save */ } }
    return all.filter(key => !expired.includes(key));
  }
  async function readReport(id) {
    if (!uuid.test(id)) throw fail("Invalid report ID.");
    const report = await store.read(keyOf(id));
    if (!report) throw fail("Saved report not found.", 404);
    return report;
  }

  // Admin routes come first so "admin" is never read as a report id.
  app.get("/api/reports/admin", send(async req => ({ configured: adminConfigured(env), unlocked: verifyAdmin(req.get("x-atlas-admin"), env) })));
  app.post("/api/reports/admin", send(async req => unlockAdmin(req.body?.passcode, env)));

  app.get("/api/reports", route(async () => {
    const pinned = await pins();
    const kept = await prune(await keys(), pinned);
    const listed = await Promise.all(kept.map(async key => {
      const report = await store.read(key);
      if (!report) return null;
      return { id: report.id, scope: report.scope, builtAt: report.builtAt, savedAt: report.savedAt, editedAt: report.editedAt,
        title: report.customization?.title, pinned: pinned.has(report.id), imported: !!report.importedChapters?.length,
        aiChapters: report.importedChapters?.length ? 0 : Object.values(report.narratives).filter(n => n.generated).length, chapterCount: report.importedChapters?.length || Object.keys(report.narratives).length };
    }));
    return listed.filter(Boolean);
  }));
  app.get("/api/reports/:id", route(async req => {
    const report = await readReport(req.params.id);
    return { ...report, pinned: (await pins()).has(report.id) };
  }));
  app.get('/api/reports/:id/records/:source',route(async req=>{
    const report=await readReport(req.params.id),source=req.params.source,month=String(req.query.month || report.scope.month);
    if(!/^[a-z0-9-]+$/.test(source) || !/^\d{4}-\d{2}$/.test(month))throw fail('Invalid evidence selection.');
    if(month===report.scope.month && report.sourceRecords?.[source])return report.sourceRecords[source];
    const key=report.recordSnapshots?.[source]?.[month];
    if(!key || !key.startsWith(`.floor/report-evidence/${report.id}/`))throw fail('No frozen evidence exists for this period.',404);
    const snapshot=await store.read(key);if(!snapshot)throw fail('Frozen evidence snapshot was not found.',404);return snapshot;
  }));
  app.post("/api/reports", route(async req => {
    const report = req.body;
    validate(report);
    // Each generation is its own version; admin edits later update it in place.
    const { pinned: _pinned, ...body } = report;
    const saved = { ...body, id: randomUUID(), savedAt: new Date().toISOString(), schemaVersion: report.schemaVersion || 2 };
    await store.write(keyOf(saved.id), saved);
    // Retention never fails a save; the next save or listing retries it.
    try { await prune(await keys(), await pins()); } catch { /* retried later */ }
    return saved;
  }));
  /** Admin edit: prose, layout choices and replaced components. Recorded figures stay frozen. */
  app.put("/api/reports/:id", route(async req => {
    requireAdmin(req, env);
    const current = await readReport(req.params.id);
    const body = req.body ?? {};
    const next = { ...current, narratives: body.narratives ?? current.narratives, customization: body.customization ?? current.customization,
      replacements: body.replacements ?? current.replacements, presenterNotes: body.presenterNotes ?? current.presenterNotes,
      speakerNotes: body.speakerNotes ?? current.speakerNotes, importedChapters: body.importedChapters ?? current.importedChapters, editedAt: new Date().toISOString() };
    validate(next);
    await store.write(keyOf(current.id), next);
    return { ...next, pinned: (await pins()).has(current.id) };
  }));
  /** Presenter notes and talk tracks belong to whoever presents; no admin unlock required. */
  app.patch("/api/reports/:id/notes", route(async req => {
    const current = await readReport(req.params.id);
    // A null value removes that page's entry.
    const merge = (saved, patch) => Object.fromEntries(Object.entries({ ...(saved ?? {}), ...(plainRecord(patch) ? patch ?? {} : {}) }).filter(([, v]) => v != null));
    const next = { ...current, presenterNotes: merge(current.presenterNotes, req.body?.presenterNotes), speakerNotes: merge(current.speakerNotes, req.body?.speakerNotes) };
    validateExtras(next);
    await store.write(keyOf(current.id), next);
    return { presenterNotes: next.presenterNotes, speakerNotes: next.speakerNotes };
  }));
  app.post("/api/reports/:id/pin", route(async req => {
    const report = await readReport(req.params.id);
    const pinned = await pins();
    if (req.body?.pinned === false) pinned.delete(report.id); else pinned.add(report.id);
    await store.write(PINS, [...pinned]);
    return { id: report.id, pinned: pinned.has(report.id) };
  }));
}
