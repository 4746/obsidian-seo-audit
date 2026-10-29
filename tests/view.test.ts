import { afterEach, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { AuditView } from '../src/ui/audit-view';
import { loadData } from '../src/storage/audit-storage';
import { UrlIndex } from '../src/indexer/url-indexer';
import { translator } from '../src/i18n';
import { parseHtml } from '../src/parser/html-parser';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
async function setup(count = 2) {
  let listener = () => undefined as void;
  const data = loadData(null); const index = new UrlIndex();
  for (let i = 0; i < count; i++) index.update(`${i}.md`, `https://page${i}.test`);
  index.update('duplicate.md', 'https://page0.test');
  const scan = vi.fn(); const scheduleSave = vi.fn(); const openLinkText = vi.fn(); const openFile = vi.fn();
  const getFileByPath = vi.fn((path: string) => ({ path }));
  const plugin = { data, index, scan, scheduleSave, t: translator('en', 'en'), scanner: { progress: { running: false, total: 0, active: 0, completed: 0 }, stop: vi.fn() },
    subscribe: (callback: () => void) => { listener = callback; return () => { listener = () => undefined; }; }, reindex: vi.fn() };
  const view = new AuditView({ app: { vault: { getFileByPath }, workspace: { openLinkText, getLeaf: () => ({ openFile }) } } } as unknown as WorkspaceLeaf, plugin);
  await view.onOpen(); document.body.appendChild(view.contentEl);
  return { view, plugin, data, scan, scheduleSave, openLinkText, openFile, getFileByPath, notify: () => listener() };
}
it('paginates large indices and scans all/selected unique URLs', async () => {
  const s = await setup(120);
  expect(s.view.contentEl.querySelectorAll('tbody tr')).toHaveLength(50);
  const all = Array.from(s.view.contentEl.querySelectorAll('button')).find(b => b.textContent === 'Scan all')!;
  all.click(); expect(s.scan.mock.calls[0]?.[0]).toHaveLength(120);
  const check = s.view.contentEl.querySelector<HTMLInputElement>('tbody input')!; check.click();
  const selected = Array.from(s.view.contentEl.querySelectorAll('button')).find(b => b.textContent === 'Scan selected')!;
  selected.click(); expect(s.scan.mock.calls[1]?.[0]).toHaveLength(1);
  await s.view.onClose();
});
it('renders details as safe text with duplicates, all H1/alternates and lengths; opens all source files', async () => {
  const s = await setup();
  s.data.cache.latest['https://page0.test'] = { url: 'https://page0.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 404, responseTimeMs: 45, xRobotsTag: [{ value: 'noindex', length: 7 }], contentType: 'text/html', error: { kind: 'http', message: 'HTTP 404' }, metadata: parseHtml('<title>&lt;img onerror=bad()&gt;</title><meta name="description" content="one"><meta name="description" content="two"><h1>First 😀</h1><h1>Second</h1><link rel="alternate" hreflang="x-default" href="/">') };
  s.view.contentEl.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  const detail = s.view.contentEl.querySelector('.seo-audit-details')!;
  expect(detail.textContent).toContain('First 😀'); expect(detail.textContent).toContain('Second');
  expect(detail.textContent).toContain('x-default'); expect(detail.textContent).toContain('one'); expect(detail.textContent).toContain('two');
  expect(detail.textContent).toContain('Length (code points)'); expect(detail.querySelector('img')).toBeNull();
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
  const column = s.view.contentEl.querySelector<HTMLInputElement>('.seo-audit-column-choices input')!;
  column.click(); expect(s.scheduleSave).toHaveBeenCalled(); expect(s.data.settings.visibleColumns).not.toContain('url');
  s.data.cache.latest['https://page1.test'] = { url: 'https://page1.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 503, responseTimeMs: 1, xRobotsTag: [], contentType: null, error: { kind: 'http', message: 'HTTP 503' }, metadata: null };
  s.notify(); await vi.advanceTimersByTimeAsync(151);
  expect(Array.from(s.view.contentEl.querySelectorAll('select[aria-label="HTTP status"] option')).map(o => o.textContent)).toContain('503');
  await s.view.onClose();
});
it('opens literal filenames containing # and skips sources deleted since rendering', async () => {
  const s = await setup();
  s.plugin.index.update('SEO #1.md', 'https://page0.test');
  s.view.contentEl.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  const source = Array.from(s.view.contentEl.querySelectorAll<HTMLAnchorElement>('.seo-audit-details .seo-audit-file')).find(a => a.textContent === 'SEO #1.md')!;
  source.click();
  expect(s.openFile).toHaveBeenCalledWith({ path: 'SEO #1.md' });
  s.getFileByPath.mockReturnValueOnce(null as unknown as { path: string });
  source.click(); expect(s.openFile).toHaveBeenCalledTimes(1); expect(s.openLinkText).not.toHaveBeenCalled();
  await s.view.onClose();
});
