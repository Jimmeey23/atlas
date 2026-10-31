import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// Ship one DuckDB-WASM build, not both: together they are ~73 MB of dist and only
// one is ever instantiated. `DUCKDB_BUNDLE=mvp` opts into the compatibility build.
const duckdbBundle =
  process.env.DUCKDB_BUNDLE === "mvp"
    ? path.join(root, "src/data/duckdb-bundle.mvp.ts")
    : path.join(root, "src/data/duckdb-bundle.eh.ts");

export default defineConfig({
  plugins: [react(), {
    name: 'protect-reference-data',
    // Node/server tests keep the actual JSON. Browser bundles get an empty
    // placeholder populated through the authenticated API before rendering.
    resolveId(source, importer) {
      if (source === './reference-contracts.json' && importer?.endsWith('/reference-standard.mjs')) return '\0atlas-private-reference';
    },
    load(id) { if (id === '\0atlas-private-reference') return 'export default []'; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0].startsWith('/reference/')) { res.statusCode = 404; res.end(); return; }
        next();
      });
    },
    async closeBundle() { await rm(path.join(root, 'dist/reference'), { recursive: true, force: true }); },
  }],
  resolve: { alias: { "duckdb-bundle": duckdbBundle } },
  server: { port: 5173, allowedHosts: [".e2b.app"], proxy: { "/api": "http://127.0.0.1:8787" } },
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
