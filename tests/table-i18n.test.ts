import { expect, it } from 'vitest';
import { columnValue, filterPages, type TableFilter } from '../src/ui/audit-table';
import { translator } from '../src/i18n';
import { parseHtml } from '../src/parser/html-parser';
import { stringFieldKeys, type AuditResult } from '../src/types';
const pages = [{ url: 'https://a.test', files: ['Folder/One.md', 'Two.md'] }, { url: 'https://b.test', files: ['Three.md'] }, { url: 'https://c.test', files: ['Four.md'] }];
const result: AuditResult = { url: pages[0]!.url, finalUrl: null, status: 200, responseTimeMs: 10, scannedAt: new Date().toISOString(), metadata: parseHtml('<title>Unique 😀</title><meta name="description" content=""><h1>Heading</h1>'), xRobotsTag: [], error: null };
const latest = { [pages[0]!.url]: result, [pages[1]!.url]: { ...result, url: pages[1]!.url, status: 404, responseTimeMs: 2, metadata: parseHtml(''), error: { kind: 'http' as const, message: 'HTTP 404' } } };
const base: TableFilter = { search: '', status: 'any', language: 'any', field: 'title', presence: 'any', sort: 'url', descending: false };
it('filters page languages case-insensitively without merging regional tags or unscanned pages', () => {
  const indexed = Array.from({ length: 6 }, (_, i) => ({ url: `https://page${i}.test`, files: [] }));
  const scanned: Record<string, AuditResult> = Object.fromEntries([' EN ', 'en-GB', '', null].map((lang, i) => [indexed[i]!.url, { ...result, url: indexed[i]!.url, metadata: { ...parseHtml(''), lang } }]));
  scanned[indexed[4]!.url] = { ...result, url: indexed[4]!.url, metadata: null };
  expect(filterPages(indexed, scanned, { ...base, language: 'lang:en' })).toEqual([indexed[0]]);
  expect(filterPages(indexed, scanned, { ...base, language: 'lang:en-gb' })).toEqual([indexed[1]]);
  expect(filterPages(indexed, scanned, { ...base, language: 'missing' })).toEqual([indexed[2], indexed[3]]);
  expect(filterPages(indexed, scanned, base)).toEqual(indexed);
  expect(columnValue(indexed[0]!, scanned[indexed[0]!.url], 'lang')).toBe(' EN ');
  expect(filterPages(indexed, scanned, { ...base, search: 'en-gb' })).toEqual([indexed[1]]);
  expect(filterPages(indexed, scanned, { ...base, sort: 'lang' }).slice(-2)).toEqual([indexed[4], indexed[5]]);
});
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
it('filters URL presence for indexed pages even before scanning', () => {
  expect(filterPages(pages, latest, { ...base, field: 'url', presence: 'present' })).toEqual(pages);
  expect(filterPages(pages, latest, { ...base, field: 'url', presence: 'missing' })).toEqual([]);
});
it('sorts numeric columns numerically and puts unscanned last', () => {
  expect(filterPages(pages, latest, { ...base, sort: 'responseTimeMs' })).toEqual([pages[1], pages[0], pages[2]]);
});
it('uses Obsidian locale, manual override and English fallback', () => {
  expect(translator('auto', 'uk-UA')('stop')).toBe('Зупинити');
  expect(translator('en', 'uk')('stop')).toBe('Stop');
  expect(translator('auto', 'de')('stop')).toBe('Stop');
});
it.each(stringFieldKeys)('searches, sorts and filters %s strings, including empty and missing values', key => {
  const scanned = {
    [pages[0]!.url]: { ...result, metadata: parseHtml('<link rel="canonical" href="https://z.test/😀">') },
    [pages[1]!.url]: { ...result, url: pages[1]!.url, metadata: parseHtml('<link rel="canonical" href="  ">') },
  };
  scanned[pages[0]!.url]!.metadata.fields.canonical = [];
  scanned[pages[0]!.url]!.metadata.fields[key] = ['https://z.test/😀'];
  scanned[pages[1]!.url]!.metadata.fields[key] = ['  '];
  expect(filterPages(pages, scanned, { ...base, search: 'z.test/😀' })).toEqual([pages[0]]);
  expect(filterPages(pages, scanned, { ...base, field: key, presence: 'present' })).toEqual([pages[0]]);
  expect(filterPages(pages, scanned, { ...base, field: key, presence: 'missing' })).toEqual([pages[1]]);
  expect(filterPages(pages, scanned, { ...base, sort: key })).toEqual([pages[1], pages[0], pages[2]]);
});
