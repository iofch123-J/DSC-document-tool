// Automatic checks on a rated load chart. DOM-free.
//
// level 'ng'   -> must be fixed (blocks a clean release later)
// level 'warn' -> needs a human look ("확인")

import {
  conditions, activeWinches, columns, radii, tableKey, getCell, cellKind, rKey, settingsProblems, winchTitle,
} from './model.js';

const fmt = (n) => Number(n).toLocaleString('en-US');

export const CHECKS = {
  settings: { level: 'ng', title: '초기 설정 오류' },
  input: { level: 'ng', title: '숫자가 아닌 입력' },
  nonpositive: { level: 'ng', title: '0 이하의 하중' },
  monotonic: { level: 'ng', title: '반경이 커지는데 하중 증가' },
  marker: { level: 'ng', title: '최대반경 표기 위치 오류' },
  outrigger: { level: 'ng', title: '아우트리거를 줄였는데 하중 증가' },
  outriggerGap: { level: 'warn', title: '상위 아우트리거 단계에 없는 값' },
  gap: { level: 'warn', title: '값 사이의 빈 칸' },
  area: { level: 'warn', title: '앞 작업영역보다 큰 하중' },
  nomark: { level: 'warn', title: '기준 표에 최대반경 표기 없음' },
  markMismatch: { level: 'warn', title: '최대반경 표기 ≠ 초기 설정값' },
};

function condLabel(c) {
  return c.outrigger ? `${c.area.name}·${c.outrigger.name}` : `${c.area.name}·전 구간`;
}

