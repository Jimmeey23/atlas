import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { createGzip } from "node:zlib";

// One snapshot per Drive revision never changes, so the CDN may keep it for good. Gzipped, the
// largest sheet stays under the CDN's 20MB cacheable-response limit; uncompressed it does not.
const SHARED = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Vercel-CDN-Cache-Control": "max-age=31536000, immutable",
};

// Stream the JSON already written by the loader. Repeated reads of a 100MB sheet
// should not allocate, parse and stringify another 100MB object per reader.
// `shared` marks a response that is exactly one revision of the sheet and may be cached by
// the CDN for everyone; every other response stays private to the requesting browser.
export async function sendSnapshot(req, res, cacheRoot, source, metadata, { shared = false } = {}) {
  let file;
  try {
    file = await open(path.join(cacheRoot, ".cache", `${source.key}.json`), "r");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const info = await file.stat();
  if (metadata?.fileMtime != null && (metadata.fileMtime !== info.mtimeMs || metadata.fileSize !== info.size)) {
    await file.close();
    return false;
  }
  const etag = metadata?.hash ? `"${metadata.hash}"` : null;
  res.set({ ...(shared ? SHARED : { "Cache-Control": "private, no-cache" }), "Content-Type": "application/json; charset=utf-8" });
  if (etag) res.set("ETag", etag);
  if (metadata?.fetchedAt) res.set("X-Snapshot-Fetched-At", String(metadata.fetchedAt));
  if (metadata?.revision) res.set("X-Snapshot-Revision", metadata.revision);
  if (etag && req.get("If-None-Match") === etag) {
    await file.close();
    res.status(304).end();
    return true;
  }
  if (shared && /\bgzip\b/.test(req.get("Accept-Encoding") || "")) {
    res.set({ "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
    await pipeline(file.createReadStream(), createGzip({ level: 6 }), res);
    return true;
  }
  await pipeline(file.createReadStream(), res);
  return true;
}
