// Data model for one rated-load-chart document (one crane model).
// DOM-free: runs in the browser and in Node (tests).
//
// Cell values in `tables` are stored as:
//   number        -> rated load (kg)
//   "(8.1)"       -> max-radius marker for that boom length
//   other string  -> invalid input kept as typed (shown as an error)

export const SCHEMA = 1;

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const DEFAULT_NOTES = [
  '하중 단위는 kg이며, 작업반경은 선회중심에서 훅 중심까지의 수평거리입니다.',
  '정격하중은 수평·견고한 지반에서 아우트리거를 규정대로 설치한 상태 기준입니다.',
  '표에 없는 작업반경·붐 길이는 바로 다음 큰 작업반경, 긴 붐 길이의 값을 적용합니다.',
  '훅 블록·줄걸이 용구 중량의 포함 여부: [사내 기준 기재]',
];

export function newBoom(len = null, maxR = null) {
  return { id: uid('b'), len, maxR };
}

export function newModel(name = '새 기종') {
  const t = new Date().toISOString();
  return {
    schema: SCHEMA,
    id: uid('m'),
    createdAt: t,
    updatedAt: t,
    info: {
      name,
      title: '정격하중표',
      titleEn: 'RATED LOAD CHART',
      subtitle: '카고 크레인 작업조건별 정격하중',
      docNo: '',
      rev: '00',
      issueDate: today(),
      revNote: '최초 제정',
      author: '',
      reviewer: '',
      approver: '',
      unit: 'kg',
      confidential: '본 자료는 당사 기술자료로서 제공 목적 외 사용 및 무단 복제·배포를 금합니다.',
      notes: [...DEFAULT_NOTES],
      logo: null, // data URL (png/jpg)
    },
    settings: {
      radius: { start: 2, end: 20, step: 1 },
      winches: {
        main: {
          enabled: true, label: '메인 윈치', labelEn: 'MAIN WINCH',
          booms: [newBoom(), newBoom(), newBoom(), newBoom(), newBoom()],
          jibs: [],
          falls: { base: '4연', high: '6연', threshold: null },
        },
        aux: {
          enabled: false, label: '보조 윈치', labelEn: 'AUX. WINCH',
          booms: [],
          jibs: [],
          falls: { base: '1연', high: '2연', threshold: null },
        },
      },
      // Generic example angles — replace with the real values per model.
      areas: [
        { id: uid('a'), name: '후방', ranges: [[330, 30]], perOutrigger: true },
        { id: uid('a'), name: '측방', ranges: [[30, 120], [240, 330]], perOutrigger: true },
        { id: uid('a'), name: '전방', ranges: [[120, 240]], perOutrigger: false },
      ],
      outriggers: [
        { id: uid('o'), code: 'MAX', name: '완전 신장', short: '100%', pct: 1.0 },
        { id: uid('o'), code: 'MID', name: '50% 이상 신장', short: 'MID', pct: 0.68 },
        { id: uid('o'), code: 'MIN', name: '50% 이하 신장', short: 'MIN', pct: 0.32 },
      ],
      checks: { areaOrder: true },
    },
    tables: {},
  };
}

// settings.winches: { main: {...}, aux: {...}, aux_xxx: {...} }
// 'main' is the single main winch; every other key is one aux winch (one per capacity, e.g. 3 ton / 4 ton).
// The main winch table does not depend on which aux winch is fitted.

/** Enabled winch keys: 'main' first, then aux winches in the order they were added. */
export function activeWinches(model) {
  const W = model.settings.winches;
  return Object.keys(W).filter((k) => W[k]?.enabled).sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : 0));
}

export const auxWinches = (model) => activeWinches(model).filter((k) => k !== 'main');

export function newAuxWinch(capacity = '') {
  return {
    enabled: true, label: '보조 윈치', labelEn: 'AUX. WINCH', capacity,
    booms: [], jibs: [],
    falls: { base: '1연', high: '2연', threshold: null },
  };
}

/** Adds an aux winch (re-uses a disabled legacy 'aux' slot) and returns its key. */
export function addAuxWinch(model, capacity = '') {
  const W = model.settings.winches;
  if (W.aux && !W.aux.enabled) { W.aux = { ...newAuxWinch(capacity) }; return 'aux'; }
  const key = W.aux ? uid('aux') : 'aux';
  W[key] = newAuxWinch(capacity);
  return key;
}

