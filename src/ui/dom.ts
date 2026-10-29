import type { IndexedPage } from '../types';
import type { Translator } from '../i18n';

export function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  return parent.createEl(tag, { text, cls: className });
}
export function button(parent: HTMLElement, text: string, action: () => void): HTMLButtonElement {
  const node = el(parent, 'button', text); node.type = 'button'; node.onclick = action; return node;
}
export function select(parent: HTMLElement, label: string, options: [string, string][], value: string, change: (value: string) => void): HTMLSelectElement {
  const wrap = el(parent, 'label', undefined, 'seo-audit-control'); el(wrap, 'span', label);
  const node = el(wrap, 'select'); node.setAttribute('aria-label', label);
  for (const [key, text] of options) {
 const option = el(node, 'option', text); option.value = key; 
}
  node.value = value; node.onchange = () => change(node.value); return node;
}
export function fileLinks(parent: HTMLElement, page: IndexedPage, t: Translator, openFile: (path: string) => void): void {
  for (const path of page.files) {
    const link = el(parent, 'a', path, 'seo-audit-file'); link.href = '#'; link.setAttribute('aria-label', `${t('openFile')}: ${path}`);
    link.onclick = event => {
      event.preventDefault(); event.stopPropagation();
      openFile(path);
    };
  }
}
