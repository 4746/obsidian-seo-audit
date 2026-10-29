import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { AuditController } from './audit-controller';
import { renderAuditDetails } from './audit-details';
import { el } from './dom';

export const DETAILS_VIEW_TYPE = 'seo-audit-details';

/** Native sidebar view shared by all audit tables. */
export class AuditDetailsView extends ItemView {
  private url: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: number | undefined;
  private host!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private controller: AuditController) {
    super(leaf);
  }

  getViewType(): string {
    return DETAILS_VIEW_TYPE;
  }
  getDisplayText(): string {
    return this.controller.t('details');
  }
  getIcon(): string {
    return 'file-search';
  }

  setPage(url: string): void {
    if (this.url !== url) {
      this.contentEl.scrollTop = 0;
    }
    this.url = url;
    this.render();
  }

  async onOpen(): Promise<void> {
    this.contentEl.classList.add('seo-audit', 'seo-audit-details-sidebar');
    this.host = el(this.contentEl, 'section', undefined, 'seo-audit-details');
    this.render();
    this.unsubscribe = this.controller.subscribe(() => {
      if (this.timer !== undefined) {
        return;
      }
      this.timer = window.setTimeout(() => {
        this.timer = undefined;
        this.render();
      }, 150);
    });
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.clearTimeout(this.timer);
  }

  private render(): void {
    const top = this.contentEl.scrollTop;
    renderAuditDetails(this.host, this.controller, this.url, path => {
      const file = this.app.vault.getFileByPath(path);
      if (file) {
        void this.app.workspace.getLeaf(true).openFile(file);
      }
    }, () => this.leaf.detach());
    this.contentEl.scrollTop = top;
  }
}
