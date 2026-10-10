// JSON document store with two backends, chosen per key.
//
// `.floor/*` holds durable state (KRA evidence, scorecard edits, training progress). It must
// survive a redeploy, so it goes to Supabase whenever credentials are configured.
//
// `.cache/*` holds Google Sheets snapshots. Those are regenerable and multi-megabyte, so they
// always stay on local disk — pushing them through Supabase on every request is slow and buys
// nothing. On serverless the cache root moves to /tmp, which is writable but per-instance:
// a cold start simply refetches from Sheets.
import { readFile, rename, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const deflate = promisify(gzip);
const inflate = promisify(gunzip);
// Postgres rejects a multi-megabyte jsonb write with a statement timeout, and the computed KRA
// payload is ~14MB. Anything over this threshold is stored gzipped instead (~1.2MB) and
// transparently expanded on read, so callers never see the difference.
const COMPRESS_OVER = 512 * 1024;

const TABLE = "atlas_store";

/**
 * Serialises a sheet snapshot in pieces. JSON.stringify of Bookings builds one ~170MB string
 * on top of the parsed rows, which is enough to push a 2GB serverless instance out of memory.
 */
export function* jsonChunks(value) {
  if (!Array.isArray(value?.rows)) {
    yield JSON.stringify(value);
    return;
  }
  const { rows, ...head } = value;
  const prefix = JSON.stringify(head);
  yield prefix === "{}" ? '{"rows":[' : prefix.slice(0, -1) + ',"rows":[';
  for (let i = 0; i < rows.length; i += 2000)
    yield (i ? "," : "") + rows.slice(i, i + 2000).map((row) => JSON.stringify(row)).join(",");
  yield "]}";
}
const DURABLE = ".floor/";

export function createStore({ root, cloud = null, cacheRoot = root }) {
  const base = key => (key.startsWith(DURABLE) ? root : cacheRoot);
  async function readLocal(key) {
    try {
      return JSON.parse(await readFile(path.join(base(key), key), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async function writeLocal(key, value) {
    const target = path.join(base(key), key);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    const file = await open(temporary, "w");
    try {
      for (const chunk of jsonChunks(value)) await file.write(chunk);
    } finally {
      await file.close();
    }
    await rename(temporary, target);
    return value;
  }
  async function readCloud(key) {
    const { data, error } = await cloud
      .from(TABLE)
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(`Store read failed for ${key}: ${error.message}`);
    const saved = data?.value ?? null;
    if (saved && typeof saved === "object" && typeof saved.__gz === "string")
      return JSON.parse((await inflate(Buffer.from(saved.__gz, "base64"))).toString("utf8"));
    return saved;
  }
  async function writeCloud(key, value) {
    const encoded = JSON.stringify(value);
    const payload =
      encoded.length > COMPRESS_OVER
        ? { __gz: (await deflate(encoded)).toString("base64") }
        : value;
    const { error } = await cloud
      .from(TABLE)
      .upsert({ key, value: payload, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(`Store write failed for ${key}: ${error.message}`);
    return value;
  }
  // Switching a local install to the cloud backend must not strand documents already on disk:
  // a cloud miss falls back to the local copy and promotes it on first read.
  async function readMigrating(key) {
    const saved = await readCloud(key);
    if (saved !== null) return saved;
    const local = await readLocal(key);
    if (local !== null) await writeCloud(key, local);
    return local;
  }
  const durable = key => !!cloud && key.startsWith(DURABLE);
  return {
    durable: !!cloud,
    backend: cloud ? "supabase documents + local cache" : "filesystem",
    read: key => (durable(key) ? readMigrating(key) : readLocal(key)),
    write: (key, value) => (durable(key) ? writeCloud(key, value) : writeLocal(key, value)),
    /** Deletes the document everywhere it may live: the cloud row and any local copy. */
    async remove(key) {
      if (durable(key)) {
        const { error } = await cloud.from(TABLE).delete().eq("key", key);
        if (error) throw new Error(`Store delete failed for ${key}: ${error.message}`);
      }
      await rm(path.join(base(key), key), { force: true });
    },
  };
}
