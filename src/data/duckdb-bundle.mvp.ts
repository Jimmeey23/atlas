// The compatibility build, for browsers without WASM exception handling. Opt in with
// DUCKDB_BUNDLE=mvp; it is ~5 MB larger than the default and no faster.
import mainModule from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mainWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
export const duckdbBundle = { mainModule, mainWorker };
export const duckdbBundleName = "mvp" as const;