/** "보조 윈치 4 ton" */
export const winchTitle = (cfg) => (cfg?.capacity ? `${cfg.label} ${cfg.capacity}` : cfg?.label || '');
/** short tag for legends: "메인", "보조 4 ton" */
export const winchShort = (key, cfg) => (key === 'main' ? (cfg?.label || '메인').replace(/\s*윈치$/, '') : `${(cfg?.label || '보조').replace(/\s*윈치$/, '')}${cfg?.capacity ? ` ${cfg.capacity}` : ''}`);
/** Sub Winch option shown to users */
export const winchOption = (cfg) => cfg?.capacity || winchTitle(cfg);
/** Sub Boom option shown to users: "4.5 m / 7.0 m" — same style as the product DB (null without S/B columns) */
export function jibOption(cfg) {
  const j = cfg?.jibs || [];
  return j.length ? j.map((x) => `${fmtLen(x.len)} m`).join(' / ') : null;
}

/** Columns of one winch table: booms first, then jibs (S/B). */
export function columns(model, winch) {
  const w = model.settings.winches[winch];
  if (!w) return [];
  return [
    ...w.booms.map((b) => ({ id: b.id, kind: 'boom', len: b.len, maxR: b.maxR, header: fmtLen(b.len) })),
    ...(w.jibs || []).map((j) => ({ id: j.id, kind: 'jib', len: j.len, maxR: j.maxR ?? null, header: fmtLen(j.len), label: j.label || 'S/B' })),
  ];
}

export function fmtLen(len) {
  if (len === null || len === undefined || len === '' || Number.isNaN(Number(len))) return '?';
  const n = Number(len);
  return Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 1000) / 1000);
}

