import { expect, it } from 'vitest';
import { filterPages, type TableFilter } from '../src/ui/audit-table';
import { translator } from '../src/i18n';
import { parseHtml } from '../src/parser/html-parser';
import type { AuditResult } from '../src/types';
const pages = [{ url: 'https://a.test', files: ['Folder/One.md', 'Two.md'] }, { url: 'https://b.test', files: ['Three.md'] }, { url: 'https://c.test', files: ['Four.md'] }];
const result: AuditResult = { url: pages[0]!.url, finalUrl: null, status: 200, responseTimeMs: 10, scannedAt: new Date().toISOString(), contentType: 'text/html', metadata: parseHtml('<title>Unique 😀</title><meta name="description" content=""><h1>Heading</h1>'), xRobotsTag: [], error: null };
const latest = { [pages[0]!.url]: result, [pages[1]!.url]: { ...result, url: pages[1]!.url, status: 404, responseTimeMs: 2, metadata: parseHtml(''), error: { kind: 'http' as const, message: 'HTTP 404' } } };
const base: TableFilter = { search: '', status: 'any', field: 'title', presence: 'any', sort: 'url', descending: false };
it('searches all field values and source paths', () => {
  for (const search of ['folder/one', 'unique 😀', 'heading', 'two.md']) expect(filterPages(pages, latest, { ...base, search }).map(p => p.url)).toEqual([pages[0]!.url]);
});
it('filters status, unscanned, errors and metadata presence including empty values', () => {
  expect(filterPages(pages, latest, { ...base, status: '404' })).toEqual([pages[1]]);
  expect(filterPages(pages, latest, { ...base, status: '4xx' })).toEqual([pages[1]]);
  expect(filterPages(pages, latest, { ...base, status: 'unscanned' })).toEqual([pages[2]]);
  expect(filterPages(pages, latest, { ...base, status: 'errors' })).toEqual([pages[1]]);
  expect(filterPages(pages, latest, { ...base, presence: 'present' })).toEqual([pages[0]]);
  expect(filterPages(pages, latest, { ...base, field: 'description', presence: 'missing' })).toHaveLength(2);
});
it('sorts numeric columns numerically and puts unscanned last', () => {
  expect(filterPages(pages, latest, { ...base, sort: 'responseTimeMs' })).toEqual([pages[1], pages[0], pages[2]]);
});
it('uses Obsidian locale, manual override and English fallback', () => {
  expect(translator('auto', 'uk-UA')('stop')).toBe('Зупинити');
  expect(translator('en', 'uk')('stop')).toBe('Stop');
  expect(translator('auto', 'de')('stop')).toBe('Stop');
});
