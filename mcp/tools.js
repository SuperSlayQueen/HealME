/* HEALME MCP tools
 * Общая логика инструментов MCP-сервера: управление Playwright-браузером
 * с постоянным профилем (данные брони в IndexedDB живут между вызовами),
 * чтение IndexedDB и реализация инструментов бронирования слотов.
 * Бронь выполняется через реальный интерфейс приложения — как у пользователя.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROFILE_DIR = path.join(__dirname, '.profile');
export const defaultUrl = process.env.HEALME_URL || 'http://127.0.0.1:5500/';

let contextPromise = null;
let queue = Promise.resolve();

export function resetProfile() {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  contextPromise = null;
}

export async function closeBrowser() {
  if (contextPromise) {
    const context = await contextPromise;
    contextPromise = null;
    await context.close();
  }
}

function getContext() {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(PROFILE_DIR, { headless: true });
  }
  return contextPromise;
}

// Постоянный контекст не допускает параллельного запуска на одной папке профиля,
// поэтому все обращения к браузеру выстраиваются в очередь. Контекст закрывается
// после каждого вызова: профиль свободен между вызовами, и его может занять,
// например, видимое окно `npm run show` для демонстрации брони.
function withPage(url, fn, before) {
  const run = queue.then(async () => {
    let context;
    try {
      context = await getContext();
    } catch (e) {
      contextPromise = null; // неудачный запуск не должен кэшироваться
      throw e;
    }
    const page = await context.newPage();
    try {
      if (before) before(page);
      const response = await page.goto(normBase(url), { waitUntil: 'load', timeout: 30000 });
      // первый рендер происходит после готовности IndexedDB (миграция + чтение)
      await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0, null, { timeout: 15000 });
      return await fn(page, response);
    } finally {
      await page.close().catch(() => {});
      contextPromise = null;
      await context.close().catch(() => {});
    }
  });
  queue = run.then(() => {}, () => {});
  return run;
}

export const normBase = url => {
  const u = String(url || defaultUrl).replace(/#.*$/, '');
  return u.endsWith('/') ? u : u + '/';
};

/* ---------- чтение IndexedDB из страницы ---------- */
async function readKV(page, key) {
  return page.evaluate(async key => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('healme', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const rq = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        rq.onsuccess = () => resolve(rq.result === undefined ? null : rq.result);
        rq.onerror = () => reject(rq.error);
      });
    } finally {
      db.close();
    }
  }, key);
}

/* ---------- работа с психологами ---------- */
function findPsy(psys, query) {
  const q = String(query || '').trim().toLowerCase();
  return psys.find(p => p.id.toLowerCase() === q)
    || psys.find(p => p.name.toLowerCase() === q)
    || (q.length >= 3 && psys.find(p => p.name.toLowerCase().includes(q)))
    || null;
}

const psyBrief = p => ({ id: p.id, name: p.name, role: p.role, price: p.price, formats: p.fmt });

async function gotoTime(page, base, pid) {
  await page.evaluate(h => { location.hash = h; }, '#/time/' + pid);
  await page.waitForSelector('[data-act="day"]', { timeout: 10000 });
}

async function selectDay(page, day) {
  await page.click(`[data-act="day"][data-v="${day}"]`);
  await page.waitForSelector(`.dc.on[data-v="${day}"]`, { timeout: 5000 });
  return page.$$eval('.sl', els => els.filter(e => !e.disabled).map(e => e.dataset.v));
}

async function freeDays(page, dayValues) {
  const days = [];
  for (const d of dayValues) {
    const slots = await selectDay(page, d);
    if (slots.length) days.push({ day: d, freeSlots: slots });
  }
  return days;
}

/* ---------- инструменты ---------- */

// Технический отчёт о странице (smoke_test, check_workers, ai_test).
export async function collectReport(url = defaultUrl) {
  const consoleErrors = [];
  const pageErrors = [];
  return withPage(url, async (page, response) => {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const title = await page.title();
    const links = await page.locator('a').evaluateAll(items =>
      items.slice(0, 100).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') }))
    );
    return {
      url: normBase(url),
      httpStatus: response?.status() ?? null,
      title,
      consoleErrors,
      pageErrors,
      links,
      serviceWorker: await page.evaluate(() => !!navigator.serviceWorker?.controller),
      sharedWorker: await page.evaluate(() => 'SharedWorker' in window)
    };
  }, page => {
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
  });
}

export async function listPsychologists(url = defaultUrl) {
  return withPage(url, async page => {
    const list = await page.evaluate(() => (window.PSY || []).map(p => ({
      id: p.id, name: p.name, role: p.role, experienceYears: p.exp, price: p.price,
      formats: p.fmt, tags: p.tags, rating: p.rating, reviewsCount: p.count
    })));
    return { ok: true, count: list.length, psychologists: list };
  });
}

export async function getFreeSlots({ psychologist, url = defaultUrl }) {
  return withPage(url, async page => {
    const psys = await page.evaluate(() => window.PSY || []);
    const p = findPsy(psys, psychologist);
    if (!p) return { ok: false, error: `Психолог «${psychologist}» не найден. Доступны: ${psys.map(x => x.id).join(', ')}.` };
    await gotoTime(page, normBase(url), p.id);
    const dayValues = await page.$$eval('[data-act="day"]', els => els.map(e => e.dataset.v));
    const days = await freeDays(page, dayValues);
    return {
      ok: true,
      psychologist: psyBrief(p),
      days,
      note: 'Расписание на ближайшие 14 дней, начиная с завтрашнего. Занятые времена не включены.'
    };
  });
}

