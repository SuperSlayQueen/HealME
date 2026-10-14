/* HEALME SharedWorker
 * Синхронизирует записи между несколькими вкладками одного браузера.
 */
const ports = new Set();
const state = new Map();

self.onconnect = event => {
  const port = event.ports[0];
  ports.add(port);

  port.onmessage = e => {
    const msg = e.data || {};

    if (msg.type === 'hello') {
      if (msg.key && !state.has(msg.key)) state.set(msg.key, msg.value);
      if (msg.key) port.postMessage({ type: 'state', key: msg.key, value: state.get(msg.key) });
      return;
    }

    if (msg.type === 'sync' && msg.key) {
      state.set(msg.key, msg.value);
      for (const target of ports) {
        try { target.postMessage({ type: 'state', key: msg.key, value: msg.value }); }
        catch (_) {}
      }
    }
  };

  port.onmessageerror = () => ports.delete(port);
  port.start();
};
