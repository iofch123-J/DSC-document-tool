// Import the existing in-house Excel layout of a rated load chart.
//
// Usually one workbook = one crane model, each sheet holding the same layout for ONE aux-winch
// capacity (e.g. sheet "3ton", sheet "4ton"); the main winch tables are the same on every sheet.
// Some workbooks instead keep one MODEL per sheet (e.g. a file with every model of one tonnage class);
// those are imported sheet by sheet with { sheet } (see chartSheets / sheetsAreModels).
//
// Per sheet:
//   "1. 후방 ( 332˚ ~ 28˚)"                 <- area title (number, name, angle ranges)
//   "1) 아우트리거 MAX"   "4연 기본" "6연 구간" …   <- outrigger state + legend
//   "메인윈치 정격하중"      "보조윈치 정격하중"        <- block labels
//   "작업반경 (M)" "붐 길이" | "작업반경 (M)" "붐 길이"  <- header
//   boom lengths row ("5.3M" …, "S/B (4.5)")
//   radius rows: radius | loads … | radius | loads …
//
// Colour legends: the cell left of "6연 구간"/"2연 구간"/"변동+2연" defines the
// "more rope falls" fill. The falls threshold is inferred from those colours.

import { readXlsx } from './xlsx.js';
import { newModel, newBoom, newAuxWinch, uid, parseInput, setCell, getCell, tableKey, DEFAULT_NOTES } from './model.js';

const OUTRIGGER_NAMES = {
  MAX: { code: 'MAX', name: '완전 신장', short: '100%', pct: 1.0 },
  MID: { code: 'MID', name: '50% 이상 신장', short: 'MID', pct: 0.68 },
  MIN: { code: 'MIN', name: '50% 이하 신장', short: 'MIN', pct: 0.32 },
};

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function parseLen(v) {
  if (typeof v === 'number') return { kind: 'boom', len: round(v) };
  const s = String(v ?? '').trim();
  const jib = s.match(/^(S\/?B|JIB|지브)\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/i);
  if (jib) return { kind: 'jib', label: 'S/B', len: Number(jib[2]) };
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? { kind: 'boom', len: round(Number(m[1])) } : null;
}

function parseAngleRanges(text) {
  return String(text)
    .replace(/[˚°º]/g, '')
    .split(/[,，]/)
    .map((p) => p.split(/~|-/).map((x) => Number(x.trim())))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

/** "4ton", "보조윈치 3 TON", "2.3톤" -> "4 ton" / "3 ton" / "2.3 ton" */
export function capacityFrom(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:ton|톤|t)(?![a-z])/i);
  return m ? `${Number(m[1])} ton` : '';
}

const MODEL_TOKEN = /(?<![A-Za-z0-9])([A-Z]{1,4}-?\d{3,5}[A-Z]?)(?![0-9])/;

