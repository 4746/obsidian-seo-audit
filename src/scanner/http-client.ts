import { requestUrl } from 'obsidian';
import { fieldValue } from '../utils/string-length';
import { parseHtml } from '../parser/html-parser';
import type { AuditResult, AuditSettings } from '../types';

export async function requestPage(url: string): Promise<HttpResponse> {
  return await requestUrl({ url, method: 'GET', throw: false, headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' } });
}

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
      if (remaining <= 0) {
throw new TimedOut();
}
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
 window.clearTimeout(timer); this.waiters.delete(wake); signal.removeEventListener('abort', cancel); 
};
        const wake = () => {
 cleanup(); resolve(); 
};
        const cancel = () => {
 cleanup(); reject(new Cancelled()); 
};
        const timer = window.setTimeout(() => {
 cleanup(); reject(new TimedOut()); 
}, remaining);
        this.waiters.add(wake);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) {
cancel();
}
      });
    }
    if (signal.aborted) {
throw new Cancelled();
}
    this.physicalActive++;
  }

  async audit(url: string, settings: AuditSettings, signal: AbortSignal): Promise<AuditResult | null> {
    const result: AuditResult = {
      url, finalUrl: null, scannedAt: new Date().toISOString(), status: null,
      responseTimeMs: null, xRobotsTag: [], metadata: null, error: null,
    };
    try {
 await this.acquire(settings.concurrency, settings.timeoutMs, signal); 
} catch (error) {
      if (signal.aborted || error instanceof Cancelled) {
return null;
}
      result.scannedAt = new Date().toISOString();
      result.error = { kind: 'timeout', message: `No HTTP request slot became available within ${settings.timeoutMs} ms; previous native requests are still pending` };
      return result;
    }
    const started = performance.now();
    let timer: number | undefined;
    let cancel: () => void = () => undefined;
    const interrupted = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new TimedOut()), settings.timeoutMs);
      cancel = () => reject(new Cancelled());
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) {
cancel();
}
    });
    const request = Promise.resolve().then(() => {
      if (signal.aborted) {
throw new Cancelled();
}
      return this.get(url);
    }).finally(() => {
      this.physicalActive--;
      for (const wake of [...this.waiters]) {
wake();
}
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
        try {
 const final = new URL(response.url); if (['http:', 'https:'].includes(final.protocol)) {
result.finalUrl = response.url;
} 
} catch { /* unavailable */ }
      }
      const header = (key: string): string[] => Object.entries(response.headers).filter(([name]) => name.toLowerCase() === key).flatMap(([, value]) => Array.isArray(value) ? value.filter(v => typeof v === 'string') : typeof value === 'string' ? [value] : []);
      result.xRobotsTag = header('x-robots-tag').map(fieldValue);
      const contentType = header('content-type').join(', ') || null;
      const mime = contentType?.split(';')[0]?.trim().toLowerCase();
      const isHtml = mime ? mime === 'text/html' || mime === 'application/xhtml+xml' : /^\s*(?:<!doctype\s+html|<html\b|<head\b|<title\b|<meta\b|<body\b|<h1\b|<!--)/i.test(response.text);
      if (!isHtml) {
result.error = { kind: 'non-html', message: contentType ?? 'Response is not recognizable HTML' };
} else {
        try {
 result.metadata = parseHtml(response.text); 
} catch (error) {
 result.error = { kind: 'parse', message: error instanceof Error ? error.message : String(error) }; 
}
      }
      if (response.status >= 400 && !result.error) {
result.error = { kind: 'http', message: `HTTP ${response.status}` };
}
    } catch (error) {
      if (error instanceof Cancelled) {
return null;
}
      // No full response was received: do not mislabel elapsed timeout as response time.
      result.error = error instanceof TimedOut ? { kind: 'timeout', message: `Request exceeded ${settings.timeoutMs} ms` }
        : { kind: 'network', message: error instanceof Error ? error.message : String(error) };
    } finally {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      result.scannedAt = new Date().toISOString();
    }
    return signal.aborted ? null : result;
  }
}

