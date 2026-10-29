import { afterEach, expect, it, vi } from 'vitest';
import { Menu, type WorkspaceLeaf } from 'obsidian';
import { Menu as MockMenu } from './obsidian-mock';
import { AuditView } from '../src/ui/audit-view';
import { AuditDetailsView } from '../src/ui/audit-details-view';
import { loadData } from '../src/storage/audit-storage';
import { UrlIndex } from '../src/indexer/url-indexer';
import { translator } from '../src/i18n';
import { parseHtml } from '../src/parser/html-parser';
import { lengthFields } from '../src/types';

function menuFor(view: AuditView) {
  const menu = new Menu(); view.onPaneMenu(menu, 'more-options');
  return menu as unknown as MockMenu;
}
function openFilters(view: AuditView): HTMLElement {
  view.contentEl.querySelector<HTMLButtonElement>('.seo-audit-filter-button')!.click();
  return document.querySelector<HTMLElement>('.seo-audit-filters')!;
}
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
async function setup(count = 2) {
  const listeners = new Set<() => void>();
  const data = loadData(null); const index = new UrlIndex();
  for (let i = 0; i < count; i++) index.update(`${i}.md`, `https://page${i}.test`);
  index.update('duplicate.md', 'https://page0.test');
  const scan = vi.fn(); const scheduleSave = vi.fn(); const openLinkText = vi.fn(); const openFile = vi.fn();
  const getFileByPath = vi.fn((path: string) => ({ path }));
  const openDetails = vi.fn((url: string) => { detailsView.setPage(url); document.body.appendChild(detailsView.contentEl); });
  const plugin = { data, index, scan, scheduleSave, openDetails, t: translator('en', 'en'), scanner: { progress: { running: false, total: 0, active: 0, completed: 0 }, stop: vi.fn() },
    subscribe: (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; }, reindex: vi.fn() };
  const detach = vi.fn();
  const leaf = { app: { vault: { getFileByPath }, workspace: { openLinkText, getLeaf: () => ({ openFile }) } }, detach } as unknown as WorkspaceLeaf;
  const detailsView = new AuditDetailsView(leaf, plugin);
  await detailsView.onOpen();
  const view = new AuditView(leaf, plugin);
  await view.onOpen(); document.body.appendChild(view.contentEl);
  return { view, detailsView, detach, plugin, data, scan, scheduleSave, openLinkText, openFile, getFileByPath, notify: () => { for (const listener of listeners) listener(); } };
}
it('paginates large indices and scans all/selected unique URLs', async () => {
  const s = await setup(120);
  const selection = s.view.contentEl.querySelector<HTMLElement>('.seo-audit-selection-count')!;
  expect(selection.hidden).toBe(true);
  expect(s.view.contentEl.querySelector('progress')).toBeNull();
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(50);
  const all = menuFor(s.view).items.find(item => item.title === 'Scan all')!;
  all.action(); expect(s.scan.mock.calls[0]?.[0]).toHaveLength(120);
  const check = s.view.contentEl.querySelector<HTMLInputElement>('tbody input')!; check.click();
  expect(selection.hidden).toBe(false);
  expect(selection.textContent).toBe('1 selected');
  const selected = menuFor(s.view).items.find(item => item.title === 'Scan selected')!;
  selected.action(); expect(s.scan.mock.calls[1]?.[0]).toHaveLength(1);
  await s.view.onClose();
});
it('renders details as safe text with duplicates, all H1/alternates and lengths; opens all source files', async () => {
  const s = await setup();
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 404, responseTimeMs: 45, xRobotsTag: [{ value: 'noindex', length: 7 }], error: { kind: 'http', message: 'HTTP 404' }, metadata: parseHtml('<title>&lt;img onerror=bad()&gt;</title><meta name="description" content="one"><meta name="description" content="two"><h1>First 😀</h1><h1>Second</h1><link rel="alternate" hreflang="x-default" href="/">') };
  vi.useFakeTimers(); s.notify(); await vi.advanceTimersByTimeAsync(151);
  s.view.contentEl.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  const detail = document.querySelector('.seo-audit-details')!;
  expect(detail.textContent).toContain('First 😀'); expect(detail.textContent).toContain('Second');
  expect(detail.textContent).toContain('x-default'); expect(detail.textContent).toContain('one'); expect(detail.textContent).toContain('two');
  expect(detail.textContent).toContain('Characters'); expect(detail.querySelector('img')).toBeNull();
  expect(detail.querySelectorAll('.seo-audit-file')).toHaveLength(2);
  detail.querySelector<HTMLAnchorElement>('.seo-audit-file')!.click(); expect(s.openFile).toHaveBeenCalledWith({ path: '0.md' });
  expect(s.view.contentEl.querySelector('.seo-audit-error-row')).not.toBeNull();
  await s.view.onClose();
});
it('debounces search, saves column choices and updates exact status options after scans', async () => {
  vi.useFakeTimers(); const s = await setup();
  const input = openFilters(s.view).querySelector<HTMLInputElement>('input[type="search"]')!;
  input.value = 'page1'; input.dispatchEvent(new Event('input')); await vi.advanceTimersByTimeAsync(201);
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(s.view.contentEl.querySelector('.seo-audit-column-choices')).toBeNull();
  menuFor(s.view).items.find(item => item.title === 'Settings')!.action();
  const column = document.querySelector<HTMLInputElement>('.seo-audit-column-choices input')!;
  column.click(); expect(s.scheduleSave).toHaveBeenCalled(); expect(s.data.settings.visibleColumns).not.toContain('files');
  expect(s.data.settings.visibleColumns).toContain('url');
  s.data.cache.latest['https://page1.test'] = { url: 'https://page1.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 503, responseTimeMs: 1, xRobotsTag: [], error: { kind: 'http', message: 'HTTP 503' }, metadata: null };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(Array.from(document.querySelectorAll('select[aria-label="HTTP status"] option')).map(o => o.textContent)).toContain('503');
  await s.view.onClose();
});
it('opens literal filenames containing # and skips sources deleted since rendering', async () => {
  const s = await setup();
  s.plugin.index.update('SEO #1.md', 'https://page0.test');
  s.view.contentEl.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  const source = Array.from(document.querySelectorAll<HTMLAnchorElement>('.seo-audit-details .seo-audit-file')).find(a => a.textContent === 'SEO #1.md')!;
  source.click();
  expect(s.openFile).toHaveBeenCalledWith({ path: 'SEO #1.md' });
  s.getFileByPath.mockReturnValueOnce(null as unknown as { path: string });
  source.click(); expect(s.openFile).toHaveBeenCalledTimes(1); expect(s.openLinkText).not.toHaveBeenCalled();
  await s.view.onClose();
});

it('disables unavailable scan actions in the pane menu', async () => {
  const s = await setup();
  const disabled = (title: string) => menuFor(s.view).items.find(item => item.title === title)!.disabled;
  expect(disabled('Scan all')).toBe(false);
  expect(disabled('Scan selected')).toBe(true);
  expect(disabled('Stop')).toBe(true);
  s.plugin.scanner.progress.running = true;
  expect(disabled('Scan all')).toBe(true);
  expect(disabled('Scan selected')).toBe(true);
  expect(disabled('Stop')).toBe(false);
  menuFor(s.view).items.find(item => item.title === 'Stop')!.action();
  expect(s.plugin.scanner.stop).toHaveBeenCalledOnce();
  expect(Array.from(s.view.contentEl.querySelectorAll('button')).map(button => button.textContent)).not.toContain('Scan all');
  menuFor(s.view).items.find(item => item.title === 'Settings')!.action();
  expect(document.querySelector('.seo-audit-column-choices')).not.toBeNull();
  await s.view.onClose();
  expect(document.querySelector('.seo-audit-column-choices')).toBeNull();
});

it('keeps URL visible, copies it without selecting a row and preserves rows on detail clicks', async () => {
  const s = await setup();
  s.data.settings.visibleColumns = ['status'];
  s.data.settings.urlProperty = 'published';
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.useFakeTimers(); s.notify(); await vi.advanceTimersByTimeAsync(151);
  const row = s.view.contentEl.querySelector<HTMLTableRowElement>('tbody tr')!;
  const table = row.closest('table');
  expect(table!.querySelector('thead')!.textContent).toContain('published');
  row.querySelector<HTMLButtonElement>('.seo-audit-copy')!.click();
  expect(writeText).toHaveBeenCalledWith('https://page0.test');
  expect(document.querySelector('.seo-audit-details')).toBeNull();
  row.click();
  expect(s.view.contentEl.querySelector('table')).toBe(table);
  expect(row.classList.contains('is-selected')).toBe(true);
  expect(document.querySelector('.seo-audit-details')!.textContent).toContain('Not scanned');
  menuFor(s.view).items.find(item => item.title === 'Settings')!.action();
  expect(Array.from(document.querySelectorAll('.seo-audit-column-choices label')).map(label => label.textContent)).not.toContain('URL');
  await s.view.onClose();
});
it('keeps both pagination controls in sync', async () => {
  const s = await setup(120);
  const navs = () => s.view.contentEl.querySelectorAll<HTMLElement>('.seo-audit-pagination');
  expect(navs()).toHaveLength(2);
  navs()[1]!.querySelectorAll('button')[1]!.click();
  for (const nav of navs()) expect(nav.textContent).toContain('Page 2 of 3');
  expect(s.view.contentEl.querySelector('tbody tr a')!.textContent).toBeTruthy();
  navs()[0]!.querySelectorAll('button')[0]!.click();
  for (const nav of navs()) expect(nav.textContent).toContain('Page 1 of 3');
  await s.view.onClose();
});

it('preserves native horizontal scrolling through progress and result updates', async () => {
  vi.useFakeTimers();
  const s = await setup();
  const wrap = s.view.contentEl.querySelector<HTMLElement>('.seo-audit-table-scroll')!;
  const row = wrap.querySelector('tbody tr');
  s.view.contentEl.scrollLeft = 240;
  s.plugin.scanner.progress.active = 1;
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(wrap.querySelector('tbody tr')).toBe(row);
  expect(s.view.contentEl.scrollLeft).toBe(240);
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 1, xRobotsTag: [], error: null, metadata: null };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(s.view.contentEl.querySelector('.seo-audit-table-scroll')).toBe(wrap);
  expect(s.view.contentEl.scrollLeft).toBe(240);
  expect(wrap.textContent).toContain('200');
  const wheel = new WheelEvent('wheel', { deltaX: 100, bubbles: true, cancelable: true });
  wrap.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  await s.view.onClose();
});