/** Read all template blocks of one sheet. Returns null when the sheet is not a chart sheet. */
function parseSheet(sh, warnings) {
  const cell = (r, c) => sh.cells.get(`${r},${c}`);
  const val = (r, c) => cell(r, c)?.v ?? null;
  const txt = (r, c) => { const v = val(r, c); return v === null ? '' : String(v).trim(); };

  const areaTitles = [];
  const subs = [];
  for (let r = 1; r <= sh.maxRow; r++) {
    for (let c = 1; c <= sh.maxCol; c++) {
      const t = txt(r, c);
      if (!t) continue;
      const a = t.match(/^\d+\s*\.\s*([^(（]+?)\s*[(（](.+)[)）]\s*$/);
      if (a) areaTitles.push({ row: r, name: a[1].trim(), ranges: parseAngleRanges(a[2]) });
      const s = t.match(/^\d+\s*\)\s*아우트리거\s*(.+)$/);
      if (s) subs.push({ row: r, col: c, codes: s[1].split(/[,\s]+/).filter(Boolean).map((x) => x.toUpperCase()) });
    }
  }
  if (!subs.length) return null;

  const blocks = [];
  let auxLabelText = '';
  for (const sub of subs) {
    const area = [...areaTitles].reverse().find((a) => a.row < sub.row);
    if (!area) { warnings.push(`[${sh.name}] ${sub.row}행: 소속 작업영역 제목을 찾지 못해 건너뜀`); continue; }
    let h = -1;
    for (let r = sub.row + 1; r <= sub.row + 6 && h < 0; r++) {
      for (let c = 1; c <= sh.maxCol; c++) if (txt(r, c).startsWith('작업반경')) { h = r; break; }
    }
    if (h < 0) { warnings.push(`[${sh.name}] ${sub.row}행: '작업반경' 머리글을 찾지 못해 건너뜀`); continue; }
    const radiusCols = [];
    for (let c = 1; c <= sh.maxCol; c++) if (txt(h, c).startsWith('작업반경')) radiusCols.push(c);
    const parts = radiusCols.map((rc, i) => {
      const end = i + 1 < radiusCols.length ? radiusCols[i + 1] - 1 : sh.maxCol;
      const label = [h - 1, h - 2].map((r) => {
        for (let c = rc; c <= end; c++) if (txt(r, c)) return txt(r, c);
        return '';
      }).join(' ');
      const winch = /보조/.test(label) ? 'aux' : 'main';
      if (winch === 'aux' && !auxLabelText) auxLabelText = label;
      const cols = [];
      for (let c = rc + 1; c <= end; c++) {
        const L = parseLen(val(h + 1, c));
        if (L) cols.push({ c, ...L });
      }
      const rows = [];
      for (let r = h + 2; r <= sh.maxRow; r++) {
        const rv = val(r, rc);
        if (typeof rv !== 'number') break;
        rows.push({ r, radius: rv });
      }
      return { winch, rc, end, cols, rows };
    });
    const legend = { main: { base: null, high: null, fills: new Set() }, aux: { base: null, high: null, fills: new Set() } };
    for (let c = 1; c <= sh.maxCol; c++) {
      const t = txt(sub.row, c);
      if (!t) continue;
      const part = parts.reduce((acc, p) => (c >= p.rc - 1 ? p : acc), parts[0]);
      const lg = legend[part.winch];
      const base = t.match(/(\d+\s*연)\s*기본/);
      const high = t.match(/^(\d+\s*연)\s*구간/);
      const mixed = t.match(/변동\s*\+\s*(\d+\s*연)/);
      if (base) lg.base = base[1].replace(/\s/g, '');
      if (high) lg.high = high[1].replace(/\s/g, '');
      if (high || mixed) { const f = cell(sub.row, c - 1)?.fill; if (f) lg.fills.add(f); }
    }
    blocks.push({ sub, area, parts, legend });
  }
  if (!blocks.length) return null;
  return { sh, cell, blocks, auxLabelText };
}

export async function importTemplateXlsx(buf, fileName = '', opts = {}) {
  return importTemplateWorkbook(await readXlsx(buf), fileName, opts);
}

/** Names of the sheets that hold a chart (in workbook order). */
export function chartSheets(wb) {
  return wb.sheets.filter((sh) => parseSheet(sh, [])).map((sh) => sh.name);
}
/** Model name written in a sheet name: 'AB1234' → 'AB1234', 'AB1234D, 1235D' → 'AB1234D'. */
export const sheetModelName = (name) => (String(name).match(MODEL_TOKEN) || [])[1] || '';
/** Do these chart sheets look like separate models (each named after one) rather than aux capacities? */
export function sheetsAreModels(names) {
  if (names.length < 2) return false;
  const models = names.map(sheetModelName);
  return models.every(Boolean) && names.every((n) => !capacityFrom(n)) && new Set(models).size === names.length;
}

