import { fieldValue, parseHtml } from './parser';
import type { AuditResult, AuditSettings, ScanProgress } from './types';

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  text: string;
  url?: string;
}
export type HttpGet = (url: string) => Promise<HttpResponse>;
class Cancelled extends Error {}
class TimedOut extends Error {}

/** Physical permits survive logical timeout/stop: native requestUrl has no AbortSignal. */
export class HttpAuditor {
  private physicalActive = 0;
  private waiters = new Set<() => void>();
  constructor(private get: HttpGet) {}

  private async acquire(limit: number, timeoutMs: number, signal: AbortSignal): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    while (this.physicalActive >= limit) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new TimedOut();
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); this.waiters.delete(wake); signal.removeEventListener('abort', cancel); };
        const wake = () => { cleanup(); resolve(); };
        const cancel = () => { cleanup(); reject(new Cancelled()); };
        const timer = setTimeout(() => { cleanup(); reject(new TimedOut()); }, remaining);
        this.waiters.add(wake);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
    }
    if (signal.aborted) throw new Cancelled();
    this.physicalActive++;
  }

  async audit(url: string, settings: AuditSettings, signal: AbortSignal): Promise<AuditResult | null> {
    const result: AuditResult = {
      url, finalUrl: null, scannedAt: new Date().toISOString(), status: null,
      responseTimeMs: null, xRobotsTag: [], contentType: null, metadata: null, error: null,
    };
    try { await this.acquire(settings.concurrency, settings.timeoutMs, signal); }
    catch (error) {
      if (signal.aborted || error instanceof Cancelled) return null;
      result.scannedAt = new Date().toISOString();
      result.error = { kind: 'timeout', message: `No HTTP request slot became available within ${settings.timeoutMs} ms; previous native requests are still pending` };
      return result;
    }
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => undefined;
    const interrupted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimedOut()), settings.timeoutMs);
      cancel = () => reject(new Cancelled());
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    const request = Promise.resolve().then(() => {
      if (signal.aborted) throw new Cancelled();
      return this.get(url);
    }).finally(() => {
      this.physicalActive--;
      for (const wake of [...this.waiters]) wake();
    });
    try {
      const response = await Promise.race([request, interrupted]);
      result.responseTimeMs = Math.round(performance.now() - started);
      if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 || typeof response.text !== 'string' || !response.headers || typeof response.headers !== 'object') {
        result.error = { kind: 'invalid-response', message: 'Invalid HTTP response' };
        return result;
      }
      result.status = response.status;
      if (typeof response.url === 'string') {
        try { const final = new URL(response.url); if (['http:', 'https:'].includes(final.protocol)) result.finalUrl = response.url; } catch { /* unavailable */ }
      }
      const header = (key: string): string[] => Object.entries(response.headers).filter(([name]) => name.toLowerCase() === key).flatMap(([, value]) => Array.isArray(value) ? value.filter(v => typeof v === 'string') : typeof value === 'string' ? [value] : []);
      result.xRobotsTag = header('x-robots-tag').map(fieldValue);
      result.contentType = header('content-type').join(', ') || null;
      const mime = result.contentType?.split(';')[0]?.trim().toLowerCase();
      const isHtml = mime ? mime === 'text/html' || mime === 'application/xhtml+xml' : /^\s*(?:<!doctype\s+html|<html\b|<head\b|<title\b|<meta\b|<body\b|<h1\b|<!--)/i.test(response.text);
      if (!isHtml) result.error = { kind: 'non-html', message: result.contentType ?? 'Response is not recognizable HTML' };
      else {
        try { result.metadata = parseHtml(response.text); }
        catch (error) { result.error = { kind: 'parse', message: error instanceof Error ? error.message : String(error) }; }
      }
      if (response.status >= 400 && !result.error) result.error = { kind: 'http', message: `HTTP ${response.status}` };
    } catch (error) {
      if (error instanceof Cancelled) return null;
      // No full response was received: do not mislabel elapsed timeout as response time.
      result.error = error instanceof TimedOut ? { kind: 'timeout', message: `Request exceeded ${settings.timeoutMs} ms` }
        : { kind: 'network', message: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      result.scannedAt = new Date().toISOString();
    }
    return signal.aborted ? null : result;
  }
}

export class ScanQueue {
  progress: ScanProgress = { running: false, total: 0, completed: 0, active: 0 };
  private controller: AbortController | null = null;
  constructor(private auditor: HttpAuditor, private onResult: (result: AuditResult) => void, private onProgress: () => void) {}

  stop(): void { this.controller?.abort(); }

  async run(urls: string[], settings: AuditSettings): Promise<void> {
    if (this.progress.running) return;
    const controller = new AbortController();
    this.controller = controller;
    const queue = [...new Set(urls)];
    this.progress = { running: true, total: queue.length, completed: 0, active: 0 };
    this.onProgress();
    let next = 0;
    const worker = async () => {
      while (!controller.signal.aborted && next < queue.length) {
        const url = queue[next++]!;
        this.progress.active++;
        this.onProgress();
        try {
          const result = await this.auditor.audit(url, settings, controller.signal);
          if (result && !controller.signal.aborted) { this.onResult(result); this.progress.completed++; }
        } finally { this.progress.active--; this.onProgress(); }
        // Allow painting and interaction between synchronous DOM parsing steps.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(settings.concurrency, queue.length) }, worker)); }
    finally { this.progress.running = false; this.controller = null; this.onProgress(); }
  }
}
