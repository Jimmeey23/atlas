// Public workbook reads. The CSV export returns every cell exactly as the sheet displays it.
// The gviz endpoint used previously infers one type per column and silently blanks every
// cell that disagrees with the majority (e.g. 28,963 of 29,064 "Total Sessions Completed"
// values in Lapsed), so it is not a faithful source for analytics.

// Configured columns a workbook may legitimately omit; the normaliser has fallbacks for them.
export const OPTIONAL_COLUMNS = {
  sales: ["Paid In Money", "Credits"],
  lapsed: ["Total Sessions", "Completed Sessions"],
  checkins: ["Month Year"],
};

export const missingColumns = (source, columns) =>
  source.columns.filter(
    (c) => !columns.includes(c) && !(OPTIONAL_COLUMNS[source.key] || []).includes(c),
  );

/** RFC 4180 CSV: quoted fields, doubled quotes, embedded commas and newlines, CRLF. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const blankRow = (row) => row.every((v) => v === "");

async function workbookTitles(source, request) {
  const response = await request(`https://docs.google.com/spreadsheets/d/${source.id}/edit`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Workbook metadata HTTP ${response.status}`);
  const html = await response.text();
  const titles = [...html.matchAll(/"name":"([^"\n]+)","id":\d+/g)].map((m) => m[1]);
  const visible = [...html.matchAll(/docs-sheet-tab-name[^>]*>([^<]+)</g)].map((m) => m[1]);
  return [...new Set([...titles, ...visible])];
}

/**
 * Reads one configured tab from a publicly shared workbook. The tab title is confirmed from
 * workbook metadata and the header row is checked against the configured schema, so a renamed
 * tab or a wrong gid fails loudly instead of loading rows from somewhere else.
 */
export async function publicSheet(source, { force = false, request = fetch, titles } = {}) {
  if (!source.gid) throw new Error(`No gid configured for '${source.title}'.`);
  const foundTitles = titles ?? (await workbookTitles(source, request));
  if (foundTitles.length && !foundTitles.some((t) => t.toLowerCase() === source.title.toLowerCase()))
    throw new Error(`Tab '${source.title}' missing. Found: ${foundTitles.join(", ")}`);
  // A forced refresh busts Google's response cache, which has been observed serving stale payloads.
  const response = await request(
    `https://docs.google.com/spreadsheets/d/${source.id}/export?format=csv&gid=${encodeURIComponent(source.gid)}${force ? `&_=${Date.now()}` : ""}`,
    { cache: "no-store", signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok) throw new Error(`Public sheet HTTP ${response.status}`);
  // A private workbook redirects to a sign-in page rather than failing.
  if (/text\/html/i.test(response.headers?.get?.("content-type") || ""))
    throw new Error("Workbook is not publicly readable. Configure the service account.");
  const parsed = parseCSV(await response.text());
  const columns = (parsed[0] || []).map((c) => c.trim());
  // Rows stay positional (row i is sheet row i + 2) so source links resolve; only the trailing
  // blank rows the export pads with are dropped.
  const rows = parsed.slice(1).map((row) => row.map((v) => (v === "" ? null : v)));
  while (rows.length && blankRow(rows.at(-1).map((v) => v ?? ""))) rows.pop();
  const missing = missingColumns(source, columns);
  if (missing.length)
    throw new Error(
      `Schema mismatch for '${source.title}': ${missing.join(", ")}. Found columns: ${columns.join(", ")}`,
    );
  return { columns, rows, mode: "Public Google Sheets CSV (title + schema verified)", foundTitles };
}

/** Keeps the newest `keep` archived snapshots per source; older versions are regenerable. */
export function snapshotsToPrune(files, key, keep = 10) {
  const pattern = new RegExp(`^${key.replace(/[^a-z0-9_]/gi, "")}-(\\d+)\\.json$`);
  return files
    .map((file) => ({ file, at: Number(file.match(pattern)?.[1]) }))
    .filter((f) => Number.isFinite(f.at))
    .sort((a, b) => b.at - a.at)
    .slice(keep)
    .map((f) => f.file);
}
