import { Modal, type App } from 'obsidian';
import type { AuditController } from './audit-controller';
import { columns, columnLabel } from './audit-table';
import { el } from './dom';

/** Applies column choices immediately using the existing settings storage. */
export class TableSettingsModal extends Modal {
  private locale = '';
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, private plugin: AuditController, private renderTable: () => void) {
    super(app);
  }

  onOpen(): void {
    this.render();
    this.unsubscribe = this.plugin.subscribe(() => {
      if (this.locale !== this.plugin.t('open')) this.render();
    });
  }

  private render(): void {
    const t = this.plugin.t;
    this.locale = t('open');
    this.contentEl.classList.add('seo-audit');
    this.setTitle(t('tableSettings'));
    this.contentEl.replaceChildren();
    el(this.contentEl, 'h3', t('columns'));
    const choices = el(this.contentEl, 'ul', undefined, 'seo-audit-column-choices');
    for (const column of columns.filter(column => column !== 'url')) {
      const row = el(choices, 'li');
      const label = el(row, 'label');
      const checkbox = el(label, 'input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.plugin.data.settings.visibleColumns.includes(column);
      el(label, 'span', columnLabel(column, t));
      checkbox.onchange = () => {
        const visible = new Set(this.plugin.data.settings.visibleColumns);
        if (checkbox.checked) visible.add(column); else visible.delete(column);
        this.plugin.data.settings.visibleColumns = [...visible];
        this.plugin.scheduleSave();
        this.renderTable();
      };
    }
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.contentEl.replaceChildren();
  }
}
