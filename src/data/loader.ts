import { init, ingest, restore, query, health } from "./duckdb";
import { sheets } from "./sheets.config";
import { blueprints } from "./blueprints";
import views from "./views.sql?raw";
import { clearAnalyses } from "./analytics";
export type SourceState = {
  state: "idle" | "loading" | "ready" | "refreshing" | "error";
  error?: string;
};
export const sourceStates: Record<string, SourceState> = Object.fromEntries(
  sheets.map((s) => [s.key, { state: "idle" }]),
);
let engine: Promise<void> | undefined;
let liveReads = 0;
const liveWaiters: (() => void)[] = [];
async function liveRead<T>(work: () => Promise<T>): Promise<T> {
  if (liveReads >= 3)
    await new Promise<void>((resolve) => liveWaiters.push(resolve));
  else liveReads++;
  try {
    return await work();
  } finally {
    const next = liveWaiters.shift();
    if (next) next();
    else liveReads--;
  }
}
function firstUsable(key: string, job: Promise<void>) {
  return new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = () => {
      unsubscribe();
      resolve();
    };
    const check = () => {
      if (usable(key) || sourceStates[key].state === "error") finish();
    };
    unsubscribe = subscribeSources(check);
    job.then(finish, (e) => {
      unsubscribe();
      reject(e);
    });
    check();
  });
}
const jobs = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
export const subscribeSources = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const publish = () => {
  clearAnalyses();
  listeners.forEach((fn) => fn());
};
export const dependencies = (tab: number) =>
  tab === 11
    ? sheets.map((s) => s.key)
    : [
        ...new Set([
          blueprints[tab].source,
          ...(tab === 0 ? ["new", "sales"] : tab === 3 ? ["payroll", "new"] : tab === 5 ? ["sales"] : tab === 8 ? ["new"] : tab === 6 ? ["new", "checkins"] : tab === 15 ? ["sales", "new", "lapsed", "leads", "payroll", "recurring", "bookings"] : []),
        ]),
      ];
export const usable = (key: string) =>
  !!health[key]?.fetchedAt && health[key].status !== "error";
export async function ensureWorkspace(tab: number, force = false) {
  engine ||= init()
    .then(() => query(views))
    .then(() => undefined)
    .catch((e) => {
      engine = undefined;
      throw e;
    });
  await engine;
  // Independent reads run concurrently; DuckDB table replacements are serialised.
  const pending = [...dependencies(tab)];
  await Promise.all(
    Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (pending.length) {
        const key = pending.shift()!,
          job = ensureSource(key, force);
        if (force) await job;
        else await firstUsable(key, job);
      }
    }),
  );
}
export async function ensureSource(key: string, force = false): Promise<void> {
  engine ||= init()
    .then(() => query(views))
    .then(() => undefined)
    .catch((e) => {
      engine = undefined;
      throw e;
    });
  await engine;
  if (jobs.has(key)) return jobs.get(key)!;
  if (usable(key) && !force && Date.now() - health[key].fetchedAt! < 900000)
    return;
  const job = (async () => {
    sourceStates[key] = { state: usable(key) ? "refreshing" : "loading" };
    publish();
    try {
      if (!force && !usable(key) && (await restore(key))) publish();
      if (!force && !usable(key)) {
        const snapshot = await fetch(`/api/sheets/${key}?snapshot=true`);
        if (snapshot.ok) {
          await ingest(await snapshot.json());
          publish();
        }
      }
      const stale =
        !health[key]?.fetchedAt ||
        Date.now() - health[key].fetchedAt! >= 15 * 60 * 1000;
      if (!force && !stale && usable(key)) {
        sourceStates[key] = { state: "ready" };
        publish();
        return;
      }
      sourceStates[key] = { state: usable(key) ? "refreshing" : "loading" };
      publish();
      const data = await liveRead(async () => {
        const response = await fetch(
          `/api/sheets/${key}${force ? "?refresh=true" : ""}`,
        );
        if (!response.ok)
          throw new Error(`Source request failed (${response.status}).`);
        return response.json();
      });
      if (data.status === "error")
        throw new Error(data.error || "Source unavailable.");
      // A fresh snapshot may have been restored while other workspaces opened.
      if (data.fetchedAt !== health[key]?.fetchedAt) await ingest(data);
      sourceStates[key] = { state: "ready" };
    } catch (e) {
      sourceStates[key] = { state: "error", error: String(e) };
    } finally {
      publish();
    }
  })();
  jobs.set(key, job);
  try {
    await job;
  } finally {
    jobs.delete(key);
  }
}
