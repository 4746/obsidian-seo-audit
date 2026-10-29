import { expect, it } from 'vitest';
import { frontmatterUrls, UrlIndex } from '../src/indexer/url-indexer';
it('accepts HTTP(S) strings/lists and rejects unsupported or malformed values', () => {
  expect(frontmatterUrls([' https://a.test ', 'https://a.test', 'javascript:alert(1)', 5, null, '/relative', 'bad', 'http://b.test'])).toEqual(['https://a.test', 'http://b.test']);
});
it('deduplicates URLs while retaining every file, and handles update/rename/delete', () => {
  const index = new UrlIndex();
  index.update('a.md', 'https://a.test'); index.update('b.md', 'https://a.test');
  expect(index.pages()).toEqual([{ url: 'https://a.test', files: ['a.md', 'b.md'] }]);
  index.update('a.md', 'https://b.test'); index.remove('b.md');
  expect(index.pages()).toEqual([{ url: 'https://b.test', files: ['a.md'] }]);
  index.remove('a.md'); index.update('renamed.md', 'https://b.test');
  expect(index.pages()[0]?.files).toEqual(['renamed.md']);
  index.update('renamed.md', undefined); expect(index.pages()).toEqual([]);
});
