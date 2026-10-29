import { fieldKeys, type FieldValue } from '../types';
import type { Translator } from '../i18n';
import type { AuditController } from './audit-controller';
import { button, el, fileLinks } from './dom';

function renderValues(parent: HTMLElement, label: string, values: FieldValue[], t: Translator): void {
  el(parent, 'h4', label);
  if (!values.length) {
 el(parent, 'p', t('missing'), 'seo-audit-missing'); return; 
}
  const table = el(parent, 'table', undefined, 'seo-audit-values'); const head = el(el(table, 'thead'), 'tr');
  el(head, 'th', t('value')); el(head, 'th', t('length'));
  const body = el(table, 'tbody');
  for (const v of values) {
 const row = el(body, 'tr'); el(row, 'td', v.value || t('missing'), v.value.trim() ? 'seo-audit-original' : 'seo-audit-original seo-audit-missing'); el(row, 'td', String(v.length)); 
}
}
export function renderAuditDetails(host: HTMLElement, controller: AuditController, focused: string | null, openFile: (path: string) => void, close: () => void): void {
  const t = controller.t; host.replaceChildren();
  const page = controller.index.pages().find(p => p.url === focused);
  if (!page) {
 el(host, 'p', t('noDetails')); return; 
}
  button(host, t('close'), close);
  el(host, 'h3', `${t('details')}: ${page.url}`); fileLinks(host, page, t, openFile);
  const r = controller.data.cache.latest[page.url];
  if (!r) {
 el(host, 'p', t('unscanned')); return; 
}
  const info = el(host, 'dl');
  for (const [label, value] of [[t('url'), r.url], [t('finalUrl'), r.finalUrl ?? t('unknown')], [t('status'), r.status ?? t('unknown')], [t('responseTimeMs'), r.responseTimeMs ?? t('unknown')], [t('scannedAt'), new Date(r.scannedAt).toLocaleString()], [t('contentType'), r.contentType ?? t('unknown')]]) {
 el(info, 'dt', String(label)); el(info, 'dd', String(value)); 
}
  if (r.error) {
    const key = { timeout: 'timeoutError', network: 'networkError', 'non-html': 'nonHtmlError', parse: 'parseError', 'invalid-response': 'invalidError', http: 'httpError' } as const;
    el(host, 'p', `${t(key[r.error.kind])}: ${r.error.message}`, 'seo-audit-error');
  }
  renderValues(host, t('xRobotsTag'), r.xRobotsTag, t);
  for (const key of fieldKeys) {
renderValues(host, key, r.metadata?.fields[key] ?? [], t);
}
  el(host, 'p', `${t('h1Count')}: ${r.metadata?.h1Count ?? t('unknown')}`);
  renderValues(host, t('h1'), r.metadata?.h1 ?? [], t);
  el(host, 'h4', t('alternates'));
  if (!r.metadata?.alternates.length) {
el(host, 'p', t('missing'), 'seo-audit-missing');
} else {
    const table = el(host, 'table', undefined, 'seo-audit-values'); const head = el(el(table, 'thead'), 'tr');
    for (const label of ['hreflang', t('length'), 'href', t('length')]) {
el(head, 'th', label);
}
    const body = el(table, 'tbody');
    for (const alt of r.metadata.alternates) {
      const row = el(body, 'tr');
      for (const value of [alt.hreflang.value, alt.hreflang.length, alt.href.value, alt.href.length]) {
el(row, 'td', String(value), 'seo-audit-original');
}
    }
  }
}
