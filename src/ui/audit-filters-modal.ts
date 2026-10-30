import { Modal, type App } from 'obsidian';
import type { AuditController } from './audit-controller';
import type { TableFilter } from './audit-table';
import { fieldKeys } from '../types';
import { button, el, select } from './dom';

/** Edits the current table filter without resetting it when the popup closes. */
export class AuditFiltersModal extends Modal {
  private unsubscribe: (() => void) | null = null;
  private searchTimer: number | undefined;
  private locale = '';
  private statusFilter!: HTMLSelectElement;
  private statusSignature = '';
  private languageFilter!: HTMLSelectElement;
  private languageSignature = '';

  constructor(app: App, private controller: AuditController, private filter: TableFilter, private changed: () => void) {
    super(app);
  }

  onOpen(): void {
    this.render();
    this.unsubscribe = this.controller.subscribe(() => {
      if (this.locale !== this.controller.t('open')) {
        this.render();
      } else {
        this.refreshStatuses();
        this.refreshLanguages();
      }
    });
  }

  private render(): void {
    const t = this.controller.t;
    this.locale = t('open');
    this.setTitle(t('filters'));
    this.contentEl.classList.add('seo-audit', 'seo-audit-filters');
    this.contentEl.replaceChildren();
    const searchGroup = el(this.contentEl, 'div', undefined, 'seo-audit-filter-search-group');
    searchGroup.setAttribute('role', 'group');
    searchGroup.setAttribute('aria-label', t('metadataFilter'));
    const search = el(searchGroup, 'input');
    search.type = 'search'; search.placeholder = t('search'); search.setAttribute('aria-label', t('search'));
    search.value = this.filter.search;
    search.oninput = () => {
      this.filter.search = search.value;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.searchTimer = undefined;
        this.changed();
      }, 200);
    };
    select(searchGroup, t('metadataFilter'), [['url', this.controller.data.settings.urlProperty], ...fieldKeys.map(key => [key, key] as [string, string])], this.filter.field, value => {
      this.filter.field = value as TableFilter['field'];
      this.changed();
    });
    this.statusFilter = select(this.contentEl, t('status'), [], this.filter.status, value => {
      this.filter.status = value;
      this.changed();
    });
    this.statusSignature = '';
    this.refreshStatuses();
    this.languageFilter = select(this.contentEl, t('lang'), [], this.filter.language, value => {
      this.filter.language = value;
      this.changed();
    });
    this.languageSignature = '';
    this.refreshLanguages();
    select(this.contentEl, t('presence'), [['any', t('any')], ['present', t('present')], ['missing', t('missing')]], this.filter.presence, value => {
      this.filter.presence = value;
      this.changed();
    });
    const actions = el(this.contentEl, 'div', undefined, 'seo-audit-filter-actions');
    button(actions, t('clear'), () => {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = undefined;
      this.filter.search = '';
      this.filter.status = 'any';
      this.filter.language = 'any';
      this.filter.field = 'url';
      this.filter.presence = 'any';
      this.render();
      this.changed();
    });
  }

  private refreshStatuses(): void {
    const t = this.controller.t;
    const statuses = [...new Set(Object.values(this.controller.data.cache.latest).flatMap(result => result.status === null ? [] : [result.status]))].sort((a, b) => a - b);
    const signature = JSON.stringify([statuses, this.filter.status]);
    if (signature === this.statusSignature) {
      return;
    }
    this.statusSignature = signature;
    const options: [string, string][] = [['any', t('any')], ['unscanned', t('unscanned')], ['errors', t('errors')], ...['1xx', '2xx', '3xx', '4xx', '5xx'].map(value => [value, value] as [string, string]), ...statuses.map(value => [String(value), String(value)] as [string, string])];
    if (!options.some(([value]) => value === this.filter.status)) {
      options.push([this.filter.status, this.filter.status]);
    }
    this.statusFilter.replaceChildren();
    for (const [value, label] of options) {
      el(this.statusFilter, 'option', label).value = value;
    }
    this.statusFilter.value = this.filter.status;
  }

  /** Match language tags case-insensitively while retaining original metadata. */
  private refreshLanguages(): void {
    const t = this.controller.t;
    const languages = [...new Set(this.controller.index.pages().flatMap(page => {
      const lang = this.controller.data.cache.latest[page.url]?.metadata?.lang?.trim().toLowerCase();
      return lang ? [lang] : [];
    }))].sort();
    const signature = JSON.stringify([languages, this.filter.language]);
    if (signature === this.languageSignature) {
      return;
    }
    this.languageSignature = signature;
    const options: [string, string][] = [['any', t('any')], ['missing', t('missing')], ...languages.map(lang => [`lang:${lang}`, lang] as [string, string])];
    if (!options.some(([value]) => value === this.filter.language)) {
      options.push([this.filter.language, this.filter.language.slice('lang:'.length)]);
    }
    this.languageFilter.replaceChildren();
    for (const [value, label] of options) {
      el(this.languageFilter, 'option', label).value = value;
    }
    this.languageFilter.value = this.filter.language;
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.searchTimer !== undefined) {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = undefined;
      this.changed();
    }
    this.contentEl.replaceChildren();
  }
}
