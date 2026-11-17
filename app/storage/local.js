// Local storage backend: IndexedDB in this browser only.
// A Google Drive backend with the same interface is added in phase 2.
//
// stores: models (one record per crane model) · meta (key/value: product DB, roster, …)
//         logs (access history: entry / exit / product views / PDFs, auto-numbered)

import { upgradeModel } from '../core/model.js';

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
    return all.map(upgradeModel).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  get: async (id) => upgradeModel(await tx('models', 'readonly', (s) => s.get(id))),
  put: (model) => tx('models', 'readwrite', (s) => s.put(plain(model))),
  remove: (id) => tx('models', 'readwrite', (s) => s.delete(id)),
  getMeta: (key) => tx('meta', 'readonly', (s) => s.get(key)),
  putMeta: (key, value) => tx('meta', 'readwrite', (s) => s.put(plain(value), key)),
  removeMeta: (key) => tx('meta', 'readwrite', (s) => s.delete(key)),
  addLog: (entry) => tx('logs', 'readwrite', (s) => s.add(plain(entry))),
  listLogs: () => tx('logs', 'readonly', (s) => s.getAll()),
  clearLogs: () => tx('logs', 'readwrite', (s) => s.clear()),
  /** Next document number for this month: DSC-2026-11-001, -002, … (counter kept in meta 'ctrlSeq'). */
  async nextCtrl() {
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const box = await tx('meta', 'readwrite', (s) => {
      const out = { value: null };
      const req = s.get('ctrlSeq');
      req.onsuccess = () => {
        const seq = req.result || {};
        seq[ym] = (seq[ym] || 0) + 1;
        s.put(seq, 'ctrlSeq');
        out.value = `DSC-${ym}-${String(seq[ym]).padStart(3, '0')}`;
      };
      return out;
    });
    return box.value;
  },
};