it('does not create hover tooltips in the audit table', async () => {
  const s = await setup();
  expect(s.view.contentEl.querySelector('.seo-audit-table tbody tr[aria-label]')).toBeNull();
  expect(s.view.contentEl.querySelector('.seo-audit-table [title], .seo-audit-table [data-tooltip]')).toBeNull();
  expect(s.view.contentEl.querySelector('.seo-audit-copy')!.getAttribute('aria-label')).toBe('Copy URL');
  await s.view.onClose();
});

it('opens details outside the table and reuses the sidebar for another row', async () => {
  const s = await setup();
  const rows = s.view.contentEl.querySelectorAll<HTMLTableRowElement>('tbody tr');
  rows[0]!.click();
  expect(s.plugin.openDetails).toHaveBeenLastCalledWith('https://page0.test');
  expect(s.view.contentEl.querySelector('.seo-audit-details')).toBeNull();
  rows[1]!.click();
  expect(document.querySelectorAll('.seo-audit-details')).toHaveLength(1);
  expect(s.detailsView.contentEl.textContent).toContain('https://page1.test');
  s.detailsView.contentEl.querySelector<HTMLButtonElement>('.seo-audit-detail-close')!.click();
  expect(s.detach).toHaveBeenCalledOnce();
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('keeps accordion choices across result updates and uses an icon to close details', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 1, xRobotsTag: [], error: null, metadata: parseHtml('<title>Hello 😀</title>') };
  s.detailsView.setPage('https://page0.test');
  const host = s.detailsView.contentEl;
  const close = host.querySelector<HTMLButtonElement>('.seo-audit-detail-close')!;
  expect(close.textContent).toBe('');
  expect(close.getAttribute('aria-label')).toBe('Close details');
  expect(close.dataset.icon).toBe('x');
  expect(host.querySelectorAll('details')).toHaveLength(6);
  expect(host.textContent).toContain('Characters: 7');
  expect(host.textContent).not.toContain('code points');
  host.querySelector<HTMLDetailsElement>('[data-section="seo"]')!.open = false;
  host.querySelector<HTMLDetailsElement>('[data-section="og"]')!.open = true;
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(host.querySelector<HTMLDetailsElement>('[data-section="seo"]')!.open).toBe(false);
  expect(host.querySelector<HTMLDetailsElement>('[data-section="og"]')!.open).toBe(true);
  s.detailsView.setPage('https://page1.test');
  s.detailsView.setPage('https://page0.test');
  expect(host.querySelector<HTMLDetailsElement>('[data-section="seo"]')!.open).toBe(true);
  expect(host.querySelector<HTMLDetailsElement>('[data-section="og"]')!.open).toBe(false);
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('scans only the sidebar page and offers refresh after results arrive', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.detailsView.setPage('https://page1.test');
  const host = s.detailsView.contentEl;
  const scanButton = () => host.querySelector<HTMLButtonElement>('.seo-audit-detail-scan')!;
  expect(host.querySelector('.seo-audit-detail-empty')!.textContent).toContain('Not scanned');
  expect(scanButton().dataset.tooltip).toBe('Scan page');
  expect(scanButton().textContent).toBe('');
  expect(s.scan).not.toHaveBeenCalled();
  scanButton().click();
  scanButton().click();
  expect(s.scan).toHaveBeenCalledExactlyOnceWith(['https://page1.test']);
  expect(scanButton().disabled).toBe(true);
  s.plugin.scanner.progress.running = true;
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(scanButton().disabled).toBe(true);
  expect(scanButton().dataset.tooltip).toBe('Scan in progress');
  s.data.cache.latest['https://page1.test'] = { url: 'https://page1.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 1, xRobotsTag: [], error: null, metadata: parseHtml('<title>Updated page</title>') };
  s.plugin.scanner.progress.running = false;
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(host.querySelector('.seo-audit-detail-empty')).toBeNull();
  expect(scanButton().disabled).toBe(false);
  expect(scanButton().dataset.tooltip).toBe('Refresh page data');
  expect(scanButton().dataset.icon).toBe('refresh-cw');
  scanButton().click();
  expect(s.scan).toHaveBeenNthCalledWith(2, ['https://page1.test']);
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('shows comma-separated language codes with URL tooltips and keeps alternate URLs searchable', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.data.settings.visibleColumns = ['alternates'];
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 1, xRobotsTag: [], error: null, metadata: parseHtml('<link rel="alternate" hreflang="de" href="https://example.test/de"><link rel="alternate" hreflang="uk" href="https://example.test/uk"><link rel="alternate" hreflang="de" href="https://example.test/de/other">') };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  const codes = s.view.contentEl.querySelectorAll<HTMLElement>('.seo-audit-language-code');
  expect(Array.from(codes).map(code => code.textContent)).toEqual(['de', 'uk']);
  expect(codes[0]!.parentElement!.textContent).toBe('de, uk');
  expect(codes[0]!.dataset.tooltip).toBe('https://example.test/de\nhttps://example.test/de/other');
  expect(codes[1]!.dataset.tooltip).toBe('https://example.test/uk');
  const search = openFilters(s.view).querySelector<HTMLInputElement>('input[type="search"]')!;
  search.value = 'example.test/de/other'; search.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(201);
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(1);
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('applies and saves page size choices from table settings and resets pagination', async () => {
  const s = await setup(120);
  s.view.contentEl.querySelector('.seo-audit-pagination')!.querySelectorAll('button')[1]!.click();
  expect(s.view.contentEl.querySelector('.seo-audit-pagination')!.textContent).toContain('Page 2 of 3');
  menuFor(s.view).items.find(item => item.title === 'Settings')!.action();
  const size = document.querySelector<HTMLSelectElement>('select[aria-label="Rows per page"]')!;
  expect(size.value).toBe('50');
  expect(Array.from(size.options).map(option => option.value)).toEqual(['25', '50', '100', '200', '500']);
  for (const value of [25, 50, 100, 200, 500]) {
    size.value = String(value); size.dispatchEvent(new Event('change'));
    expect(s.data.settings.pageSize).toBe(value);
    expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(Math.min(value, 120));
    for (const nav of s.view.contentEl.querySelectorAll('.seo-audit-pagination')) {
      expect(nav.textContent).toContain(`Page 1 of ${Math.ceil(120 / value)}`);
    }
  }
  expect(s.scheduleSave).toHaveBeenCalledTimes(5);
  expect(loadData(JSON.parse(JSON.stringify(s.data))).settings.pageSize).toBe(500);
  await s.view.onClose();
  await s.detailsView.onClose();
});

it.each(['Scan selected', 'Scan all'])('clears scanned checkboxes after %s finishes, including fast scans', async action => {
  vi.useFakeTimers();
  const s = await setup();
  const checks = () => s.view.contentEl.querySelectorAll<HTMLInputElement>('tbody input');
  checks()[0]!.click();
  s.scan.mockImplementation(() => {
    Object.assign(s.plugin.scanner.progress, { running: true, total: action === 'Scan all' ? 2 : 1, completed: 0 });
    s.notify();
  });
  menuFor(s.view).items.find(item => item.title === action)!.action();
  expect(checks()[0]!.checked).toBe(true);
  checks()[1]!.click();
  Object.assign(s.plugin.scanner.progress, { running: false, completed: s.plugin.scanner.progress.total });
  s.notify();
  await vi.advanceTimersByTimeAsync(151);
  expect(checks()[0]!.checked).toBe(false);
  expect(checks()[1]!.checked).toBe(true);
  expect(s.view.contentEl.querySelector<HTMLInputElement>('thead input')!.indeterminate).toBe(true);
  expect(s.view.contentEl.querySelector('.seo-audit-selection-count')!.textContent).toBe('1 selected');
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('keeps selected pages when a scan is stopped before completion', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.view.contentEl.querySelector<HTMLInputElement>('tbody input')!.click();
  s.scan.mockImplementation(() => {
    Object.assign(s.plugin.scanner.progress, { running: true, total: 1, completed: 0 });
    s.notify();
  });
  menuFor(s.view).items.find(item => item.title === 'Scan selected')!.action();
  s.plugin.scanner.progress.running = false;
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(s.view.contentEl.querySelector<HTMLInputElement>('tbody input')!.checked).toBe(true);
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('opens filters in a popup, preserves choices on reopening and applies pending search on close', async () => {
  vi.useFakeTimers();
  const s = await setup(120);
  s.data.settings.urlProperty = 'published_url';
  expect(s.view.contentEl.querySelector('input[type="search"], select')).toBeNull();
  s.view.contentEl.querySelector('.seo-audit-pagination')!.querySelectorAll('button')[1]!.click();
  const popup = openFilters(s.view);
  const field = popup.querySelector<HTMLSelectElement>('select[aria-label="Metadata filter"]')!;
  expect(field.value).toBe('url');
  expect(field.selectedOptions[0]!.textContent).toBe('published_url');
  expect(field.closest('.seo-audit-filter-search-group')!.querySelector('input[type="search"]')).not.toBeNull();
  const status = popup.querySelector<HTMLSelectElement>('select[aria-label="HTTP status"]')!;
  status.value = 'unscanned'; status.dispatchEvent(new Event('change'));
  expect(s.view.contentEl.querySelector('.seo-audit-pagination')!.textContent).toContain('Page 1 of 3');
  const search = popup.querySelector<HTMLInputElement>('input[type="search"]')!;
  search.value = 'page119'; search.dispatchEvent(new Event('input'));
  const reopened = openFilters(s.view);
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(reopened.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('page119');
  expect(reopened.querySelector<HTMLSelectElement>('select[aria-label="HTTP status"]')!.value).toBe('unscanned');
  s.plugin.t = translator('uk', 'en');
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(reopened.getAttribute('aria-label')).toBe('Фільтри');
  expect(reopened.querySelector('select[aria-label="HTTP-статус"]')).not.toBeNull();
  await s.detailsView.onClose();
  await s.view.onClose();
  expect(document.querySelector('.seo-audit-filters')).toBeNull();
});

it('clears filters and pending search while keeping table sorting', async () => {
  vi.useFakeTimers();
  const s = await setup(120);
  const popup = openFilters(s.view);
  const change = (label: string, value: string) => {
    const select = popup.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    select.value = value; select.dispatchEvent(new Event('change'));
  };
  change('HTTP status', 'errors');
  change('Metadata filter', 'title');
  change('Value presence', 'missing');
  const search = popup.querySelector<HTMLInputElement>('input[type="search"]')!;
  search.value = 'page119'; search.dispatchEvent(new Event('input'));
  Array.from(popup.querySelectorAll('button')).find(button => button.textContent === 'Clear filter')!.click();
  expect(popup.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
  expect(popup.querySelector<HTMLSelectElement>('select[aria-label="HTTP status"]')!.value).toBe('any');
  expect(popup.querySelector<HTMLSelectElement>('select[aria-label="Metadata filter"]')!.value).toBe('url');
  expect(popup.querySelector<HTMLSelectElement>('select[aria-label="Value presence"]')!.value).toBe('any');
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(50);
  await vi.advanceTimersByTimeAsync(201);
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(50);
  expect(s.view.contentEl.querySelector('.seo-audit-pagination')!.textContent).toContain('Page 1 of 3');
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('highlights each overlong field and updates table and detail counts when thresholds change', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.data.settings.visibleColumns = [...lengthFields];
  for (const field of lengthFields) s.data.settings.lengthLimits[field] = 5;
  const html = '<title>12345</title><title>😀😀😀😀😀😀</title><h1>😀😀😀😀😀😀</h1>' + lengthFields.filter(field => field !== 'title' && field !== 'h1').map(field => `<meta name="${field}" content="😀😀😀😀😀😀">`).join('');
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 1, xRobotsTag: [], error: null, metadata: parseHtml(html) };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(s.view.contentEl.querySelectorAll('td.seo-audit-length-error')).toHaveLength(lengthFields.length);
  s.view.contentEl.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  const details = s.detailsView.contentEl;
  expect(details.querySelectorAll('.seo-audit-detail-value.seo-audit-length-error')).toHaveLength(lengthFields.length);
  expect(details.textContent).toContain('Characters: 6 / 5');
  expect(details.querySelector('.seo-audit-detail-value:not(.seo-audit-length-error)')!.textContent).toContain('Characters: 5 / 5');
  for (const field of lengthFields) s.data.settings.lengthLimits[field] = 6;
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(s.view.contentEl.querySelectorAll('td.seo-audit-length-error')).toHaveLength(0);
  expect(details.querySelectorAll('.seo-audit-length-error')).toHaveLength(0);
  expect(details.textContent).toContain('Characters: 6 / 6');
  expect(s.scan).not.toHaveBeenCalled();
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('toggles table issue highlights without changing values or sidebar highlights', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 404, responseTimeMs: 1, xRobotsTag: [], error: { kind: 'http', message: 'HTTP 404' }, metadata: parseHtml(`<title>${'x'.repeat(61)}</title>`) };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  s.view.contentEl.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  expect(s.view.contentEl.querySelector('.seo-audit-length-error')).not.toBeNull();
  expect(s.view.contentEl.querySelector('.seo-audit-error-row')).not.toBeNull();
  menuFor(s.view).items.find(item => item.title === 'Settings')!.action();
  const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Highlight errors and warnings"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  toggle.click();
  expect(s.data.settings.highlightIssues).toBe(false);
  expect(s.view.contentEl.querySelector('.seo-audit-length-error, .seo-audit-error-row, .seo-audit-error, .seo-audit-missing')).toBeNull();
  expect(s.view.contentEl.textContent).toContain('404');
  expect(s.detailsView.contentEl.querySelector('.seo-audit-length-error')).not.toBeNull();
  expect(loadData(JSON.parse(JSON.stringify(s.data))).settings.highlightIssues).toBe(false);
  toggle.click();
  expect(s.view.contentEl.querySelector('.seo-audit-length-error')).not.toBeNull();
  expect(s.view.contentEl.querySelector('.seo-audit-error-row')).not.toBeNull();
  expect(s.scheduleSave).toHaveBeenCalledTimes(2);
  await s.detailsView.onClose();
  await s.view.onClose();
});

it('renders alternates as a table with duplicate languages and safe links', async () => {
  const s = await setup();
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 1, xRobotsTag: [], error: null, metadata: parseHtml('<link rel="alternate" hreflang="de" href="https://other.test/de"><link rel="alternate" hreflang="de" href="/de/other"><link rel="alternate" hreflang="x-default" href="/"><link rel="alternate" hreflang="bad" href="javascript:alert(1)"><link rel="alternate" hreflang="invalid" href="http://">') };
  s.detailsView.setPage('https://page0.test');
  const table = s.detailsView.contentEl.querySelector<HTMLTableElement>('.seo-audit-alternates-table')!;
  expect(Array.from(table.querySelectorAll('th')).map(header => header.textContent)).toEqual(['Language code', 'URL']);
  expect(table.querySelectorAll('tbody tr')).toHaveLength(5);
  expect(Array.from(table.querySelectorAll('.seo-audit-alternate-code')).map(code => code.textContent)).toEqual(['de', 'de', 'x-default', 'bad', 'invalid']);
  const links = table.querySelectorAll('a');
  expect(links).toHaveLength(3);
  expect(links[1]!.textContent).toBe('/de/other');
  expect(links[1]!.href).toBe('https://page0.test/de/other');
  expect(links[1]!.rel).toBe('noopener noreferrer');
  expect(table.textContent).toContain('javascript:alert(1)');
  expect(table.querySelector('a[href^="javascript:"]')).toBeNull();
  await s.detailsView.onClose();
  await s.view.onClose();
});
