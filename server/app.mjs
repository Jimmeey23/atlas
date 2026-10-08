import { stickyNoteRoutes } from "./sticky-notes.mjs";
import "dotenv/config";
import express from "express";
import { authenticatedSheet } from "./sheets-auth.mjs";
import { publicSheet, missingColumns, snapshotsToPrune } from "./sheets-public.mjs";
import { readFile, mkdir, copyFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { kraRoutes } from "./kra.mjs";
import { presentationRoutes } from "./presentation.mjs";
import { reportRoutes } from "./reports.mjs";
import { createStore } from "./store.mjs";
import { createFreshness } from "./freshness.mjs";
import { intelligenceRoutes } from "./intelligence.mjs";
import { followupRoutes } from "./followups.mjs";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  await readFile(path.join(root, "server/sheets.json"), "utf8"),
);
export async function createApp({ serveStatic = false } = {}) {
  const cloud =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false }, realtime: { transport: WebSocket } },
        )
      : null;
  // Serverless has no writable project directory; /tmp is the only option for the sheet cache.
  const cacheRoot = process.env.VERCEL ? "/tmp/atlas" : root;
  const store = createStore({ root, cloud, cacheRoot });
  const app = express();
  app.use("/api/reports", express.json({ limit: "8mb" }));
  app.use(express.json({ limit: "96kb" }));
  reportRoutes(app, store, cloud);
  presentationRoutes(app, store);
  stickyNoteRoutes(app, store, cloud);
  const ttl = 15 * 60 * 1000;
  await mkdir(path.join(cacheRoot, ".cache"), { recursive: true });
  if (!process.env.VERCEL) {
    await mkdir(path.join(root, ".floor"), { recursive: true });
    try {
      await copyFile(
        path.join(root, ".cache", "retention-followups.json"),
        path.join(root, ".floor", "retention-followups.json"),
        1,
      );
    } catch (error) {
      if (!["ENOENT", "EEXIST"].includes(error.code)) throw error;
    }
  }
  followupRoutes(app, path.join(root, ".floor", "retention-followups.json"), cloud);
  intelligenceRoutes(app, root, config, load, { store });
  kraRoutes(app, root, config, load, store);
  const inflight = new Map();
  async function archiveSnapshot(data) {
    const key = `.cache/snapshots/${data.key}-${data.fetchedAt}.json`;
    if (await store.read(key)) return;
    await store.write(key, data);
    // Every fetch archives a full copy (bookings alone is ~80MB), so unbounded archives fill
    // the disk. Drill-downs only need the versions a browser can still be showing.
    const dir = path.join(cacheRoot, ".cache", "snapshots");
    try {
      for (const file of snapshotsToPrune(await readdir(dir), data.key))
        await unlink(path.join(dir, file)).catch(() => {});
    } catch {}
  }
  const metadata = new Map();
  const freshness = createFreshness();
  async function load(source, force) {
    const start = performance.now();
    const cacheKey = `.cache/${source.key}.json`;
    let cached;
    try {
      cached = await store.read(cacheKey);
    } catch {}
    if (cached && !force && Date.now() - cached.fetchedAt < ttl) {
      // Inside the TTL the cache is only trustworthy while the workbook has not
      // been edited. One metadata call decides it; the TTL is just the fallback
      // for when no revision can be read.
      const { revision } = await freshness.revision(source.id);
      const edited =
        revision && cached.revision && revision !== cached.revision;
      if (!edited) return { ...cached, cached: true, revision: revision ?? cached.revision ?? null };
    }
    try {
      // Read before the rows, not after: if the workbook is edited mid-fetch,
      // recording the older revision makes the next probe refetch. Recording
      // the newer one would make it skip and keep partially stale rows.
      const { revision } = await freshness.revision(source.id, { maxAge: 0 });
      let rows, columns, mode, foundTitles;
      try {
        if (process.env.ALLOW_PUBLIC_SHEETS === "false") throw new Error("Public reads disabled.");
        // Tab titles are re-read on a forced refresh so a renamed tab is caught.
        const titles = force ? undefined : metadata.get(source.id);
        ({ rows, columns, mode, foundTitles } = await publicSheet(source, { force, titles }));
        metadata.set(source.id, foundTitles);
      } catch (publicError) {
        ({ rows, columns, mode, foundTitles } = await authenticatedSheet(source, publicError));
      }

      const missing = missingColumns(source, columns);
      const result = {
        key: source.key,
        title: source.title,
        id: source.id,
        columns,
        rows,
        revision: revision ?? null,
        fetchedAt: Date.now(),
        loadMs: Math.round(performance.now() - start),
        mode,
        foundTitles,
        missing,
        status: missing.length ? "warning" : "ok",
      };
      await archiveSnapshot(result);
      await store.write(cacheKey, result);
      return result;
    } catch (error) {
      return {
        key: source.key,
        title: source.title,
        id: source.id,
        columns: source.columns,
        rows: [],
        status: "error",
        error: error.message,
        fetchedAt: null,
        loadMs: Math.round(performance.now() - start),
        staleAvailable: !!cached,
      };
    }
  }
  // Registered before /api/sheets/:key, which would otherwise capture "freshness" as a
  // source key and answer 404, silently disabling every client freshness check.
  // One small metadata call per workbook answers "is anything on screen out of
  // date?" for every source at once. The client polls this, not the sheets.
  app.get("/api/sheets/freshness", async (_, res) => {
    const revisions = await freshness.revisions(config);
    const sources = await Promise.all(
      config.map(async (source) => {
        let cached;
        try {
          cached = await store.read(`.cache/${source.key}.json`);
        } catch {}
        const probe = revisions.get(source.id) || {};
        const current = probe.revision || null;
        return {
          key: source.key,
          fetchedAt: cached?.fetchedAt ?? null,
          revision: cached?.revision ?? null,
          currentRevision: current,
          // Unknown revisions fall back to the age rule rather than claiming
          // freshness that has not been verified.
          stale: current
            ? !cached || cached.revision !== current
            : !cached || Date.now() - cached.fetchedAt >= ttl,
          verified: Boolean(current),
          reason: probe.reason || null,
        };
      }),
    );
    res.set("Cache-Control", "no-store").json({ checkedAt: Date.now(), sources });
  });
  app.get("/api/sheets/:key", async (req, res) => {
    const source = config.find((s) => s.key === req.params.key);
    if (!source) return res.status(404).json({ error: "Unknown source" });
    if (req.query.snapshot === "true") {
      try {
        const cached = await store.read(`.cache/${source.key}.json`);
        if (!cached) throw new Error("No saved source snapshot.");
        await archiveSnapshot(cached);
        return res.set("Cache-Control", "no-store").json({
          ...cached,
          cached: true,
          stale: Date.now() - cached.fetchedAt >= ttl,
        });
      } catch {
        return res.status(404).json({ error: "No saved source snapshot." });
      }
    }
    const force = req.query.refresh === "true";
    if (!inflight.has(source.key))
      inflight.set(
        source.key,
        load(source, force).finally(() => inflight.delete(source.key)),
      );
    res.set("Cache-Control", "no-store").json(await inflight.get(source.key));
  });
  app.get("/api/field-health", async (_, res) => {
    const result = [];
    for (const source of config) {
      try {
        const data = await store.read(`.cache/${source.key}.json`);
        if (!data) continue;
        for (const [index, field] of data.columns.entries()) {
          if (!field) continue;
          const values = data.rows
            .map((r) => r[index])
            .filter((v) => v != null && String(v).trim() !== "" && v !== "-");
          const distinct = new Set(values.map((v) => String(v).trim()));
          const nums = values
            .map((v) => Number(String(v).replace(/[₹,%\s]/g, "")))
            .filter(Number.isFinite);
          result.push({
            source: source.title,
            field,
            rows: data.rows.length,
            missing: data.rows.length - values.length,
            nullPercent: data.rows.length
              ? (data.rows.length - values.length) / data.rows.length
              : null,
            distinct: distinct.size,
            min: nums.length
              ? nums.reduce((a, b) => Math.min(a, b), Infinity)
              : null,
            max: nums.length
              ? nums.reduce((a, b) => Math.max(a, b), -Infinity)
              : null,
            fetchedAt: data.fetchedAt,
          });
        }
      } catch {}
    }
    res.set("Cache-Control", "no-store").json(result);
  });
  app.get("/api/source-rows/:key", async (req, res) => {
    const source = config.find((s) => s.key === req.params.key);
    if (!source) return res.status(404).json({ error: "Unknown source" });
    const ids = String(req.query.rows || "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 2)
      .slice(0, 500);
    try {
      const data = await store.read(
        req.query.snapshot
          ? `.cache/snapshots/${source.key}-${String(req.query.snapshot).replace(/[^0-9]/g, "")}.json`
          : `.cache/${source.key}.json`,
      );
      if (!data) throw new Error("No saved source snapshot.");
      res
        .set("Cache-Control", "no-store")
        .json(
          ids.map((i) =>
            Object.fromEntries(
              data.columns.map((c, j) => [c, data.rows[i - 2]?.[j] ?? null]),
            ),
          ),
        );
    } catch (e) {
      res.status(503).json({ error: e.message });
    }
  });
  app.get("/api/health", (_, res) =>
    res.json({
      status: "ok",
      sources: config.length,
      ttlMinutes: 15,
      store: store.backend,
    }),
  );
  app.use("/api", (_req,res)=>res.status(404).json({error:"Unknown API endpoint. Refresh the app after updating the gateway."}));
    if (serveStatic) {
      app.use(express.static(path.join(root, "dist")));
      app.get("*", (_, res) => res.sendFile(path.join(root, "dist/index.html")));
    }

  return app;
}
