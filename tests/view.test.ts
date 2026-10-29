import { afterEach, expect, it, vi } from 'vitest';
import { Menu, type WorkspaceLeaf } from 'obsidian';
import { Menu as MockMenu } from './obsidian-mock';
import { AuditView } from '../src/ui/audit-view';
import { AuditDetailsView } from '../src/ui/audit-details-view';
import { loadData } from '../src/storage/audit-storage';
import { UrlIndex } from '../src/indexer/url-indexer';
import { translator } from '../src/i18n';
import { parseHtml } from '../src/parser/html-parser';

function menuFor(view: AuditView) {
  const menu = new Menu(); view.onPaneMenu(menu, 'more-options');
  return menu as unknown as MockMenu;
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
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(50);
  const all = menuFor(s.view).items.find(item => item.title === 'Scan all')!;
  all.action(); expect(s.scan.mock.calls[0]?.[0]).toHaveLength(120);
  const check = s.view.contentEl.querySelector<HTMLInputElement>('tbody input')!; check.click();
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
  const input = s.view.contentEl.querySelector<HTMLInputElement>('input[type="search"]')!;
  input.value = 'page1'; input.dispatchEvent(new Event('input')); await vi.advanceTimersByTimeAsync(201);
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(s.view.contentEl.querySelector('.seo-audit-column-choices')).toBeNull();
  menuFor(s.view).items.find(item => item.title === 'Settings')!.action();
  const column = document.querySelector<HTMLInputElement>('.seo-audit-column-choices input')!;
  column.click(); expect(s.scheduleSave).toHaveBeenCalled(); expect(s.data.settings.visibleColumns).not.toContain('files');
  expect(s.data.settings.visibleColumns).toContain('url');
  s.data.cache.latest['https://page1.test'] = { url: 'https://page1.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 503, responseTimeMs: 1, xRobotsTag: [], error: { kind: 'http', message: 'HTTP 503' }, metadata: null };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(Array.from(s.view.contentEl.querySelectorAll('select[aria-label="HTTP status"] option')).map(o => o.textContent)).toContain('503');
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
  wrap.scrollLeft = 240;
  s.plugin.scanner.progress.active = 1;
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(wrap.querySelector('tbody tr')).toBe(row);
  expect(wrap.scrollLeft).toBe(240);
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 1, xRobotsTag: [], error: null, metadata: null };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(s.view.contentEl.querySelector('.seo-audit-table-scroll')).toBe(wrap);
  expect(wrap.scrollLeft).toBe(240);
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
  s.detailsView.contentEl.querySelector('button')!.click();
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
