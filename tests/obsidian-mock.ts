// Small public-API surface used by DOM integration tests. No production bundle imports this file.
export class ItemView {
  contentEl = Object.assign(document.createElement('div'), { addClass: (...names: string[]) => this.contentEl.classList.add(...names) });
  app: unknown;
  constructor(leaf: { app: unknown }) { this.app = leaf.app; }
}
export class Notice { constructor(public text: string) {} }
export class TFile {
  extension = 'md';
  constructor(public path: string) {}
}
