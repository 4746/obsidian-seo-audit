export interface FieldValue { value: string; length: number }
export const fieldKeys = ['title', 'description', 'canonical', 'robots', 'og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description', 'twitter:image'] as const;
export type FieldKey = typeof fieldKeys[number];
export interface Alternate { hreflang: FieldValue; href: FieldValue }
export interface SeoMetadata {
  fields: Record<FieldKey, FieldValue[]>;
  alternates: Alternate[];
  h1: FieldValue[];
  h1Count: number;
}
export type ErrorKind = 'network' | 'timeout' | 'invalid-response' | 'non-html' | 'parse' | 'http';
export interface AuditResult {
  url: string;
  finalUrl: string | null;
  scannedAt: string;
  status: number | null;
  responseTimeMs: number | null;
  xRobotsTag: FieldValue[];
  contentType: string | null;
  metadata: SeoMetadata | null;
  error: { kind: ErrorKind; message: string } | null;
}
export interface IndexedPage { url: string; files: string[] }
export interface AuditSettings {
  urlProperty: string;
  concurrency: number;
  timeoutMs: number;
  language: 'auto' | 'en' | 'uk';
  visibleColumns: string[];
}
export interface PluginData {
  schemaVersion: 1;
  settings: AuditSettings;
  cache: { schemaVersion: 1; latest: Record<string, AuditResult> };
}
export interface ScanProgress { running: boolean; total: number; completed: number; active: number }
