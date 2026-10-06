// Bundles the Express gateway for the serverless runtime.
//
// server/*.mjs imports src/data/normalise.ts directly, which plain Node cannot load — the
// local gateway only works because it runs under tsx. Here esbuild inlines the local
// TypeScript and .mjs modules into one file and leaves npm dependencies external.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "api", "_app.mjs");

await build({
  entryPoints: [path.join(root, "server", "app.mjs")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  logLevel: "info",
});
console.log("Serverless gateway bundled:", path.relative(root, outfile));
