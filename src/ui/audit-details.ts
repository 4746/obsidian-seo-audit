import { setIcon } from 'obsidian';
import type { FieldKey, FieldValue } from '../types';
import type { Translator } from '../i18n';
import type { AuditController } from './audit-controller';
import { button, el, fileLinks } from './dom';

function renderValues(parent: HTMLElement, label: string, values: FieldValue[], t: Translator): void {
  const field = el(parent, 'div', undefined, 'seo-audit-detail-field');
  el(field, 'h4', label);
  if (!values.length) {
    el(field, 'p', t('missing'), 'seo-audit-missing');
    return;
  }
  for (const v of values) {
    const entry = el(field, 'div', undefined, 'seo-audit-detail-value');
    el(entry, 'div', v.value || t('missing'), v.value.trim() ? 'seo-audit-original' : 'seo-audit-original seo-audit-missing');
    el(entry, 'span', `${t('length')}: ${v.length}`, 'seo-audit-character-count');
  }
}
export function renderAuditDetails(host: HTMLElement, controller: AuditController, focused: string | null, openFile: (path: string) => void, close: () => void): void {
  const t = controller.t;
  const openSections = new Map<string, boolean>();
  if (host.dataset.page === focused) {
    for (const section of host.querySelectorAll<HTMLDetailsElement>('details[data-section]')) {
      openSections.set(section.dataset.section!, section.open);
    }
  }
  host.dataset.page = focused ?? '';
  host.replaceChildren();
  const page = controller.index.pages().find(p => p.url === focused);
  if (!page) {
    el(host, 'p', t('noDetails'));
    return;
  }
  const header = el(host, 'div', undefined, 'seo-audit-detail-header');
  el(header, 'h3', t('details'));
  const closeButton = button(header, '', close);
  closeButton.classList.add('clickable-icon', 'seo-audit-detail-close');
  closeButton.setAttribute('aria-label', t('close'));
  setIcon(closeButton, 'x');
  const link = el(host, 'a', page.url, 'seo-audit-detail-url');
  link.href = page.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  const sources = el(host, 'div', undefined, 'seo-audit-detail-sources');
  fileLinks(sources, page, t, openFile);
  const r = controller.data.cache.latest[page.url];
  if (!r) {
    el(host, 'p', t('unscanned'));
    return;
  }
  if (r.error) {
    const key = { timeout: 'timeoutError', network: 'networkError', 'non-html': 'nonHtmlError', parse: 'parseError', 'invalid-response': 'invalidError', http: 'httpError' } as const;
    el(host, 'p', `${t(key[r.error.kind])}: ${r.error.message}`, 'seo-audit-error');
  }
  const section = (id: string, title: string, expanded = false): HTMLElement => {
    const details = el(host, 'details', undefined, 'seo-audit-detail-section');
    details.dataset.section = id;
    details.open = openSections.get(id) ?? expanded;
    el(details, 'summary', title);
    return el(details, 'div', undefined, 'seo-audit-detail-section-body');
  };
  const response = section('response', t('httpResponse'), true);
  const info = el(response, 'dl');
  for (const [label, value] of [[t('url'), r.url], [t('finalUrl'), r.finalUrl ?? t('unknown')], [t('status'), r.status ?? t('unknown')], [t('responseTimeMs'), r.responseTimeMs ?? t('unknown')], [t('scannedAt'), new Date(r.scannedAt).toLocaleString()]]) {
    el(info, 'dt', String(label)); el(info, 'dd', String(value));
  }
  renderValues(response, t('xRobotsTag'), r.xRobotsTag, t);
  const groups: { id: string; label: string; keys: FieldKey[] }[] = [
    { id: 'seo', label: t('basicSeo'), keys: ['title', 'description', 'canonical', 'robots'] },
    { id: 'og', label: t('openGraph'), keys: ['og:title', 'og:description', 'og:image'] },
    { id: 'twitter', label: t('twitterCards'), keys: ['twitter:title', 'twitter:description', 'twitter:image'] },
  ];
  for (const group of groups) {
    const body = section(group.id, group.label, group.id === 'seo');
    for (const key of group.keys) {
      renderValues(body, key, r.metadata?.fields[key] ?? [], t);
    }
  }
  const headings = section('h1', `${t('h1')} (${r.metadata?.h1Count ?? 0})`);
  renderValues(headings, t('h1'), r.metadata?.h1 ?? [], t);
  const alternates = section('alternates', t('alternates'));
  if (!r.metadata?.alternates.length) {
    el(alternates, 'p', t('missing'), 'seo-audit-missing');
  } else {
    for (const alt of r.metadata.alternates) {
      const entry = el(alternates, 'div', undefined, 'seo-audit-alternate');
      renderValues(entry, 'hreflang', [alt.hreflang], t);
      renderValues(entry, 'href', [alt.href], t);
    }
  }
}
