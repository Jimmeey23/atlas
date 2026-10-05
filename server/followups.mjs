import { readFile, writeFile, rename } from "node:fs/promises";
export function followupRoutes(app, file, cloud = null) {
  let queue = Promise.resolve();
  const read = async () => {
    if (cloud) {
      const { data, error } = await cloud
        .from("p57_documents")
        .select("body")
        .eq("kind", "followup");
      if (error) throw error;
      return Object.fromEntries(
        data.map((d) => [d.body.memberId, d.body.record]),
      );
    }
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return {};
      throw e;
    }
  };
  app.get("/api/retention-followups", async (_, res) => {
    try {
      await queue;
      res.set("Cache-Control", "no-store").json(await read());
    } catch {
      res.status(500).json({ error: "Follow-up records could not be read." });
    }
  });
  app.put("/api/retention-followups/:id", async (req, res) => {
    const id = req.params.id,
      b = req.body || {};
    const statuses = [
      "Not started",
      "Contact planned",
      "Contacted",
      "Awaiting member",
      "Closed",
    ];
    if (
      !/^[\w:.-]{1,200}$/.test(id) ||
      !statuses.includes(b.status) ||
      typeof b.owner !== "string" ||
      b.owner.length > 120 ||
      ![
        "",
        "Phone",
        "Email",
        "WhatsApp",
        "In person",
        "No follow-up requested",
      ].includes(b.preference) ||
      (b.nextDate &&
        (typeof b.nextDate !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(b.nextDate) ||
          !Number.isFinite(Date.parse(b.nextDate + "T00:00:00Z")) ||
          new Date(b.nextDate + "T00:00:00Z").toISOString().slice(0, 10) !==
            b.nextDate)) ||
      (b.closedReasons !== undefined &&
        (!Array.isArray(b.closedReasons) ||
          b.closedReasons.length > 20 ||
          b.closedReasons.some(
            (k) => typeof k !== "string" || k.length > 500,
          ))) ||
      !["note", "memberVoice", "observation"].every(
        (k) => typeof b[k] === "string" && b[k].length <= 4000,
      )
    )
      return res.status(400).json({ error: "Invalid follow-up fields." });
    if (b.status === "Closed" && !b.note.trim())
      return res
        .status(400)
        .json({ error: "Record an outcome before closing." });
    const work = queue.then(async () => {
      const records = await read(),
        old = records[id];
      const record = {
        owner: b.owner.trim(),
        status: b.status,
        nextDate: b.nextDate || "",
        preference: b.preference,
        note: b.note.trim(),
        memberVoice: b.memberVoice.trim(),
        observation: b.observation.trim(),
        closedReasons: b.status === "Closed" ? b.closedReasons || [] : [],
        updatedAt: new Date().toISOString(),
      };
      records[id] = {
        ...record,
        history: [...(old?.history || []), record].slice(-100),
      };
      if (cloud) {
        const { data, error } = await cloud
          .from("p57_documents")
          .select("id")
          .eq("kind", "followup")
          .eq("title", id)
          .limit(1);
        if (error) throw error;
        const saved = await cloud
          .from("p57_documents")
          .upsert({
            ...(data[0] ? { id: data[0].id } : {}),
            kind: "followup",
            title: id,
            page: 6,
            body: { memberId: id, record: records[id] },
            updated_at: new Date().toISOString(),
          });
        if (saved.error) throw saved.error;
      } else {
        await writeFile(file + ".tmp", JSON.stringify(records));
        await rename(file + ".tmp", file);
      }
      return records[id];
    });
    queue = work.catch(() => undefined);
    try {
      res.json(await work);
    } catch {
      res.status(500).json({ error: "Follow-up could not be saved." });
    }
  });
}
