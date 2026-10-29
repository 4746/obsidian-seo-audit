import type { AuditSettings } from '../types';
import { en, type Message } from './en';
import { uk } from './uk';

export function translator(language: AuditSettings['language'], obsidianLocale: string): (key: Message) => string {
  const code = language === 'auto' ? obsidianLocale.toLowerCase().split(/[-_]/)[0] : language;
  return key => (code === 'uk' ? uk[key] : en[key]) ?? en[key];
}
export type Translator = ReturnType<typeof translator>;
