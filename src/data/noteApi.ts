export async function noteRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const content = await response.text();
  let body;
  try {
    body = JSON.parse(content);
  } catch {
    throw new Error(
      `The notes API returned a page instead of JSON (HTTP ${response.status}). Refresh the app after the gateway update, then retry saving. Your draft is kept on this device.`,
    );
  }
  if (!response.ok)
    throw new Error(
      body.error || `Notes could not be saved (HTTP ${response.status}).`,
    );
  return body;
}
