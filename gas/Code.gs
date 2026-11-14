/**
 * DY Rated Load — Apps Script back end.
 *
 * Paste this file into the Google Sheet that holds the 개발 DATABASE
 * (확장 프로그램 → Apps Script), run `setup` once, then deploy as a web app
 * (실행 사용자: 나 · 액세스 권한: 모든 사용자). See docs/WEB-SETUP.md.
 *
 * What lives where (all in the owner's Google account, never in the public repository):
 *   · 제품 분류  — the sheet with 제품명 / Sub Winch / Sub Boom columns (edited by hand in Google Sheets)
 *   · 사용자     — sheet '사용자': 사번 · 이름 · 관리자 권한(O)   (edited by hand; never sent to browsers
 *                  except to administrators)
 *   · 이력       — sheet '이력', appended by this script (entry, failed entry, exit, views, PDFs)
 *   · 정격하중 데이터 · 회사 로고 — JSON files in the Drive folder created by `setup`
 *
 * Every data request needs a token issued by `login` (사번 + 이름 초성, checked here, never in the
 * browser). Repeated failures lock a 사번 for a while.
 */

const APP = {
  version: '2',
  folderName: 'DY Rated Load 데이터',
  modelsFile: 'models.json',
  brandFile: 'brand.json',
  staffSheet: '사용자',
  logSheet: '이력',
  tokenHours: 12,
  maxFail: 5,
  lockMinutes: 15,
  defaultSuffix: 'HA',
};

// ------------------------------------------------------------------------------ web app entry points
function doGet() {
  return json_({ ok: true, app: 'dy-rated-load', version: APP.version });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: '잘못된 요청입니다.' }); }
  try {
    return json_(Object.assign({ ok: true }, route_(req)));
  } catch (x) {
    return json_({ ok: false, error: String((x && x.message) || x), code: (x && x.code) || '' });
  }
}

function route_(req) {
  switch (req.action) {
    case 'ping': return { version: APP.version };
    case 'config': return { suffix: suffix_(), brand: brandPublic_() };   // the logo shows on the entry screen too
    case 'checkEmp': return checkEmp_(req.empNo);
    case 'login': return login_(req.empNo, req.cho);
    default: break;
  }
  const s = verify_(req.token);
  switch (req.action) {
    case 'catalog': return { sheets: catalogSheets_(), sheetUrl: s.a ? sheetUrl_() : '' };
    case 'models.list': return { models: modelList_() };
    case 'models.put': admin_(s); return { model: modelPut_(req.model) };
    case 'models.delete': admin_(s); modelDelete_(req.id); return {};
    case 'meta.get': return { value: metaGet_(req.key) };
    case 'meta.put': admin_(s); metaPut_(req.key, req.value); return {};
    case 'log': logClient_(s, req.entry || {}); return {};
    case 'logs.list': admin_(s); return { logs: logList_(Number(req.limit) || 2000), sheetUrl: sheetUrl_() };
    case 'staff.list': admin_(s); return { staff: { suffix: suffix_(), people: staff_() }, sheetUrl: sheetUrl_() };
    default: throw err_('알 수 없는 요청입니다.', 'bad');
  }
}

// ------------------------------------------------------------------------------ one-time setup
/** Run once from the editor: creates the Drive folder, the 이력 sheet and the token secret. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  folder_();
  logSheet_();
  const people = staff_();
  Logger.log('준비 완료 — 사용자 %s명 (관리자 %s명), 데이터 폴더: %s', people.length, people.filter(function (p) { return p.admin; }).length, folder_().getUrl());
}

// ------------------------------------------------------------------------------ roster & login
const CHO19 = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const CHO_BASE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };

/** 초성 of every syllable, in order: 홍길동 → 'ㅎㄱㄷ' (same rule as the browser side). */
function choSeq_(name) {
  return String(name || '').replace(/\s+/g, '').split('').map(function (ch) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const c = CHO19[Math.floor((code - 0xAC00) / 588)];
      return CHO_BASE[c] || c;
    }
    return '기타';
  }).join('');
}

const normEmp_ = function (s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); };

function suffix_() {
  return PropertiesService.getScriptProperties().getProperty('SUFFIX') || APP.defaultSuffix;
}

