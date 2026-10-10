import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";

// Stream the JSON already written by the loader. Repeated reads of a 100MB sheet
// should not allocate, parse and stringify another 100MB object per reader.
export async function sendSnapshot(req, res, cacheRoot, source, metadata) {
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
  res.set({ "Cache-Control": "private, no-cache", "Content-Type": "application/json; charset=utf-8" });
  if (etag) res.set("ETag", etag);
  if (metadata?.fetchedAt) res.set("X-Snapshot-Fetched-At", String(metadata.fetchedAt));
  if (metadata?.revision) res.set("X-Snapshot-Revision", metadata.revision);
  if (etag && req.get("If-None-Match") === etag) {
    await file.close();
    res.status(304).end();
    return true;
  }
  await pipeline(file.createReadStream(), res);
  return true;
}
