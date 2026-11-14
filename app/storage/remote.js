// Web backend: the Apps Script web app bound to the 개발 DATABASE Google Sheet (gas/Code.gs).
// Same interface as storage/local.js, plus login. Requests are plain-text POSTs (no CORS preflight).
//
//   models        → models.json in the owner's Drive folder (shared by everyone who logs in)
//   productDb     → read from the sheet (edited in Google Sheets, read-only here)
//   staff         → sheet '사용자' (administrators only; edited in Google Sheets)
//   brandLogo     → brand.json in the Drive folder
//   logs          → sheet '이력' (appended by the server; identity comes from the token)
import { parseProductSheets, PRODUCT_DB } from '../core/catalog.js';
import { STAFF } from '../core/security.js';
import { BRAND_LOGO } from '../core/brand.js';

export function createRemote(url, { onAuthError } = {}) {
  let token = null;
  let models = null;          // id → model, loaded once per page
  let catalog = null;
  const meta = new Map();

  async function call(action, body = {}) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', body: JSON.stringify({ action, token, ...body }) });
    } catch {
      throw Object.assign(new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.'), { code: 'network' });
    }
    let out;
    try { out = await res.json(); } catch { throw Object.assign(new Error('서버 응답을 읽지 못했습니다.'), { code: 'server' }); }
    if (!out.ok) {
      const e = Object.assign(new Error(out.error || '서버 오류'), { code: out.code || 'server' });
      if (e.code === 'auth') onAuthError?.(e);
      throw e;
    }
    return out;
  }

  async function loadModels() {
    if (!models) {
      const out = await call('models.list');
      models = new Map(out.models.map((m) => [m.id, m]));
    }
    return models;
  }

  const plain = (o) => JSON.parse(JSON.stringify(o));

  const store = {
    kind: 'remote',
    label: '웹 모드',
    description: '구글 드라이브(관리자 계정)에 저장되어 로그인한 모든 사용자가 같은 데이터를 봅니다. 제품 분류와 사용자 명단은 구글 시트에서 관리합니다.',
    setToken(t) { token = t; },
    reset() { token = null; models = null; catalog = null; meta.clear(); },

    // ---- models
    async list() {
      const all = [...(await loadModels()).values()];
      return all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(plain);
    },
    async get(id) { const m = (await loadModels()).get(id); return m ? plain(m) : undefined; },
    async put(model) {
      const m = plain(model);
      await call('models.put', { model: m });
      (await loadModels()).set(m.id, m);
    },
    async remove(id) {
      await call('models.delete', { id });
      (await loadModels()).delete(id);
    },

    // ---- key/value
    async getMeta(key) {
      if (key === PRODUCT_DB) {
        if (!catalog) {
          const out = await call('catalog');
          try {
            catalog = parseProductSheets(out.sheets.map((s) => sheetFromValues(s.name, s.values)), '구글 시트');
            catalog.sheetUrl = out.sheetUrl || '';
          } catch (e) {
            console.warn('제품 분류 시트를 읽지 못했습니다:', e.message);
            catalog = null;
          }
        }
        return catalog;
      }
      if (key === STAFF) {
        if (!meta.has(key)) {
          const out = await call('staff.list');
          meta.set(key, { ...out.staff, sheetUrl: out.sheetUrl, managed: 'sheet' });
        }
        return meta.get(key);
      }
      if (key === BRAND_LOGO) {
        if (!meta.has(key)) meta.set(key, (await call('meta.get', { key })).value || null);
        return meta.get(key);
      }
      return null;
    },
    async putMeta(key, value) {
      if (key !== BRAND_LOGO) throw new Error('이 항목은 구글 시트에서 관리합니다.');
      await call('meta.put', { key, value });
      meta.set(key, value);
    },
    async removeMeta(key) {
      if (key !== BRAND_LOGO) throw new Error('이 항목은 구글 시트에서 관리합니다.');
      await call('meta.put', { key, value: null });
      meta.set(key, null);
    },
    refresh() { models = null; catalog = null; meta.clear(); },

    // ---- history
    async addLog(entry) {
      // the server takes the person from the token; only what happened is sent
      const { type, product, subWinch, subBoom, to, ctrl, file, mode, pages, via } = entry;
      await call('log', { entry: { type, product, subWinch, subBoom, to, ctrl, file, mode, pages, via } });
    },
    async listLogs() { return (await call('logs.list', { limit: 2000 })).logs; },
    async clearLogs() { throw new Error('이력은 구글 시트 \'이력\' 탭에서 관리합니다.'); },
  };

  // ---- entry screen (사번 → 이름 초성), checked on the server
  const auth = {
    remote: true,
    suffix: 'HA',
    showOther: false,
    async init() { auth.suffix = (await call('config')).suffix || 'HA'; },
    async checkEmp(empNo) { return call('checkEmp', { empNo }); },
    async login(empNo, seq) {
      const out = await call('login', { empNo, cho: seq.join('') });
      if (!out.match) return { match: false, locked: out.locked };
      return { match: true, session: { sid: out.sid, empNo: out.empNo, name: out.name, admin: !!out.admin, token: out.token, at: new Date().toISOString() } };
    },
  };

  return { store, auth };
}

/** Wrap a 2-D array of display values as the sheet shape the product DB parser reads. */
function sheetFromValues(name, values) {
  return {
    name,
    maxRow: values.length,
    maxCol: Math.max(0, ...values.map((r) => r.length)),
    get: (r, c) => String(values[r - 1]?.[c - 1] ?? '').trim(),
  };
}
