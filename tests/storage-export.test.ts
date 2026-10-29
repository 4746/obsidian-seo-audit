import { describe, expect, it } from 'vitest';
import { loadData, SaveQueue } from '../src/storage/audit-storage';
import { cleanSettings } from '../src/settings/settings';
import { exportCsv, exportJson } from '../src/export/export-service';
import { parseHtml } from '../src/parser/html-parser';
import type { AuditResult, PluginData } from '../src/types';

const result: AuditResult = { url: 'https://a.test', finalUrl: null, scannedAt: '2026-10-29T00:00:00Z', status: 200, responseTimeMs: 42, xRobotsTag: [], error: null, metadata: parseHtml('<title>=HYPERLINK("bad")</title><meta name="description" content="one"><meta name="description" content="two">') };
describe('storage', () => {
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
