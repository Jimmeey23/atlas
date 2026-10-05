import { GoogleAuth, OAuth2Client } from "google-auth-library";

export async function authenticatedSheet(source, publicError, env = process.env, request = fetch, clientOverride) {
  let client = clientOverride;
  let mode = "Sheets API v4 (OAuth fallback)";
  if (!client) {
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) {
      client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
      client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
    } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] }).getClient();
      mode = "Sheets API v4 (service account fallback)";
    } else {
      throw new Error(`${publicError.message} Authenticated fallback unavailable: configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN on the server.`);
    }
  }
  const headers = await client.getRequestHeaders();
  async function read(url) {
    const response = await request(url, { headers, signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Authenticated Google Sheets HTTP ${response.status}`);
    return response.json();
  }
  const meta = await read(`https://sheets.googleapis.com/v4/spreadsheets/${source.id}?fields=sheets.properties(title)`);
  const foundTitles = meta.sheets.map((s) => s.properties.title);
  const title = foundTitles.find((t) => t.toLowerCase() === source.title.toLowerCase());
  if (!title) throw new Error(`Tab '${source.title}' missing. Found: ${foundTitles.join(", ")}`);
  const range = encodeURIComponent("'" + title.replaceAll("'", "''") + "'!A:ZZ");
  const data = await read(`https://sheets.googleapis.com/v4/spreadsheets/${source.id}/values/${range}?valueRenderOption=FORMATTED_VALUE`);
  return { columns: data.values?.[0] || [], rows: (data.values || []).slice(1), mode, foundTitles };
}
