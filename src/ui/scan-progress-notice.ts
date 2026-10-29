import { Notice } from 'obsidian';
import type { Translator } from '../i18n';
import type { ScanProgress } from '../types';
import { button, el } from './dom';

/** One native notification per scan, shared by the table and sidebar. */
export class ScanProgressNotice {
  private notice: Notice | null = null;
  private content = createDiv();
  private heading = el(this.content, 'strong');
  private counter = el(this.content, 'div', undefined, 'seo-audit-scan-counter');
  private progress = el(this.content, 'progress');
  private stopButton: HTMLButtonElement;

  constructor(private translate: () => Translator, stop: () => void) {
    this.content.className = 'seo-audit-scan-notice';
    this.counter.setAttribute('role', 'status');
    this.stopButton = button(this.content, '', stop);
    this.stopButton.addEventListener('click', event => event.stopPropagation());
  }

  update(state: ScanProgress): void {
    if (!state.running) {
      this.hide();
      return;
    }
    const t = this.translate();
    this.heading.textContent = `${t('pluginName')} · ${t('running')}`;
    this.counter.textContent = `${t('scannedPages')} ${state.completed} ${t('of')} ${state.total}`;
    this.progress.max = state.total || 1;
    this.progress.value = state.completed;
    this.progress.setAttribute('aria-label', t('running'));
    this.stopButton.textContent = t('stop');
    if (!this.notice) {
      const fragment = createFragment(fragment => {
        fragment.appendChild(this.content);
      });
      this.notice = new Notice(fragment, 0);
    }
  }

  hide(): void {
    this.notice?.hide();
    this.notice = null;
  }
}
