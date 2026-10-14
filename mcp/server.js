import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import OpenAI from 'openai';
import { z } from 'zod';
import { collectReport, listPsychologists, getFreeSlots, bookSlot, listBookings } from './tools.js';

const server = new McpServer({
  name: 'healme-ai-tester',
  version: '2.0.0'
});

const defaultUrl = process.env.HEALME_URL || 'http://127.0.0.1:5500/';
const urlArg = { url: z.string().url().optional().describe('Адрес HEALME, по умолчанию ' + defaultUrl) };
const json = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const safe = fn => fn().catch(e => ({ ok: false, error: String((e && e.message) || e) }));

/* ---------- диагностика ---------- */

server.tool(
  'smoke_test',
  'Открывает HEALME в браузере и возвращает технический отчёт для проверки проекта.',
  urlArg,
  ({ url }) => safe(() => collectReport(url)).then(json)
);

server.tool(
  'check_workers',
  'Проверяет наличие ServiceWorker и SharedWorker в HEALME.',
  urlArg,
  async ({ url = defaultUrl }) => {
    const report = await collectReport(url);
    return {
      content: [{
        type: 'text',
        text: [
          `ServiceWorker: ${report.serviceWorker ? 'обнаружен' : 'не обнаружен'}`,
          `SharedWorker API: ${report.sharedWorker ? 'доступен' : 'не доступен'}`,
          `HTTP: ${report.httpStatus}`,
          report.consoleErrors.length ? `Ошибки консоли:\n${report.consoleErrors.join('\n')}` : 'Ошибок консоли не обнаружено.'
        ].join('\n')
      }]
    };
  }
);

server.tool(
  'ai_test',
  'Запускает браузерную проверку HEALME и просит нейросеть найти потенциальные ошибки и предложить тест-кейсы.',
  {
    url: urlArg.url,
    task: z.string().optional()
  },
  async ({ url = defaultUrl, task = 'Проверь приложение как QA-инженер: найди функциональные и технические риски и составь приоритетный список тестов.' }) => {
    const report = await collectReport(url);

    if (!process.env.OPENAI_API_KEY) {
      return {
        content: [{
          type: 'text',
          text: 'OPENAI_API_KEY не задан. Браузерная проверка выполнена, но AI-анализ недоступен.\n\n' +
            JSON.stringify(report, null, 2)
        }]
      };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Ты QA-инженер. Анализируй только предоставленный отчёт. Не выдумывай факты. Отделяй обнаруженные ошибки от рекомендаций.'
        },
        {
          role: 'user',
          content: `${task}\n\nТехнический отчёт HEALME:\n${JSON.stringify(report, null, 2)}`
        }
      ]
    });

    return {
      content: [{
        type: 'text',
        text: completion.choices[0]?.message?.content || 'AI не вернул результат.'
      }]
    };
  }
);

/* ---------- бронирование слотов ---------- */

server.tool(
  'list_psychologists',
  'Возвращает список психологов HEALME: id, имя, специализация, цена, формат и рейтинг.',
  urlArg,
  ({ url }) => safe(() => listPsychologists(url)).then(json)
);

server.tool(
  'get_free_slots',
  'Возвращает свободные слоты у психолога HEALME на ближайшие 14 дней (данные реального интерфейса записи).',
  {
    psychologist: z.string().describe('id или имя психолога, например maria или «Мария Лебедева»'),
    ...urlArg
  },
  ({ psychologist, url }) => safe(() => getFreeSlots({ psychologist, url })).then(json)
);

server.tool(
  'book_slot',
  'Бронирует слот у психолога в HEALME через реальный интерфейс приложения: выбирает день и время, заполняет форму и подтверждает запись. Бронь сохраняется в IndexedDB.',
  {
    psychologist: z.string().describe('id или имя психолога, например maria'),
    name: z.string().describe('Имя клиента (минимум 2 символа)'),
    email: z.string().describe('Email клиента в формате name@mail.ru'),
    day: z.string().optional().describe('Дата в формате YYYY-MM-DD; если не указана — берётся ближайший день со свободными слотами'),
    time: z.string().optional().describe('Время в формате ЧЧ:ММ; если не указано — первый свободный слот выбранного дня'),
    comment: z.string().optional().describe('Необязательный комментарий к записи'),
    ...urlArg
  },
  ({ psychologist, name, email, day, time, comment, url }) =>
    safe(() => bookSlot({ psychologist, name, email, day, time, comment, url })).then(json)
);

server.tool(
  'list_bookings',
  'Возвращает все записи клиента из IndexedDB HEALME: психолог, дата, время, статус, отзыв.',
  urlArg,
  ({ url }) => safe(() => listBookings({ url })).then(json)
);

const transport = new StdioServerTransport();
await server.connect(transport);
