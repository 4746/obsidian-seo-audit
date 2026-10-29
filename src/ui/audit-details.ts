import { setIcon, setTooltip } from 'obsidian';
import type { FieldKey, FieldValue } from '../types';
import type { Translator } from '../i18n';
import type { AuditController } from './audit-controller';
import { button, el, fileLinks } from './dom';
import { getLengthLimit } from '../utils/metadata-length';

function renderValues(parent: HTMLElement, label: string, values: FieldValue[], t: Translator, limit: number | null = null): void {
  const field = el(parent, 'div', undefined, 'seo-audit-detail-field');
  el(field, 'h4', label);
  if (!values.length) {
    el(field, 'p', t('missing'), 'seo-audit-missing');
    return;
  }
  for (const v of values) {
    const entry = el(field, 'div', undefined, 'seo-audit-detail-value');
    el(entry, 'div', v.value || t('missing'), v.value.trim() ? 'seo-audit-original' : 'seo-audit-original seo-audit-missing');
    const count = limit === null ? String(v.length) : `${v.length} / ${limit}`;
    el(entry, 'span', `${t('length')}: ${count}`, 'seo-audit-character-count');
    if (limit !== null && v.length > limit) {
      entry.classList.add('seo-audit-length-error');
    }
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
  const r = controller.data.cache.latest[page.url];
  const actions = el(header, 'div', undefined, 'seo-audit-detail-actions');
  const scanButton = button(actions, '', () => {
    if (controller.scanner.progress.running) {
      return;
    }
    scanButton.disabled = true;
    setTooltip(scanButton, t('scanBusy'));
    scanButton.setAttribute('aria-label', t('scanBusy'));
    controller.scan([page.url]);
  });
  scanButton.classList.add('clickable-icon', 'seo-audit-detail-scan');
  scanButton.disabled = controller.scanner.progress.running;
  const scanLabel = t(scanButton.disabled ? 'scanBusy' : r ? 'refreshPage' : 'scanPage');
  scanButton.setAttribute('aria-label', scanLabel);
  setTooltip(scanButton, scanLabel);
  setIcon(scanButton, r ? 'refresh-cw' : 'play');
  const closeButton = button(actions, '', close);
  closeButton.classList.add('clickable-icon', 'seo-audit-detail-close');
  closeButton.setAttribute('aria-label', t('close'));
  setIcon(closeButton, 'x');
  const link = el(host, 'a', page.url, 'seo-audit-detail-url');
  link.href = page.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  const sources = el(host, 'div', undefined, 'seo-audit-detail-sources');
  fileLinks(sources, page, t, openFile);
  if (!r) {
    const empty = el(host, 'div', undefined, 'seo-audit-detail-empty');
    empty.setAttribute('role', 'status');
    const icon = el(empty, 'div', undefined, 'seo-audit-detail-empty-icon');
    icon.setAttribute('aria-hidden', 'true');
    setIcon(icon, 'file-search');
    el(empty, 'h4', t('unscanned'));
    el(empty, 'p', t(controller.scanner.progress.running ? 'scanBusyHelp' : 'unscannedHelp'));
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
      renderValues(body, key, r.metadata?.fields[key] ?? [], t, getLengthLimit(key, controller.data.settings));
    }
  }
  const headings = section('h1', `${t('h1')} (${r.metadata?.h1Count ?? 0})`);
  renderValues(headings, t('h1'), r.metadata?.h1 ?? [], t, getLengthLimit('h1', controller.data.settings));
  const alternates = section('alternates', t('alternates'));
  if (!r.metadata || Object.keys(r.metadata.alternates).length === 0) {
    el(alternates, 'p', t('missing'), 'seo-audit-missing');
  } else {
    const wrap = el(alternates, 'div', undefined, 'seo-audit-alternates-wrap');
    const table = el(wrap, 'table', undefined, 'seo-audit-alternates-table');
    table.setAttribute('aria-label', t('alternates'));
    const head = el(el(table, 'thead'), 'tr');
    el(head, 'th', t('languageCode')).scope = 'col';
    el(head, 'th', t('url')).scope = 'col';
    const body = el(table, 'tbody');
    for (const [language, hrefs] of Object.entries(r.metadata.alternates)) {
      for (const href of Array.isArray(hrefs) ? hrefs : [hrefs]) {
        const row = el(body, 'tr');
        el(el(row, 'td'), 'span', language, 'seo-audit-alternate-code');
        const cell = el(row, 'td');
        // Resolve relative alternates while keeping the original value visible.
        let target: URL | null = null;
        try {
          target = new URL(href, page.url);
        } catch { /* Malformed URLs remain readable as text. */ }
        if (target && ['http:', 'https:'].includes(target.protocol)) {
          const link = el(cell, 'a', href, 'seo-audit-original');
          link.href = target.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        } else {
          el(cell, 'span', href, 'seo-audit-original');
        }
      }
    }
  }
}
