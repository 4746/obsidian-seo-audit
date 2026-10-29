import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type { AuditController } from './audit-controller';
import { columns, columnLabel, renderAuditTable, type AuditTableState, type TableFilter } from './audit-table';
import { renderAuditDetails } from './audit-details';
import { fieldKeys } from '../types';
import { download, exportCsv, exportJson } from '../export/export-service';
import { button, el, select } from './dom';

export const VIEW_TYPE = 'seo-audit';
export class AuditView extends ItemView {
  private tableState: AuditTableState = {
    selected: new Set(), focused: null, page: 0, pageSize: 50,
    filter: { search: '', status: 'any', field: 'title', presence: 'any', sort: 'url', descending: false },
  };
  private tableHost!: HTMLElement;
  private detailHost!: HTMLElement;
  private progressHost!: HTMLElement;
  private scanAll!: HTMLButtonElement;
  private scanSelected!: HTMLButtonElement;
  private stopButton!: HTMLButtonElement;
  private unsubscribe: (() => void) | null = null;
  private renderTimer: number | undefined;
  private searchTimer: number | undefined;
  private lastLocale = '';
  private statusFilter!: HTMLSelectElement;
  private statusOptions = '';

  constructor(leaf: WorkspaceLeaf, private plugin: AuditController) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return this.plugin.t('pluginName'); }
  getIcon(): string { return 'search-check'; }
  async onOpen(): Promise<void> {
    this.contentEl.addClass('seo-audit');
    this.build();
    this.unsubscribe = this.plugin.subscribe(() => {
      if (this.renderTimer) return;
      this.renderTimer = window.setTimeout(() => {
        this.renderTimer = undefined;
        if (this.lastLocale !== this.plugin.t('open')) this.build();
        else this.refresh();
      }, 150);
    });
  }
  async onClose(): Promise<void> {
    this.unsubscribe?.(); window.clearTimeout(this.renderTimer); window.clearTimeout(this.searchTimer);
  }
  private build(): void {
    window.clearTimeout(this.searchTimer);
    const t = this.plugin.t;
    this.lastLocale = t('open');
    this.contentEl.replaceChildren();
    el(this.contentEl, 'h2', t('pluginName'));
    const toolbar = el(this.contentEl, 'div', undefined, 'seo-audit-toolbar');
    this.scanAll = button(toolbar, t('all'), () => this.plugin.scan(this.plugin.index.pages().map(p => p.url)));
    this.scanSelected = button(toolbar, t('selected'), () => this.plugin.scan([...this.tableState.selected]));
    this.stopButton = button(toolbar, t('stop'), () => this.plugin.scanner.stop());
    button(toolbar, t('reindex'), () => { void this.plugin.reindex(); });
    for (const format of ['json', 'csv'] as const) button(toolbar, t(format === 'json' ? 'exportJson' : 'exportCsv'), () => {
      try {
        const pages = this.plugin.index.pages();
        download((format === 'json' ? exportJson : exportCsv)(pages, this.plugin.data.cache.latest), format);
      } catch (error) { console.error('SEO Audit export', error); new Notice(t('downloadFailed')); }
    });
    const filters = el(this.contentEl, 'div', undefined, 'seo-audit-toolbar');
    const search = el(filters, 'input'); search.type = 'search'; search.placeholder = t('search'); search.setAttribute('aria-label', t('search')); search.value = this.tableState.filter.search;
    search.oninput = () => { window.clearTimeout(this.searchTimer); this.searchTimer = window.setTimeout(() => { this.tableState.filter.search = search.value; this.tableState.page = 0; this.renderTable(); }, 200); };
    this.statusOptions = '';
    this.statusFilter = select(filters, t('status'), [], this.tableState.filter.status, value => { this.tableState.filter.status = value; this.tableState.page = 0; this.renderTable(); });
    select(filters, t('metadataFilter'), fieldKeys.map(k => [k, k]), this.tableState.filter.field, value => { this.tableState.filter.field = value as TableFilter['field']; this.tableState.page = 0; this.renderTable(); });
    select(filters, '', [['any', t('any')], ['present', t('present')], ['missing', t('missing')]], this.tableState.filter.presence, value => { this.tableState.filter.presence = value; this.tableState.page = 0; this.renderTable(); }).setAttribute('aria-label', t('metadataFilter'));
    const chooser = el(this.contentEl, 'details', undefined, 'seo-audit-columns'); el(chooser, 'summary', t('columns'));
    const choices = el(chooser, 'div', undefined, 'seo-audit-column-choices');
    for (const column of columns) {
      const label = el(choices, 'label'); const checkbox = el(label, 'input'); checkbox.type = 'checkbox'; checkbox.checked = this.plugin.data.settings.visibleColumns.includes(column);
      el(label, 'span', columnLabel(column, t));
      checkbox.onchange = () => {
        const visible = new Set(this.plugin.data.settings.visibleColumns);
        if (checkbox.checked) visible.add(column); else visible.delete(column);
        this.plugin.data.settings.visibleColumns = [...visible];
        this.plugin.scheduleSave(); this.renderTable();
      };
    }
    this.progressHost = el(this.contentEl, 'div', undefined, 'seo-audit-progress'); this.progressHost.setAttribute('role', 'status'); this.progressHost.setAttribute('aria-live', 'polite');
    this.tableHost = el(this.contentEl, 'div');
    this.detailHost = el(this.contentEl, 'section', undefined, 'seo-audit-details');
    this.refresh();
  }
  private refresh(): void {
    const pages = new Set(this.plugin.index.pages().map(p => p.url));
    for (const url of this.tableState.selected) if (!pages.has(url)) this.tableState.selected.delete(url);
    const p = this.plugin.scanner.progress; const t = this.plugin.t;
    const statuses = [...new Set(Object.values(this.plugin.data.cache.latest).flatMap(r => r.status === null ? [] : [r.status]))].sort((a, b) => a - b);
    const signature = JSON.stringify([statuses, this.tableState.filter.status]);
    if (signature !== this.statusOptions) {
      this.statusOptions = signature;
      this.statusFilter.replaceChildren();
      const options: [string, string][] = [['any', t('any')], ['unscanned', t('unscanned')], ['errors', t('errors')], ...['1xx', '2xx', '3xx', '4xx', '5xx'].map(s => [s, s] as [string, string]), ...statuses.map(s => [String(s), String(s)] as [string, string])];
      if (!options.some(([value]) => value === this.tableState.filter.status)) options.push([this.tableState.filter.status, this.tableState.filter.status]);
      for (const [value, label] of options) { const option = el(this.statusFilter, 'option', label); option.value = value; }
      this.statusFilter.value = this.tableState.filter.status;
    }
    this.progressHost.replaceChildren();
    el(this.progressHost, 'span', `${t(p.running ? 'running' : 'idle')} · ${p.completed}/${p.total} ${t('completed')} · ${p.active} ${t('active')} · ${this.tableState.selected.size} ${t('selectedCount')}`);
    const progress = el(this.progressHost, 'progress'); progress.max = p.total || 1; progress.value = p.completed;
    this.scanAll.disabled = p.running || !pages.size;
    this.scanSelected.disabled = p.running || !this.tableState.selected.size;
    this.stopButton.disabled = !p.running;
    this.renderTable(); this.renderDetails();
  }
  private openFile = (path: string): void => {
    const file = this.app.vault.getFileByPath(path);
    if (file) void this.app.workspace.getLeaf(true).openFile(file);
  };
  private renderTable(): void {
    renderAuditTable(this.tableHost, this.plugin, this.tableState, {
      render: () => this.renderTable(), details: () => this.renderDetails(),
      refresh: () => this.refresh(), openFile: this.openFile,
    });
  }
  private renderDetails(): void {
    renderAuditDetails(this.detailHost, this.plugin, this.tableState.focused, this.openFile, () => {
      this.tableState.focused = null; this.renderTable(); this.renderDetails();
    });
  }
}
