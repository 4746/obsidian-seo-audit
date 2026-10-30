import {Modal, type App} from 'obsidian';
import type {AuditController} from './audit-controller';
import {button, el} from './dom';

/** Requires explicit confirmation before clearing the persisted scan cache. */
export class ClearResultsModal extends Modal {
	private unsubscribe: (() => void) | null = null;
	private locale = '';

	constructor(app: App, private controller: AuditController) {
		super(app);
	}

	onOpen(): void {
		this.render();
		this.unsubscribe = this.controller.subscribe(() => {
			if (this.locale !== this.controller.t('clearResults')) {
				this.render();
			}
		});
	}

	private render(): void {
		const t = this.controller.t;
		this.locale = t('clearResults');
		this.setTitle(t('clearResults'));
		this.contentEl.replaceChildren();
		this.contentEl.classList.add('seo-audit-clear-results');
		el(this.contentEl, 'p', t('clearResultsConfirm'));
		const actions = el(this.contentEl, 'div', undefined, 'modal-button-container');
		button(actions, t('cancel'), () => this.close());
		button(actions, t('clearResults'), () => {
			this.close();
			void this.controller.clearResults();
		}).classList.add('mod-warning');
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.contentEl.replaceChildren();
	}
}
