import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpAuditor, type HttpResponse } from '../src/scanner/http-client';
import { ScanQueue } from '../src/scanner/scan-manager';
import { defaultSettings } from '../src/settings/settings';
import type { AuditResult } from '../src/types';

const response = (extra: Partial<HttpResponse> = {}): HttpResponse => ({ status: 200, headers: { 'Content-Type': 'text/html' }, text: '<title>Test 😀</title>', ...extra });
const settings = { ...defaultSettings, timeoutMs: 100, concurrency: 2 };
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());

describe('HTTP audit', () => {
  it('records full-response duration, headers, status, scan time and only explicit final URLs', async () => {
    vi.useFakeTimers();
    const auditor = new HttpAuditor(async () => { await new Promise(resolve => setTimeout(resolve, 40)); return response({ headers: { 'X-Robots-Tag': ['noindex', 'googlebot: nofollow'], 'x-robots-tag': 'noarchive', 'Content-Type': 'text/html;charset=utf-8' }, url: 'https://final.test' }); });
    const pending = auditor.audit('https://a.test', settings, signal());
    await vi.advanceTimersByTimeAsync(40);
    const r = await pending;
    expect(r).toMatchObject({ status: 200, finalUrl: 'https://final.test', responseTimeMs: 40, error: null });
    expect(r?.xRobotsTag.map(v => v.value)).toEqual(['noindex', 'googlebot: nofollow', 'noarchive']);
    expect(r?.metadata?.fields.title[0]).toEqual({ value: 'Test 😀', length: 6 });
    expect(Number.isFinite(Date.parse(r!.scannedAt))).toBe(true);
  });
  it('keeps HTML error metadata and never guesses final URL from Location/canonical', async () => {
    const auditor = new HttpAuditor(async () => response({ status: 404, headers: { Location: 'https://other.test', 'content-type': 'text/html' }, text: '<title>Missing</title><link rel="canonical" href="https://canonical.test">' }));
    const r = await auditor.audit('https://a.test', settings, signal());
    expect(r?.error?.kind).toBe('http'); expect(r?.status).toBe(404);
    expect(r?.metadata?.fields.title[0]?.value).toBe('Missing'); expect(r?.finalUrl).toBeNull();
  });
  it('distinguishes network failure, invalid response and non-HTML', async () => {
    const bad = new HttpAuditor(async () => { throw new Error('offline'); });
    expect((await bad.audit('https://a.test', settings, signal()))?.error).toEqual({ kind: 'network', message: 'offline' });
    const invalid = new HttpAuditor(async () => response({ status: NaN }));
    expect((await invalid.audit('https://a.test', settings, signal()))?.error?.kind).toBe('invalid-response');
    const json = new HttpAuditor(async () => response({ headers: { 'content-type': 'application/json' }, text: '{"title":"x"}' }));
    expect(await json.audit('https://a.test', settings, signal())).toMatchObject({ metadata: null, error: { kind: 'non-html' } });
    const noMime = new HttpAuditor(async () => response({ headers: {} }));
    expect((await noMime.audit('https://a.test', settings, signal()))?.metadata?.fields.title).toHaveLength(1);
  });
  it('returns timeout promptly, retains its physical slot and ignores late completion', async () => {
    vi.useFakeTimers();
    let finish!: (r: HttpResponse) => void;
    const get = vi.fn(() => new Promise<HttpResponse>(resolve => { finish = resolve; }));
    const auditor = new HttpAuditor(get);
    const one = auditor.audit('https://a.test', { ...settings, concurrency: 1 }, signal());
    await vi.advanceTimersByTimeAsync(101);
    expect(await one).toMatchObject({ responseTimeMs: null, error: { kind: 'timeout' } });
    const cancel = new AbortController();
    const two = auditor.audit('https://b.test', { ...settings, concurrency: 1 }, cancel.signal);
    await vi.advanceTimersByTimeAsync(50);
    expect(get).toHaveBeenCalledTimes(1);
    cancel.abort(); expect(await two).toBeNull();
    finish(response()); await vi.advanceTimersByTimeAsync(0);
  });
  it('does not start an HTTP request if cancellation happens during acquisition', async () => {
    const get = vi.fn(async () => response()); const control = new AbortController();
    const pending = new HttpAuditor(get).audit('https://a.test', settings, control.signal);
    control.abort(); expect(await pending).toBeNull(); expect(get).not.toHaveBeenCalled();
  });
});

describe('scan queue', () => {
  it('finishes a batch even when a timed-out native request never releases its slot', async () => {
    vi.useFakeTimers();
    const get = vi.fn(() => new Promise<HttpResponse>(() => undefined));
    const results: AuditResult[] = [];
    const queue = new ScanQueue(new HttpAuditor(get), r => results.push(r), () => undefined);
    const pending = queue.run(['https://a.test', 'https://b.test'], { ...settings, concurrency: 1 });
    await vi.advanceTimersByTimeAsync(205);
    expect(queue.progress.running).toBe(false);
    await pending;
    expect(get).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(results[1]?.error?.kind).toBe('timeout');
    expect(results[1]?.error?.message).toContain('slot');
  });
  it('limits concurrent requests, deduplicates URLs and reports completed progress', async () => {
    vi.useFakeTimers();
    let active = 0; let max = 0;
    const get = vi.fn(async () => {
      active++; max = Math.max(max, active);
      await new Promise(resolve => setTimeout(resolve, 10)); active--; return response();
    });
    const results: AuditResult[] = []; const progress = vi.fn();
    const queue = new ScanQueue(new HttpAuditor(get), r => results.push(r), progress);
    const pending = queue.run(['https://a.test', 'https://b.test', 'https://a.test', 'https://c.test'], settings);
    await vi.runAllTimersAsync(); await pending;
    expect(max).toBe(2); expect(get).toHaveBeenCalledTimes(3); expect(results).toHaveLength(3);
    expect(queue.progress).toEqual({ running: false, active: 0, completed: 3, total: 3 });
    expect(progress).toHaveBeenCalled();
  });
  it('stops immediately, prevents queued requests and late writes, and can restart safely', async () => {
    vi.useFakeTimers();
    let finish!: (r: HttpResponse) => void;
    const get = vi.fn(() => new Promise<HttpResponse>(resolve => { finish = resolve; }));
    const results: AuditResult[] = [];
    const queue = new ScanQueue(new HttpAuditor(get), r => results.push(r), () => undefined);
    const pending = queue.run(['https://a.test', 'https://b.test'], { ...settings, concurrency: 1 });
    await vi.advanceTimersByTimeAsync(0); queue.stop(); await vi.runAllTimersAsync(); await pending;
    expect(queue.progress.running).toBe(false); expect(get).toHaveBeenCalledTimes(1); expect(results).toEqual([]);
    const restarted = queue.run(['https://c.test'], { ...settings, concurrency: 1 });
    await vi.advanceTimersByTimeAsync(0); expect(get).toHaveBeenCalledTimes(1);
    finish(response()); await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(2);
    finish(response()); await vi.runAllTimersAsync(); await restarted;
    expect(results.map(r => r.url)).toEqual(['https://c.test']);
  });
});
