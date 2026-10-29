// Historical report layouts, loaded only when a narrative is actually being written.
//
// The 451 KB `reference-templates.json` used to be a static import at the top of
// intelligence.mjs. That put it in every serverless cold start — including requests
// that only fetch a sheet — for a file that only one code path ever reads.
// A dynamic import keeps it in a separate chunk, fetched on first use.
let cache;

/**
 * @returns {Promise<Array|null>} the layout catalogue, or null if it cannot be read.
 * A missing catalogue degrades one prompt section; it must never take the API down.
 */
export async function referenceLayouts() {
  if (cache !== undefined) return cache;
  try {
    cache = (await import("../src/report/reference-templates.json", { with: { type: "json" } })).default;
  } catch (error) {
    console.warn("Reference layouts unavailable; narrative will omit the layout sample.", error);
    cache = null;
  }
  return cache;
}

/** The historical layout for one edition/section pair, if we have it. */
export async function referenceLayout(editionId, sectionId) {
  const templates = await referenceLayouts();
  const edition = templates?.find((template) => template.id === editionId);
  return edition?.sections.find((section) => section.id === sectionId)?.layout ?? null;
}
