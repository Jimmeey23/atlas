import { latestLapseSQL } from "../semantics/membership-eligibility";
import { renewalStateSQL } from "./renewals";
import { today } from "./periods";
import * as duckdb from "@duckdb/duckdb-wasm";
// Resolved by the alias in vite.config.ts to one of the two modules beside this file,
// so exactly one WASM build reaches dist.
import { duckdbBundle, duckdbBundleName } from "duckdb-bundle";
import { readSnapshot, writeSnapshot } from "./cache";
import { sqlTypes, normalise, type SourceData, type Defect } from "./normalise";
const resultCache = new Map<string, Promise<Row[]>>();
let queue: Promise<unknown> = Promise.resolve();
const pendingQueries = new Map<
  number,
  { queuedAt: number; startedAt?: number; source: string }
>();
let querySequence = 0;
let connection: duckdb.AsyncDuckDBConnection;
let database: duckdb.AsyncDuckDB;
export const health: Record<
  string,
  SourceData & { defects: Defect[]; recordsCount: number }
> = {};
export type Row = Record<string, string | number | null>;
// Every table is created with the full `sqlTypes` column set, so a column a
// source does not supply exists but is entirely NULL. Filtering such a field
// would silently return zero rows, so we record which fields each table
// actually carries and skip the rest when building WHERE clauses.
export const fieldPresence: Record<string, Set<string>> = {};
const presenceFields = [
  "location",
  "trainer",
  "format",
  "format_group",
  "source",
  "category",
  "day",
  "time",
  "member",
  "month",
  "status",
  "product",
  "associate",
  "capacity",
  "payment_method",
  "session_type",
  "is_new",
];
/** Bump to invalidate every persisted snapshot. Read on both write and restore, so the
 * two can never disagree and silently discard a snapshot.
 */
export const SCHEMA_VERSION = 21;

// Bumped whenever a table is (re)loaded, so schema-derived views (group-by
// fields) can recompute once per data version rather than per render.
let version = 0;
const dataListeners = new Set<() => void>();
export const dataVersion = () => version;
export function onData(listener: () => void) {
  dataListeners.add(listener);
  return () => void dataListeners.delete(listener);
}
async function measureFields(key: string) {
  try {
    const rows = await connection.query(
      `SELECT ${presenceFields.map((f) => `COUNT("${f}") AS "${f}"`).join(",")} FROM "${key}"`,
    );
    const row = rows.toArray()[0];
    fieldPresence[key] = new Set(
      presenceFields.filter((f) => Number(row?.[f] ?? 0) > 0),
    );
  } catch {
    delete fieldPresence[key];
  }
  version++;
  dataListeners.forEach((l) => l());
}
export function query(sql: string): Promise<Row[]> {
  const cacheable = /^\s*(SELECT|WITH)/i.test(sql);
  if (cacheable && resultCache.has(sql)) return resultCache.get(sql)!;
  if (!cacheable) resultCache.clear();
  const queryId = ++querySequence;
  pendingQueries.set(queryId, {
    queuedAt: performance.now(),
    source: sql.match(/FROM\s+"?([a-z_]+)/i)?.[1] || "derived",
  });
  const promise = queue
    .then(async () => {
      const start = performance.now();
      pendingQueries.get(queryId)!.startedAt = start;
      const result = await connection.query(sql);
      const rows = result
        .toArray()
        .map((r) =>
          Object.fromEntries(
            Object.entries(r.toJSON()).map(([k, v]) => [
              k,
              typeof v === "bigint" ? Number(v) : v,
            ]),
          ),
        ) as Row[];
      performance.measure("floor-query", { start, end: performance.now() });
      return rows;
    })
    .finally(() => pendingQueries.delete(queryId));
  queue = promise.catch(() => undefined);
  if (cacheable) {
    if (resultCache.size > 80)
      resultCache.delete(resultCache.keys().next().value!);
    resultCache.set(sql, promise);
    promise.catch(() => resultCache.delete(sql));
  }
  return promise;
}
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const promise = queue.then(work);
  queue = promise.catch(() => undefined);
  return promise;
}
export async function restore(key: string) {
  return exclusive(() => restoreSnapshot(key));
}
async function restoreSnapshot(key: string) {
  try {
    const entry = (await readSnapshot(key)) as
      | {
          schema: number;
          key: string;
          buffer: Uint8Array;
          meta: (typeof health)[string];
          savedAt: number;
        }
      | undefined;
    if (!entry || entry.schema !== SCHEMA_VERSION) return false;
    resultCache.clear();
    await database.registerFileBuffer(key + ".parquet", entry.buffer);
    await connection.query(
      `DROP TABLE IF EXISTS "${key}";CREATE TABLE "${key}" AS SELECT * FROM read_parquet('${key}.parquet')`,
    );
    await database.dropFile(key + ".parquet");
    if (key === "lapsed") for (const sql of [latestLapseSQL("lapsed", today()), ...renewalStateSQL(today())]) await connection.query(sql);
    health[key] = entry.meta;
    await measureFields(key);
    return true;
  } catch {
    return false;
  }
}
async function persist(key: string) {
  try {
    await connection.query(
      `COPY "${key}" TO '${key}.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY)`,
    );
    const buffer = await database.copyFileToBuffer(key + ".parquet");
    await writeSnapshot({
      schema: SCHEMA_VERSION,
      key,
      buffer,
      meta: health[key],
      savedAt: Date.now(),
    });
    await database.dropFile(key + ".parquet");
  } catch (error) {
    console.warn("Local snapshot unavailable for " + key, error);
  }
}
/**
 * The browser engine gets the same budget the server engine declares
 * (`server/intelligence.mjs`). Without it DuckDB-WASM takes whatever the tab can get
 * and dies with an opaque worker crash when Bookings alone is ~350 MB uncompressed.
 * An explicit limit fails as a source error we can show instead.
 */
