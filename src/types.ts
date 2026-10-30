export interface FieldValue { value: string; length: number }
export const fieldKeys = ['title', 'description', 'canonical', 'robots', 'og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description', 'twitter:image'] as const;
export type FieldKey = typeof fieldKeys[number];
export const stringFieldKeys = ['canonical', 'robots', 'og:image', 'twitter:image'] as const;
export type StringFieldKey = typeof stringFieldKeys[number];
export function isStringField(key: FieldKey): key is StringFieldKey {
  return (stringFieldKeys as readonly FieldKey[]).includes(key);
}
export const lengthFields = ['title', 'description', 'og:title', 'og:description', 'twitter:title', 'twitter:description', 'h1'] as const;
export type LengthField = typeof lengthFields[number];
export type AlternateLinks = Record<string, string | string[]>;
export interface SeoMetadata {
  fields: Record<Exclude<FieldKey, StringFieldKey>, FieldValue[]> & Record<StringFieldKey, string[]>;
  alternates: AlternateLinks;
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
  pageSize: number;
  highlightIssues: boolean;
  lengthLimits: Record<LengthField, number>;
}
export interface PluginData {
  schemaVersion: 1;
  settings: AuditSettings;
  cache: { schemaVersion: 2; latest: Record<string, AuditResult> };
}
export interface ScanProgress { running: boolean; total: number; completed: number; active: number }