/** Import a parsed workbook: every chart sheet into one model, or only `sheet` (one model per sheet). */
export function importTemplateWorkbook(wb, fileName = '', { sheet = null } = {}) {
  if (!wb.sheets.length) throw new Error('시트가 없습니다.');
  const warnings = [];
  const sheets = [];
  for (const sh of wb.sheets) {
    if (sheet !== null && sh.name !== sheet) continue;
    const p = parseSheet(sh, warnings);
    if (p) sheets.push(p);
    else warnings.push(`시트 '${sh.name}'에는 정격하중표 양식이 없어 건너뜀`);
  }
  if (!sheets.length) throw new Error("'아우트리거 MAX' 같은 구간 제목을 찾지 못했습니다. 기존 정격하중표 엑셀 양식인지 확인하세요.");

  // --- model, info -------------------------------------------------------------
  const m = newModel();
  m.tables = {};
  const first = sheets[0];
  const paren = first.sh.name.match(/\(([^)]+)\)/);
  const token = (first.sh.name.match(MODEL_TOKEN) || fileName.match(MODEL_TOKEN) || [])[1];
  m.info.name = ((paren && MODEL_TOKEN.test(paren[1]) ? paren[1].match(MODEL_TOKEN)[1] : null) || token || (paren ? paren[1] : '') || fileName.replace(/\.[^.]+$/, '')).trim() || '가져온 기종';
  const dm = fileName.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (dm) m.info.issueDate = `20${dm[1]}-${dm[2]}-${dm[3]}`;
  m.info.revNote = '기존 엑셀에서 가져옴';
  m.info.notes = [...DEFAULT_NOTES];

  // --- areas & outriggers from the first sheet ------------------------------------------
  m.settings.areas = [];
  m.settings.outriggers = [];
  const areaByName = new Map();
  const orByCode = new Map();
  for (const b of first.blocks) {
    if (!areaByName.has(b.area.name)) {
      const a = { id: uid('a'), name: b.area.name, ranges: b.area.ranges, perOutrigger: b.sub.codes.length === 1 };
      m.settings.areas.push(a);
      areaByName.set(b.area.name, a);
    }
    if (b.sub.codes.length === 1 && !orByCode.has(b.sub.codes[0])) {
      const code = b.sub.codes[0];
      const o = { id: uid('o'), ...(OUTRIGGER_NAMES[code] || { name: code, short: code, pct: 0.5 }) };
      m.settings.outriggers.push(o);
      orByCode.set(code, o);
    }
  }
  const condKeyOf = (b) => {
    const a = areaByName.get(b.area.name);
    if (!a) return null;
    if (!a.perOutrigger) return `${a.id}|all`;
    const o = orByCode.get(b.sub.codes[0]);
    return o ? `${a.id}|${o.id}` : null;
  };

  // --- winches: main from the first sheet, one aux winch per sheet ------------------------
  const W = m.settings.winches;
  delete W.aux;
  const colMaps = {};
  const buildWinch = (key, cfg, part, legend) => {
    cfg.booms = []; cfg.jibs = [];
    colMaps[key] = new Map();
    for (const col of part.cols) {
      const item = col.kind === 'jib' ? { id: uid('j'), label: col.label, len: col.len, maxR: null } : newBoom(col.len, null);
      (col.kind === 'jib' ? cfg.jibs : cfg.booms).push(item);
      colMaps[key].set(`${col.len}|${col.kind}`, item.id);
    }
    if (legend.base) cfg.falls.base = legend.base;
    if (legend.high) cfg.falls.high = legend.high;
  };
  const firstPart = (s, winch) => s.blocks.map((b) => b.parts.find((p) => p.winch === winch)).find(Boolean);
  const mainPart = firstPart(first, 'main');
  if (mainPart) buildWinch('main', W.main, mainPart, first.blocks[0].legend.main);
  else W.main.enabled = false;

  const sheetReport = [];
  sheets.forEach((s, i) => {
    const part = firstPart(s, 'aux');
    if (!part) { sheetReport.push({ name: s.sh.name, key: null, capacity: '', cells: 0 }); return; }
    const key = i === 0 ? 'aux' : uid('aux');
    const cfg = newAuxWinch(capacityFrom(s.sh.name) || capacityFrom(s.auxLabelText));
    W[key] = cfg;
    buildWinch(key, cfg, part, s.blocks[0].legend.aux);
    s.auxKey = key;
    sheetReport.push({ name: s.sh.name, key, capacity: cfg.capacity, cells: 0 });
  });

  // --- data ----------------------------------------------------------------------
  const radiiSeen = new Set();
  const hl = {}; const plain = {};
  const markers = new Map();
  let cellCount = 0;
  let mainDiff = 0;
  sheets.forEach((s, si) => {
    const fills = { main: new Set(), aux: new Set() };
    for (const b of s.blocks) for (const w of ['main', 'aux']) for (const f of b.legend[w].fills) fills[w].add(f);
    for (const b of s.blocks) {
      const ck = condKeyOf(b);
      if (!ck) { warnings.push(`[${s.sh.name}] '${b.area.name} ${b.sub.codes.join(',')}' 조건이 첫 시트에 없어 건너뜀`); continue; }
      for (const part of b.parts) {
        const key = part.winch === 'main' ? 'main' : s.auxKey;
        if (!key || (key === 'main' && !W.main.enabled)) continue;
        const compareOnly = key === 'main' && si > 0; // main is the same on every sheet
        const tk = tableKey(ck, key);
        for (const col of part.cols) {
          const id = colMaps[key].get(`${col.len}|${col.kind}`);
          if (!id) { warnings.push(`[${s.sh.name}] ${b.sub.row}행 부근: 첫 표에 없는 붐 길이 ${col.len} 열은 건너뜀`); continue; }
          for (const row of part.rows) {
            radiiSeen.add(row.radius);
            const c = s.cell(row.r, col.c);
            const v = c && c.v !== null && c.v !== '' ? parseInput(c.v) : null;
            if (compareOnly) {
              const cur = getCell(m, tk, id, row.radius);
              if (JSON.stringify(cur ?? null) !== JSON.stringify(v ?? null)) mainDiff++;
              continue;
            }
            if (v === null) continue;
            setCell(m, tk, id, row.radius, v);
            cellCount++;
            const rep = sheetReport.find((x) => x.key === key);
            if (rep) rep.cells++;
            if (typeof v === 'number') {
              ((fills[part.winch].has(c.fill) ? hl : plain)[key] ||= []).push(v);
            } else {
              const mk = String(v).match(/^\((.+)\)$/);
              if (mk) markers.set(id, Math.max(markers.get(id) || 0, Number(mk[1])));
            }
          }
        }
      }
    }
  });
  if (mainDiff) warnings.push(`메인 윈치 값이 첫 시트와 다른 칸이 ${mainDiff}개 있습니다 (첫 시트 값을 사용).`);

  const thresholds = {};
  for (const key of Object.keys(W).filter((k) => W[k].enabled)) {
    const cfg = W[key];
    for (const item of [...cfg.booms, ...cfg.jibs]) if (markers.has(item.id)) item.maxR = markers.get(item.id);
    const H = hl[key] || [], Pl = plain[key] || [];
    if (H.length) {
      const th = Pl.length ? Math.max(...Pl) : 0;
      if (Math.min(...H) > th) cfg.falls.threshold = th;
      else warnings.push(`${cfg.label}${cfg.capacity ? ` ${cfg.capacity}` : ''}: 줄걸이 색칠 구간이 하나의 기준 하중으로 설명되지 않아 기준값을 비워 둠`);
    }
    thresholds[key] = cfg.falls.threshold;
  }

  const rs = [...radiiSeen].sort((a, b) => a - b);
  if (rs.length) {
    let step = Infinity;
    for (let i = 1; i < rs.length; i++) step = Math.min(step, round(rs[i] - rs[i - 1], 2));
    m.settings.radius = { start: rs[0], end: rs[rs.length - 1], step: Number.isFinite(step) ? step : 1 };
  }

  return {
    model: m,
    report: {
      sheets: sheetReport,
      tables: sheets.reduce((n, s) => n + s.blocks.reduce((k, b) => k + b.parts.length, 0), 0),
      cells: cellCount,
      thresholds,
      warnings,
    },
  };
}