/** Radius values cleaned up: numbers ≥ 0, rounded to 0.1 m, unique, ascending. */
export const cleanRadii = (vs) => [...new Set(vs.map(Number).filter((v) => Number.isFinite(v) && v >= 0)
  .map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b);

/** Radius rows as numbers (rounded to 0.1 m to avoid float drift). An explicit row list — the
 *  Excel's own rows when they are not evenly spaced (2 · 2.5 · 3 · 4 …) — wins over start / end / step. */
export function radii(model) {
  const R = model.settings.radius || {};
  if (Array.isArray(R.list) && R.list.length) return cleanRadii(R.list);
  const { start, end, step } = R;
  const out = [];
  const s = Number(start), e = Number(end), st = Number(step);
  if (!(st > 0) || !(e >= s)) return out;
  for (let i = 0; ; i++) {
    const r = Math.round((s + i * st) * 10) / 10;
    if (r > e + 1e-9 || i > 500) break;
    out.push(r);
  }
  return out;
}

export const rKey = (r) => Number(r).toFixed(1);

/** Every radius that holds a value in any table (also rows the current row settings don't show). */
export function usedRadii(model) {
  const used = new Set();
  for (const t of Object.values(model.tables || {})) {
    for (const col of Object.values(t || {})) {
      for (const [k, v] of Object.entries(col || {})) if (v !== null && v !== undefined && v !== '') used.add(k);
    }
  }
  return cleanRadii([...used]);
}

/** All conditions (area × outrigger), in document order. */
export function conditions(model) {
  const out = [];
  const { areas, outriggers } = model.settings;
  for (const a of areas) {
    if (a.perOutrigger) {
      for (const o of outriggers) out.push({ key: `${a.id}|${o.id}`, area: a, outrigger: o });
    } else {
      out.push({ key: `${a.id}|all`, area: a, outrigger: null });
    }
  }
  return out;
}

export const tableKey = (condKey, winch) => `${condKey}|${winch}`;

export function getTable(model, tKey, create = false) {
  let t = model.tables[tKey];
  if (!t && create) t = model.tables[tKey] = {};
  return t || null;
}

export function getCell(model, tKey, colId, r) {
  return model.tables[tKey]?.[colId]?.[rKey(r)];
}

export function setCell(model, tKey, colId, r, value) {
  const k = rKey(r);
  if (value === null || value === undefined || value === '') {
    const col = model.tables[tKey]?.[colId];
    if (col) {
      delete col[k];
      if (!Object.keys(col).length) delete model.tables[tKey][colId];
    }
    return;
  }
  const t = getTable(model, tKey, true);
  (t[colId] ||= {})[k] = value;
}

/** Parse text typed by a user (or read from Excel) into a stored cell value. */
export function parseInput(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const s = String(text).trim();
  if (!s) return null;
  const m = s.match(/^\(\s*(\d+(?:\.\d+)?)\s*\)$/);
  if (m) return `(${Number(m[1]).toFixed(1)})`;
  const n = Number(s.replace(/,/g, ''));
  if (Number.isFinite(n)) return n;
  return s; // invalid, kept so the user can see and fix it
}

/** Classify a stored value. */
export function cellKind(v) {
  if (v === null || v === undefined || v === '') return { type: 'empty' };
  if (typeof v === 'number') return { type: 'num', v };
  const m = String(v).match(/^\((\d+(?:\.\d+)?)\)$/);
  if (m) return { type: 'mark', v: Number(m[1]) };
  return { type: 'bad', text: String(v) };
}

export function displayValue(v) {
  const k = cellKind(v);
  if (k.type === 'num') return k.v.toLocaleString('en-US');
  if (k.type === 'mark') return `(${k.v.toFixed(1)})`;
  if (k.type === 'bad') return k.text;
  return '';
}

export function isHighFalls(model, winch, v) {
  const th = model.settings.winches[winch]?.falls?.threshold;
  return typeof v === 'number' && th !== null && th !== undefined && th !== '' && v > Number(th);
}

/** Reference condition = first area × first outrigger (used for "변동구간"). */
export function referenceCondition(model) {
  return conditions(model)[0] || null;
}

export function isVariation(model, condKey, winch, colId, r, v) {
  const ref = referenceCondition(model);
  if (!ref || ref.key === condKey || typeof v !== 'number') return false;
  const base = getCell(model, tableKey(ref.key, winch), colId, r);
  return typeof base === 'number' && v < base;
}

/** Last radius row (index) that holds any value in any table — used to trim printed rows. */
export function lastUsedRowIndex(model) {
  const rs = radii(model);
  let last = -1;
  for (const c of conditions(model)) {
    for (const w of activeWinches(model)) {
      for (const col of columns(model, w)) {
        rs.forEach((r, i) => {
          if (i > last && getCell(model, tableKey(c.key, w), col.id, r) !== undefined) last = i;
        });
      }
    }
  }
  return last;
}

/** Cells stored in tables that no longer belong to the current settings. */
export function orphanCells(model) {
  const valid = new Set();
  for (const c of conditions(model)) for (const w of activeWinches(model)) valid.add(tableKey(c.key, w));
  const rowSet = new Set(radii(model).map(rKey));
  let count = 0;
  for (const [tk, t] of Object.entries(model.tables)) {
    const w = tk.split('|')[2];
    const colIds = new Set(columns(model, w).map((c) => c.id));
    for (const [cid, col] of Object.entries(t)) {
      for (const rk of Object.keys(col)) {
        if (!valid.has(tk) || !colIds.has(cid) || !rowSet.has(rk)) count++;
      }
    }
  }
  return count;
}

export function pruneOrphans(model) {
  const valid = new Set();
  for (const c of conditions(model)) for (const w of activeWinches(model)) valid.add(tableKey(c.key, w));
  const rowSet = new Set(radii(model).map(rKey));
  for (const [tk, t] of Object.entries(model.tables)) {
    if (!valid.has(tk)) { delete model.tables[tk]; continue; }
    const w = tk.split('|')[2];
    const colIds = new Set(columns(model, w).map((c) => c.id));
    for (const [cid, col] of Object.entries(t)) {
      if (!colIds.has(cid)) { delete t[cid]; continue; }
      for (const rk of Object.keys(col)) if (!rowSet.has(rk)) delete col[rk];
    }
  }
}

/** Parse "332-28, 245-332" (also accepts ~ and °) into [[332,28],[245,332]]. */
export function parseRanges(text) {
  return String(text || '')
    .split(/[,/]/)
    .map((p) => p.replace(/[°˚º]/g, '').split(/[-~]/).map((x) => Number(x.trim())))
    .filter((p) => p.length === 2 && p.every((n) => Number.isFinite(n)));
}

export const formatRanges = (ranges) => (ranges || []).map(([a, b]) => `${a}° ~ ${b}°`).join(' · ');

/** A working-area range as the crane controller shows it: degrees left/right of the rear, 0 … 180
 *  (the same both sides). 332~28 → [0, 28] · 28~115 and 245~332 → [28, 115] · 115~245 → [115, 180]. */
export function slewRange([a1, a2]) {
  const dev = (a) => { const m = ((a % 360) + 360) % 360; return m <= 180 ? m : 360 - m; };
  let b = a2;
  while (b <= a1) b += 360;
  const passes = (t) => [-360, 0, 360, 720].some((k) => t + k > a1 && t + k < b);
  const lo = passes(0) ? 0 : Math.min(dev(a1), dev(a2));
  const hi = passes(180) ? 180 : Math.max(dev(a1), dev(a2));
  return [lo, hi];
}
/** All ranges of an area in that form, each distinct one once: '0°~28°', '28°~115°'. Every model, every
 *  user-facing place (조회, PDF) — the admin settings keep the 0–360° definition. */
export const formatSlew = (ranges, gap = '') => [...new Set((ranges || []).map((r) => {
  const [lo, hi] = slewRange(r);
  return `${lo}°${gap}~${gap}${hi}°`;
}))].join(' · ');

export function settingsProblems(model) {
  const out = [];
  const { radius, winches, areas, outriggers } = model.settings;
  if (!(radius.step > 0) || !(radius.end >= radius.start)) out.push('작업반경 범위(시작·끝·간격)를 확인하세요.');
  const seen = new Set();
  for (const w of activeWinches(model)) {
    const cfg = winches[w];
    const t = winchTitle(cfg);
    if (!cfg.booms.length) out.push(`${t}: 붐 길이를 1개 이상 입력하세요.`);
    cfg.booms.forEach((b, i) => {
      if (!(Number(b.len) > 0)) out.push(`${t}: ${i + 1}단 붐 길이가 비어 있습니다.`);
      const prev = cfg.booms[i - 1];
      if (i > 0 && Number(b.len) > 0 && Number(prev.len) > 0 && Number(b.len) <= Number(prev.len)) out.push(`${t}: ${i + 1}단 붐 길이가 앞 단보다 길어야 합니다.`);
    });
    if (w !== 'main') {
      if (seen.has(t)) out.push(`보조 윈치 이름·용량이 겹칩니다: '${t}' — 용량을 구분해 주세요.`);
      seen.add(t);
    }
  }
  if (!areas.length) out.push('작업영역을 1개 이상 입력하세요.');
  areas.forEach((a) => { if (!a.ranges?.length) out.push(`작업영역 '${a.name}': 각도 범위가 없습니다.`); });
  if (areas.some((a) => a.perOutrigger) && !outriggers.length) out.push('아우트리거 단계를 1개 이상 입력하세요.');
  return out;
}

/**
 * Re-place max-radius markers from the settings: for every column with a max radius,
 * put "(maxR)" in the row right after the last load — only when the loads reach
 * floor(maxR) (a table whose capacity ends earlier gets no marker).
 */
export function autoMarkers(model) {
  let placed = 0, cleared = 0;
  const rs = radii(model);
  for (const c of conditions(model)) for (const w of activeWinches(model)) {
    const tk = tableKey(c.key, w);
    for (const col of columns(model, w)) {
      const maxR = Number(col.maxR);
      if (!(maxR > 0)) continue;
      rs.forEach((r) => { if (cellKind(getCell(model, tk, col.id, r)).type === 'mark') { setCell(model, tk, col.id, r, null); cleared++; } });
      let last = -1;
      rs.forEach((r, i) => { if (typeof getCell(model, tk, col.id, r) === 'number') last = i; });
      if (last < 0 || last + 1 >= rs.length || rs[last] < Math.floor(maxR)) continue;
      if (getCell(model, tk, col.id, rs[last + 1]) !== undefined) continue;
      setCell(model, tk, col.id, rs[last + 1], `(${maxR.toFixed(1)})`);
      placed++;
    }
  }
  return { placed, cleared };
}

export function touch(model) {
  model.updatedAt = new Date().toISOString();
  return model;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
