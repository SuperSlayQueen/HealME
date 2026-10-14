
import { chromium } from 'playwright';

const url = process.env.HEALME_URL || 'http://127.0.0.1:5500/';
const browser = await chromium.launch({ headless: true });

const errors = [];

try {
  const page = await browser.newPage();

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  // Ожидаем загрузку страницы, не всех сетевых запросов.
  const response = await page.goto(url, {
    waitUntil: 'load',
    timeout: 60000
  });

  if (!response || response.status() >= 400) {
    throw new Error(
      `HEALME недоступен: HTTP ${response?.status() ?? 'нет ответа'}`
    );
  }

  console.log('Главная страница открылась.');

  // Проверяем каталог психологов.
  const catalogLink = page.locator('a[href="#/psychologists"]').first();

  if (await catalogLink.count() === 0) {
    throw new Error('Не найдена ссылка на каталог психологов.');
  }

  await catalogLink.click();
  await page.waitForTimeout(500);

  if (
    !await page.locator('h1')
      .filter({ hasText: 'Психологи' })
      .count()
  ) {
    throw new Error('Не открылся каталог психологов.');
  }

  console.log('Каталог психологов работает.');

  // Проверяем карточку психолога.
  await page.goto(`${url}#/psychologist/maria`, {
    waitUntil: 'load',
    timeout: 60000
  });

  await page.waitForTimeout(500);

  if (!await page.locator('h1').count()) {
    throw new Error('Не открылась карточка психолога.');
  }

  console.log('Карточка психолога открывается.');

  if (errors.length > 0) {
    throw new Error(
      'Обнаружены ошибки браузера:\n' + errors.join('\n')
    );
  }

  console.log('HEALME smoke test: OK');
} finally {
  await browser.close();
}
