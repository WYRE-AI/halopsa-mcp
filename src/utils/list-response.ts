/**
 * Halo's lookup endpoints return either a bare JSON array or an object that
 * wraps the rows under a key next to `record_count`. The SDK types only the
 * wrapped shape and passes the raw body through, so normalize both here.
 */
export function normalizeList<T>(
  response: unknown,
  key: string
): { record_count: number; rows: T[] } {
  if (Array.isArray(response)) {
    return { record_count: response.length, rows: response as T[] };
  }
  const wrapped = (response ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(wrapped[key]) ? (wrapped[key] as T[]) : [];
  const count = wrapped.record_count;
  return { record_count: typeof count === "number" ? count : rows.length, rows };
}
