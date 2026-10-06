// JSON document store with two backends, chosen per key.
//
// `.floor/*` holds durable state (KRA evidence, scorecard edits, training progress). It must
// survive a redeploy, so it goes to Supabase whenever credentials are configured.
//
// `.cache/*` holds Google Sheets snapshots. Those are regenerable and multi-megabyte, so they
// always stay on local disk — pushing them through Supabase on every request is slow and buys
// nothing. On serverless the cache root moves to /tmp, which is writable but per-instance:
// a cold start simply refetches from Sheets.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TABLE = "atlas_store";
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
    await writeFile(temporary, JSON.stringify(value));
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
    return data?.value ?? null;
  }
  async function writeCloud(key, value) {
    const { error } = await cloud
      .from(TABLE)
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
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
  };
}
