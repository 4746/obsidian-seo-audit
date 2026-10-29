import { lengthFields, type AuditSettings } from '../types';

export const pageSizes: readonly number[] = [25, 50, 100, 200, 500];

export const defaultSettings: AuditSettings = {
  urlProperty: 'url', concurrency: 3, timeoutMs: 30000, language: 'auto', pageSize: 50, highlightIssues: true,
  visibleColumns: ['url', 'files', 'status', 'title', 'description', 'canonical', 'h1Count', 'responseTimeMs', 'scannedAt'],
  // Editable audit thresholds, not Google character limits or truncation predictions.
  lengthLimits: { title: 60, description: 160, 'og:title': 60, 'og:description': 160, 'twitter:title': 70, 'twitter:description': 200, h1: 70 },
};
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bounded = (value: unknown, fallback: number, min: number, max: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
export function cleanSettings(raw: unknown): AuditSettings {
  const s = object(raw) ? raw : {};
  const limits = object(s.lengthLimits) ? s.lengthLimits : {};
  return {
    urlProperty: typeof s.urlProperty === 'string' && s.urlProperty.trim() ? s.urlProperty.trim() : 'url',
    concurrency: bounded(s.concurrency, 3, 1, 20),
    timeoutMs: bounded(s.timeoutMs, 30000, 1000, 300000),
    language: s.language === 'en' || s.language === 'uk' ? s.language : 'auto',
    pageSize: typeof s.pageSize === 'number' && pageSizes.includes(s.pageSize) ? s.pageSize : defaultSettings.pageSize,
    highlightIssues: typeof s.highlightIssues === 'boolean' ? s.highlightIssues : defaultSettings.highlightIssues,
    lengthLimits: Object.fromEntries(lengthFields.map(field => {
      const value = limits[field];
      return [field, typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : defaultSettings.lengthLimits[field]];
    })) as AuditSettings['lengthLimits'],
    visibleColumns: Array.isArray(s.visibleColumns) && s.visibleColumns.every(x => typeof x === 'string') ? s.visibleColumns : [...defaultSettings.visibleColumns],
  };
}

