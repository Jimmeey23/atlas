/** Reset the previous Sales accent once, while retaining other saved page settings. */
export function migrateSalesAccent<T extends {
  salesAccentVersion?: number;
  page?: Record<number, { accent?: string }>;
}>(preferences: T) {
  if (preferences.salesAccentVersion === 3) return preferences;
  const page = { ...preferences.page };
  if (page[4]) {
    const { accent: _oldAccent, ...settings } = page[4];
    page[4] = settings;
  }
  return { ...preferences, page, salesAccentVersion: 3 };
}
