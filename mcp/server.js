import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright';
import OpenAI from 'openai';
import { z } from 'zod';

const server = new McpServer({
  name: 'healme-ai-tester',
  version: '1.0.0'
});

const defaultUrl = process.env.HEALME_URL || 'http://127.0.0.1:5500/';

async function collectReport(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const title = await page.title();
  const links = await page.locator('a').evaluateAll(items =>
    items.slice(0, 100).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') }))
  );

  const report = {
    url,
    httpStatus: response?.status() ?? null,
    title,
    consoleErrors,
    pageErrors,
    links,
    serviceWorker: await page.evaluate(() => !!navigator.serviceWorker?.controller),
    sharedWorker: await page.evaluate(() => 'SharedWorker' in window)
  };

  await browser.close();
  return report;
}

server.tool(
  'smoke_test',
  'Открывает HEALME в браузере и возвращает технический отчёт для проверки проекта.',
  { url: z.string().url().optional() },
  async ({ url = defaultUrl }) => {
    const report = await collectReport(url);
    return {
      content: [{ type: 'text', text: JSON.stringify(report, null, 2) }]
    };
  }
);

server.tool(
  'ai_test',
  'Запускает браузерную проверку HEALME и просит нейросеть найти потенциальные ошибки и предложить тест-кейсы.',
  {
    url: z.string().url().optional(),
    task: z.string().optional()
  },
  async ({ url = defaultUrl, task = 'Проверь приложение как QA-инженер: найди функциональные и технические риски и составь приоритетный список тестов.' }) => {
    const report = await collectReport(url);

    if (!process.env.OPENAI_API_KEY) {
      return {
        content: [{
          type: 'text',
          text: 'OPENAI_API_KEY не задан. Браузерная проверка выполнена, но AI-анализ недоступен.\\n\\n' +
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
          content: `${task}\\n\\nТехнический отчёт HEALME:\\n${JSON.stringify(report, null, 2)}`
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

server.tool(
  'check_workers',
  'Проверяет наличие ServiceWorker и SharedWorker в HEALME.',
  { url: z.string().url().optional() },
  async ({ url = defaultUrl }) => {
    const report = await collectReport(url);
    return {
      content: [{
        type: 'text',
        text: [
          `ServiceWorker: ${report.serviceWorker ? 'обнаружен' : 'не обнаружен'}`,
          `SharedWorker API: ${report.sharedWorker ? 'доступен' : 'не доступен'}`,
          `HTTP: ${report.httpStatus}`,
          report.consoleErrors.length ? `Ошибки консоли:\\n${report.consoleErrors.join('\\n')}` : 'Ошибок консоли не обнаружено.'
        ].join('\\n')
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
