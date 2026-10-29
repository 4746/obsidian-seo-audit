import type { FieldValue } from '../types';

/** Count Unicode code points, including combining marks individually. */
export const codePointLength = (value: string): number => Array.from(value).length;
export const fieldValue = (value: string): FieldValue => ({ value, length: codePointLength(value) });

