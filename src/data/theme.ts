/**
 * The theme default lives in exactly one place.
 *
 * It used to be written three times — `index.html`, `main.tsx` and the store — and
 * they disagreed (`matte`, `gloss`, `matte`). The store hydrated after the first
 * paint, so the opening theme flipped and the first press of the theme key appeared
 * to do nothing.
 */
export const DEFAULT_THEME = "matte";
export const THEME_KEY = "floor-theme";
