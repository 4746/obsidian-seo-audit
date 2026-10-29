import { getLanguage, Notice, Plugin } from 'obsidian';
import { VaultUrlIndexer } from './indexer/url-indexer';
import { translator, type Translator } from './i18n';
import { HttpAuditor, requestPage } from './scanner/http-client';
import { ScanQueue } from './scanner/scan-manager';
import { AuditStorage, loadData } from './storage/audit-storage';
import { AuditSettingTab } from './settings/settings-tab';
import { AuditView, VIEW_TYPE } from './ui/audit-view';
import type { PluginData } from './types';

export default class SeoAuditPlugin extends Plugin {
  data!: PluginData;
  index!: VaultUrlIndexer;
  scanner!: ScanQueue;
  private storage!: AuditStorage;
  private listeners = new Set<() => void>();
  private disposed = false;
  get t(): Translator {
 return translator(this.data?.settings.language ?? 'auto', getLanguage()); 
}

  async onload(): Promise<void> {
    try {
 this.data = loadData(await this.loadData()); 
} catch (error) {
      new Notice(`${this.t('loadFailed')}: ${error instanceof Error ? error.message : String(error)}`, 15000);
      throw error;
    }
    this.storage = new AuditStorage(this.data, data => this.saveData(data), error => {
      console.error('SEO Audit save', error); new Notice(this.t('saveFailed'));
    });
    this.index = new VaultUrlIndexer(this.app, () => this.data.settings.urlProperty, () => this.notify());
    this.index.start(this);
    this.scanner = new ScanQueue(new HttpAuditor(requestPage), result => {
      if (this.disposed) {
return;
}
      this.data.cache.latest[result.url] = result; this.scheduleSave();
    }, () => this.notify());
    this.registerView(VIEW_TYPE, leaf => new AuditView(leaf, this));
    this.addRibbonIcon('search-check', this.t('open'), () => {
 void this.activateView(); 
});
    this.addCommand({ id: 'open', name: this.t('open'), callback: () => {
 void this.activateView(); 
} });
    this.addSettingTab(new AuditSettingTab(this.app, this));
  }

  subscribe(listener: () => void): () => void {
 this.listeners.add(listener); return () => this.listeners.delete(listener); 
}
  notify(): void {
 if (!this.disposed) {
for (const listener of this.listeners) {
listener();
}
} 
}

  reindex(): Promise<void> {
 return this.index.rebuild(); 
}
  scheduleSave(): void {
 this.storage.scheduleSave(); 
}
  scan(urls: string[]): void {
    const available = new Set(this.index.pages().map(p => p.url));
    void this.scanner.run(urls.filter(url => available.has(url)), { ...this.data.settings }).catch(error => {
      console.error('SEO Audit scan', error); new Notice(this.t('scanFailed'));
    }).finally(() => {
 if (!this.disposed) {
void this.storage.flush();
} 
});
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
    this.disposed = true; this.scanner?.stop(); this.index?.dispose();
    this.listeners.clear(); this.storage?.dispose();
  }
}
