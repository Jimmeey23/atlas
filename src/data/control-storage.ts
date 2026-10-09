/** Storage is optional; corrupt saved controls must never prevent analysis. */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(fallback)
      ? Array.isArray(value)
        ? (value as T)
        : fallback
      : (value ?? fallback);
  } catch {
    return fallback;
  }
}
