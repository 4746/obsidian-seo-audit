import type { Translator } from '../i18n';
import type { IndexedPage, PluginData, ScanProgress } from '../types';

/** Explicit UI dependency contract; components do not depend on the plugin entry point. */
export interface AuditController {
  readonly t: Translator;
  data: PluginData;
  index: { pages(): IndexedPage[] };
  scanner: { progress: ScanProgress; stop(): void };
  subscribe(listener: () => void): () => void;
  scan(urls: string[]): void;
  reindex(): Promise<void>;
  scheduleSave(): void;
  openDetails(url: string): void;
}
