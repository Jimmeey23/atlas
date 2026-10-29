// The DuckDB-WASM build shipped to browsers with the newer WASM exception handling.
// Only one of these two modules enters the build; see the alias in vite.config.ts.
import mainModule from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mainWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
export const duckdbBundle = { mainModule, mainWorker };
export const duckdbBundleName = "eh" as const;
