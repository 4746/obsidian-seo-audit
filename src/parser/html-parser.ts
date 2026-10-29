import type { SeoMetadata } from '../types';
import { parseMetadata } from './metadata-parser';

export function parseHtml(html: string): SeoMetadata {
  // DOMParser creates an inert document; page scripts never execute.
  return parseMetadata(new DOMParser().parseFromString(html, 'text/html'));
}
