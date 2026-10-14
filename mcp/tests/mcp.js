// Интеграционный тест MCP-сервера: общается с ним по stdio, как реальный
// MCP-клиент (initialize → tools/list → tools/call). Требуется запущенный сайт.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../server.js', import.meta.url));
const profileDir = fileURLToPath(new URL('../.profile', import.meta.url));
fs.rmSync(profileDir, { recursive: true, force: true }); // детерминированный сценарий

let fails = 0;
const check = (cond, name) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fails++; };

const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', d => process.stderr.write('[server] ' + d));

const pending = new Map();
let buffer = '';
child.stdout.on('data', chunk => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (e) { /* не JSON — игнорируем */ }
  }
});

const request = (id, method, params) => new Promise(resolve => {
  pending.set(id, resolve);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const notify = method => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
const wait = ms => new Promise(r => setTimeout(r, ms));

const withTimeout = (p, ms, name) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('таймаут ожидания ' + name)), ms))
]);

try {
  const init = await withTimeout(request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'healme-test', version: '1.0.0' }
  }), 15000, 'initialize');
  check(!!init.result && !!init.result.serverInfo, `initialize: сервер ${init.result?.serverInfo?.name} v${init.result?.serverInfo?.version}`);
  notify('notifications/initialized');

  const list = await withTimeout(request(2, 'tools/list', {}), 10000, 'tools/list');
  const names = (list.result?.tools || []).map(t => t.name);
  for (const t of ['smoke_test', 'check_workers', 'ai_test', 'list_psychologists', 'get_free_slots', 'book_slot', 'list_bookings']) {
    check(names.includes(t), `tools/list содержит ${t}`);
  }

  const lp = await withTimeout(request(3, 'tools/call', { name: 'list_psychologists', arguments: {} }), 60000, 'list_psychologists');
  const lpData = JSON.parse(lp.result?.content?.[0]?.text || '{}');
  check(lpData.ok && lpData.count === 4, `tools/call list_psychologists: ${lpData.count} психологов`);

  const bs = await withTimeout(request(4, 'tools/call', {
    name: 'book_slot',
    arguments: { psychologist: 'elena', name: 'Елена Через MCP', email: 'elena.mcp@example.com' }
  }), 90000, 'book_slot');
  const bsData = JSON.parse(bs.result?.content?.[0]?.text || '{}');
  check(bsData.ok && bsData.bookingId, `tools/call book_slot: ${bsData.message || bsData.error}`);

  const lb = await withTimeout(request(5, 'tools/call', { name: 'list_bookings', arguments: {} }), 60000, 'list_bookings');
  const lbData = JSON.parse(lb.result?.content?.[0]?.text || '{}');
  check(lbData.ok && lbData.bookings.some(b => b.id === bsData.bookingId), 'tools/call list_bookings: бронь из book_slot найдена');

  console.log(fails ? '\nMCP-ТЕСТ: ЕСТЬ ОШИБКИ' : '\nMCP-ТЕСТ: OK');
} catch (e) {
  console.log('FAIL ' + e.message);
  fails++;
} finally {
  child.kill();
  await wait(500);
}
process.exit(fails ? 1 : 0);
