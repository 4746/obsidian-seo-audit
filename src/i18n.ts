import type { AuditSettings } from './types';

const en = {
  open: 'Open SEO Audit', all: 'Scan all', selected: 'Scan selected', stop: 'Stop', search: 'Search URLs, files and metadata…',
  status: 'HTTP status', any: 'All', unscanned: 'Not scanned', errors: 'Errors', present: 'Present', missing: 'Missing',
  metadataFilter: 'Metadata filter', columns: 'Columns', exportJson: 'Export JSON', exportCsv: 'Export CSV',
  files: 'Source files', url: 'URL', finalUrl: 'Final URL', responseTimeMs: 'HTTP response time (ms)', scannedAt: 'Last scan',
  h1Count: 'H1 count', h1: 'H1 headings', alternates: 'Language alternates', xRobotsTag: 'X-Robots-Tag',
  empty: 'No matching pages. Add an HTTP(S) URL to the configured frontmatter property.',
  unknown: 'Unavailable', never: 'Never', details: 'Page details', close: 'Close details',
  select: 'Select page', selectPage: 'Select visible page', previous: 'Previous', next: 'Next', page: 'Page',
  of: 'of', pages: 'pages', value: 'Original value', length: 'Length (code points)',
  error: 'Error', contentType: 'Content type', noDetails: 'Select a row to inspect all metadata.',
  idle: 'Ready', running: 'Scanning', completed: 'completed', active: 'active',
  settings: 'SEO Audit settings', property: 'Frontmatter URL property',
  propertyHelp: 'Top-level YAML property containing an HTTP(S) URL or a list of URLs. Default: url.',
  concurrency: 'Parallel requests', concurrencyHelp: 'Maximum concurrent HTTP requests (1–20). Default: 3.',
  timeout: 'Request timeout (seconds)', timeoutHelp: '1–300 seconds. Timed-out native requests retain their slot until they finish.',
  language: 'Interface language', auto: 'Automatic (Obsidian)',
  saveFailed: 'Could not save SEO Audit data. Check storage and try again.',
  scanFailed: 'SEO Audit scan failed', loadFailed: 'SEO Audit could not load its data',
  openFile: 'Open Markdown file', openUrl: 'Open URL in browser', downloadFailed: 'Could not export results',
  settingsSaved: 'Settings saved', selectedCount: 'selected', reindex: 'Refresh index',
  timeoutError: 'Request timed out', networkError: 'Network error', nonHtmlError: 'Non-HTML response',
  parseError: 'HTML parsing error', invalidError: 'Invalid HTTP response', httpError: 'HTTP error',
};
type Message = keyof typeof en;
const uk: Record<Message, string> = {
  open: 'Відкрити SEO Audit', all: 'Перевірити всі', selected: 'Перевірити вибрані', stop: 'Зупинити', search: 'Пошук за URL, файлами та метаданими…',
  status: 'HTTP-статус', any: 'Усі', unscanned: 'Не перевірено', errors: 'Помилки', present: 'Є значення', missing: 'Відсутнє',
  metadataFilter: 'Фільтр метаданих', columns: 'Стовпці', exportJson: 'Експорт JSON', exportCsv: 'Експорт CSV',
  files: 'Вихідні файли', url: 'URL', finalUrl: 'Кінцевий URL', responseTimeMs: 'Час HTTP-відповіді (мс)', scannedAt: 'Остання перевірка',
  h1Count: 'Кількість H1', h1: 'Заголовки H1', alternates: 'Мовні альтернативи', xRobotsTag: 'X-Robots-Tag',
  empty: 'Відповідних сторінок немає. Додайте HTTP(S) URL у налаштовану властивість frontmatter.',
  unknown: 'Недоступно', never: 'Ніколи', details: 'Деталі сторінки', close: 'Закрити деталі',
  select: 'Вибрати сторінку', selectPage: 'Вибрати видимі рядки', previous: 'Назад', next: 'Далі', page: 'Сторінка',
  of: 'з', pages: 'сторінок', value: 'Оригінальне значення', length: 'Довжина (Unicode code points)',
  error: 'Помилка', contentType: 'Тип вмісту', noDetails: 'Виберіть рядок для перегляду всіх метаданих.',
  idle: 'Готово', running: 'Сканування', completed: 'завершено', active: 'активних',
  settings: 'Налаштування SEO Audit', property: 'URL-властивість frontmatter',
  propertyHelp: 'Властивість верхнього рівня YAML з HTTP(S) URL або списком URL. Типово: url.',
  concurrency: 'Паралельні запити', concurrencyHelp: 'Максимальна кількість одночасних HTTP-запитів (1–20). Типово: 3.',
  timeout: 'Таймаут запиту (секунди)', timeoutHelp: '1–300 секунд. Нативний запит після таймауту займає слот до свого завершення.',
  language: 'Мова інтерфейсу', auto: 'Автоматично (Obsidian)',
  saveFailed: 'Не вдалося зберегти дані SEO Audit. Перевірте сховище й повторіть спробу.',
  scanFailed: 'Не вдалося виконати сканування SEO Audit', loadFailed: 'SEO Audit не вдалося завантажити свої дані',
  openFile: 'Відкрити Markdown-файл', openUrl: 'Відкрити URL у браузері', downloadFailed: 'Не вдалося експортувати результати',
  settingsSaved: 'Налаштування збережено', selectedCount: 'вибрано', reindex: 'Оновити індекс',
  timeoutError: 'Перевищено час очікування', networkError: 'Помилка мережі', nonHtmlError: 'Відповідь не є HTML',
  parseError: 'Помилка парсингу HTML', invalidError: 'Некоректна HTTP-відповідь', httpError: 'HTTP-помилка',
};

export function translator(language: AuditSettings['language'], obsidianLocale: string): (key: Message) => string {
  const code = language === 'auto' ? obsidianLocale.toLowerCase().split(/[-_]/)[0] : language;
  return key => (code === 'uk' ? uk[key] : en[key]) ?? en[key];
}
export type Translator = ReturnType<typeof translator>;
