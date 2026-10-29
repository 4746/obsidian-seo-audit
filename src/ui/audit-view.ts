import { ItemView, Notice, type Menu, type WorkspaceLeaf } from 'obsidian';
import type { AuditController } from './audit-controller';
import { renderAuditTable, type AuditTableState, type TableFilter } from './audit-table';
import { TableSettingsModal } from './table-settings-modal';
import { fieldKeys } from '../types';
import { download, exportCsv, exportJson } from '../export/export-service';
import { el, select } from './dom';
import type { AuditResult } from '../types';

export const VIEW_TYPE = 'seo-audit';
export class AuditView extends ItemView {
  private tableState: AuditTableState = {
    selected: new Set(), focused: null, page: 0, pageSize: 50,
    filter: { search: '', status: 'any', field: 'title', presence: 'any', sort: 'url', descending: false },
  };
  private tableHost!: HTMLElement;
  private selectionHost!: HTMLElement;
  private settingsModal: TableSettingsModal | null = null;
  private unsubscribe: (() => void) | null = null;
  private renderTimer: number | undefined;
  private searchTimer: number | undefined;
  private lastLocale = '';
  private statusFilter!: HTMLSelectElement;
  private statusOptions = '';
  private tableSignature = '';
  private tableResults: (AuditResult | undefined)[] = [];

