const PREFIX = ".floor/sticky-notes/";
const COLORS = ["lemon", "rose", "mint", "sky"];
export function validateNote(body) {
  if (
    !body ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      body.id ?? "",
    )
  )
    throw new Error("Invalid note ID.");
  if (body.reportId != null && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.reportId))
    throw new Error("Invalid report ID.");
  if (!Number.isInteger(body.tab) || body.tab < 0 || body.tab > 15)
    throw new Error("Invalid workspace.");
  if (
    !Number.isFinite(body.x) ||
    body.x < 0 ||
    body.x > 1 ||
    !Number.isFinite(body.y) ||
    body.y < 0 ||
    body.y > 1000000
  )
    throw new Error("Invalid note position.");
  if (typeof body.text !== "string" || body.text.length > 4000)
    throw new Error("Note text must be 4,000 characters or fewer.");
  if (!COLORS.includes(body.color)) throw new Error("Invalid note color.");
  const connections = body.connections ?? [];
  if (!Array.isArray(connections) || connections.length > 20)
    throw new Error("A note supports up to 20 connections.");
  for (const c of connections) {
    if (
      !c ||
      !/^[\da-f-]{36}$/i.test(c.id ?? "") ||
      !["arrow", "line"].includes(c.type) ||
      typeof c.target?.selector !== "string" ||
      c.target.selector.length > 2000 ||
      !Number.isFinite(c.target.x) ||
      c.target.x < 0 ||
      c.target.x > 1 ||
      !Number.isFinite(c.target.y) ||
      c.target.y < 0 ||
      c.target.y > 1 ||
      typeof c.target.label !== "string" ||
      c.target.label.length > 160
    )
      throw new Error("Invalid note connection.");
  }
  if (
    body.title != null &&
    (typeof body.title !== "string" || body.title.length > 120)
  )
    throw new Error("Note title must be 120 characters or fewer.");
  const dimension = (value, fallback, min, max) =>
    value == null
      ? fallback
      : Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
  return {
    id: body.id,
    ...(body.reportId ? {reportId: body.reportId} : {}),
    tab: body.tab,
    view: body.view === "kra" ? "kra" : "performance",
    x: body.x,
    y: body.y,
    text: body.text,
    color: body.color,
    collapsed: !!body.collapsed,
    title: body.title ?? "",
    pinned: !!body.pinned,
    resolved: !!body.resolved,
    width: dimension(body.width, 240, 200, 480),
    height: dimension(body.height, 125, 90, 500),
    fontSize: dimension(body.fontSize, 12, 10, 20),
    priority: ["normal", "important", "urgent"].includes(body.priority)
      ? body.priority
      : "normal",
    connections: connections.map((c) => ({
      id: c.id,
      type: c.type,
      target: {
        selector: c.target.selector,
        x: c.target.x,
        y: c.target.y,
        label: c.target.label,
      },
    })),
    // Who posted it and when; kept as sent so every reader sees the original author.
    author: typeof body.author === "string" ? body.author.trim().slice(0, 60) : "",
    createdAt: typeof body.createdAt === "string" && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : null,
    updatedAt: new Date().toISOString(),
  };
}
export function stickyNoteRoutes(app, store, cloud) {
  app.use("/api/sticky-notes", (_req, res, next) =>
    cloud
      ? next()
      : res.status(503).json({
          error: "Supabase is not configured. Notes cannot be saved yet.",
        }),
  );
  app.get("/api/sticky-notes", async (req, res) => {
    try {
      const { data, error } = await cloud
        .from("atlas_store")
        .select("key")
        .like("key", `${PREFIX}%`);
      if (error) throw error;
      const notes = await Promise.all(
        (data ?? []).map((row) => store.read(row.key)),
      );
      res.json({
        notes: notes.filter((note) => note && !note.deleted && (!req.query.reportId || note.reportId === req.query.reportId)),
        backend: "supabase",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.put("/api/sticky-notes/:id", async (req, res) => {
    let note;
    try {
      note = validateNote({ ...req.body, id: req.params.id });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    try {
      await store.write(`${PREFIX}${note.id}.json`, note);
      res.json({ note, backend: "supabase" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.delete("/api/sticky-notes/:id", async (req, res) => {
    if (!/^[\da-f-]{36}$/i.test(req.params.id))
      return res.status(400).json({ error: "Invalid note ID." });
    try {
      await store.write(`${PREFIX}${req.params.id}.json`, {
        deleted: true,
        updatedAt: new Date().toISOString(),
      });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
