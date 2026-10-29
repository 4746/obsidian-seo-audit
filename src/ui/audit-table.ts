import { Notice } from 'obsidian';
import type { AuditController } from './audit-controller';
import type { Translator } from '../i18n';
import { button, el, fileLinks } from './dom';
import { fieldKeys, type AuditResult, type FieldKey, type IndexedPage } from '../types';

export const columns = ['url', 'files', 'status', ...fieldKeys, 'h1Count', 'responseTimeMs', 'scannedAt', 'finalUrl', 'xRobotsTag', 'alternates', 'h1', 'contentType', 'error'] as const;
export type Column = typeof columns[number];
export function columnValue(page: IndexedPage, result: AuditResult | undefined, column: Column): string | number | null {
  if (column === 'url') {
return page.url;
}
  if (column === 'files') {
return page.files.join('\n');
}
  if (!result) {
return null;
}
  if (fieldKeys.includes(column as FieldKey)) {
return result.metadata?.fields[column as FieldKey].map(v => v.value).join(' · ') ?? null;
}
  switch (column) {
    case 'h1Count': return result.metadata?.h1Count ?? null;
    case 'h1': return result.metadata?.h1.map(v => v.value).join(' · ') ?? null;
    case 'alternates': return result.metadata?.alternates.map(v => `${v.hreflang.value}: ${v.href.value}`).join(' · ') ?? null;
    case 'xRobotsTag': return result.xRobotsTag.map(v => v.value).join(' · ');
    case 'error': return result.error ? `${result.error.kind}: ${result.error.message}` : null;
    default: return result[column as 'status' | 'responseTimeMs' | 'scannedAt' | 'finalUrl' | 'contentType'];
  }
}
export interface TableFilter { search: string; status: string; field: FieldKey; presence: string; sort: Column; descending: boolean }
export function filterPages(pages: IndexedPage[], latest: Record<string, AuditResult>, filter: TableFilter): IndexedPage[] {
  const search = filter.search.toLocaleLowerCase();
  return pages.filter(page => {
    const r = latest[page.url];
    if (filter.status === 'unscanned' && r) {
return false;
}
    if (filter.status === 'errors' && !(r?.error || (r?.status ?? 0) >= 400)) {
return false;
}
    if (/^[1-5]xx$/.test(filter.status) && Math.floor((r?.status ?? 0) / 100) !== Number(filter.status[0])) {
return false;
}
    if (/^\d{3}$/.test(filter.status) && r?.status !== Number(filter.status)) {
return false;
}
    if (filter.presence !== 'any') {
      if (!r) {
return false;
}
      const has = r.metadata?.fields[filter.field].some(v => v.value.trim().length > 0) ?? false;
      if (filter.presence === 'present' ? !has : has) {
return false;
}
    }
    return !search || columns.some(c => String(columnValue(page, r, c) ?? '').toLocaleLowerCase().includes(search));
  }).sort((a, b) => {
    const av = columnValue(a, latest[a.url], filter.sort);
    const bv = columnValue(b, latest[b.url], filter.sort);
    if (av === null) {
return bv === null ? a.url.localeCompare(b.url) : 1;
}
    if (bv === null) {
return -1;
}
    const order = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return (order || a.url.localeCompare(b.url)) * (filter.descending ? -1 : 1);
  });
}

