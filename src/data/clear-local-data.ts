// Studio data copied into this browser (source snapshots in IndexedDB, the DuckDB file in
// OPFS, private filter scopes) must not outlive the session on a shared front-desk machine.
// Sign-out marks a purge and reloads; the purge runs at the next boot, before the data
// engine starts, because an open DuckDB worker holds its OPFS file locked.
const PURGE_FLAG = "atlas-purge-local-data";
const PRIVATE_PREFIXES = ["atlas-private-scope-"];

export function requestLocalDataPurge() {
  try { localStorage.setItem(PURGE_FLAG, "1"); } catch { /* storage blocked: nothing persisted either */ }
}

async function purge() {
  try { sessionStorage.clear(); } catch { /* unavailable */ }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && PRIVATE_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch { /* unavailable */ }
  const names = new Set(["floor-sources"]);
  try { for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) names.add(db.name); } catch { /* unsupported */ }
  await Promise.all([...names].map((name) => new Promise<void>((resolve) => {
    try { const request = indexedDB.deleteDatabase(name); request.onsuccess = request.onerror = request.onblocked = () => resolve(); }
    catch { resolve(); }
  })));
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (root) for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys())
      if (name.startsWith("atlas-studio-")) await root.removeEntry(name).catch(() => undefined);
  } catch { /* OPFS unavailable */ }
  try { for (const key of await caches.keys()) await caches.delete(key); } catch { /* no Cache Storage */ }
}

/** Runs a pending purge. Call once at boot, before anything opens the data engine. */
export async function runPendingLocalDataPurge() {
  let pending = false;
  try { pending = localStorage.getItem(PURGE_FLAG) === "1"; } catch { return; }
  if (!pending) return;
  await purge();
  try { localStorage.removeItem(PURGE_FLAG); } catch { /* unavailable */ }
}
