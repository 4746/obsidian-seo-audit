import { lengthFields, type AuditSettings } from '../types';

/** Returns the configured threshold only for fields with a length rule. */
export function getLengthLimit(field: string, settings: AuditSettings): number | null {
  const key = lengthFields.find(key => key === field);
  return key ? settings.lengthLimits[key] : null;
}