export function validate(model) {
  const issues = [];
  const add = (code, msg, loc = null) => issues.push({ code, level: CHECKS[code].level, msg, ...(loc || {}) });

  for (const p of settingsProblems(model)) add('settings', p);

  const conds = conditions(model);
  const rs = radii(model);
  const winches = activeWinches(model);

  for (const w of winches) {
    const wl = winchTitle(model.settings.winches[w]);
    const cols = columns(model, w);
    for (const c of conds) {
      const tk = tableKey(c.key, w);
      for (const col of cols) {
        let prev = null; // {r, v}
        let markAt = null;
        let lastNum = null;
        let sawGapAfterNum = null;
        rs.forEach((r) => {
          const k = cellKind(getCell(model, tk, col.id, r));
          const loc = { cond: c.key, winch: w, col: col.id, r: rKey(r) };
          const where = `${condLabel(c)} · ${wl} · 붐 ${col.header} m · 반경 ${rKey(r)} m`;
          if (k.type === 'bad') add('input', `${where}: '${k.text}'`, loc);
          if (k.type === 'num') {
            if (k.v <= 0) add('nonpositive', `${where}: ${fmt(k.v)}`, loc);
            if (markAt) add('marker', `${where}: 최대반경 표기(${markAt.v}) 아래에 하중 값이 있음`, loc);
            if (prev && k.v > prev.v) add('monotonic', `${where}: ${rKey(prev.r)} m ${fmt(prev.v)} → ${rKey(r)} m ${fmt(k.v)}`, loc);
            if (sawGapAfterNum) add('gap', `${condLabel(c)} · ${wl} · 붐 ${col.header} m: 반경 ${sawGapAfterNum} m 칸이 비어 있음`, { ...loc, r: sawGapAfterNum });
            prev = { r, v: k.v }; lastNum = r; sawGapAfterNum = null;
          } else if (k.type === 'mark') {
            if (markAt) add('marker', `${where}: 최대반경 표기가 2개 이상`, loc);
            markAt = { r, v: k.v };
            if (col.maxR !== null && col.maxR !== undefined && col.maxR !== '' && Math.abs(Number(col.maxR) - k.v) > 1e-6) {
              add('markMismatch', `${where}: 표기 (${k.v}) / 초기 설정 ${col.maxR} m`, loc);
            }
          } else if (k.type === 'empty' && lastNum !== null && !markAt && sawGapAfterNum === null) {
            sawGapAfterNum = rKey(r);
          }
        });
      }
    }

    // reference table should carry max-radius markers on boom columns that have loads
    const ref = conds[0];
    if (ref) {
      const tk = tableKey(ref.key, w);
      for (const col of cols.filter((x) => x.kind === 'boom')) {
        const kinds = rs.map((r) => cellKind(getCell(model, tk, col.id, r)).type);
        if (kinds.includes('num') && !kinds.includes('mark')) {
          add('nomark', `${condLabel(ref)} · ${wl} · 붐 ${col.header} m: 최대반경 표기 없음`, { cond: ref.key, winch: w, col: col.id, r: null });
        }
      }
    }

    // outrigger hierarchy inside each area
    for (const a of model.settings.areas.filter((x) => x.perOutrigger)) {
      const ors = model.settings.outriggers;
      for (let i = 1; i < ors.length; i++) {
        const hi = `${a.id}|${ors[i - 1].id}`, lo = `${a.id}|${ors[i].id}`;
        for (const col of cols) for (const r of rs) {
          const vh = getCell(model, tableKey(hi, w), col.id, r);
          const vl = getCell(model, tableKey(lo, w), col.id, r);
          if (typeof vl !== 'number') continue;
          const loc = { cond: lo, winch: w, col: col.id, r: rKey(r) };
          const where = `${a.name} · ${wl} · 붐 ${col.header} m · 반경 ${rKey(r)} m`;
          if (typeof vh === 'number' && vl > vh) add('outrigger', `${where}: ${ors[i].name} ${fmt(vl)} > ${ors[i - 1].name} ${fmt(vh)}`, loc);
          if (vh === undefined) add('outriggerGap', `${where}: ${ors[i].name}에만 값 ${fmt(vl)}`, loc);
        }
      }
    }

    // area order (optional): each area should not exceed the previous one
    if (model.settings.checks?.areaOrder) {
      const areas = model.settings.areas;
      const ors = model.settings.outriggers;
      for (let i = 1; i < areas.length; i++) {
        const prevA = areas[i - 1], curA = areas[i];
        const pairs = [];
        if (curA.perOutrigger && prevA.perOutrigger) ors.forEach((o) => pairs.push([`${curA.id}|${o.id}`, `${prevA.id}|${o.id}`, o.name, o.name]));
        else {
          const cur = curA.perOutrigger ? ors.map((o) => [`${curA.id}|${o.id}`, o.name]) : [[`${curA.id}|all`, '전 구간']];
          const prv = prevA.perOutrigger && ors.length ? [`${prevA.id}|${ors[ors.length - 1].id}`, ors[ors.length - 1].name] : [`${prevA.id}|all`, '전 구간'];
          cur.forEach(([k, n]) => pairs.push([k, prv[0], n, prv[1]]));
        }
        for (const [ck, pk, cn, pn] of pairs) for (const col of cols) for (const r of rs) {
          const vc = getCell(model, tableKey(ck, w), col.id, r);
          const vp = getCell(model, tableKey(pk, w), col.id, r);
          if (typeof vc === 'number' && typeof vp === 'number' && vc > vp) {
            add('area', `${wl} · 붐 ${col.header} m · 반경 ${rKey(r)} m: ${curA.name}(${cn}) ${fmt(vc)} > ${prevA.name}(${pn}) ${fmt(vp)}`,
              { cond: ck, winch: w, col: col.id, r: rKey(r) });
          }
        }
      }
    }
  }

  const ng = issues.filter((i) => i.level === 'ng').length;
  return { issues, ng, warn: issues.length - ng };
}

/** Map "cond|winch|col|r" -> issues, for quick lookup while drawing the grid. */
export function issueIndex(result) {
  const map = new Map();
  for (const i of result.issues) {
    if (!i.cond || !i.r) continue;
    const k = `${i.cond}|${i.winch}|${i.col}|${i.r}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  return map;
}
