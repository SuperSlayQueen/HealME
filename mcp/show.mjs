/* Открывает HEALME в видимом окне браузера с профилем MCP (mcp/.profile).
 * Показывает те же данные IndexedDB, с которыми работает MCP-сервер:
 * брони, созданные через book_slot / npm run book, видны в «Моих записях».
 * Окно остаётся открытым, пока его не закрыть (или Ctrl+C).
 *
 * Важно: профиль занят, пока MCP выполняет вызов инструмента —
 * запускайте между вызовами.
 */
import { chromium } from 'playwright';
import { PROFILE_DIR, defaultUrl, closeBrowser } from './tools.js';

await closeBrowser(); // если в этом процессе остался контекст — освобождаем

// Git Bash в Windows превращает аргумент «#/my» в путь файловой системы —
// такие аргументы отбрасываем, показываем список записей
const raw = process.argv[2] || 'my';
const route = /^#?\/?[a-z0-9][a-z0-9/?=&.-]*$/i.test(raw) ? raw.replace(/^#?\/?/, '#/') : '#/my';
const url = (process.env.HEALME_URL || defaultUrl).replace(/#.*$/, '') + route;

const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
const page = context.pages()[0] || await context.newPage();
await page.goto(url, { waitUntil: 'load', timeout: 30000 });
console.log('HEALME открыт в окне браузера:', url);
console.log('Здесь те же записи, что и у MCP (профиль mcp/.profile). Закройте окно для выхода.');

await new Promise(resolve => context.on('close', resolve));
process.exit(0);