export interface AuditTableState {
  selected: Set<string>;
  focused: string | null;
  filter: TableFilter;
  page: number;
  pageSize: number;
}
export interface AuditTableActions {
  render: () => void;
  details: () => void;
  refresh: () => void;
  openFile: (path: string) => void;
}
export function columnLabel(column: Column, t: Translator): string {
  return fieldKeys.includes(column as FieldKey) ? column : t(column as Exclude<Column, FieldKey>);
}
export function renderAuditTable(host: HTMLElement, controller: AuditController, state: AuditTableState, actions: AuditTableActions): void {
  const t = controller.t;
  const pages = filterPages(controller.index.pages(), controller.data.cache.latest, state.filter);
  state.page = Math.max(0, Math.min(state.page, Math.ceil(pages.length / state.pageSize) - 1));
  const visiblePages = pages.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
  // Keep the native scroll container alive across data updates.
  const existingWrap = host.querySelector<HTMLElement>('.seo-audit-table-scroll');
  const scrollLeft = existingWrap?.scrollLeft ?? 0;
  for (const child of Array.from(host.children)) {
    if (child !== existingWrap) {
child.remove();
}
  }
  const renderPagination = (): void => {
    const nav = el(host, 'nav', undefined, 'seo-audit-pagination');
    nav.setAttribute('aria-label', t('pagination'));
    button(nav, t('previous'), () => {
 state.page--; actions.render(); 
}).disabled = state.page === 0;
    const summary = el(nav, 'span', undefined, 'seo-audit-page-summary');
    el(summary, 'span', `${t('page')} ${state.page + 1} ${t('of')} ${Math.max(1, Math.ceil(pages.length / state.pageSize))}`);
    el(summary, 'span', `${pages.length} ${t('pages')}`, 'seo-audit-page-count');
    button(nav, t('next'), () => {
 state.page++; actions.render(); 
}).disabled = (state.page + 1) * state.pageSize >= pages.length;
  };
  renderPagination();
  if (!pages.length) {
 existingWrap?.remove(); el(host, 'p', t('empty')); return; 
}
  if (existingWrap) {
host.prepend(host.lastElementChild!);
}
  const wrap = existingWrap ?? el(host, 'div', undefined, 'seo-audit-table-scroll');
  wrap.replaceChildren();
  const table = el(wrap, 'table', undefined, 'seo-audit-table');
  const head = el(el(table, 'thead'), 'tr');
  const selectAll = el(el(head, 'th'), 'input'); selectAll.type = 'checkbox'; selectAll.setAttribute('aria-label', t('selectPage'));
  selectAll.checked = visiblePages.every(p => state.selected.has(p.url));
  selectAll.indeterminate = !selectAll.checked && visiblePages.some(p => state.selected.has(p.url));
  selectAll.onchange = () => {
 for (const p of visiblePages) {
if (selectAll.checked) {
state.selected.add(p.url);
} else {
state.selected.delete(p.url);
}
} actions.refresh(); 
};
  const shown = columns.filter(column => column === 'url' || controller.data.settings.visibleColumns.includes(column));
  for (const column of shown) {
    const th = el(head, 'th'); th.scope = 'col';
    th.setAttribute('aria-sort', state.filter.sort === column ? state.filter.descending ? 'descending' : 'ascending' : 'none');
    button(th, (column === 'url' ? controller.data.settings.urlProperty : columnLabel(column, t)) + (state.filter.sort === column ? state.filter.descending ? ' ↓' : ' ↑' : ''), () => {
      state.filter.descending = state.filter.sort === column ? !state.filter.descending : false; state.filter.sort = column; actions.render();
    });
  }
  const body = el(table, 'tbody');
  for (const page of visiblePages) {
    const result = controller.data.cache.latest[page.url];
    const row = el(body, 'tr'); row.tabIndex = 0;
    if (state.focused === page.url) {
row.classList.add('is-selected');
}
    if (result?.error || (result?.status ?? 0) >= 400) {
row.classList.add('seo-audit-error-row');
}
    const showDetails = (): void => {
      state.focused = page.url;
      for (const other of body.rows) {
other.classList.toggle('is-selected', other === row);
}
      actions.details();
    };
    row.onclick = showDetails;
    row.onkeydown = event => {
 if (event.target === row && (event.key === 'Enter' || event.key === ' ')) {
 event.preventDefault(); showDetails(); 
} 
};
    const check = el(el(row, 'td'), 'input'); check.type = 'checkbox'; check.checked = state.selected.has(page.url); check.setAttribute('aria-label', `${t('select')}: ${page.url}`);
    check.onclick = e => e.stopPropagation(); check.onchange = () => {
 if (check.checked) {
state.selected.add(page.url);
} else {
state.selected.delete(page.url);
} actions.refresh(); 
};
    for (const column of shown) {
      const cell = el(row, 'td'); const value = columnValue(page, result, column);
      if (column === 'files') {
fileLinks(cell, page, t, actions.openFile);
} else if (column === 'url') {
        const content = el(cell, 'div', undefined, 'seo-audit-url');
        const link = el(content, 'a', page.url);
        link.href = page.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.onclick = e => e.stopPropagation();
        const copy = button(content, '⧉', () => {
          void navigator.clipboard.writeText(page.url).catch(error => {
            console.error('SEO Audit clipboard', error);
            new Notice(t('copyFailed'));
          });
        });
        copy.classList.add('seo-audit-copy');
        copy.setAttribute('aria-label', t('copyUrl'));
        copy.addEventListener('click', event => event.stopPropagation());
      } else {
        const text = column === 'scannedAt' && value ? new Date(String(value)).toLocaleString() : value === null || value === '' ? t(result ? 'missing' : 'unscanned') : String(value);
        cell.textContent = text;
        if (value === null || value === '') {
cell.classList.add('seo-audit-missing');
}
        if ((column === 'status' && typeof value === 'number' && value >= 400) || (column === 'error' && value)) {
cell.classList.add('seo-audit-error');
}
      }
    }
  }
  renderPagination();
  wrap.scrollLeft = scrollLeft;
}
