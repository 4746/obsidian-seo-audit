import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type SeoAuditPlugin from './main';
import { columns, columnValue, filterPages, type Column, type TableFilter } from './table';
import { fieldKeys, type FieldValue, type IndexedPage } from './types';
import { download, exportCsv, exportJson } from './export';

export const VIEW_TYPE = 'seo-audit';
export function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  parent.appendChild(node);
  return node;
}
function button(parent: HTMLElement, text: string, action: () => void): HTMLButtonElement {
  const node = el(parent, 'button', text); node.type = 'button'; node.onclick = action; return node;
}
function select(parent: HTMLElement, label: string, options: [string, string][], value: string, change: (value: string) => void): HTMLSelectElement {
  const wrap = el(parent, 'label', undefined, 'seo-audit-control'); el(wrap, 'span', label);
  const node = el(wrap, 'select'); node.setAttribute('aria-label', label);
  for (const [key, text] of options) { const option = el(node, 'option', text); option.value = key; }
  node.value = value; node.onchange = () => change(node.value); return node;
}
export class AuditView extends ItemView {
  private selected = new Set<string>();
  private focused: string | null = null;
  private filter: TableFilter = { search: '', status: 'any', field: 'title', presence: 'any', sort: 'url', descending: false };
  private page = 0;
  private pageSize = 50;
  private tableHost!: HTMLElement;
  private detailHost!: HTMLElement;
  private progressHost!: HTMLElement;
  private scanAll!: HTMLButtonElement;
  private scanSelected!: HTMLButtonElement;
  private stopButton!: HTMLButtonElement;
  private unsubscribe: (() => void) | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private lastLocale = '';
  private statusFilter!: HTMLSelectElement;
  private statusOptions = '';

