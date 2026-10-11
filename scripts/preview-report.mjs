/**
 * Design preview for the monthly report deck.
 *
 * The real report page renders a *saved* report: it reads one frozen snapshot from the
 * report store, which needs Supabase credentials and a completed build job. Neither is
 * available in a design review, so this harness serves the same Vite app against an
 * in-memory store holding one clearly-labelled synthetic snapshot.
 *
 *   node scripts/preview-report.mjs            → http://localhost:5179/report?id=<fixture>
 *
 * Everything downstream of the snapshot is the production code path: the same deck
 * components, the same CSS, the same export. Only the figures are synthetic, and the
 * figures are generated here — never imported into application code or stored as data.
 */
import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reportRoutes } from "../server/reports.mjs";
import { FIXTURE, MONTHS, SERIES, STUDIO } from "./preview-fixture.mjs";
import { presentationRoutes } from "../server/presentation.mjs";
import { stickyNoteRoutes } from "../server/sticky-notes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFERRED_PORT = Number(process.env.PREVIEW_PORT || 5179);
/**
 * The snapshot is mirrored under a fixed id. The save route always assigns its own uuid,
 * but a design preview is reloaded and restarted many times during a review, and the link
 * has to keep working across both.
 */
const PREVIEW_REPORT_ID = "6f1c0d94-3a7b-4e52-9d18-5c8ab7e2f340";

/* ------------------------------------------------------------------ server ---
   The report store is in memory; a minimal cloud double satisfies the listing
   query. Nothing in this file is imported by application code.                        */
function harness() {
  const documents = new Map();
  const order = new Map();
  let tick = 0;
  const store = {
    read: async key => structuredClone(documents.get(key) ?? null),
    write: async (key, value) => { documents.set(key, structuredClone(value)); order.set(key, ++tick); return value; },
    remove: async key => { documents.delete(key); order.delete(key); },
  };
  const cloud = { from: () => ({ select: () => ({ like: (_column, pattern) => ({ order: () => ({ limit: async () => ({
    data: [...documents.keys()].filter(key => key.startsWith(pattern.replace(/%$/, "")))
      .sort((a, b) => order.get(b) - order.get(a)).map(key => ({ key, updated_at: new Date(order.get(key)).toISOString() })),
    error: null }) }) }) }) }) };
  return { store, cloud };
}

const app = express();
app.use(express.json({ limit: "20mb" }));
// AI endpoints are stubbed so the deck's authoring tools can be demonstrated offline.
app.post("/api/reports/speaker-notes", (_req, res) => res.json({ notes: {
  opener: "\"This page is where the month's decision lives — let's take it together.\"",
  points: ["Anchor on the first card before anything else.", "Name the slot carrying the loss and the value at stake.", "Ask for the decision, then confirm the owner."],
  numbers: ["Attendance 747, down 15.1% on August", "Fill rate 63.0%, down 7.7pp"],
  questions: [{ q: "Is this seasonal?", a: "Partly — last September dipped 4%, not 15%." }, { q: "Is it the timetable or the market?", a: "Timetable: evenings held." }],
  transition: "Now to the next chapter.", generated: true,
} }));
app.post("/api/reports/component", (req, res) => res.json({ component: {
  kind: "chart", title: "Attendance, fourteen months", subtitle: "Redesigned from the frozen section figures", body: "", tone: "info",
  items: [], columns: [], rows: [], bullets: [], left: { label: "", points: [] }, right: { label: "", points: [] },
  chart: { type: "line", unit: "visits", categories: MONTHS.slice(-8).map(month => month.slice(2)), series: [{ name: "Attendance", values: SERIES.slice(-8).map(row => row.attendance) }] },
  prompt: req.body?.prompt ?? "design preview", generatedAt: new Date().toISOString(),
} }));
// A Sessions sheet so the data explorer renders real grouped rows.
const formats = ["Barre 57", "PowerCycle", "Strength Lab"];
const trainers = ["Asha Menon", "Rohan Pillai", "Meera Krishnan", "Kabir Shah"];
const times = ["07:45", "09:30", "18:30", "19:45"];
const sheetRows = Array.from({ length: 96 }, (_, i) => [`2026-09-${String(1 + i % 28).padStart(2, "0")} ${times[i % 4]}:00`, STUDIO, trainers[i % 4], formats[i % 3], times[i % 4], 25, 20 + i % 6, 16 + i % 8, i % 3 ? 0 : 1, i % 4 ? 0 : 1, 9000 + (i % 6) * 700]);
app.get("/api/sheets/:key", (req, res) => req.params.key === "sessions"
  ? res.json({ key: "sessions", title: "Sessions", id: "preview-fixture", status: "ok", fetchedAt: Date.now(), hash: "preview-sessions", columns: ["Date", "Location", "Trainer", "Class", "Time", "Capacity", "Booked", "CheckedIn", "LateCancelled", "Complimentary", "Revenue"], rows: sheetRows })
  : res.status(404).json({ status: "error", error: "The design preview serves only the Sessions fixture." }));
const { store, cloud } = harness();
reportRoutes(app, store, cloud, { ATLAS_ADMIN_PASSCODE: "preview", ATLAS_ADMIN_SECRET: "preview-secret-preview-secret-0000" });
presentationRoutes(app, store);
stickyNoteRoutes(app, store, cloud);

const api = createHttpServer(app);
await new Promise((resolve, reject) => { api.once("error", reject); api.listen(0, "127.0.0.1", resolve); });
const apiPort = api.address().port;

// The preview panel opens the port root. Send that to the report page rather than the
// dashboard shell, which has no snapshot to show without credentials. A plugin's
// `configureServer` runs before Vite installs its own HTML middleware, so this wins.
const preview = { reportPath: "" };
const reportPreviewPlugin = {
  name: "report-design-preview",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = (req.url || "/").split("?")[0];
      if (preview.reportPath && (pathname === "/" || pathname === "/index.html")) {
        res.writeHead(302, { Location: preview.reportPath, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      next();
    });
  },
};

const vite = await createViteServer({
  configFile: path.join(root, "vite.config.ts"),
  plugins: [reportPreviewPlugin],
  server: {
    host: "0.0.0.0",
    port: PREFERRED_PORT,
    strictPort: false,
    // The preview is proxied through a sandbox host, so any Host header is legitimate here.
    allowedHosts: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
await vite.listen();
const port = vite.config.server.port;

// Publish the snapshot exactly once, through the production save route.
const published = await fetch(`http://127.0.0.1:${apiPort}/api/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(FIXTURE) });
const saved = published.ok ? await published.json() : null;
if (!saved) console.error(`Could not publish the preview snapshot: ${published.status} ${await published.text()}`);
// Mirror the validated snapshot so the preview link is the same on every restart.
if (saved) await store.write(`.floor/reports/${PREVIEW_REPORT_ID}.json`, { ...saved, id: PREVIEW_REPORT_ID });
preview.reportPath = `/report?id=${PREVIEW_REPORT_ID}`;
const url = `http://localhost:${port}${preview.reportPath}`;

console.log(`\n  Report design preview  →  ${url}`);
console.log(`  The port root opens this page, and the link stays valid across restarts.`);
console.log(`  Synthetic figures for layout review only (14 months, ${MONTHS[0]}…${MONTHS.at(-1)}, ${STUDIO}).`);
console.log(`  API on 127.0.0.1:${apiPort} · frontend on 0.0.0.0:${port} · Ctrl+C to stop\n`);

const shutdown = async () => { await vite.close(); api.closeAllConnections(); api.close(); process.exit(0); };
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
