import { afterEach, expect, it, vi } from 'vitest';
import type { App, Plugin } from 'obsidian';
import { TFile } from 'obsidian';
import { VaultUrlIndexer } from '../src/indexer/url-indexer';
import { AuditStorage, loadData } from '../src/storage/audit-storage';
import { normalizeUrl } from '../src/utils/normalize-url';
import type { PluginData } from '../src/types';

afterEach(() => vi.useRealTimers());

it('persists clearing after a pending write and retains settings', async () => {
  vi.useFakeTimers();
  const data = loadData(null);
  data.settings.urlProperty = 'published';
  data.cache.latest['https://a.test'] = { url: 'https://a.test', finalUrl: null, scannedAt: new Date().toISOString(), status: 200, responseTimeMs: 10, xRobotsTag: [], metadata: null, error: null };
  const snapshots: PluginData[] = [];
  let finishWrite = () => {};
  const storage = new AuditStorage(data, async snapshot => {
    if (!snapshots.length) await new Promise<void>(resolve => { finishWrite = resolve; });
    snapshots.push(snapshot);
  }, vi.fn());
  storage.scheduleSave();
  const pending = storage.flush();
  await Promise.resolve(); await Promise.resolve();
  const clearing = storage.clearResults();
  expect(data.cache.latest).toEqual({});
  finishWrite();
  await pending; await clearing;
  expect(Object.keys(snapshots[0]!.cache.latest)).toEqual(['https://a.test']);
  expect(snapshots[1]!.cache.latest).toEqual({});
  expect(snapshots[1]!.settings).toEqual(data.settings);
  expect(loadData(JSON.parse(JSON.stringify(snapshots[1]))).cache.latest).toEqual({});
  storage.dispose();
});

it('reports a failed clear save and allows retrying it', async () => {
  vi.useFakeTimers();
  const data = loadData(null);
  const write = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
  const error = vi.fn();
  const storage = new AuditStorage(data, write, error);
  await storage.clearResults();
  expect(error).toHaveBeenCalledOnce();
  await storage.flush();
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1]![0].cache.latest).toEqual({});
  storage.dispose();
});

function vaultFixture() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const files = new Map<string, TFile>();
  const frontmatter = new Map<string, Record<string, unknown>>();
  const on = (source: string) => (event: string, handler: (...args: unknown[]) => void) => handlers.set(`${source}:${event}`, handler);
  let ready = () => undefined as void;
  const markdownFiles = vi.fn(() => [...files.values()]);
  const app = {
    vault: { on: on('vault'), getFileByPath: (path: string) => files.get(path) ?? null, getMarkdownFiles: markdownFiles },
    metadataCache: { on: on('metadata'), getFileCache: (file: TFile) => ({ frontmatter: frontmatter.get(file.path) }) },
    workspace: { onLayoutReady: (callback: () => void) => { ready = callback; } },
  } as unknown as App;
  const cleanup: (() => void)[] = [];
  const plugin = { registerEvent: vi.fn(), register: (callback: () => void) => cleanup.push(callback) } as unknown as Plugin;
  const emit = (source: string, event: string, ...args: unknown[]) => handlers.get(`${source}:${event}`)?.(...args);
  const add = (path: string, values: Record<string, unknown>) => {
    // The host supplies TFile instances; the test double only needs the path and extension.
    const file = Object.assign(Object.create(TFile.prototype) as TFile, { path, extension: 'md' });
    files.set(path, file); frontmatter.set(path, values); return file;
  };
  return { app, plugin, emit, add, files, frontmatter, markdownFiles, cleanup, ready: () => ready() };
}

it('normalizes source whitespace without merging distinct paths, queries or fragments', () => {
  expect(normalizeUrl(' https://example.com/a?x=1#part ')).toBe('https://example.com/a?x=1#part');
  expect(normalizeUrl('https://example.com/a/')).not.toBe(normalizeUrl('https://example.com/a'));
  expect(normalizeUrl('javascript:alert(1)')).toBeNull();
  expect(normalizeUrl(undefined)).toBeNull();
});

it('batches metadata events and updates create/rename/delete without rescanning the Vault', async () => {
  vi.useFakeTimers();
  const f = vaultFixture(); const first = f.add('one.md', { url: 'https://one.test' });
  const notify = vi.fn(); let property = 'url';
  const index = new VaultUrlIndexer(f.app, () => property, notify); index.start(f.plugin);
  f.ready(); await vi.advanceTimersByTimeAsync(151);
  expect(index.pages()).toEqual([{ url: 'https://one.test', files: ['one.md'] }]);
  expect(f.markdownFiles).toHaveBeenCalledTimes(1); notify.mockClear();
  f.frontmatter.set('one.md', { url: 'https://updated.test' });
  for (let i = 0; i < 10; i++) f.emit('metadata', 'changed', first);
  expect(notify).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(151);
  expect(notify).toHaveBeenCalledTimes(1); expect(index.pages()[0]?.url).toBe('https://updated.test');
  const second = f.add('two.md', { url: 'https://updated.test' }); f.emit('vault', 'create', second);
  await vi.advanceTimersByTimeAsync(151); expect(index.pages()[0]?.files).toEqual(['one.md', 'two.md']);
  f.files.delete('two.md'); const renamed = f.add('renamed.md', { url: 'https://updated.test' });
  f.emit('vault', 'rename', renamed, 'two.md'); await vi.advanceTimersByTimeAsync(151);
  expect(index.pages()[0]?.files).toEqual(['one.md', 'renamed.md']);
  f.files.delete('one.md'); f.emit('vault', 'delete', first); await vi.advanceTimersByTimeAsync(151);
  expect(index.pages()[0]?.files).toEqual(['renamed.md']); expect(f.markdownFiles).toHaveBeenCalledTimes(1);
  property = 'page'; f.frontmatter.set('renamed.md', { page: 'https://new-property.test' });
  await index.rebuild(); expect(index.pages()[0]?.url).toBe('https://new-property.test');
  f.emit('metadata', 'changed', renamed); notify.mockClear(); f.cleanup.forEach(dispose => dispose());
  await vi.advanceTimersByTimeAsync(200); expect(notify).not.toHaveBeenCalled();
  f.files.clear(); await index.rebuild(); expect(notify).not.toHaveBeenCalled();
});

it('coalesces storage writes and persists pending settings on unload', async () => {
  vi.useFakeTimers();
  const data = loadData(null); const write = vi.fn(async () => undefined); const error = vi.fn();
  const storage = new AuditStorage(data, write, error);
  for (let i = 0; i < 10; i++) storage.scheduleSave();
  expect(write).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1501);
  expect(write).toHaveBeenCalledTimes(1);
  data.settings.urlProperty = 'page'; storage.scheduleSave(); storage.dispose();
  await vi.advanceTimersByTimeAsync(0);
  expect(write).toHaveBeenCalledTimes(2); expect(error).not.toHaveBeenCalled();
});