export async function bookSlot({ psychologist, day, time, name, email, comment = '', url = defaultUrl }) {
  const nameTrimmed = String(name || '').trim();
  const emailTrimmed = String(email || '').trim();
  if (nameTrimmed.length < 2) return { ok: false, error: 'Имя должно быть не короче 2 символов.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed)) return { ok: false, error: 'Укажите email в формате name@mail.ru.' };
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return { ok: false, error: 'Дата должна быть в формате YYYY-MM-DD.' };
  if (time && !/^\d{2}:\d{2}$/.test(String(time))) return { ok: false, error: 'Время должно быть в формате ЧЧ:ММ.' };

  return withPage(url, async page => {
    const psys = await page.evaluate(() => window.PSY || []);
    const p = findPsy(psys, psychologist);
    if (!p) return { ok: false, error: `Психолог «${psychologist}» не найден. Доступны: ${psys.map(x => x.id).join(', ')}.` };
    const base = normBase(url);
    await gotoTime(page, base, p.id);
    const dayValues = await page.$$eval('[data-act="day"]', els => els.map(e => e.dataset.v));

    // приложение не позволяет клиенту иметь две встречи в одно время —
    // при автоподборе пропускаем времена, уже занятые существующими записями
    const existing = (await readKV(page, 'b')) || [];
    const slotTakenByOther = (d, t) => existing.some(b => b.st === 'ok' && b.day === d && b.t === t);

    let chosenDay = day ? String(day) : null;
    let chosenFree = null;
    if (chosenDay && !dayValues.includes(chosenDay)) {
      return { ok: false, error: `Дата ${chosenDay} недоступна для записи.`, availableDays: dayValues };
    }
    if (chosenDay) {
      chosenFree = await selectDay(page, chosenDay);
    } else {
      for (const d of dayValues) {
        const slots = (await selectDay(page, d)).filter(t => !slotTakenByOther(d, t));
        if (slots.length) { chosenDay = d; chosenFree = slots; break; }
      }
      if (!chosenDay) return { ok: false, error: 'У психолога нет свободных слотов на ближайшие 14 дней.' };
    }

    const free = chosenFree;
    let chosenTime = time ? String(time) : null;
    if (chosenTime && !free.includes(chosenTime)) {
      return { ok: false, error: `Слот ${chosenTime} на ${chosenDay} занят или недоступен.`, freeSlots: free };
    }
    if (!chosenTime) {
      if (!free.length) return { ok: false, error: `На ${chosenDay} свободных слотов нет.`, availableDays: dayValues };
      chosenTime = free[0];
    }

    await page.click(`[data-act="slot"][data-v="${chosenTime}"]`);
    await page.click('[data-act="next"]');
    await page.waitForSelector('#fn', { timeout: 10000 });
    await page.fill('#fn', nameTrimmed);
    await page.fill('#fm', emailTrimmed);
    if (comment) await page.fill('#fcm', String(comment).slice(0, 300));
    if (!(await page.isChecked('#fk'))) await page.check('#fk');
    await page.click('[data-act="submit"]');

    // ждём подтверждение либо ошибку формы/модального окна
    let booked = false, errorMsg = null;
    for (let i = 0; i < 60 && !booked && !errorMsg; i++) {
      await page.waitForTimeout(100);
      booked = /#\/done\/ok\?b=/.test(page.url());
      if (!booked) {
        errorMsg = await page.evaluate(() => {
          const g = document.getElementById('e-g');
          if (g && g.textContent.trim()) return g.textContent.trim();
          const er = document.querySelector('.fld.er .em, label.er .em');
          if (er && er.textContent.trim()) return er.textContent.trim();
          const ek = document.getElementById('e-k');
          if (ek && ek.textContent.trim()) return ek.textContent.trim();
          const md = document.querySelector('.md h3');
          if (md && md.textContent.trim()) return md.textContent.trim();
          return null;
        });
      }
    }
    if (!booked) {
      return { ok: false, error: errorMsg || 'Не удалось подтвердить бронь.', psychologist: p.name, day: chosenDay, time: chosenTime };
    }

    const bookingId = (new URL(page.url()).hash.match(/b=(\w+)/) || [])[1] || null;
    const all = (await readKV(page, 'b')) || [];
    const rec = all.find(b => b.id === bookingId) || null;
    const headline = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() || '';
    return {
      ok: true,
      message: `Бронь оформлена: ${p.name}, ${chosenDay} ${chosenTime}. Экран: «${headline}».`,
      bookingId,
      booking: rec ? {
        id: rec.id, psychologist: p.name, day: rec.day, time: rec.t,
        client: rec.name, email: rec.mail, status: rec.st
      } : null,
      storage: 'IndexedDB (healme/kv)'
    };
  });
}

export async function listBookings({ url = defaultUrl } = {}) {
  return withPage(url, async page => {
    const raw = (await readKV(page, 'b')) || [];
    const names = await page.evaluate(() => Object.fromEntries((window.PSY || []).map(p => [p.id, p.name])));
    const list = raw.map(b => ({
      id: b.id,
      psychologist: names[b.pid] || b.pid,
      day: b.day,
      time: b.t,
      client: b.name,
      email: b.mail,
      status: b.st === 'cancelled' ? 'отменена' : (+new Date(b.day + 'T' + b.t + ':00') < Date.now() ? 'прошла' : 'предстоит'),
      comment: b.cm || '',
      moves: b.moves || 0,
      review: b.review ? { rating: b.review.r, text: b.review.txt } : null
    })).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
    return { ok: true, count: list.length, bookings: list, storage: 'IndexedDB (healme/kv)' };
  });
}
