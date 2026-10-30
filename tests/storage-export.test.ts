import { describe, expect, it } from 'vitest';
import { loadData, SaveQueue } from '../src/storage/audit-storage';
import { cleanSettings } from '../src/settings/settings';
import { exportCsv, exportJson } from '../src/export/export-service';
import { parseHtml } from '../src/parser/html-parser';
import { stringFieldKeys, type AuditResult, type PluginData } from '../src/types';

const result: AuditResult = { url: 'https://a.test', finalUrl: null, scannedAt: '2026-10-29T00:00:00Z', status: 200, responseTimeMs: 42, xRobotsTag: [], error: null, metadata: parseHtml('<title>=HYPERLINK("bad")</title><meta name="description" content="one"><meta name="description" content="two">') };
describe('storage', () => {
  it.each(stringFieldKeys)('round-trips %s strings and rejects invalid entries without migrating them', key => {
    const data = loadData(null);
    data.cache.latest[result.url] = { ...result, metadata: parseHtml('<link rel="canonical" href="https://fbfast.io"><link rel="canonical" href="/😀">') };
    data.cache.latest[result.url]!.metadata!.fields[key] = ['https://fbfast.io', '/😀', ''];
    expect(loadData(JSON.parse(JSON.stringify(data)))).toEqual(data);
    for (const canonical of [[{ value: 'https://fbfast.io', length: 17 }], [42], [null], 'https://fbfast.io']) {
      const bad = JSON.parse(JSON.stringify(data)) as PluginData;
      Object.assign(bad.cache.latest[result.url]!.metadata!.fields, { [key]: canonical });
      expect(() => loadData(bad)).toThrow(/cache/);
    }
  });
  it('defaults issue highlights to enabled and preserves an explicit disabled setting', () => {
    expect(cleanSettings(null).highlightIssues).toBe(true);
    expect(cleanSettings({ highlightIssues: false }).highlightIssues).toBe(false);
    expect(cleanSettings({ highlightIssues: 'false' }).highlightIssues).toBe(true);
  });
  it('validates independent length thresholds and keeps settings objects isolated', () => {
    const settings = cleanSettings({ lengthLimits: { title: 70, description: -1, 'og:title': 1.5, 'og:description': Infinity, 'twitter:title': '80', 'twitter:description': 250 } });
    expect(settings.lengthLimits).toEqual({ title: 70, description: 160, 'og:title': 60, 'og:description': 160, 'twitter:title': 70, 'twitter:description': 250, h1: 70 });
    settings.lengthLimits.title = 1;
    expect(cleanSettings(null).lengthLimits.title).toBe(60);
  });
  it('validates page size against the supported choices', () => {
    for (const pageSize of [25, 50, 100, 200, 500]) {
      expect(cleanSettings({ pageSize }).pageSize).toBe(pageSize);
    }
    for (const pageSize of [undefined, null, 0, -1, 75, 1000, Infinity, '100']) {
      expect(cleanSettings({ pageSize }).pageSize).toBe(50);
    }
  });
  it('separates settings/cache and validates versions/lengths without overwriting', () => {
    const data = loadData(null); data.cache.latest[result.url] = result;
    expect(loadData(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(() => loadData({ schemaVersion: 9 })).toThrow(/schema/);
    const bad = JSON.parse(JSON.stringify(data)) as PluginData; bad.cache.latest[result.url]!.metadata!.fields.title[0]!.length = 999;
    expect(() => loadData(bad)).toThrow(/cache/);
    expect(cleanSettings({ concurrency: 0, timeoutMs: Infinity, urlProperty: '', language: 'fr' })).toMatchObject({ concurrency: 1, timeoutMs: 30000, urlProperty: 'url', language: 'auto' });
  });
  it('serializes snapshots and recovers after a failed save', async () => {
    const snapshots: string[] = []; let first = true;
    const q = new SaveQueue(async data => { if (first) { first = false; throw new Error('disk'); } snapshots.push(data.settings.urlProperty); });
    const data = loadData(null); const one = q.save(data); data.settings.urlProperty = 'page'; const two = q.save(data);
    await expect(one).rejects.toThrow('disk'); await two;
    expect(snapshots).toEqual(['page']);
  });
});
it('exports every source, duplicate field and Unicode length as JSON and CSV', () => {
  const pages = [{ url: result.url, files: ['a.md', 'b.md'] }, { url: '=formula', files: [] }];
  const latest = { [result.url]: result };
  const json = JSON.parse(exportJson(pages, latest)) as { pages: { result: AuditResult | null }[] };
  expect(json.pages[0]?.result?.metadata?.fields.description).toHaveLength(2);
  expect(json.pages[1]?.result).toBeNull();
  const csv = exportCsv(pages, latest);
  expect(csv).toContain('"\'=formula"');
  expect(csv).toContain('b.md'); expect(csv).toContain('""length""'); expect(csv).toContain('HYPERLINK(\\""bad\\"")');
});
it.each(stringFieldKeys)('exports %s as string arrays in JSON and CSV', key => {
  const canonical = ['https://fbfast.io', '/😀?q="quoted"', 'https://fbfast.io'];
  const metadata = parseHtml('');
  metadata.fields[key] = canonical;
  const latest = { [result.url]: { ...result, metadata } };
  const pages = [{ url: result.url, files: [] }];
  const json = JSON.parse(exportJson(pages, latest)) as { pages: { result: AuditResult }[] };
  expect(json.pages[0]!.result.metadata!.fields[key]).toEqual(canonical);
  expect(exportCsv(pages, latest)).toContain(`"${JSON.stringify(canonical).replace(/"/g, '""')}"`);
});
