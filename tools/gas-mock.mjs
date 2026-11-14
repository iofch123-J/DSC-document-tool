// Local stand-in for the Google side, for testing web mode without deploying anything.
// Runs gas/Code.gs unchanged in Node with small in-memory fakes of SpreadsheetApp, DriveApp,
// CacheService, PropertiesService, LockService, Utilities and ContentService, and serves it
// over HTTP like the deployed web app (POST text/plain JSON, CORS open).
//
//   node tools/gas-mock.mjs [--port 8770] [--xlsx <개발 DATABASE.xlsx>]
//
// The roster is always two made-up people (12345HA 홍길동 = 관리자, 23456HA 이몽룡); the product
// sheet comes from --xlsx when given (read locally, kept in memory only), else a tiny fake list.
// Then point a browser at it: localStorage.setItem('rlc-api', 'http://127.0.0.1:8770/').
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port', 8770));
const XLSX = arg('--xlsx', '');

// ---------------------------------------------------------------- Sheets
class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.values[this.r - 1 + i] || [];
      out.push(Array.from({ length: this.nc }, (_, j) => (row[this.c - 1 + j] ?? '')));
    }
    return out;
  }
  getDisplayValues() { return this.getValues().map((row) => row.map((v) => (v instanceof Date ? v.toISOString() : String(v)))); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (this.sheet.values[this.r - 1 + i] ||= [])[this.c - 1 + j] = x; })); return this; }
}
class Sheet {
  constructor(name, values = []) { this.name = name; this.values = values; }
  getName() { return this.name; }
  getLastRow() { return this.values.length; }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.values.length), Math.max(1, ...this.values.map((r) => r.length))); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  appendRow(row) { this.values.push([...row]); return this; }
  setFrozenRows() { return this; }
}
const sheets = [];
const ss = {
  getSheets: () => sheets,
  getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
  insertSheet: (n) => { const s = new Sheet(n); sheets.push(s); return s; },
  getUrl: () => 'https://docs.google.com/spreadsheets/d/MOCK/edit',
};

// ---------------------------------------------------------------- Drive
const files = new Map();
const folders = new Map();
let seq = 0;
function makeFile(folderId, name, content) {
  const id = `file${++seq}`;
  const f = {
    id, folderId, name, content,
    getId: () => id,
    getBlob: () => ({ getDataAsString: () => f.content }),
    setContent: (t) => { f.content = t; return f; },
  };
  files.set(id, f);
  return f;
}
function makeFolder(name) {
  const id = `folder${++seq}`;
  const folder = {
    getId: () => id,
    getUrl: () => `https://drive.google.com/drive/folders/${id}`,
    getFilesByName: (n) => {
      const list = [...files.values()].filter((f) => f.folderId === id && f.name === n);
      return { hasNext: () => list.length > 0, next: () => list.shift() };
    },
    createFile: (n, content) => makeFile(id, n, content),
  };
  folders.set(id, folder);
  return folder;
}

// ---------------------------------------------------------------- the rest of the services
const props = new Map();
const cache = new Map();
const signed = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => b & 255));
const ctx = vm.createContext({
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  DriveApp: {
    getFolderById: (id) => { if (!folders.has(id)) throw new Error('no folder'); return folders.get(id); },
    createFolder: (name) => makeFolder(name),
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null; },
      put: (k, v, sec = 600) => { cache.set(k, { v, exp: Date.now() + sec * 1000 }); },
      remove: (k) => { cache.delete(k); },
    }),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => { props.set(k, v); } }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    newBlob: (data) => {
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : unsigned(data);
      return { getBytes: () => signed(buf), getDataAsString: () => buf.toString('utf8') };
    },
    computeHmacSha256Signature: (value, key) => signed(crypto.createHmac('sha256', key).update(value).digest()),
    base64EncodeWebSafe: (data) => (typeof data === 'string' ? Buffer.from(data) : unsigned(data)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => signed(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  },
  ContentService: {
    createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }),
    MimeType: { JSON: 'application/json' },
  },
  Logger: { log: (...a) => console.log('[Logger]', ...a) },
});
vm.runInContext(fs.readFileSync(join(root, 'gas', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

// ---------------------------------------------------------------- seed the spreadsheet
if (XLSX) {
  const { readXlsx } = await import('../app/core/xlsx.js');
  const wb = await readXlsx(fs.readFileSync(XLSX));
  for (const sh of wb.sheets) {
    if (sh.name === '사용자' || sh.name === '이력') continue;   // the roster is always the fake one below
    const values = [];
    for (let r = 1; r <= sh.maxRow; r++) {
      const row = [];
      for (let c = 1; c <= sh.maxCol; c++) row.push(sh.cells.get(`${r},${c}`)?.v ?? '');
      values.push(row);
    }
    sheets.push(new Sheet(sh.name, values));
  }
} else {
  sheets.push(new Sheet('제품 분류', [
    ['No.', '분류', '제품명', 'Sub Winch', 'Sub Boom'],
    ['1', '소형', 'TEST100', '없음', '없음'],
    ['2', '', 'TEST100', '2.3 ton', '5.0 m'],
    ['3', '중형', 'TEST200', '없음', '없음'],
  ]));
}
sheets.push(new Sheet('사용자', [[], [], [], ['', '사번', '이름', '관리자 권한'], ['', '12345HA', '홍길동', 'O'], ['', '23456HA', '이몽룡', '']]));
vm.runInContext('setup()', ctx);

// ---------------------------------------------------------------- HTTP
const doPost = vm.runInContext('doPost', ctx);
const doGet = vm.runInContext('doGet', ctx);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json; charset=utf-8' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method === 'GET') { res.writeHead(200, CORS); res.end(doGet().getContent()); return; }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const out = doPost({ postData: { contents: body } }).getContent();
    const a = (() => { try { return JSON.parse(body).action; } catch { return '?'; } })();
    console.log(new Date().toISOString().slice(11, 19), a, out.length > 120 ? `${out.slice(0, 117)}…` : out);
    res.writeHead(200, CORS);
    res.end(out);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`gas-mock: http://127.0.0.1:${PORT}/  (sheets: ${sheets.map((s) => s.name).join(', ')})`));