/** People from sheet '사용자' (header row with 사번 · 이름 [· 관리자 권한]); cached for a minute. */
function staff_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('staff');
  if (hit) return JSON.parse(hit);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP.staffSheet);
  if (!sh) return [];
  const values = sh.getDataRange().getDisplayValues();
  const HEAD = { emp: /^(사번|사원번호|직원번호|empno|id)$/i, name: /^(이름|성명|name)$/i, admin: /^(관리자|권한|관리자권한|관리권한|admin|role)$/i };
  const MARK = /^(y|yes|o|○|●|◎|v|✓|✔|1|true|관리자|admin|administrator)$/i;
  const people = [];
  for (let r = 0; r < Math.min(values.length, 30); r++) {
    const cols = {};
    values[r].forEach(function (v, c) {
      const t = String(v).replace(/\s+/g, '');
      Object.keys(HEAD).forEach(function (k) { if (t && cols[k] === undefined && HEAD[k].test(t)) cols[k] = c; });
    });
    if (cols.emp === undefined || cols.name === undefined) continue;
    for (let rr = r + 1; rr < values.length; rr++) {
      const raw = String(values[rr][cols.emp] || '').trim();
      const name = String(values[rr][cols.name] || '').trim();
      if (!raw || !name) continue;
      const emp = /^\d+$/.test(raw) ? normEmp_(raw + suffix_()) : normEmp_(raw);
      people.push({ empNo: emp, name: name, admin: cols.admin !== undefined && MARK.test(String(values[rr][cols.admin]).trim()) });
    }
    break;
  }
  cache.put('staff', JSON.stringify(people), 60);
  return people;
}

function person_(emp) {
  emp = normEmp_(emp);
  return staff_().filter(function (p) { return p.empNo === emp; })[0] || null;
}

function locked_(emp) {
  return Number(CacheService.getScriptCache().get('fail:' + emp) || 0) >= APP.maxFail;
}

function failed_(emp, note) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('fail:' + emp) || 0) + 1;
  cache.put('fail:' + emp, String(n), APP.lockMinutes * 60);
  logRow_({ type: 'fail', empNo: '', name: '', note: '입력한 사번 ' + emp + ' · ' + note });
  return n;
}

const LOCK_MSG = function () { return '입력 오류가 많아 ' + APP.lockMinutes + '분 동안 이 사번으로 들어올 수 없습니다.'; };

/** Step ①: is this 사번 in the roster? (and how many 초성 to expect) */
function checkEmp_(empIn) {
  const emp = normEmp_(empIn);
  if (!emp) throw err_('사번을 입력하세요.', 'input');
  if (locked_(emp)) throw err_(LOCK_MSG(), 'locked');
  const p = person_(emp);
  if (!p) { failed_(emp, '등록되지 않은 사번'); return { exists: false }; }
  return { exists: true, len: choSeq_(p.name).length };
}

/** Step ②: 사번 + 이름 초성 → token. */
function login_(empIn, cho) {
  const emp = normEmp_(empIn);
  if (locked_(emp)) throw err_(LOCK_MSG(), 'locked');
  const p = person_(emp);
  if (!p || choSeq_(p.name) !== String(cho || '')) {
    failed_(emp, p ? '초성 불일치' : '등록되지 않은 사번');
    return { match: false, locked: locked_(emp) };
  }
  CacheService.getScriptCache().remove('fail:' + emp);
  const sid = Utilities.getUuid().slice(0, 12);
  logRow_({ type: 'enter', empNo: p.empNo, name: p.name, sid: sid, note: p.admin ? '관리자' : '' });
  const token = sign_({ e: p.empNo, n: p.name, a: !!p.admin, s: sid, x: Date.now() + APP.tokenHours * 3600 * 1000 });
  return { match: true, token: token, empNo: p.empNo, name: p.name, admin: !!p.admin, sid: sid };
}

// ------------------------------------------------------------------------------ tokens
function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SECRET', s); }
  return s;
}

function b64_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function unb64_(text) { return Utilities.base64DecodeWebSafe(text + '==='.slice((text.length + 3) % 4)); }

function sign_(payload) {
  const body = b64_(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  return body + '.' + b64_(Utilities.computeHmacSha256Signature(body, secret_()));
}

/** Check a token; the person must still be in the roster (removing someone revokes access). */
function verify_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || b64_(Utilities.computeHmacSha256Signature(parts[0], secret_())) !== parts[1]) throw err_('다시 들어와 주세요.', 'auth');
  const s = JSON.parse(Utilities.newBlob(unb64_(parts[0])).getDataAsString());
  if (!(s.x > Date.now())) throw err_('사용 시간이 지나 다시 들어와야 합니다.', 'auth');
  const p = person_(s.e);
  if (!p || p.name !== s.n) throw err_('사용자 명단에서 확인되지 않습니다.', 'auth');
  s.a = !!p.admin;
  return s;
}

function admin_(s) { if (!s.a) throw err_('관리자만 할 수 있습니다.', 'forbidden'); }

