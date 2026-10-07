import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    // Ports are proxied by a preview host in hosted development, so the dev
    // server accepts any Host header instead of maintaining an allowlist.
    allowedHosts: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  preview: { host: "0.0.0.0", allowedHosts: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["echarts"],
          duckdb: ["@duckdb/duckdb-wasm"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
