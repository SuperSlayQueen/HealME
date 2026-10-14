/* HEALME IndexedDB Store
 * Данные приложения (записи, лист ожидания) хранятся в IndexedDB:
 * база "healme", хранилище "kv", ключи "b" (записи), "w" (лист ожидания), "init".
 * Рендер приложения синхронный, поэтому данные держатся в кэше в памяти:
 * чтение — мгновенно из кэша, запись — сразу в кэш и асинхронно в базу.
 * При первом запуске старые данные переносятся из localStorage (ключи "hm.*").
 * Синхронизация вкладок — SharedWorker, при его отсутствии BroadcastChannel.
 */
window.HM_DB = (function () {
  'use strict';
  const NAME = 'healme', VERSION = 1, STORE = 'kv', LEGACY = 'hm.';
  const cache = new Map();
  const listeners = new Set();
  let dbPromise = null, channel = null;

  const hasIDB = 'indexedDB' in window;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(NAME, VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  const wrap = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  function run(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      let out;
      try { out = fn(t.objectStore(STORE)); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Транзакция прервана'));
    }));
  }

  function persist(key, value) {
    if (hasIDB) {
      run('readwrite', st => wrap(st.put(value, key)))
        .catch(e => console.warn('IndexedDB: не удалось сохранить «' + key + '»:', e));
    } else {
      try { localStorage.setItem(LEGACY + key, JSON.stringify(value)); } catch (e) {}
    }
  }

  // Разовый перенос старых данных из localStorage в IndexedDB.
  function migrate() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(LEGACY) === 0) keys.push(k);
    }
    if (!keys.length) return Promise.resolve();
    return run('readwrite', st => Promise.all(keys.map(k => {
      let v;
      try { v = JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
      return v == null ? null : wrap(st.put(v, k.slice(LEGACY.length)));
    }))).then(() => keys.forEach(k => localStorage.removeItem(k)))
      .catch(e => console.warn('Миграция из localStorage не удалась:', e));
  }

  function hydrate() {
    return run('readonly', st => Promise.all([wrap(st.getAllKeys()), wrap(st.getAll())]))
      .then(([keys, values]) => keys.forEach((k, i) => cache.set(k, values[i])));
  }

  // Запасной вариант без IndexedDB: прежнее поведение через localStorage.
  function hydrateLegacy() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(LEGACY) === 0) {
        try { const v = JSON.parse(localStorage.getItem(k)); if (v != null) cache.set(k.slice(LEGACY.length), v); } catch (e) {}
      }
    }
  }

  // Чужое изменение (другая вкладка): применяем, сохраняем и уведомляем подписчиков.
  // Своё эхо от SharedWorker отличается только лишним проходом — отсекаем его сравнением.
  function applyRemote(key, value) {
    if (JSON.stringify(cache.get(key)) === JSON.stringify(value)) return;
    cache.set(key, value);
    persist(key, value);
    listeners.forEach(fn => { try { fn(key, value); } catch (e) {} });
  }

  function connect() {
    if ('SharedWorker' in window) {
      try {
        const worker = new SharedWorker('js/shared-worker.js', { name: 'healme-state' });
        worker.port.start();
        worker.port.onmessage = e => {
          const m = e.data || {};
          if (m.type === 'state' && m.key) applyRemote(m.key, m.value);
        };
        channel = worker.port;
        channel.postMessage({ type: 'hello', key: 'b', value: cache.get('b', []) });
        return;
      } catch (e) {
        console.warn('SharedWorker недоступен:', e);
      }
    }
    if ('BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('healme-state');
        bc.onmessage = e => {
          const m = e.data || {};
          if (m && m.type === 'sync' && m.key) applyRemote(m.key, m.value);
        };
        channel = bc;
      } catch (e) {}
    }
  }

  const ready = (async () => {
    if (hasIDB) {
      await migrate();
      await hydrate();
    } else {
      hydrateLegacy();
    }
    connect();
  })();

  return {
    ready,
    get(key, dflt) { const v = cache.get(key); return v === undefined ? dflt : v; },
    set(key, value) {
      cache.set(key, value);
      persist(key, value);
      if (channel) {
        try { channel.postMessage({ type: 'sync', key, value }); } catch (e) {}
      }
    },
    onChange(fn) { listeners.add(fn); }
  };
})();
