// Bundles the Express gateway for the serverless runtime.
//
// server/*.mjs imports src/data/normalise.ts directly, which plain Node cannot load — the
// local gateway only works because it runs under tsx. Here esbuild inlines the local
// TypeScript and .mjs modules into one file and leaves npm dependencies external.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, stat } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Code splitting keeps anything reached only through a dynamic import — the 451 KB
// historical report layouts, for one — out of the cold-start path. `outdir` is required
// for splitting; `entryNames` preserves the filename api/index.mjs already imports.
await build({
  entryPoints: [path.join(root, "server", "app.mjs")],
  outdir: path.join(root, "api"),
  entryNames: "_app",
  chunkNames: "_app-[hash]",
  // Vercel treats these as ESM by extension; api/index.mjs imports "./_app.mjs".
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  splitting: true,
  packages: "external",
  logLevel: "info",
});

const api = path.join(root, "api");
let largest = { name: "", size: 0 };
let total = 0;
for (const entry of await readdir(api)) {
  if (!entry.endsWith(".mjs")) continue;
  const size = (await stat(path.join(api, entry))).size;
  total += size;
  if (size > largest.size) largest = { name: entry, size };
}
console.log(
  `Serverless gateway bundled: ${(total / 1024 / 1024).toFixed(2)} MB across ` +
    `${(await readdir(api)).filter((f) => f.endsWith(".mjs")).length} files; ` +
    `largest is ${largest.name} at ${(largest.size / 1024 / 1024).toFixed(2)} MB.`,
);
