// Small public-API surface used by DOM integration tests. No production bundle imports this file.
export class ItemView {
  contentEl = Object.assign(document.createElement('div'), { addClass: (...names: string[]) => this.contentEl.classList.add(...names) });
  onPaneMenu(): void {}
  app: unknown;
  constructor(public leaf: { app: unknown; detach?: () => void }) { this.app = leaf.app; }
}
export class Notice {
  static instances: Notice[] = [];
  messageEl = document.createElement('div');
  hidden = false;
  constructor(public text: string | DocumentFragment, public duration?: number) {
    if (typeof text === 'string') this.messageEl.textContent = text;
    else this.messageEl.appendChild(text);
    Notice.instances.push(this);
  }
  hide() { this.hidden = true; }
}
export class TFile {
  extension = 'md';
  constructor(public path: string) {}
}

export class MenuItem {
  title = ''; disabled = false; action = () => {};
  setTitle(title: string) { this.title = title; return this; }
  setIcon() { return this; }
  setDisabled(disabled: boolean) { this.disabled = disabled; return this; }
  onClick(action: () => void) { this.action = action; return this; }
}
export class Menu {
  items: MenuItem[] = [];
  addItem(build: (item: MenuItem) => void) { const item = new MenuItem(); build(item); this.items.push(item); return this; }
  addSeparator() { return this; }
}
export class Modal {
  contentEl = document.createElement('div');
  constructor(_app: unknown) {}
  setTitle(title: string) { this.contentEl.setAttribute('aria-label', title); }
  onOpen(): void {}
  onClose(): void {}
  open() { document.body.appendChild(this.contentEl); this.onOpen(); }
  close() { this.onClose(); this.contentEl.remove(); }
}

export function setIcon(element: HTMLElement, icon: string): void { element.dataset.icon = icon; }
export function setTooltip(element: HTMLElement, tooltip: string): void { element.dataset.tooltip = tooltip; }