  constructor(leaf: WorkspaceLeaf, private plugin: AuditController) {
 super(leaf); 
}
  getViewType(): string {
 return VIEW_TYPE; 
}
  getDisplayText(): string {
 return this.plugin.t('pluginName'); 
}
  getIcon(): string {
 return 'search-check'; 
}
  onPaneMenu(menu: Menu, source: string): void {
    const t = this.plugin.t;
    const running = this.plugin.scanner.progress.running;
    const urls = this.plugin.index.pages().map(page => page.url);
    const selected = urls.filter(url => this.tableState.selected.has(url));
    menu.addItem(item => item.setTitle(t('all')).setIcon('play').setDisabled(running || !urls.length).onClick(() => this.plugin.scan(urls)));
    menu.addItem(item => item.setTitle(t('selected')).setIcon('list-checks').setDisabled(running || !selected.length).onClick(() => this.plugin.scan(selected)));
    menu.addItem(item => item.setTitle(t('stop')).setIcon('square').setDisabled(!running).onClick(() => this.plugin.scanner.stop()));
    menu.addSeparator();
    menu.addItem(item => item.setTitle(t('reindex')).setIcon('refresh-cw').onClick(() => {
      void this.plugin.reindex();
    }));
    for (const format of ['json', 'csv'] as const) {
      menu.addItem(item => item.setTitle(t(format === 'json' ? 'exportJson' : 'exportCsv')).setIcon('download').onClick(() => {
        try {
          const pages = this.plugin.index.pages();
          download((format === 'json' ? exportJson : exportCsv)(pages, this.plugin.data.cache.latest), format);
        } catch (error) {
 console.error('SEO Audit export', error); new Notice(t('downloadFailed')); 
}
      }));
    }
    menu.addItem(item => item.setTitle(t('tableSettings')).setIcon('settings').onClick(() => {
      this.settingsModal?.close();
      this.settingsModal = new TableSettingsModal(this.app, this.plugin, () => this.renderTable());
      this.settingsModal.open();
    }));
    menu.addSeparator();
    super.onPaneMenu(menu, source);
  }
  async onOpen(): Promise<void> {
    this.contentEl.addClass('seo-audit', 'seo-audit-main');
    this.build();
    this.unsubscribe = this.plugin.subscribe(() => {
      if (this.renderTimer) {
return;
}
      this.renderTimer = window.setTimeout(() => {
        this.renderTimer = undefined;
        if (this.lastLocale !== this.plugin.t('open')) {
this.build();
} else {
this.refresh();
}
      }, 150);
    });
  }
  async onClose(): Promise<void> {
    this.settingsModal?.close();
    this.unsubscribe?.(); window.clearTimeout(this.renderTimer); window.clearTimeout(this.searchTimer);
  }
  private build(): void {
    window.clearTimeout(this.searchTimer);
    const t = this.plugin.t;
    this.lastLocale = t('open');
    this.contentEl.replaceChildren();
    this.tableSignature = '';
    const filters = el(this.contentEl, 'div', undefined, 'seo-audit-toolbar');
    const search = el(filters, 'input'); search.type = 'search'; search.placeholder = t('search'); search.setAttribute('aria-label', t('search')); search.value = this.tableState.filter.search;
    search.oninput = () => {
 window.clearTimeout(this.searchTimer); this.searchTimer = window.setTimeout(() => {
 this.tableState.filter.search = search.value; this.tableState.page = 0; this.renderTable(); 
}, 200); 
};
    this.statusOptions = '';
    this.statusFilter = select(filters, t('status'), [], this.tableState.filter.status, value => {
 this.tableState.filter.status = value; this.tableState.page = 0; this.renderTable(); 
});
    select(filters, t('metadataFilter'), fieldKeys.map(k => [k, k]), this.tableState.filter.field, value => {
 this.tableState.filter.field = value as TableFilter['field']; this.tableState.page = 0; this.renderTable(); 
});
    select(filters, '', [['any', t('any')], ['present', t('present')], ['missing', t('missing')]], this.tableState.filter.presence, value => {
 this.tableState.filter.presence = value; this.tableState.page = 0; this.renderTable(); 
}).setAttribute('aria-label', t('metadataFilter'));
    this.selectionHost = el(filters, 'span', undefined, 'seo-audit-selection-count');
    this.selectionHost.setAttribute('role', 'status');
    this.tableHost = el(this.contentEl, 'div', undefined, 'seo-audit-table-host');
    this.refresh();
  }
  private refresh(): void {
    const pages = new Set(this.plugin.index.pages().map(p => p.url));
    for (const url of this.tableState.selected) {
if (!pages.has(url)) {
this.tableState.selected.delete(url);
}
}
    const t = this.plugin.t;
    const statuses = [...new Set(Object.values(this.plugin.data.cache.latest).flatMap(r => r.status === null ? [] : [r.status]))].sort((a, b) => a - b);
    const signature = JSON.stringify([statuses, this.tableState.filter.status]);
    if (signature !== this.statusOptions) {
      this.statusOptions = signature;
      this.statusFilter.replaceChildren();
      const options: [string, string][] = [['any', t('any')], ['unscanned', t('unscanned')], ['errors', t('errors')], ...['1xx', '2xx', '3xx', '4xx', '5xx'].map(s => [s, s] as [string, string]), ...statuses.map(s => [String(s), String(s)] as [string, string])];
      if (!options.some(([value]) => value === this.tableState.filter.status)) {
options.push([this.tableState.filter.status, this.tableState.filter.status]);
}
      for (const [value, label] of options) {
 const option = el(this.statusFilter, 'option', label); option.value = value; 
}
      this.statusFilter.value = this.tableState.filter.status;
    }
    this.selectionHost.hidden = this.tableState.selected.size === 0;
    this.selectionHost.textContent = `${this.tableState.selected.size} ${t('selectedCount')}`;
    this.renderTable(false);
  }
  private openFile = (path: string): void => {
    const file = this.app.vault.getFileByPath(path);
    if (file) {
void this.app.workspace.getLeaf(true).openFile(file);
}
  };
  private renderTable(force = true): void {
    if (this.tableState.pageSize !== this.plugin.data.settings.pageSize) {
      this.tableState.pageSize = this.plugin.data.settings.pageSize;
      this.tableState.page = 0;
    }
    const pages = this.plugin.index.pages();
    const results = pages.map(page => this.plugin.data.cache.latest[page.url]);
    const signature = JSON.stringify([pages, this.plugin.data.settings.urlProperty, this.plugin.data.settings.visibleColumns, this.tableState.filter, this.tableState.page, this.tableState.pageSize, [...this.tableState.selected], this.tableState.focused]);
    // Progress-only notifications must not interrupt native scrolling or mouse gestures.
    if (!force && signature === this.tableSignature && results.length === this.tableResults.length && results.every((result, index) => result === this.tableResults[index])) {
      return;
    }
    renderAuditTable(this.tableHost, this.plugin, this.tableState, {
      render: () => this.renderTable(), details: () => {
        if (this.tableState.focused) {
          this.plugin.openDetails(this.tableState.focused);
        }
      },
      refresh: () => this.refresh(), openFile: this.openFile,
    });
    this.tableSignature = signature;
    this.tableResults = results;
  }
}
