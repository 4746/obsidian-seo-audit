import { describe, expect, it } from 'vitest';
import { parseHtml } from '../src/parser/html-parser';
import { codePointLength } from '../src/utils/string-length';

describe('code point length', () => {
  it.each([['', 0], ['SEO', 3], ['Україна', 7], ['😀𐐀', 2], ['e\u0301', 2], ['👩‍💻', 3]])('counts %s as %i', (s, n) => expect(codePointLength(s)).toBe(n));
});
describe('HTML parser', () => {
  it.each(['en', 'uk', 'en-GB', ' EN-us ', ''])('preserves the root HTML lang attribute %j', lang => {
    expect(parseHtml(`<html lang="${lang}"><body lang="fr"><meta name="lang" content="de"></body></html>`).lang).toBe(lang);
  });
  it('does not infer page language from metadata, alternates or nested elements', () => {
    expect(parseHtml('<meta http-equiv="content-language" content="en"><link rel="alternate" hreflang="uk" href="/uk"><div lang="fr">Text</div>').lang).toBeNull();
    expect(parseHtml('').lang).toBeNull();
  });
  it('stores canonical strings in document order without changing or deduplicating URLs', () => {
    const m = parseHtml('<link rel="canonical" href="https://fbfast.io"><link rel="canonical" href=" /😀?a=1&amp;b=2 "><link rel="canonical" href="https://fbfast.io"><link rel="canonical" href=""><link rel="canonical">');
    expect(m.fields.canonical).toEqual(['https://fbfast.io', ' /😀?a=1&b=2 ', 'https://fbfast.io', '']);
  });
  it('stores language URLs directly and preserves repeated codes and unusual keys', () => {
    const m = parseHtml('<link rel="alternate" hreflang="de" href="/de"><link rel="alternate" hreflang="de" href="/de/other"><link rel="alternate" hreflang="de" href="/de"><link rel="alternate" hreflang="uk" href="/uk"><link rel="alternate" hreflang="__proto__" href="/safe">');
    expect(m.alternates.de).toEqual(['/de', '/de/other', '/de']);
    expect(m.alternates.uk).toBe('/uk');
    expect(Object.prototype.hasOwnProperty.call(m.alternates, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(m.alternates))['__proto__']).toBe('/safe');
  });
  it('preserves duplicate values, whitespace, decoded characters, empty content and lengths', () => {
    const m = parseHtml('<title> A 😀 &amp; B </title><meta name="DESCRIPTION" content="one"><meta name="description" content=""><meta name="description"><meta name="robots" content="noindex"><meta name="robots" content="nofollow"><link rel="CANONICAL other" href="/😀"><h1>First <em>😀</em></h1><h1>Second</h1>');
    expect(m.fields.title).toEqual([{ value: ' A 😀 & B ', length: 9 }]);
    expect(m.fields.description).toEqual([{ value: 'one', length: 3 }, { value: '', length: 0 }]);
    expect(m.fields.robots).toEqual(['noindex', 'nofollow']);
    expect(m.fields.canonical).toEqual(['/😀']);
    expect(m.h1).toEqual([{ value: 'First 😀', length: 7 }, { value: 'Second', length: 6 }]);
    expect(m.h1Count).toBe(2);
  });
  it('collects every OG and Twitter field including duplicates', () => {
    const m = parseHtml(['og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description', 'twitter:image'].map(k => `<meta ${k.startsWith('og') ? 'property' : 'name'}="${k}" content="😀"><meta ${k.startsWith('og') ? 'property' : 'name'}="${k}" content="two">`).join(''));
    for (const [key, values] of Object.entries(m.fields)) {
      if (key.includes(':')) {
        expect(values).toEqual(key.endsWith(':image') ? ['😀', 'two'] : [{ value: '😀', length: 1 }, { value: 'two', length: 3 }]);
      }
    }
  });
  it.each(['robots', 'og:image', 'twitter:image'] as const)('stores %s strings with duplicates, whitespace and empty values', key => {
    const m = parseHtml(`<meta name="${key}" content=" /😀?a=1&amp;b=2 "><meta property="${key}" name="${key}" content=""><meta name="${key}" content=" /😀?a=1&amp;b=2 "><meta name="${key}">`);
    expect(m.fields[key]).toEqual([' /😀?a=1&b=2 ', '', ' /😀?a=1&b=2 ']);
    expect(parseHtml('').fields[key]).toEqual([]);
  });
  it('keeps unlimited language alternates including x-default and raw URL strings', () => {
    const m = parseHtml('<link rel="alternate" hreflang="x-default" href="/">' + Array.from({ length: 200 }, (_, i) => `<link rel="alternate" hreflang="lang-${i}" href="/${i}">`).join(''));
    expect(Object.keys(m.alternates)).toHaveLength(201);
    expect(m.alternates['x-default']).toBe('/');
  });
  it('tolerates malformed HTML, missing values, inert scripts and text safely', () => {
    const m = parseHtml('<script>throw new Error("never execute")</script><meta name="description"><h1>Hello <b>world');
    expect(m.h1[0]?.value).toBe('Hello world');
    expect(m.fields.description).toEqual([]);
    expect(m.fields.canonical).toEqual([]);
    expect(m.alternates).toEqual({});
    expect(parseHtml('').h1Count).toBe(0);
  });
});
