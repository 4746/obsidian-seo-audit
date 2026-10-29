import type { HttpAuditor } from './http-client';
import type { AuditResult, AuditSettings, ScanProgress } from '../types';

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
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(settings.concurrency, queue.length) }, worker)); }
    finally { this.progress.running = false; this.controller = null; this.onProgress(); }
  }
}
