/** Keep the trimmed source spelling to preserve cache keys and distinct page URLs. */
export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch { return null; }
}
