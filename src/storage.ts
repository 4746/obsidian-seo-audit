import { fieldKeys, type AuditResult, type AuditSettings, type PluginData } from './types';

export const defaultSettings: AuditSettings = {
  urlProperty: 'url', concurrency: 3, timeoutMs: 30000, language: 'auto',
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
    visibleColumns: Array.isArray(s.visibleColumns) && s.visibleColumns.every(x => typeof x === 'string') ? s.visibleColumns : [...defaultSettings.visibleColumns],
  };
}

function validValues(value: unknown): boolean {
  return Array.isArray(value) && value.every(v => object(v) && typeof v.value === 'string' && typeof v.length === 'number' && v.length === Array.from(v.value).length);
}
export function validResult(v: unknown): v is AuditResult {
  if (!object(v) || typeof v.url !== 'string' || typeof v.scannedAt !== 'string' || !Number.isFinite(Date.parse(v.scannedAt))) return false;
  if (v.finalUrl !== null && typeof v.finalUrl !== 'string') return false;
  if (v.contentType !== null && typeof v.contentType !== 'string') return false;
  if (v.status !== null && (typeof v.status !== 'number' || !Number.isInteger(v.status) || v.status < 100 || v.status > 599)) return false;
  if (v.responseTimeMs !== null && (typeof v.responseTimeMs !== 'number' || !Number.isFinite(v.responseTimeMs) || v.responseTimeMs < 0)) return false;
  if (!validValues(v.xRobotsTag)) return false;
  if (v.error !== null && (!object(v.error) || !['network', 'timeout', 'invalid-response', 'non-html', 'parse', 'http'].includes(String(v.error.kind)) || typeof v.error.message !== 'string')) return false;
  if (v.metadata === null) return true;
  const m = v.metadata;
  return object(m) && object(m.fields) && fieldKeys.every(k => validValues((m.fields as Record<string, unknown>)[k])) && validValues(m.h1)
    && m.h1Count === (m.h1 as unknown[]).length && Array.isArray(m.alternates)
    && m.alternates.every(a => object(a) && validValues([a.hreflang]) && validValues([a.href]));
}

export function loadData(raw: unknown): PluginData {
  if (raw == null) return { schemaVersion: 1, settings: cleanSettings(null), cache: { schemaVersion: 1, latest: Object.create(null) as Record<string, AuditResult> } };
  if (!object(raw) || raw.schemaVersion !== 1 || !object(raw.cache) || raw.cache.schemaVersion !== 1 || !object(raw.cache.latest)) {
    throw new Error('Unsupported or invalid SEO Audit data schema. Existing data was not overwritten.');
  }
  const latest: Record<string, AuditResult> = Object.create(null) as Record<string, AuditResult>;
  for (const [url, value] of Object.entries(raw.cache.latest)) {
    if (!validResult(value) || value.url !== url) throw new Error('Invalid SEO Audit cache. Existing data was not overwritten.');
    latest[url] = value;
  }
  return { schemaVersion: 1, settings: cleanSettings(raw.settings), cache: { schemaVersion: 1, latest } };
}

/** Serialize saves so a slower older write cannot replace newer data. */
export class SaveQueue {
  private pending: Promise<void> = Promise.resolve();
  constructor(private write: (data: PluginData) => Promise<void>) {}
  save(data: PluginData): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(data)) as PluginData;
    const next = this.pending.catch(() => undefined).then(() => this.write(snapshot));
    this.pending = next;
    return next;
  }
}
