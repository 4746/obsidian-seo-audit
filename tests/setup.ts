// Obsidian's DOM helpers are supplied by the host application in production.
Object.defineProperty(HTMLElement.prototype, 'createEl', {
  configurable: true,
  value: function <K extends keyof HTMLElementTagNameMap>(this: HTMLElement, tag: K, options?: { text?: string; cls?: string }): HTMLElementTagNameMap[K] {
    const element = this.ownerDocument.createElement(tag);
    if (options?.text !== undefined) element.textContent = options.text;
    if (options?.cls) element.className = options.cls;
    this.appendChild(element);
    return element;
  },
});
