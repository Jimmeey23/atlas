// JSON document store with two backends.
//
// Local operation keeps the original behaviour: atomic writes into .floor/.cache on disk.
// Serverless deployments (Vercel) have no durable filesystem, so the same documents go to
// Supabase instead. Callers use one interface and never branch on the environment.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TABLE = "atlas_store";

export function createStore({ root, cloud = null }) {
  async function readLocal(key) {
    try {
      return JSON.parse(await readFile(path.join(root, key), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async function writeLocal(key, value) {
    const target = path.join(root, key);
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
    if (local === null) return null;
    await writeCloud(key, local);
    return local;
  }
  return {
    durable: !!cloud,
    backend: cloud ? "supabase" : "filesystem",
    read: key => (cloud ? readMigrating(key) : readLocal(key)),
    write: (key, value) => (cloud ? writeCloud(key, value) : writeLocal(key, value)),
  };
}
