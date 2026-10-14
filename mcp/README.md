# HEALME MCP AI Tester

Это отдельный MCP-сервер для подключения HEALME к AI-клиенту. Он использует Playwright для запуска приложения в браузере и предоставляет нейросети технический отчёт для анализа.

## Что умеет

- `smoke_test` — открывает HEALME и собирает HTTP, console/page errors, ссылки и наличие воркеров.
- `check_workers` — отдельно проверяет ServiceWorker и SharedWorker.
- `ai_test` — запускает браузерную проверку и передаёт результат нейросети для поиска рисков и составления тест-кейсов.

## Запуск HEALME

В корне проекта:

```bash
python -m http.server 5500
```

После этого сайт будет доступен на `http://127.0.0.1:5500/`.

## Установка MCP

Перейдите в папку `mcp`:

```bash
npm install
npx playwright install chromium
```

Обычная проверка:

```bash
npm test
```

## AI-проверка

Для нейросетевого анализа задайте API-ключ:

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="ваш_ключ"
$env:OPENAI_MODEL="gpt-5-mini"
```

После этого MCP-клиент может вызвать инструмент `ai_test`.

Важно: API-ключ не хранится в проекте и не добавлен в ZIP.

## Подключение к MCP-клиенту

Пример конфигурации для MCP-клиента:

```json
{
  "mcpServers": {
    "healme-ai-tester": {
      "command": "node",
      "args": ["C:/путь/к/HealME/mcp/server.js"],
      "env": {
        "HEALME_URL": "http://127.0.0.1:5500/"
      }
    }
  }
}
```

Путь нужно заменить на фактический путь к проекту.

## Что добавлено в сам HEALME

### SharedWorker

`js/shared-worker.js` синхронизирует записи между открытыми вкладками. Изменение записи в одной вкладке передаётся другим вкладкам.

### ServiceWorker

`sw.js` кэширует оболочку приложения и основные ресурсы. После первого запуска приложение может открываться из кэша без сети.

ServiceWorker и SharedWorker работают в браузере через HTTP(S), поэтому для проверки используйте Live Server или `python -m http.server`. Открытие `index.html` двойным кликом не подходит для ServiceWorker.
