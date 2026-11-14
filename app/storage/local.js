// Local storage backend: IndexedDB in this browser only.
// A Google Drive backend with the same interface is added in phase 2.
//
// stores: models (one record per crane model) · meta (key/value: product DB, roster, …)
//         logs (access history: entry / exit / product views / PDFs, auto-numbered)

const DB = 'rlc-tool';
const VERSION = 3;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('models')) db.createObjectStore('models', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    // a request for a missing key has result === undefined: resolve to undefined, not the request
    t.oncomplete = () => { db.close(); resolve(out instanceof IDBRequest ? out.result : out); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

const plain = (o) => JSON.parse(JSON.stringify(o));

export const localStore = {
  kind: 'local',
  label: '로컬 모드',
  description: '이 PC의 이 브라우저에만 저장됩니다. 백업 파일로 내보내 두세요.',
  async list() {
    const all = await tx('models', 'readonly', (s) => s.getAll());
    return all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  get: (id) => tx('models', 'readonly', (s) => s.get(id)),
  put: (model) => tx('models', 'readwrite', (s) => s.put(plain(model))),
  remove: (id) => tx('models', 'readwrite', (s) => s.delete(id)),
  getMeta: (key) => tx('meta', 'readonly', (s) => s.get(key)),
  putMeta: (key, value) => tx('meta', 'readwrite', (s) => s.put(plain(value), key)),
  removeMeta: (key) => tx('meta', 'readwrite', (s) => s.delete(key)),
  addLog: (entry) => tx('logs', 'readwrite', (s) => s.add(plain(entry))),
  listLogs: () => tx('logs', 'readonly', (s) => s.getAll()),
  clearLogs: () => tx('logs', 'readwrite', (s) => s.clear()),
};
