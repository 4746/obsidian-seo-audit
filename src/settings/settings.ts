import type { AuditSettings } from '../types';

export const pageSizes: readonly number[] = [25, 50, 100, 200, 500];

export const defaultSettings: AuditSettings = {
  urlProperty: 'url', concurrency: 3, timeoutMs: 30000, language: 'auto', pageSize: 50,
  visibleColumns: ['url', 'files', 'status', 'title', 'description', 'canonical', 'h1Count', 'responseTimeMs', 'scannedAt'],
};
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bounded = (value: unknown, fallback: number, min: number, max: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
export function cleanSettings(raw: unknown): AuditSettings {
  const s = object(raw) ? raw : {};
  return {
    urlProperty: typeof s.urlProperty === 'string' && s.urlProperty.trim() ? s.urlProperty.trim() : 'url',
    concurrency: bounded(s.concurrency, 3, 1, 20),
    timeoutMs: bounded(s.timeoutMs, 30000, 1000, 300000),
    language: s.language === 'en' || s.language === 'uk' ? s.language : 'auto',
    pageSize: typeof s.pageSize === 'number' && pageSizes.includes(s.pageSize) ? s.pageSize : defaultSettings.pageSize,
    visibleColumns: Array.isArray(s.visibleColumns) && s.visibleColumns.every(x => typeof x === 'string') ? s.visibleColumns : [...defaultSettings.visibleColumns],
  };
}

