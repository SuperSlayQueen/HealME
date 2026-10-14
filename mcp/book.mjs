/* Быстрая бронь слота из командной строки — без MCP-клиента.
 * Использует те же инструменты, что и MCP-сервер (tools.js).
 *
 * Примеры:
 *   npm run book -- --psy maria --name "Анна Смирнова" --email anna@mail.ru
 *   npm run book -- --psy "Игорь Соколов" --name Анна --email a@ya.ru --day 2026-10-20 --time 15:30
 *   node book.mjs --psy elena --name Анна --email a@ya.ru        (день и время подберутся сами)
 */
import { bookSlot, getFreeSlots, closeBrowser } from './tools.js';

const argv = process.argv.slice(2);
const arg = name => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) { console.error('Не указано значение --' + name); process.exit(2); }
  return v;
};

const psychologist = arg('psy') || 'maria';
const name = arg('name');
const email = arg('email');
const day = arg('day');
const time = arg('time');

if (!name || !email) {
  console.error('Нужно указать --name и --email. Например:\n' +
    '  npm run book -- --psy maria --name "Анна Смирнова" --email anna@mail.ru');
  process.exit(2);
}

const url = process.env.HEALME_URL || 'http://127.0.0.1:5500/';

try {
  if (!day || !time) {
    const slots = await getFreeSlots({ psychologist, url });
    if (!slots.ok) { console.error(slots.error); process.exit(1); }
    if (!day) console.log(`Свободные дни у «${slots.psychologist.name}»: ${slots.days.map(d => d.day).join(', ')}`);
  }

  const result = await bookSlot({ psychologist, name, email, day, time, url });
  if (!result.ok) {
    console.error('Бронь не удалась:', result.error);
    if (result.freeSlots) console.error('Свободные слоты:', result.freeSlots.join(', '));
    process.exit(1);
  }
  console.log(result.message);
  console.log('Запись в IndexedDB:', JSON.stringify(result.booking));
} finally {
  await closeBrowser();
}
