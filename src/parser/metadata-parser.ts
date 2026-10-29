import { fieldKeys, type SeoMetadata } from '../types';
import { fieldValue } from '../utils/string-length';
import { addAlternate } from '../utils/alternate-links';

export function parseMetadata(doc: Document): SeoMetadata {
  const fields = Object.fromEntries(fieldKeys.map(key => [key, []])) as unknown as SeoMetadata['fields'];
  for (const title of doc.querySelectorAll('title')) {
fields.title.push(fieldValue(title.textContent ?? ''));
}
  for (const meta of doc.querySelectorAll('meta')) {
    const name = (meta.getAttribute('name') ?? '').toLowerCase();
    const property = (meta.getAttribute('property') ?? '').toLowerCase();
    for (const key of fieldKeys) {
      if (key === 'title' || key === 'canonical') {
continue;
}
      const matches = key.includes(':') ? property === key || name === key : name === key;
      if (matches && meta.hasAttribute('content')) {
fields[key].push(fieldValue(meta.getAttribute('content')!));
}
    }
  }
  const alternates = Object.create(null) as SeoMetadata['alternates'];
  for (const link of doc.querySelectorAll('link')) {
    const rels = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    const href = link.getAttribute('href');
    if (rels.includes('canonical') && href !== null) {
fields.canonical.push(fieldValue(href));
}
    const lang = link.getAttribute('hreflang');
    if (rels.includes('alternate') && lang !== null && href !== null) {
      addAlternate(alternates, lang, href);
    }
  }
  const h1 = Array.from(doc.querySelectorAll('h1'), el => fieldValue(el.textContent ?? ''));
  return { fields, alternates, h1, h1Count: h1.length };
}
