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

/**
 * Incremental RFC 4180 CSV: quoted fields, doubled quotes, embedded commas and newlines, CRLF.
 * Chunks are parsed as they arrive so the whole export (72MB for Bookings) is never held as one
 * string next to its parsed rows.
 */
export function csvParser() {
  const rows = [];
  // Unparsed tail: always starts at the beginning of an incomplete row.
  let buffer = "";
  // Building a field character by character leaves V8 a chain of string fragments per cell
  // (Bookings parsed to ~680MB of heap). Fields are sliced whole and repeated values shared.
  const interned = new Map();
  const intern = (value) => {
    if (value.length > 48) return value;
    const hit = interned.get(value);
    if (hit !== undefined) return hit;
    const flat = (" " + value).slice(1);
    if (interned.size < 500000) interned.set(flat, flat);
    return flat;
  };
  function parse(final) {
    const text = buffer;
    let i = 0;
    let rowStart = 0;
    let row = [];
    while (i < text.length) {
      let value;
      if (text[i] === '"') {
        let j = i + 1;
        let parts = "";
        for (;;) {
          const q = text.indexOf('"', j);
          if (q < 0) {
            j = -1;
            break;
          }
          if (text[q + 1] === '"') {
            parts += text.slice(j, q + 1);
            j = q + 2;
            continue;
          }
          if (q + 1 >= text.length && !final) j = -1;
          else {
            parts += text.slice(j, q);
            j = q + 1;
          }
          break;
        }
        if (j < 0) break;
        value = parts;
        i = j;
      } else {
        let j = i;
        while (j < text.length && text[j] !== "," && text[j] !== "\n" && text[j] !== "\r") j++;
        if (j >= text.length && !final) break;
        value = text.slice(i, j);
        i = j;
      }
      row.push(intern(value));
      if (text[i] === "\r") i++;
      if (i >= text.length) {
        if (!final) {
          row = null;
          break;
        }
        rows.push(row);
        row = [];
        rowStart = i;
        break;
      }
      if (text[i] === ",") {
        i++;
        if (i >= text.length && final) {
          row.push("");
          rows.push(row);
          row = [];
          rowStart = i;
        }
        continue;
      }
      if (text[i] === "\n") {
        i++;
        rows.push(row);
        row = [];
        rowStart = i;
      }
    }
    buffer = final ? "" : text.slice(rowStart);
  }
  return {
    rows,
    push(text) {
      buffer += text;
      parse(false);
    },
    end() {
      if (buffer) parse(true);
      return rows;
    },
  };
}

export function parseCSV(text) {
  const parser = csvParser();
  parser.push(text);
  return parser.end();
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
  const parser = csvParser();
  if (response.body?.getReader) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(value);
    }
  } else parser.push(await response.text());
  const parsed = parser.end();
  const columns = (parsed[0] || []).map((c) => c.trim());
  // Rows stay positional (row i is sheet row i + 2) so source links resolve; only the trailing
  // blank rows the export pads with are dropped.
  const rows = parsed;
  rows.shift();
  for (const row of rows) for (let i = 0; i < row.length; i++) if (row[i] === "") row[i] = null;
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
