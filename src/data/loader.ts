import { init, ingest, restore, query, health } from "./duckdb";
import { sheets } from "./sheets.config";
import { blueprints } from "./blueprints";
import views from "./views.sql?raw";
import { clearAnalyses } from "./analytics";
import { useStore, PERFORMANCE_MARKETING_VIEW } from "../state/store";
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
          ...(tab === 1 ? ["bookings", "checkins"] : tab === 0 ? ["new", "sales", "lapsed", "leads", "bookings", "checkins"] : tab === 3 ? ["payroll", "new", "bookings"] : tab === 5 ? ["sales", "bookings"] : tab === 14 ? ["new", "bookings"] : tab === 8 ? ["new"] : tab === 9 ? ["sessions"] : tab === 6 ? ["new", "checkins"] : tab === 15 ? ["sales", "new", "lapsed", "leads", "payroll", "recurring", "bookings"] : []),
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
/**
 * `force` makes the gateway refetch the workbook. `latest` only skips this browser's
 * 15-minute window, taking whatever newer copy the gateway already holds.
 */
export async function ensureSource(key: string, force = false, latest = false): Promise<void> {
  engine ||= init()
    .then(() => query(views))
    .then(() => undefined)
    .catch((e) => {
      engine = undefined;
      throw e;
    });
  await engine;
  if (jobs.has(key)) return jobs.get(key)!;
  if (usable(key) && !force && !latest && Date.now() - health[key].fetchedAt! < 900000)
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
      if (!force && !latest && !stale && usable(key)) {
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

export interface FreshnessReport {
  checkedAt: number;
  sources: {
    key: string;
    fetchedAt: number | null;
    revision: string | null;
    currentRevision: string | null;
    stale: boolean;
    verified: boolean;
    reason: string | null;
  }[];
}
/** The last probe, for the age indicator in the UI. */
export let lastFreshness: FreshnessReport | null = null;
let probing: Promise<FreshnessReport | null> | undefined;
let probedAt = 0;

/**
 * One small request that asks the server whether any workbook has been edited
 * since the rows we hold. It never blocks a render: callers fire it after the
 * data on screen is already painted.
 */
export async function probeFreshness(minInterval = 10000) {
  if (probing) return probing;
  if (Date.now() - probedAt < minInterval) return lastFreshness;
  probing = (async () => {
    try {
      const response = await fetch("/api/sheets/freshness");
      if (!response.ok) return lastFreshness;
      lastFreshness = (await response.json()) as FreshnessReport;
      probedAt = Date.now();
      return lastFreshness;
    } catch {
      return lastFreshness;
    } finally {
      probing = undefined;
    }
  })();
  return probing;
}

/**
 * Refresh only the sources whose workbook has actually changed. Returns the
 * keys that were reloaded, so the caller can say so.
 */
export async function revalidate(tab: number, minInterval = 10000) {
  const report = await probeFreshness(minInterval);
  if (!report) return [];
  const watched = new Set(dependencies(tab));
  if (tab===8 && useStore.getState().view===PERFORMANCE_MARKETING_VIEW) watched.add("meta");
  // A source we have never loaded is handled by the normal load path.
  const loaded = report.sources.filter((s) => watched.has(s.key) && usable(s.key));
  const stale = loaded
    .filter((s) => s.stale)
    // The probe compares against the server's cache; ours may differ.
    .filter((s) => !s.currentRevision || s.currentRevision !== health[s.key]?.revision)
    .map((s) => s.key);
  // The gateway already holds a newer copy (another tab or user refreshed it): take it
  // without asking Google again.
  const newer = loaded
    .filter((s) => !stale.includes(s.key) && (s.fetchedAt ?? 0) > (health[s.key]?.fetchedAt ?? 0))
    .map((s) => s.key);
  if (!stale.length && !newer.length) return [];
  await Promise.all([
    ...stale.map((key) => ensureSource(key, true)),
    ...newer.map((key) => ensureSource(key, false, true)),
  ]);
  return [...stale, ...newer];
}
