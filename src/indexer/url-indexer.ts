import type { IndexedPage } from '../types';
import { type App, type Plugin, TFile } from 'obsidian';
import { normalizeUrl } from '../utils/normalize-url';

export function frontmatterUrls(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap(item => {
    const url = normalizeUrl(item);
    return url === null ? [] : [url];
  }))];
}

/** Incremental many-to-many index; no Markdown reads/writes are required. */
export class UrlIndex {
  private byFile = new Map<string, string[]>();
  private byUrl = new Map<string, Set<string>>();

  update(path: string, value: unknown): void {
    this.remove(path);
    const urls = frontmatterUrls(value);
    if (!urls.length) {
return;
}
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
      if (!files?.size) {
this.byUrl.delete(url);
}
    }
    this.byFile.delete(path);
  }

  clear(): void {
 this.byFile.clear(); this.byUrl.clear(); 
}
  pages(): IndexedPage[] {
    return Array.from(this.byUrl, ([url, files]) => ({ url, files: [...files].sort() }));
  }
}

/** Owns Vault subscriptions and batches bursts of metadata/filesystem events. */
export class VaultUrlIndexer extends UrlIndex {
  private pending = new Set<string>();
  private timer: number | undefined;
  private needsRebuild = false;
  private disposed = false;
  private generation = 0;

  constructor(private app: App, private property: () => string, private onChange: () => void) {
 super(); 
}

  start(plugin: Plugin): void {
    plugin.registerEvent(this.app.metadataCache.on('changed', file => this.queue(file.path)));
    let initiallyResolved = false;
    plugin.registerEvent(this.app.metadataCache.on('resolved', () => {
      if (!initiallyResolved) {
 initiallyResolved = true; this.scheduleRebuild(); 
}
    }));
    plugin.registerEvent(this.app.vault.on('create', file => {
      if (file instanceof TFile) {
this.queue(file.path);
}
    }));
    plugin.registerEvent(this.app.vault.on('delete', file => {
      if (file instanceof TFile) {
this.queue(file.path);
} else {
this.scheduleRebuild();
}
    }));
    plugin.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.queue(oldPath);
      if (file instanceof TFile) {
this.queue(file.path);
} else {
this.scheduleRebuild();
}
    }));
    this.app.workspace.onLayoutReady(() => {
 if (!this.disposed) {
this.scheduleRebuild();
} 
});
    plugin.register(() => this.dispose());
  }

  private scheduleRebuild(): void {
 this.needsRebuild = true; this.queue(); 
}
  private queue(path?: string): void {
    if (this.disposed) {
return;
}
    if (path) {
this.pending.add(path);
}
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      if (this.needsRebuild) {
        this.needsRebuild = false; this.pending.clear(); void this.rebuild();
      } else {
        for (const path of this.pending) {
          const file = this.app.vault.getFileByPath(path);
          if (file?.extension === 'md') {
this.update(path, this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.property()]);
} else {
this.remove(path);
}
        }
        this.pending.clear(); this.onChange();
      }
    }, 150);
  }

  async rebuild(): Promise<void> {
    if (this.disposed) {
return;
}
    window.clearTimeout(this.timer); this.timer = undefined;
    this.needsRebuild = false; this.pending.clear();
    const generation = ++this.generation;
    const property = this.property();
    this.clear();
    const files = this.app.vault.getMarkdownFiles();
    for (let i = 0; i < files.length; i++) {
      if (this.disposed || generation !== this.generation) {
return;
}
      const file = files[i]!;
      if (this.app.vault.getFileByPath(file.path) === file) {
this.update(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter?.[property]);
}
      if (i % 200 === 199) {
await new Promise(resolve => window.setTimeout(resolve, 0));
}
    }
    if (!this.disposed && generation === this.generation) {
this.onChange();
}
  }
  dispose(): void {
    this.disposed = true; this.generation++; window.clearTimeout(this.timer); this.pending.clear();
  }
}