  constructor(leaf: WorkspaceLeaf, private plugin: SeoAuditPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'SEO Audit'; }
  getIcon(): string { return 'search-check'; }
  async onOpen(): Promise<void> {
    this.contentEl.addClass('seo-audit');
    this.build();
    this.unsubscribe = this.plugin.subscribe(() => {
      if (this.renderTimer) return;
      this.renderTimer = setTimeout(() => {
        this.renderTimer = undefined;
        if (this.lastLocale !== this.plugin.t('open')) this.build();
        else this.refresh();
      }, 150);
    });
  }
  async onClose(): Promise<void> {
    this.unsubscribe?.(); clearTimeout(this.renderTimer); clearTimeout(this.searchTimer);
  }
  private label(column: Column): string {
    return fieldKeys.includes(column as typeof fieldKeys[number]) ? column : this.plugin.t(column as Exclude<Column, typeof fieldKeys[number]>);
  }
  private build(): void {
    clearTimeout(this.searchTimer);
    const t = this.plugin.t;
    this.lastLocale = t('open');
    this.contentEl.replaceChildren();
    el(this.contentEl, 'h2', 'SEO Audit');
    const toolbar = el(this.contentEl, 'div', undefined, 'seo-audit-toolbar');
    this.scanAll = button(toolbar, t('all'), () => this.plugin.scan(this.plugin.index.pages().map(p => p.url)));
    this.scanSelected = button(toolbar, t('selected'), () => this.plugin.scan([...this.selected]));
    this.stopButton = button(toolbar, t('stop'), () => this.plugin.scanner.stop());
    button(toolbar, t('reindex'), () => { void this.plugin.reindex(); });
    for (const format of ['json', 'csv'] as const) button(toolbar, t(format === 'json' ? 'exportJson' : 'exportCsv'), () => {
      try {
        const pages = this.plugin.index.pages();
        download((format === 'json' ? exportJson : exportCsv)(pages, this.plugin.data.cache.latest), format);
      } catch (error) { console.error('SEO Audit export', error); new Notice(t('downloadFailed')); }
    });
    const filters = el(this.contentEl, 'div', undefined, 'seo-audit-toolbar');
    const search = el(filters, 'input'); search.type = 'search'; search.placeholder = t('search'); search.setAttribute('aria-label', t('search')); search.value = this.filter.search;
    search.oninput = () => { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.filter.search = search.value; this.page = 0; this.renderTable(); }, 200); };
    this.statusOptions = '';
    this.statusFilter = select(filters, t('status'), [], this.filter.status, value => { this.filter.status = value; this.page = 0; this.renderTable(); });
    select(filters, t('metadataFilter'), fieldKeys.map(k => [k, k]), this.filter.field, value => { this.filter.field = value as TableFilter['field']; this.page = 0; this.renderTable(); });
    select(filters, '', [['any', t('any')], ['present', t('present')], ['missing', t('missing')]], this.filter.presence, value => { this.filter.presence = value; this.page = 0; this.renderTable(); }).setAttribute('aria-label', t('metadataFilter'));
    const chooser = el(this.contentEl, 'details', undefined, 'seo-audit-columns'); el(chooser, 'summary', t('columns'));
    const choices = el(chooser, 'div', undefined, 'seo-audit-column-choices');
    for (const column of columns) {
      const label = el(choices, 'label'); const checkbox = el(label, 'input'); checkbox.type = 'checkbox'; checkbox.checked = this.plugin.data.settings.visibleColumns.includes(column);
      el(label, 'span', this.label(column));
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
    for (const url of this.selected) if (!pages.has(url)) this.selected.delete(url);
    const p = this.plugin.scanner.progress; const t = this.plugin.t;
    const statuses = [...new Set(Object.values(this.plugin.data.cache.latest).flatMap(r => r.status === null ? [] : [r.status]))].sort((a, b) => a - b);
    const signature = JSON.stringify([statuses, this.filter.status]);
    if (signature !== this.statusOptions) {
      this.statusOptions = signature;
      this.statusFilter.replaceChildren();
      const options: [string, string][] = [['any', t('any')], ['unscanned', t('unscanned')], ['errors', t('errors')], ...['1xx', '2xx', '3xx', '4xx', '5xx'].map(s => [s, s] as [string, string]), ...statuses.map(s => [String(s), String(s)] as [string, string])];
      if (!options.some(([value]) => value === this.filter.status)) options.push([this.filter.status, this.filter.status]);
      for (const [value, label] of options) { const option = el(this.statusFilter, 'option', label); option.value = value; }
      this.statusFilter.value = this.filter.status;
    }
    this.progressHost.replaceChildren();
    el(this.progressHost, 'span', `${t(p.running ? 'running' : 'idle')} · ${p.completed}/${p.total} ${t('completed')} · ${p.active} ${t('active')} · ${this.selected.size} ${t('selectedCount')}`);
    const progress = el(this.progressHost, 'progress'); progress.max = p.total || 1; progress.value = p.completed;
    this.scanAll.disabled = p.running || !pages.size;
    this.scanSelected.disabled = p.running || !this.selected.size;
    this.stopButton.disabled = !p.running;
    this.renderTable(); this.renderDetails();
  }
  private renderTable(): void {
    const t = this.plugin.t;
    const pages = filterPages(this.plugin.index.pages(), this.plugin.data.cache.latest, this.filter);
    this.page = Math.max(0, Math.min(this.page, Math.ceil(pages.length / this.pageSize) - 1));
    const visiblePages = pages.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
    this.tableHost.replaceChildren();
    const nav = el(this.tableHost, 'div', undefined, 'seo-audit-toolbar');
    button(nav, t('previous'), () => { this.page--; this.renderTable(); }).disabled = this.page === 0;
    el(nav, 'span', `${t('page')} ${this.page + 1} ${t('of')} ${Math.max(1, Math.ceil(pages.length / this.pageSize))} · ${pages.length} ${t('pages')}`);
    button(nav, t('next'), () => { this.page++; this.renderTable(); }).disabled = (this.page + 1) * this.pageSize >= pages.length;
    if (!pages.length) { el(this.tableHost, 'p', t('empty')); return; }
    const wrap = el(this.tableHost, 'div', undefined, 'seo-audit-table-scroll');
    const table = el(wrap, 'table', undefined, 'seo-audit-table');
    const head = el(el(table, 'thead'), 'tr');
    const selectAll = el(el(head, 'th'), 'input'); selectAll.type = 'checkbox'; selectAll.setAttribute('aria-label', t('selectPage'));
    selectAll.checked = visiblePages.every(p => this.selected.has(p.url));
    selectAll.indeterminate = !selectAll.checked && visiblePages.some(p => this.selected.has(p.url));
    selectAll.onchange = () => { for (const p of visiblePages) if (selectAll.checked) this.selected.add(p.url); else this.selected.delete(p.url); this.refresh(); };
    const shown = columns.filter(column => this.plugin.data.settings.visibleColumns.includes(column));
    for (const column of shown) {
      const th = el(head, 'th'); th.scope = 'col';
      th.setAttribute('aria-sort', this.filter.sort === column ? this.filter.descending ? 'descending' : 'ascending' : 'none');
      button(th, this.label(column) + (this.filter.sort === column ? this.filter.descending ? ' ↓' : ' ↑' : ''), () => {
        this.filter.descending = this.filter.sort === column ? !this.filter.descending : false; this.filter.sort = column; this.renderTable();
      });
    }
    const body = el(table, 'tbody');
    for (const page of visiblePages) {
      const result = this.plugin.data.cache.latest[page.url];
      const row = el(body, 'tr'); row.tabIndex = 0; row.setAttribute('aria-label', `${t('details')}: ${page.url}`);
      if (this.focused === page.url) row.classList.add('is-selected');
      if (result?.error || (result?.status ?? 0) >= 400) row.classList.add('seo-audit-error-row');
      row.onclick = () => { this.focused = page.url; this.renderTable(); this.renderDetails(); };
      row.onkeydown = event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.focused = page.url; this.renderDetails(); } };
      const check = el(el(row, 'td'), 'input'); check.type = 'checkbox'; check.checked = this.selected.has(page.url); check.setAttribute('aria-label', `${t('select')}: ${page.url}`);
      check.onclick = e => e.stopPropagation(); check.onchange = () => { if (check.checked) this.selected.add(page.url); else this.selected.delete(page.url); this.refresh(); };
      for (const column of shown) {
        const cell = el(row, 'td'); const value = columnValue(page, result, column);
        if (column === 'files') this.fileLinks(cell, page);
        else if (column === 'url') { const link = el(cell, 'a', page.url); link.href = page.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = t('openUrl'); link.onclick = e => e.stopPropagation(); }
        else {
          const text = column === 'scannedAt' && value ? new Date(String(value)).toLocaleString() : value === null || value === '' ? t(result ? 'missing' : 'unscanned') : String(value);
          cell.textContent = text; cell.title = text;
          if (value === null || value === '') cell.classList.add('seo-audit-missing');
          if ((column === 'status' && typeof value === 'number' && value >= 400) || (column === 'error' && value)) cell.classList.add('seo-audit-error');
        }
      }
    }
  }
  private fileLinks(parent: HTMLElement, page: IndexedPage): void {
    for (const path of page.files) {
      const link = el(parent, 'a', path, 'seo-audit-file'); link.href = '#'; link.title = this.plugin.t('openFile');
      link.onclick = event => {
        event.preventDefault(); event.stopPropagation();
        const file = this.app.vault.getFileByPath(path);
        if (file) void this.app.workspace.getLeaf(true).openFile(file);
      };
    }
  }
  private values(parent: HTMLElement, label: string, values: FieldValue[]): void {
    const t = this.plugin.t; el(parent, 'h4', label);
    if (!values.length) { el(parent, 'p', t('missing'), 'seo-audit-missing'); return; }
    const table = el(parent, 'table', undefined, 'seo-audit-values'); const head = el(el(table, 'thead'), 'tr');
    el(head, 'th', t('value')); el(head, 'th', t('length'));
    const body = el(table, 'tbody');
    for (const v of values) { const row = el(body, 'tr'); el(row, 'td', v.value || t('missing'), v.value.trim() ? 'seo-audit-original' : 'seo-audit-original seo-audit-missing'); el(row, 'td', String(v.length)); }
  }
  private renderDetails(): void {
    const host = this.detailHost; const t = this.plugin.t; host.replaceChildren();
    const page = this.plugin.index.pages().find(p => p.url === this.focused);
    if (!page) { el(host, 'p', t('noDetails')); return; }
    button(host, t('close'), () => { this.focused = null; this.renderTable(); this.renderDetails(); });
    el(host, 'h3', `${t('details')}: ${page.url}`); this.fileLinks(host, page);
    const r = this.plugin.data.cache.latest[page.url];
    if (!r) { el(host, 'p', t('unscanned')); return; }
    const info = el(host, 'dl');
    for (const [label, value] of [[t('url'), r.url], [t('finalUrl'), r.finalUrl ?? t('unknown')], [t('status'), r.status ?? t('unknown')], [t('responseTimeMs'), r.responseTimeMs ?? t('unknown')], [t('scannedAt'), new Date(r.scannedAt).toLocaleString()], [t('contentType'), r.contentType ?? t('unknown')]]) { el(info, 'dt', String(label)); el(info, 'dd', String(value)); }
    if (r.error) {
      const key = { timeout: 'timeoutError', network: 'networkError', 'non-html': 'nonHtmlError', parse: 'parseError', 'invalid-response': 'invalidError', http: 'httpError' } as const;
      el(host, 'p', `${t(key[r.error.kind])}: ${r.error.message}`, 'seo-audit-error');
    }
    this.values(host, t('xRobotsTag'), r.xRobotsTag);
    for (const key of fieldKeys) this.values(host, key, r.metadata?.fields[key] ?? []);
    el(host, 'p', `${t('h1Count')}: ${r.metadata?.h1Count ?? t('unknown')}`);
    this.values(host, t('h1'), r.metadata?.h1 ?? []);
    el(host, 'h4', t('alternates'));
    if (!r.metadata?.alternates.length) el(host, 'p', t('missing'), 'seo-audit-missing');
    else {
      const table = el(host, 'table', undefined, 'seo-audit-values'); const head = el(el(table, 'thead'), 'tr');
      for (const label of ['hreflang', t('length'), 'href', t('length')]) el(head, 'th', label);
      const body = el(table, 'tbody');
      for (const alt of r.metadata.alternates) {
        const row = el(body, 'tr');
        for (const value of [alt.hreflang.value, alt.hreflang.length, alt.href.value, alt.href.length]) el(row, 'td', String(value), 'seo-audit-original');
      }
    }
  }
}
