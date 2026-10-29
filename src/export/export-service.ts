import { fieldKeys, type AuditResult, type IndexedPage } from '../types';

export function exportJson(pages: IndexedPage[], latest: Record<string, AuditResult>): string {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), pages: pages.map(page => ({ ...page, result: latest[page.url] ?? null })) }, null, 2);
}

/** Prevent spreadsheet execution even when a value starts with control characters. */
function startsFormula(text: string): boolean {
  for (const char of text) {
    if (char.charCodeAt(0) > 31 && !/\s/u.test(char)) return /^[=+@-]$/.test(char);
  }
  return false;
}

function cell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  if (startsFormula(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(pages: IndexedPage[], latest: Record<string, AuditResult>): string {
  const headers = ['url', 'files', 'scannedAt', 'finalUrl', 'status', 'responseTimeMs', 'contentType', 'error', 'xRobotsTag', ...fieldKeys, 'alternates', 'h1', 'h1Count'];
  const rows = pages.map(page => {
    const r = latest[page.url];
    return [page.url, page.files, r?.scannedAt, r?.finalUrl, r?.status, r?.responseTimeMs, r?.contentType, r?.error, r?.xRobotsTag,
      ...fieldKeys.map(key => r?.metadata?.fields[key]), r?.metadata?.alternates, r?.metadata?.h1, r?.metadata?.h1Count].map(cell).join(',');
  });
  // Nested arrays remain JSON inside CSV cells, preserving every duplicate and length.
  return '\uFEFF' + [headers.map(cell).join(','), ...rows].join('\r\n');
}

export function download(text: string, format: 'csv' | 'json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' }));
  const anchor = createEl('a');
  anchor.href = url;
  anchor.download = `seo-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
