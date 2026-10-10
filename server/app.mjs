import { stickyNoteRoutes } from "./sticky-notes.mjs";
import "dotenv/config";
import express from "express";
import { authenticatedSheet } from "./sheets-auth.mjs";
import { publicSheet, missingColumns, snapshotsToPrune } from "./sheets-public.mjs";
import { readFile, mkdir, copyFile, readdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import v8 from "node:v8";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { kraRoutes } from "./kra.mjs";
import { presentationRoutes } from "./presentation.mjs";
import { reportRoutes } from "./reports.mjs";
import { createStore, jsonChunks } from "./store.mjs";
import { createFreshness } from "./freshness.mjs";
import { intelligenceRoutes } from "./intelligence.mjs";
import { followupRoutes } from "./followups.mjs";
import { fileURLToPath } from "node:url";
import { sendSnapshot } from "./snapshot-response.mjs";
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
  function sendJSON(res, value) {
    res.set({ "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
    for (const chunk of jsonChunks(value)) res.write(chunk);
    res.end();
  }
  async function archiveSnapshot(data) {
    // Serverless /tmp is per-instance and capped at 512MB: an archive there is never seen by
    // the next request's instance, and bookings alone is ~80MB per copy.
    if (process.env.VERCEL) return;
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
  // key → {fetchedAt, revision, hash} of the copy this instance holds.
  const known = new Map();
  const remember = (data) => {
    if (data?.fetchedAt) known.set(data.key, { fetchedAt: data.fetchedAt, revision: data.revision ?? null, hash: data.hash ?? null });
    return data;
  };
  const freshness = createFreshness();
  async function saveMetadata(data) {
    const info = await stat(path.join(cacheRoot, ".cache", `${data.key}.json`));
    await store.write(`.cache/${data.key}.meta.json`, {
      fetchedAt: data.fetchedAt, revision: data.revision, hash: data.hash,
      fileSize: info.size, fileMtime: info.mtimeMs,
    });
  }
  function load(source, force) {
    if (!inflight.has(source.key)) inflight.set(source.key,
      loadSource(source, force).finally(() => inflight.delete(source.key)));
    return inflight.get(source.key);
  }
  async function loadSource(source, force) {
    const start = performance.now();
    const cacheKey = `.cache/${source.key}.json`;
    let cached;
    try {
      cached = remember(await store.read(cacheKey));
    } catch {}
    if (cached && (force || Date.now() - cached.fetchedAt < ttl)) {
      // Inside the TTL the cache is only trustworthy while the workbook has not
      // been edited. One metadata call decides it; the TTL is just the fallback
      // for when no revision can be read.
      const { revision } = await freshness.revision(source.id, force ? { maxAge: 0 } : undefined);
      const edited =
        revision && cached.revision && revision !== cached.revision;
      // A forced refresh exists to pick up an edit. Every browser that notices the same edit
      // sends one, and each refetch of Bookings costs tens of CPU-seconds, so it is skipped
      // when Drive proves this copy is already the current revision, or (unverifiable) when
      // the copy was fetched moments ago.
      const reuse = force
        ? (revision && cached.revision === revision) || (!revision && Date.now() - cached.fetchedAt < 60000)
        : !edited;
      if (reuse) {
        await saveMetadata(cached).catch(() => {});
        return { ...cached, cached: true, revision: revision ?? cached.revision ?? null };
      }
    }
    try {
      // Read before the rows, not after: if the workbook is edited mid-fetch,
      // recording the older revision makes the next probe refetch. Recording
      // the newer one would make it skip and keep partially stale rows.
      const { revision } = await freshness.revision(source.id, { maxAge: 0 });
      let rows, columns, mode, foundTitles, hash;
      try {
        if (process.env.ALLOW_PUBLIC_SHEETS === "false") throw new Error("Public reads disabled.");
        // Tab titles are re-read on a forced refresh so a renamed tab is caught.
        const titles = force ? undefined : metadata.get(source.id);
        ({ rows, columns, mode, foundTitles, hash } = await publicSheet(source, { force, titles }));
        metadata.set(source.id, foundTitles);
      } catch (publicError) {
        ({ rows, columns, mode, foundTitles } = await authenticatedSheet(source, publicError));
      }

      const missing = missingColumns(source, columns);
      // Identifies the content, not the fetch: serverless instances fetch separately, so two
      // copies of an unchanged sheet share a hash even though their fetchedAt differs.
      // The public path hashes the CSV bytes as they stream; stringifying ~300k rows again
      // just to hash them was a large share of each fetch's CPU.
      if (!hash) {
        const digest = createHash("sha1").update(JSON.stringify(columns));
        for (const row of rows) digest.update(JSON.stringify(row));
        hash = digest.digest("hex");
      }
      const result = {
        hash,
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
      await saveMetadata(result).catch(() => {});
      return remember(result);
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
    const sources = config.map((source) => {
      // From the in-memory index, not the cache files: parsing ~200MB of snapshots once a
      // minute just to read timestamps is slow and memory-hungry.
      const cached = known.get(source.key);
      const probe = revisions.get(source.id) || {};
      const current = probe.revision || null;
      return {
        key: source.key,
        fetchedAt: cached?.fetchedAt ?? null,
        revision: cached?.revision ?? null,
        hash: cached?.hash ?? null,
        currentRevision: current,
        // Only a Drive revision proves staleness. Without one the browser judges age from its
        // own copy: a serverless instance that has not cached a sheet says nothing about it,
        // and reporting that as stale made every browser refetch every sheet every minute.
        stale: current ? !!cached && cached.revision !== current : false,
        verified: Boolean(current),
        reason: probe.reason || null,
      };
    });
    // Shared briefly by the CDN: every open browser polls this, and a 30-second-old answer
    // only delays noticing an edit. A forced check adds a unique query to bypass it.
    res.set({ "Cache-Control": "public, max-age=0, must-revalidate", "Vercel-CDN-Cache-Control": "max-age=30" })
      .json({ checkedAt: Date.now(), sources });
  });
  app.get("/api/sheets/:key", async (req, res, next) => {
    try {
    const source = config.find((s) => s.key === req.params.key);
    if (!source) return res.status(404).json({ error: "Unknown source" });
    // A request for one Drive revision. Its answer never changes, so the CDN serves every
    // later request for it and this function runs once per sheet edit, not once per load.
    const rev = typeof req.query.rev === "string" ? req.query.rev : "";
    if (rev) {
      const metaKey = `.cache/${source.key}.meta.json`;
      let meta = await store.read(metaKey).catch(() => null);
      if (meta?.revision !== rev) {
        // Forced, so the loader re-reads Drive and refetches only if its copy is older.
        const data = await load(source, true);
        if (data.status === "error") return res.set("Cache-Control", "no-store").status(502).json(data);
        meta = await store.read(metaKey).catch(() => null);
      }
      if (meta) {
        known.set(source.key, meta);
        // Only a copy that is provably the requested revision may be cached under its URL; a
        // sheet edited again since is still answered, privately, with the newer rows.
        if (await sendSnapshot(req, res, cacheRoot, source, meta, { shared: meta.revision === rev })) return;
      }
    }
    // Metadata is tiny and persists with the snapshot across warm/cold requests.
    // Only an expired/edited sheet or an explicit refresh needs its rows parsed.
    const meta = await store.read(`.cache/${source.key}.meta.json`).catch(() => null);
    if (meta && req.query.refresh !== "true") {
      const snapshot = req.query.snapshot === "true";
      if (snapshot || Date.now() - meta.fetchedAt < ttl) {
        const probe = snapshot ? null : await freshness.revision(source.id);
        if (snapshot || !probe?.revision || !meta.revision || probe.revision === meta.revision) {
          known.set(source.key, meta);
          if (await sendSnapshot(req, res, cacheRoot, source, meta)) return;
        }
      }
    }
    if (req.query.snapshot === "true") {
      try {
        const cached = await store.read(`.cache/${source.key}.json`);
        if (!cached) throw new Error("No saved source snapshot.");
        await archiveSnapshot(cached);
        return sendJSON(res, {
          ...cached,
          cached: true,
          stale: Date.now() - cached.fetchedAt >= ttl,
        });
      } catch {
        return res.status(404).json({ error: "No saved source snapshot." });
      }
    }
    const force = req.query.refresh === "true";
    const data = await load(source, force);
    if (data.status !== "error" && await sendSnapshot(req, res, cacheRoot, source, data)) return;
    sendJSON(res, data);
    } catch (error) { next(error); }
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
    const snapshot = String(req.query.snapshot || "").replace(/[^0-9]/g, "");
    try {
      // The exact version the browser displays, when this instance archived it.
      let data = snapshot ? await store.read(`.cache/snapshots/${source.key}-${snapshot}.json`) : null;
      if (!data) {
        // Otherwise the current copy, but only when it is provably the same content: rows are
        // positional, so a different version would show the wrong records.
        let current = await store.read(`.cache/${source.key}.json`).catch(() => null);
        if (!current) current = await load(source, false);
        const same = !snapshot || String(current?.fetchedAt) === snapshot || (req.query.hash && current?.hash === req.query.hash);
        if (current?.rows?.length && same) data = current;
        else if (current?.rows?.length)
          return res.status(409).json({ error: "The source changed since it was loaded.", fetchedAt: current.fetchedAt });
      }
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
      // The instance's real JS heap ceiling, so serverless memory limits are measured, not guessed.
      heapLimitMB: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576),
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