const BROWSER_MEMORY_LIMIT = "512MB";

export async function init() {
  const bundle = await duckdb.selectBundle({
    [duckdbBundleName]: duckdbBundle,
  } as Parameters<typeof duckdb.selectBundle>[0]);
  if (!bundle.mainWorker || !bundle.mainModule)
    throw new Error(
      `This browser cannot run the ${duckdbBundleName.toUpperCase()} analytics engine. Use a current version of Chrome, Edge, Firefox or Safari, or rebuild with DUCKDB_BUNDLE=mvp.`,
    );
  const worker = new Worker(bundle.mainWorker!);
  database = new duckdb.AsyncDuckDB(
    new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
    worker,
  );
  await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
  connection = await database.connect();
  await connection.query(`SET memory_limit='${BROWSER_MEMORY_LIMIT}'`);
  await connection.query(`SET temp_directory='atlas_duckdb_temp'`);
  await connection.query("SET preserve_insertion_order=false");
  for (const key of [
    "sessions",
    "new",
    "sales",
    "leads",
    "meta",
    "lapsed",
    "checkins",
    "bookings",
    "payroll",
    "recurring",
    "teacher_recurring",
  ])
    await connection.query(
      `CREATE TABLE "${key}" (${Object.entries(sqlTypes)
        .map(([k, t]) => `"${k}" ${t}`)
        .join(",")})`,
    );
}
export async function ingest(data: SourceData) {
  return exclusive(async () => {
    const previous = health[data.key];
    await connection.query("BEGIN TRANSACTION");
    try {
      await ingestSource(data);
      await connection.query("COMMIT");
    } catch (e) {
      await connection.query("ROLLBACK");
      if (previous) health[data.key] = previous;
      else delete health[data.key];
      throw e;
    }
  });
}
async function ingestSource(data: SourceData) {
  resultCache.clear();
  const defects: Defect[] = [];
  health[data.key] = {
    ...data,
    rows: [],
    defects,
    recordsCount: data.rows.length,
  };
  await connection.query(
    `DROP TABLE IF EXISTS "${data.key}"; CREATE TABLE "${data.key}" (${Object.entries(
      sqlTypes,
    )
      .map(([k, t]) => `"${k}" ${t}`)
      .join(",")})`,
  );
  for (let offset = 0; offset < data.rows.length; offset += 5000) {
    const batch = normalise(
      { ...data, rows: data.rows.slice(offset, offset + 5000) },
      false,
    );
    batch.defects.forEach((d) => {
      d.row += offset;
      defects.push(d);
    });
    batch.rows.forEach((r) => {
      r.row_id = Number(r.row_id) + offset;
      r.source_row = Number(r.source_row) + offset;
      delete r.raw_json;
    });
    await database.registerFileText(
      data.key + ".json",
      JSON.stringify(batch.rows),
    );
    await connection.query(
      `INSERT INTO "${data.key}" SELECT ${Object.keys(sqlTypes)
        .map((c) => `TRY_CAST("${c}" AS ${sqlTypes[c]})`)
        .join(",")} FROM read_json('${data.key}.json',columns={${Object.entries(
        sqlTypes,
      )
        .map(([k, t]) => `'${k}':'${t}'`)
        .join(",")}}, format='array')`,
    );
    await database.dropFile(data.key + ".json");
  }
  if (data.key === "lapsed") {
    await connection.query(latestLapseSQL("lapsed", today()));
    for (const sql of renewalStateSQL(today())) await connection.query(sql);
  }
  await persist(data.key);
  await measureFields(data.key);
}
export const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
if (import.meta.env.DEV)
  Object.assign(window, {
    __floorDiagnostics: { query, health, pendingQueries },
  });
