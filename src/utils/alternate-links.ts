import type { AlternateLinks } from '../types';

/** Keeps repeated language codes without making ordinary entries verbose. */
export function addAlternate(links: AlternateLinks, language: string, href: string): void {
  if (!Object.prototype.hasOwnProperty.call(links, language)) {
    Object.defineProperty(links, language, { value: href, enumerable: true, writable: true, configurable: true });
    return;
  }
  const previous = links[language]!;
  if (Array.isArray(previous)) {
    previous.push(href);
  } else {
    links[language] = [previous, href];
  }
}
