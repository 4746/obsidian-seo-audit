import { fieldKeys, type AuditResult, type FieldKey, type IndexedPage } from './types';

export const columns = ['url', 'files', 'status', ...fieldKeys, 'h1Count', 'responseTimeMs', 'scannedAt', 'finalUrl', 'xRobotsTag', 'alternates', 'h1', 'contentType', 'error'] as const;
export type Column = typeof columns[number];
export function columnValue(page: IndexedPage, result: AuditResult | undefined, column: Column): string | number | null {
  if (column === 'url') return page.url;
  if (column === 'files') return page.files.join('\n');
  if (!result) return null;
  if (fieldKeys.includes(column as FieldKey)) return result.metadata?.fields[column as FieldKey].map(v => v.value).join(' · ') ?? null;
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
    if (filter.status === 'unscanned' && r) return false;
    if (filter.status === 'errors' && !(r?.error || (r?.status ?? 0) >= 400)) return false;
    if (/^[1-5]xx$/.test(filter.status) && Math.floor((r?.status ?? 0) / 100) !== Number(filter.status[0])) return false;
    if (/^\d{3}$/.test(filter.status) && r?.status !== Number(filter.status)) return false;
    if (filter.presence !== 'any') {
      if (!r) return false;
      const has = r.metadata?.fields[filter.field].some(v => v.value.trim().length > 0) ?? false;
      if (filter.presence === 'present' ? !has : has) return false;
    }
    return !search || columns.some(c => String(columnValue(page, r, c) ?? '').toLocaleLowerCase().includes(search));
  }).sort((a, b) => {
    const av = columnValue(a, latest[a.url], filter.sort);
    const bv = columnValue(b, latest[b.url], filter.sort);
    if (av === null) return bv === null ? a.url.localeCompare(b.url) : 1;
    if (bv === null) return -1;
    const order = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return (order || a.url.localeCompare(b.url)) * (filter.descending ? -1 : 1);
  });
}
