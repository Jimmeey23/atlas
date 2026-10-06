import "dotenv/config";
import express from "express";
import { authenticatedSheet } from "./sheets-auth.mjs";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { kraRoutes } from "./kra.mjs";
import { createStore } from "./store.mjs";
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
  app.use(express.json({ limit: "96kb" }));
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
  }
  const metadata = new Map();
  async function load(source, force) {
    const start = performance.now();
    const cacheKey = `.cache/${source.key}.json`;
    let cached;
    try {
      cached = await store.read(cacheKey);
    } catch {}
    if (cached && !force && Date.now() - cached.fetchedAt < ttl)
      return { ...cached, cached: true };
    try {
      let rows,
        columns,
        mode,
        foundTitles = [];
      try {
        if (process.env.ALLOW_PUBLIC_SHEETS === "false") throw new Error("Public reads disabled.");
        // GViz is an explicitly documented public-read alternative. Confirm title from workbook metadata first.
        let meta = metadata.get(source.id);
        if (!meta || force) {
          const response = await fetch(
            `https://docs.google.com/spreadsheets/d/${source.id}/edit`,
            { signal: AbortSignal.timeout(30000) },
          );
          if (!response.ok)
            throw new Error(`Workbook metadata HTTP ${response.status}`);
          const html = await response.text();
          const titles = [...html.matchAll(/"name":"([^"\n]+)","id":\d+/g)].map(
            (m) => m[1],
          );
          const visible = [
            ...html.matchAll(/docs-sheet-tab-name[^>]*>([^<]+)</g),
          ].map((m) => m[1]);
          meta = { titles: [...new Set([...titles, ...visible])], html };
          metadata.set(source.id, meta);
        }
        foundTitles = meta.titles;
        if (
          foundTitles.length &&
          !foundTitles.some((t) => t.toLowerCase() === source.title.toLowerCase())
        )
          throw new Error(
            `Tab '${source.title}' missing. Found: ${foundTitles.join(", ")}`,
          );
        const res = await fetch(
          // gviz silently serves the DEFAULT tab when a sheet name does not match, so a renamed
          // or missing tab reads as valid data from the wrong place. A configured gid addresses
          // the tab exactly and removes that failure mode.
          // gviz silently serves the DEFAULT tab when a sheet name does not match, so a renamed
          // or missing tab reads as valid data from the wrong place. A configured gid addresses
          // the tab exactly. A forced refresh also busts Google's response cache, which has been
          // observed returning a stale, partially-filtered payload for the same URL.
          `https://docs.google.com/spreadsheets/d/${source.id}/gviz/tq?tqx=out:json&headers=1&${source.gid ? `gid=${encodeURIComponent(source.gid)}` : `sheet=${encodeURIComponent(source.title)}`}&range=A:ZZ${force ? `&_=${Date.now()}` : ""}`,
          
          { cache: "no-store", signal: AbortSignal.timeout(120000) },
        );
        if (!res.ok) throw new Error(`Public sheet HTTP ${res.status}`);
        const text = await res.text();
        const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
        if (!match)
          throw new Error(
            "Workbook is not publicly readable. Configure the service account.",
          );
        const data = JSON.parse(match[1]);
        if (data.status !== "ok") throw new Error(JSON.stringify(data.errors));
        columns = data.table.cols.map((c) => c.label.trim());
        // Reject a wrong/default tab via its complete header fingerprint.
        const aliases = {
          sales: ["Paid In Money", "Credits"],
          lapsed: ["Total Sessions", "Completed Sessions"],
          checkins: ["Month Year"],
        };
        const missing = source.columns.filter(
          (c) => !columns.includes(c) && !(aliases[source.key] || []).includes(c),
        );
        if (missing.length)
          throw new Error(
            `Schema mismatch for '${source.title}': ${missing.join(", ")}. Found columns: ${columns.join(", ")}`,
          );
        rows = data.table.rows.map((r) =>
          r.c.map((c) => (c == null ? null : (c.f ?? c.v))),
        );
        mode = "Public Google Sheets (title + schema verified)";
      } catch (publicError) {
        const authenticated = await authenticatedSheet(source, publicError);
        ({ rows, columns, mode, foundTitles } = authenticated);
      }

      const missing = source.columns.filter((c) => !columns.includes(c));
      const result = {
        key: source.key,
        title: source.title,
        id: source.id,
        columns,
        rows,
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
    if (serveStatic) {
      app.use(express.static(path.join(root, "dist")));
      app.get("*", (_, res) => res.sendFile(path.join(root, "dist/index.html")));
    }

  return app;
}
