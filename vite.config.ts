import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// Ship one DuckDB-WASM build, not both: together they are ~73 MB of dist and only
// one is ever instantiated. `DUCKDB_BUNDLE=mvp` opts into the compatibility build.
const duckdbBundle =
  process.env.DUCKDB_BUNDLE === "mvp"
    ? path.join(root, "src/data/duckdb-bundle.mvp.ts")
    : path.join(root, "src/data/duckdb-bundle.eh.ts");

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "duckdb-bundle": duckdbBundle } },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Group by path, not by package name. Listing a package in the object form
        // forces its *entry* into the chunk — which is what pulled in all of ECharts
        // including the eight chart types this app never draws.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/echarts/") || id.includes("/zrender/")) return "charts";
          if (id.includes("/@duckdb/")) return "duckdb";
          if (id.includes("/framer-motion/") || id.includes("/motion-dom/")) return "motion";
        },
      },
    },
  },
});
