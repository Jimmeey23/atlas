import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { createGzip } from "node:zlib";

// Revision snapshots can be compressed, but are never shared through a public CDN.
// Source rows can contain personal data. Never place them in a shared CDN cache,
// including revision-addressed URLs; every request must pass authorization.
const SHARED = { "Cache-Control": "private, no-cache" };

// Stream the JSON already written by the loader. Repeated reads of a 100MB sheet
// should not allocate, parse and stringify another 100MB object per reader.
// `shared` identifies revision-addressed responses eligible for compression;
// all responses remain private to the authenticated browser.
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
