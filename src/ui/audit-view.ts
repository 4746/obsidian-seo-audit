import { ItemView, Notice, setIcon, setTooltip, type Menu, type WorkspaceLeaf } from 'obsidian';
import type { AuditController } from './audit-controller';
import { renderAuditTable, type AuditTableState } from './audit-table';
import { TableSettingsModal } from './table-settings-modal';
import { AuditFiltersModal } from './audit-filters-modal';
import { download, exportCsv, exportJson } from '../export/export-service';
import { button, el } from './dom';
import type { AuditResult } from '../types';

export const VIEW_TYPE = 'seo-audit';
export class AuditView extends ItemView {
  private tableState: AuditTableState = {
    selected: new Set(), focused: null, page: 0, pageSize: 50,
    filter: { search: '', status: 'any', field: 'url', presence: 'any', sort: 'url', descending: false },
  };
  private tableHost!: HTMLElement;
  private tableActions!: HTMLElement;
  private selectionHost!: HTMLElement;
  private filtersModal: AuditFiltersModal | null = null;
  private settingsModal: TableSettingsModal | null = null;
  private unsubscribe: (() => void) | null = null;
  private renderTimer: number | undefined;
  private lastLocale = '';
  private tableSignature = '';
  private tableResults: (AuditResult | undefined)[] = [];
  private scannedSelection = new Set<string>();

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
    menu.addItem(item => item.setTitle(t('all')).setIcon('play').setDisabled(running || !urls.length).onClick(() => this.scanPages(urls)));
    menu.addItem(item => item.setTitle(t('selected')).setIcon('list-checks').setDisabled(running || !selected.length).onClick(() => this.scanPages(selected)));
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
      const progress = this.plugin.scanner.progress;
      // Observe completion before debouncing: a short scan can finish between renders.
      if (!progress.running) {
        if (progress.completed === progress.total) {
          for (const url of this.scannedSelection) {
            this.tableState.selected.delete(url);
          }
        }
        this.scannedSelection.clear();
      }
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
    this.filtersModal?.close();
    this.unsubscribe?.(); window.clearTimeout(this.renderTimer);
  }
  private scanPages(urls: string[]): void {
    if (this.plugin.scanner.progress.running) {
      return;
    }
    this.scannedSelection = new Set(urls.filter(url => this.tableState.selected.has(url)));
    this.plugin.scan(urls);
  }
  private build(): void {
    const t = this.plugin.t;
    this.lastLocale = t('open');
    this.contentEl.replaceChildren();
    this.tableSignature = '';
    const filters = this.tableActions = el(this.contentEl, 'div', undefined, 'seo-audit-table-actions');
    const filterButton = button(filters, '', () => {
      this.filtersModal?.close();
      this.filtersModal = new AuditFiltersModal(this.app, this.plugin, this.tableState.filter, () => {
        this.tableState.page = 0;
        this.renderTable();
      });
      this.filtersModal.open();
    });
    filterButton.classList.add('clickable-icon', 'seo-audit-filter-button');
    filterButton.setAttribute('aria-label', t('filters'));
    setIcon(filterButton, 'list-filter');
    setTooltip(filterButton, t('filters'));
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
    const signature = JSON.stringify([pages, this.plugin.data.settings.urlProperty, this.plugin.data.settings.visibleColumns, this.plugin.data.settings.lengthLimits, this.plugin.data.settings.highlightIssues, this.tableState.filter, this.tableState.page, this.tableState.pageSize, [...this.tableState.selected], this.tableState.focused]);
    // Progress-only notifications must not interrupt native scrolling or mouse gestures.
    if (!force && signature === this.tableSignature && results.length === this.tableResults.length && results.every((result, index) => result === this.tableResults[index])) {
      return;
    }
    renderAuditTable(this.tableHost, this.plugin, this.tableState, {
      toolbar: this.tableActions,
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
