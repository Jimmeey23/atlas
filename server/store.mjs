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

export async function decodeStoredValue(saved) {
  if (saved && typeof saved === "object" && typeof saved.__gz === "string")
    return JSON.parse((await inflate(Buffer.from(saved.__gz, "base64"))).toString("utf8"));
  return saved ?? null;
}

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
  // Durable keys are meant to survive a redeploy, but serverless has nowhere durable
  // to write: there they fall back to the (ephemeral, but writable) cache root.
  const durableRoot = process.env.VERCEL ? cacheRoot : root;
  const base = key => (key.startsWith(DURABLE) ? durableRoot : cacheRoot);
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
    return decodeStoredValue(data?.value);
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
  // Read-modify-write without lost updates. Within one process, writes to a key queue
  // behind each other; across server instances, a cloud write only lands if the row still
  // carries the updated_at it was read with, otherwise the change is re-applied to the
  // newer value. `change(current)` must be a pure function of the value it is given.
  const queues = new Map();
  const encode = async (value) => {
    const encoded = JSON.stringify(value);
    return encoded.length > COMPRESS_OVER ? { __gz: (await deflate(encoded)).toString("base64") } : value;
  };
  async function updateCloud(key, change) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await cloud.from(TABLE).select("value,updated_at").eq("key", key).maybeSingle();
      if (error) throw new Error(`Store read failed for ${key}: ${error.message}`);
      let current = data ? await decodeStoredValue(data.value) : null;
      if (!data) current = await readLocal(key);
      const next = await change(current);
      const updated_at = new Date().toISOString();
      if (!data) {
        const { error: insertError } = await cloud.from(TABLE).insert({ key, value: await encode(next), updated_at });
        if (!insertError) return next;
        if (insertError.code !== "23505") throw new Error(`Store write failed for ${key}: ${insertError.message}`);
      } else {
        const { data: rows, error: updateError } = await cloud.from(TABLE)
          .update({ value: await encode(next), updated_at }).eq("key", key).eq("updated_at", data.updated_at).select("key");
        if (updateError) throw new Error(`Store write failed for ${key}: ${updateError.message}`);
        if (rows?.length) return next;
      }
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt + Math.random() * 25));
    }
    const conflict = new Error("This document is being changed in another session. Retry.");
    conflict.status = 409;
    throw conflict;
  }
  function update(key, change) {
    const run = (queues.get(key) ?? Promise.resolve()).then(() =>
      durable(key) ? updateCloud(key, change) : readLocal(key).then(change).then((next) => writeLocal(key, next)));
    queues.set(key, run.catch(() => undefined));
    return run;
  }
  return {
    durable: !!cloud,
    backend: cloud ? "supabase documents + local cache" : "filesystem",
    read: key => (durable(key) ? readMigrating(key) : readLocal(key)),
    write: (key, value) => (durable(key) ? writeCloud(key, value) : writeLocal(key, value)),
    update,
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

/** store.update when the store provides it (test doubles may not), else read-then-write. */
export const updateDocument = (store, key, change) =>
  store.update ? store.update(key, change) : Promise.resolve(store.read(key)).then(change).then(async (next) => { await store.write(key, next); return next; });
