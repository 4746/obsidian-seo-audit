import { getLanguage, Notice, Plugin, requestUrl, TFile } from 'obsidian';
import { UrlIndex } from './indexer';
import { translator, type Translator } from './i18n';
import { HttpAuditor, ScanQueue } from './scanner';
import { loadData, SaveQueue } from './storage';
import { AuditSettingTab } from './settings';
import { AuditView, VIEW_TYPE } from './view';
import type { PluginData } from './types';

export default class SeoAuditPlugin extends Plugin {
  data!: PluginData;
  index = new UrlIndex();
  scanner!: ScanQueue;
  private saves!: SaveQueue;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private disposed = false;
  private indexGeneration = 0;
  get t(): Translator { return translator(this.data?.settings.language ?? 'auto', getLanguage()); }

  async onload(): Promise<void> {
    try { this.data = loadData(await this.loadData()); }
    catch (error) {
      new Notice(`${this.t('loadFailed')}: ${error instanceof Error ? error.message : String(error)}`, 15000);
      throw error;
    }
    this.saves = new SaveQueue(data => this.saveData(data));
    this.scanner = new ScanQueue(new HttpAuditor(async url => {
      return await requestUrl({ url, method: 'GET', throw: false, headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' } });
    }), result => {
      if (this.disposed) return;
      this.data.cache.latest[result.url] = result; this.scheduleSave();
    }, () => this.notify());
    this.registerView(VIEW_TYPE, leaf => new AuditView(leaf, this));
    this.addRibbonIcon('search-check', this.t('open'), () => { void this.activateView(); });
    this.addCommand({ id: 'open', name: this.t('open'), callback: () => { void this.activateView(); } });
    this.addSettingTab(new AuditSettingTab(this.app, this));
    const update = (file: TFile) => {
      if (file.extension !== 'md') return;
      this.index.update(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.data.settings.urlProperty]);
      this.notify();
    };
    this.registerEvent(this.app.metadataCache.on('changed', update));
    let initiallyResolved = false;
    this.registerEvent(this.app.metadataCache.on('resolved', () => {
      if (!initiallyResolved) { initiallyResolved = true; void this.reindex(); }
    }));
    this.registerEvent(this.app.vault.on('create', file => { if (file instanceof TFile) update(file); }));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file instanceof TFile) this.index.remove(file.path);
      else void this.reindex();
      this.notify();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.index.remove(oldPath);
      if (file instanceof TFile) update(file); else void this.reindex();
      this.notify();
    }));
    this.app.workspace.onLayoutReady(() => { if (!this.disposed) void this.reindex(); });
  }

  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify(): void { if (!this.disposed) for (const listener of this.listeners) listener(); }

  async reindex(): Promise<void> {
    const generation = ++this.indexGeneration;
    const property = this.data.settings.urlProperty;
    this.index.clear();
    const files = this.app.vault.getMarkdownFiles();
    for (let i = 0; i < files.length; i++) {
      if (this.disposed || generation !== this.indexGeneration) return;
      const file = files[i]!;
      if (this.app.vault.getAbstractFileByPath(file.path) === file) {
        this.index.update(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter?.[property]);
      }
      if (i % 200 === 199) await new Promise(resolve => setTimeout(resolve, 0));
    }
    this.notify();
  }

  scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer || this.disposed) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.flush(); }, 1500);
  }
  private async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try { await this.saves.save(this.data); }
    catch (error) { this.dirty = true; console.error('SEO Audit save', error); new Notice(this.t('saveFailed')); }
  }
  scan(urls: string[]): void {
    const available = new Set(this.index.pages().map(p => p.url));
    void this.scanner.run(urls.filter(url => available.has(url)), { ...this.data.settings }).catch(error => {
      console.error('SEO Audit scan', error); new Notice(this.t('scanFailed'));
    }).finally(() => { if (!this.disposed) void this.flush(); });
  }
  async activateView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  onunload(): void {
    this.disposed = true; this.indexGeneration++; this.scanner?.stop();
    clearTimeout(this.saveTimer); this.listeners.clear();
    if (this.saves) void this.flush();
  }
}
