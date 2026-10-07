import { GoogleAuth, OAuth2Client } from "google-auth-library";

// Drive's modifiedTime is a few hundred bytes and answers the only question
// that matters between fetches: has anyone touched this workbook? Asking it is
// cheap enough to do on every focus; pulling a sheet is not.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];
// Several sources share one workbook, and a probe fans out across all of them,
// so identical questions inside this window reuse one answer.
const PROBE_TTL = 20000;

function authClient(env) {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) {
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
    return client;
  }
  if (env.GOOGLE_CREDENTIALS_JSON)
    return new GoogleAuth({
      credentials: JSON.parse(env.GOOGLE_CREDENTIALS_JSON),
      scopes: SCOPES,
    }).getClient();
  if (env.GOOGLE_APPLICATION_CREDENTIALS)
    return new GoogleAuth({ scopes: SCOPES }).getClient();
  return null;
}

export function createFreshness({ env = process.env, request = fetch, client: clientOverride } = {}) {
  const cache = new Map();
  const inflight = new Map();
  let client = clientOverride;
  let unavailable = "";

  async function read(id) {
    if (unavailable) return { id, revision: null, reason: unavailable };
    try {
      client ??= await authClient(env);
      if (!client) {
        // Public workbooks expose no revision, so callers fall back to the TTL.
        unavailable = "No Google credentials configured for metadata reads.";
        return { id, revision: null, reason: unavailable };
      }
      const headers = await client.getRequestHeaders();
      const response = await request(
        `https://www.googleapis.com/drive/v3/files/${id}?fields=modifiedTime&supportsAllDrives=true`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      if (response.status === 401 || response.status === 403) {
        unavailable = `Drive metadata not permitted (HTTP ${response.status}). Grant drive.metadata.readonly to use change detection.`;
        return { id, revision: null, reason: unavailable };
      }
      if (!response.ok) return { id, revision: null, reason: `HTTP ${response.status}` };
      const body = await response.json();
      return { id, revision: body.modifiedTime || null };
    } catch (error) {
      return { id, revision: null, reason: String(error.message || error) };
    }
  }

  /** The workbook's last edit time, or null when it cannot be determined. */
  async function revision(id, { maxAge = PROBE_TTL } = {}) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < maxAge) return hit.value;
    if (inflight.has(id)) return inflight.get(id);
    const job = read(id).then((value) => {
      cache.set(id, { at: Date.now(), value });
      inflight.delete(id);
      return value;
    });
    inflight.set(id, job);
    return job;
  }

  /** One probe per distinct workbook, in parallel, for a set of sources. */
  async function revisions(sources, options) {
    const ids = [...new Set(sources.map((s) => s.id))];
    const results = await Promise.all(ids.map((id) => revision(id, options)));
    return new Map(results.map((r) => [r.id, r]));
  }

  return { revision, revisions, reset: () => { cache.clear(); unavailable = ""; client = undefined; } };
}
