import type { IndexedPage } from './types';

export function frontmatterUrls(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap(item => {
    if (typeof item !== 'string' || !item.trim()) return [];
    const raw = item.trim();
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? [raw] : [];
    } catch { return []; }
  }))];
}

/** Incremental many-to-many index; no Markdown reads/writes are required. */
export class UrlIndex {
  private byFile = new Map<string, string[]>();
  private byUrl = new Map<string, Set<string>>();

  update(path: string, value: unknown): void {
    this.remove(path);
    const urls = frontmatterUrls(value);
    if (!urls.length) return;
    this.byFile.set(path, urls);
    for (const url of urls) {
      const files = this.byUrl.get(url) ?? new Set<string>();
      files.add(path);
      this.byUrl.set(url, files);
    }
  }

  remove(path: string): void {
    for (const url of this.byFile.get(path) ?? []) {
      const files = this.byUrl.get(url);
      files?.delete(path);
      if (!files?.size) this.byUrl.delete(url);
    }
    this.byFile.delete(path);
  }

  clear(): void { this.byFile.clear(); this.byUrl.clear(); }
  pages(): IndexedPage[] {
    return Array.from(this.byUrl, ([url, files]) => ({ url, files: [...files].sort() }));
  }
}