// ------------------------------------------------------------------------------ 제품 분류 (raw values; parsed in the browser)
function catalogSheets_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .filter(function (sh) { return sh.getName() !== APP.staffSheet && sh.getName() !== APP.logSheet; })
    .map(function (sh) { return { name: sh.getName(), values: sh.getDataRange().getDisplayValues() }; });
}

function sheetUrl_() { return SpreadsheetApp.getActiveSpreadsheet().getUrl(); }

// ------------------------------------------------------------------------------ Drive data (models, logo)
function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) { /* recreate below */ } }
  const f = DriveApp.createFolder(APP.folderName);
  props.setProperty('FOLDER', f.getId());
  return f;
}

function readJson_(name, fallback) {
  const it = folder_().getFilesByName(name);
  if (!it.hasNext()) return fallback;
  return JSON.parse(it.next().getBlob().getDataAsString() || 'null') || fallback;
}

function writeJson_(name, value) {
  const it = folder_().getFilesByName(name);
  const text = JSON.stringify(value);
  if (it.hasNext()) it.next().setContent(text);
  else folder_().createFile(name, text, 'application/json');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function modelList_() {
  const all = readJson_(APP.modelsFile, {});
  return Object.keys(all).map(function (k) { return all[k]; });
}

function modelPut_(model) {
  if (!model || !model.id || !model.info || !model.settings || !model.tables) throw err_('기종 데이터 형식이 맞지 않습니다.', 'bad');
  return withLock_(function () {
    const all = readJson_(APP.modelsFile, {});
    all[model.id] = model;
    writeJson_(APP.modelsFile, all);
    return model;
  });
}

function modelDelete_(id) {
  withLock_(function () {
    const all = readJson_(APP.modelsFile, {});
    delete all[id];
    writeJson_(APP.modelsFile, all);
  });
}

const META_FILES = { brandLogo: APP.brandFile };

function metaGet_(key) {
  if (!META_FILES[key]) throw err_('알 수 없는 항목입니다.', 'bad');
  return readJson_(META_FILES[key], null);
}

function metaPut_(key, value) {
  if (!META_FILES[key]) throw err_('알 수 없는 항목입니다.', 'bad');
  withLock_(function () { writeJson_(META_FILES[key], value); });
  if (key === 'brandLogo') CacheService.getScriptCache().remove('brand');
}

/** The company logo for everyone (also before login — it is on the entry screen); cached 10 minutes. */
function brandPublic_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('brand');
  if (hit) return JSON.parse(hit);
  const v = readJson_(APP.brandFile, null);
  const text = JSON.stringify(v);
  if (text.length < 90000) cache.put('brand', text, 600);
  return v;
}

// ------------------------------------------------------------------------------ 이력
const LOG_HEAD = ['시각', '사번', '이름', '구분', '제품', 'Sub Winch', 'Sub Boom', '제공처', '관리번호', '파일', '비고', 'type', 'session'];
const LOG_LABEL = { enter: '진입', fail: '진입 실패', exit: '종료', view: '조회', pdf: 'PDF 생성' };

function logSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(APP.logSheet);
  if (!sh) {
    sh = ss.insertSheet(APP.logSheet);
    sh.appendRow(LOG_HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}

function logRow_(e) {
  logSheet_().appendRow([
    new Date(), e.empNo || '', e.name || '', LOG_LABEL[e.type] || e.type, e.product || '', e.subWinch || '', e.subBoom || '',
    e.to || '', e.ctrl || '', e.file || '', e.note || '', e.type, e.sid || '',
  ]);
}

/** Entries sent by the browser: identity always comes from the token, never from the request. */
function logClient_(s, e) {
  const type = String(e.type || '');
  if (['view', 'pdf', 'exit'].indexOf(type) < 0) throw err_('기록할 수 없는 구분입니다.', 'bad');
  const note = type === 'pdf' ? [e.mode === 'internal' ? '내부용' : '고객 제공용', e.pages ? e.pages + '페이지' : '', e.via || ''].filter(String).join(' · ') : '';
  logRow_({ type: type, empNo: s.e, name: s.n, sid: s.s, product: e.product, subWinch: e.subWinch, subBoom: e.subBoom, to: e.to, ctrl: e.ctrl, file: e.file, note: note });
}

function logList_(limit) {
  const sh = logSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(limit, last - 1);
  const values = sh.getRange(last - n + 1, 1, n, LOG_HEAD.length).getValues();
  return values.map(function (r) {
    return {
      t: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), empNo: r[1], name: r[2], type: r[11] || r[3],
      product: r[4], subWinch: r[5], subBoom: r[6], to: r[7], ctrl: r[8], file: r[9], note: r[10], sid: r[12],
    };
  }).reverse();
}

// ------------------------------------------------------------------------------ helpers
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function err_(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}
