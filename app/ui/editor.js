// "하중 입력" — Excel-like grid per condition × winch.
// Keyboard: Enter/Tab/arrows move · Shift+arrows or drag select a range · Ctrl+C/Ctrl+V with Excel
// · Delete clears the range · Ctrl+Z undo · "(8.1)" is a max-radius marker.
import { h, clear, toast, dialog, confirmBox } from './dom.js';
import {
  conditions, activeWinches, columns, radii, tableKey, getCell, setCell, parseInput, cellKind, displayValue,
  isHighFalls, isVariation, referenceCondition, autoMarkers, rKey, winchTitle,
} from '../core/model.js';
import { issueIndex } from '../core/validate.js';
import { toSvg } from '../pdf/diagrams.js';
import { areaTopView, outriggerFront } from '../pdf/pictures.js';

const undoStacks = new Map(); // tableKey -> [json snapshots]
let stopDrag = () => {};
window.addEventListener('mouseup', () => stopDrag());

const condName = (c) => (c.outrigger ? c.outrigger.name : '전 구간 공통');
const raw = (v) => (v === undefined || v === null ? '' : typeof v === 'number' ? String(v) : String(v));

export function renderEditor(app, el) {
  const m = app.model;
  const conds = conditions(m);
  const ws = activeWinches(m);
  const rows = radii(m);
  if (!conds.length || !ws.length || !rows.length) {
    el.append(h('div', { class: 'card empty' },
      h('h2', null, '입력 양식을 만들 수 없습니다'),
      h('p', null, '초기 설정에서 작업반경 범위, 붐 길이, 작업영역을 먼저 입력하세요.'),
      h('button', { class: 'btn primary', onclick: () => app.go(`#/m/${m.id}/settings`) }, '초기 설정으로')));
    return;
  }
  let cond = conds.find((c) => c.key === app.ui.cond) || conds[0];
  app.ui.cond = cond.key;
  if (!ws.includes(app.ui.winch)) app.ui.winch = ws[0];
  const winch = app.ui.winch;
  const cols = columns(m, winch);
  const tk = tableKey(cond.key, winch);
  let idx = issueIndex(app.validation());

  // ------------------------------------------------------------------- sidebar
  const side = h('aside', { class: 'cond-list' });
  function paintSide() {
    clear(side);
    const v = app.validation();
    let lastArea = null;
    for (const c of conds) {
      if (c.area.id !== lastArea) { side.append(h('div', { class: 'cl-area' }, c.area.name)); lastArea = c.area.id; }
      let filled = 0;
      for (const w of ws) for (const col of columns(m, w)) for (const r of rows) if (typeof getCell(m, tableKey(c.key, w), col.id, r) === 'number') filled++;
      const ng = v.issues.filter((i) => i.cond === c.key && i.level === 'ng').length;
      const wn = v.issues.filter((i) => i.cond === c.key && i.level === 'warn').length;
      side.append(h('button', {
        class: `cl-item ${c.key === cond.key ? 'on' : ''}`,
        onclick: () => { app.ui.cond = c.key; clear(el); renderEditor(app, el); },
      }, h('span', null, condName(c)),
      h('span', { class: 'cl-meta' }, filled ? `${filled}칸` : '비어 있음',
        ng ? h('span', { class: 'chip ng' }, `NG ${ng}`) : wn ? h('span', { class: 'chip warn' }, wn) : null)));
    }
  }

  // ------------------------------------------------------------------- toolbar
  const winchSeg = h('div', { class: 'seg' }, ws.map((w) => h('button', {
    class: w === winch ? 'on' : '',
    onclick: () => { app.ui.winch = w; clear(el); renderEditor(app, el); },
  }, winchTitle(m.settings.winches[w]))));
  const varToggle = h('label', { class: 'chk' }, h('input', {
    type: 'checkbox', checked: app.ui.showVar, disabled: referenceCondition(m)?.key === cond.key,
    onchange: (e) => { app.ui.showVar = e.target.checked; paintAll(); },
  }), '변동구간 보기');
  const tools = h('div', { class: 'tools' },
    h('button', { class: 'btn sm', onclick: copyFromOther }, '다른 조건에서 복사'),
    h('button', { class: 'btn sm', onclick: runAutoMarkers }, '최대반경 자동 표기'),
    h('button', { class: 'btn sm', onclick: undo }, '되돌리기'),
    h('button', { class: 'btn sm danger-text', onclick: clearTable }, '표 비우기'),
    varToggle,
  );
  const head = h('div', { class: 'ed-head' },
    h('div', { class: 'ed-icons', html: toSvg(areaTopView(m.settings.areas, cond.area.id), 'height="46"') + toSvg(outriggerFront(cond.outrigger ? cond.outrigger.pct ?? 1 : 'all'), 'height="46"') }),
    h('div', { class: 'ed-title' },
      h('div', { class: 'ed-cond' }, `${cond.area.name} · ${condName(cond)}`),
      h('div', { class: 'muted' }, (cond.area.ranges || []).map(([a, b]) => `${a}° ~ ${b}°`).join(', '))),
    winchSeg,
  );
  const fl = m.settings.winches[winch].falls;
  const legend = h('div', { class: 'ed-legend' },
    fl.threshold !== null && fl.threshold !== undefined && fl.threshold !== '' ? h('span', { class: 'lg hl' }, `${fl.high} 구간 (> ${Number(fl.threshold).toLocaleString('en-US')} kg)`) : null,
    h('span', { class: 'lg mark' }, '(8.1) 최대반경'),
    h('span', { class: 'lg ng' }, 'NG'),
    h('span', { class: 'lg warn' }, '확인'),
    app.ui.showVar ? h('span', { class: 'lg var' }, '변동구간') : null,
    h('span', { class: 'muted hint-inline' }, 'Enter·Tab·방향키 이동 · 엑셀 범위 복사 후 Ctrl+V · Shift+방향키/드래그로 범위 선택 → Ctrl+C·Delete · Ctrl+Z'),
  );

  // ------------------------------------------------------------------- grid
  const booms = cols.filter((c) => c.kind === 'boom');
  const jibs = cols.filter((c) => c.kind === 'jib');
  const inputs = rows.map(() => []);
  const tbody = h('tbody');
  rows.forEach((r, ri) => {
    const tr = h('tr', { class: Math.abs(r % 5) < 1e-9 ? 'r5' : '' }, h('th', { class: 'rad' }, rKey(r)));
    cols.forEach((c, ci) => {
      const inp = h('input', { class: 'cell-in', dataset: { r: ri, c: ci }, autocomplete: 'off', spellcheck: false });
      inputs[ri][ci] = inp;
      tr.append(h('td', { class: 'cell' }, inp));
    });
    tbody.append(tr);
  });
  const table = h('table', { class: 'grid' },
    h('thead', null,
      h('tr', null,
        h('th', { class: 'rad', rowspan: 2 }, '반경', h('br'), '(m)'),
        booms.length ? h('th', { colspan: booms.length, class: 'grp' }, '붐 길이 (m)') : null,
        jibs.length ? h('th', { colspan: jibs.length, class: 'grp' }, `${jibs[0].label || 'S/B'} (m)`) : null),
      h('tr', null, cols.map((c) => h('th', { class: 'colh' }, c.header, c.maxR ? h('small', null, `최대 ${c.maxR}`) : null)))),
    tbody);
  const wrap = h('div', { class: 'grid-wrap' }, table);

  // selection state
  let active = { r: 0, c: 0 };
  let anchor = { r: 0, c: 0 };
  let extending = false;
  let dragging = false;
  const rect = () => ({ r0: Math.min(anchor.r, active.r), r1: Math.max(anchor.r, active.r), c0: Math.min(anchor.c, active.c), c1: Math.max(anchor.c, active.c) });
  const selSize = () => { const s = rect(); return (s.r1 - s.r0 + 1) * (s.c1 - s.c0 + 1); };

  function paint(ri, ci) {
    const inp = inputs[ri][ci];
    const r = rows[ri], c = cols[ci];
    const v = getCell(m, tk, c.id, r);
    const k = cellKind(v);
    if (document.activeElement !== inp) inp.value = displayValue(v);
    const td = inp.parentElement;
    const cl = ['cell'];
    if (k.type === 'num' && isHighFalls(m, winch, k.v)) cl.push('hl');
    if (k.type === 'num' && app.ui.showVar && isVariation(m, cond.key, winch, c.id, r, k.v)) cl.push('var');
    if (k.type === 'mark') cl.push('mark');
    if (k.type === 'bad') cl.push('bad');
    if (k.type === 'empty' && c.maxR && r > Math.ceil(Number(c.maxR)) + 1) cl.push('beyond');
    const iss = idx.get(`${cond.key}|${winch}|${c.id}|${rKey(r)}`);
    if (iss) { cl.push(iss.some((i) => i.level === 'ng') ? 'ng' : 'warn'); td.title = iss.map((i) => i.msg).join('\n'); } else td.title = '';
    const s = rect();
    if (selSize() > 1 && ri >= s.r0 && ri <= s.r1 && ci >= s.c0 && ci <= s.c1) cl.push('sel');
    td.className = cl.join(' ');
  }
  function paintAll() { rows.forEach((_, ri) => cols.forEach((__, ci) => paint(ri, ci))); }
  function paintSel() {
    const s = rect();
    const multi = selSize() > 1;
    rows.forEach((_, ri) => cols.forEach((__, ci) => {
      inputs[ri][ci].parentElement.classList.toggle('sel', multi && ri >= s.r0 && ri <= s.r1 && ci >= s.c0 && ci <= s.c1);
    }));
  }

  let revalTimer = null;
  function afterEdit(cells) {
    app.changed();
    if (cells === 'all') paintAll(); else cells.forEach(([ri, ci]) => paint(ri, ci));
    clearTimeout(revalTimer);
    revalTimer = setTimeout(() => { idx = issueIndex(app.validation()); paintAll(); paintSide(); }, 200);
  }
  function pushUndo() {
    const st = undoStacks.get(tk) || [];
    st.push(JSON.stringify(m.tables[tk] || {}));
    if (st.length > 60) st.shift();
    undoStacks.set(tk, st);
  }
  function undo() {
    const st = undoStacks.get(tk);
    if (!st || !st.length) { toast('되돌릴 작업이 없습니다.'); return; }
    const snap = JSON.parse(st.pop());
    if (Object.keys(snap).length) m.tables[tk] = snap; else delete m.tables[tk];
    afterEdit('all');
  }
  function commit(ri, ci, text) {
    const r = rows[ri], c = cols[ci];
    const nv = parseInput(text);
    const ov = getCell(m, tk, c.id, r);
    if (JSON.stringify(ov ?? null) === JSON.stringify(nv ?? null)) return;
    pushUndo();
    setCell(m, tk, c.id, r, nv);
    afterEdit([[ri, ci]]);
  }
  function go(ri, ci) {
    ri = Math.max(0, Math.min(rows.length - 1, ri));
    ci = Math.max(0, Math.min(cols.length - 1, ci));
    inputs[ri][ci].focus();
  }
  const pos = (t) => ({ ri: Number(t.dataset.r), ci: Number(t.dataset.c) });

  table.addEventListener('focusin', (e) => {
    if (!e.target.matches('.cell-in')) return;
    const { ri, ci } = pos(e.target);
    active = { r: ri, c: ci };
    if (!extending) anchor = { r: ri, c: ci };
    extending = false;
    e.target.value = raw(getCell(m, tk, cols[ci].id, rows[ri]));
    e.target.select();
    paintSel();
  });
  table.addEventListener('focusout', (e) => {
    if (!e.target.matches('.cell-in')) return;
    const { ri, ci } = pos(e.target);
    commit(ri, ci, e.target.value);
    paint(ri, ci);
  });
  table.addEventListener('keydown', (e) => {
    const inp = e.target;
    if (!inp.matches('.cell-in')) return;
    const { ri, ci } = pos(inp);
    const mod = e.ctrlKey || e.metaKey;
    const full = inp.selectionStart === 0 && inp.selectionEnd === inp.value.length;
    const move = (dr, dc) => {
      e.preventDefault();
      commit(ri, ci, inp.value);
      if (e.shiftKey && e.key.startsWith('Arrow')) extending = true;
      go(ri + dr, ci + dc);
    };
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      if (inp.value !== raw(getCell(m, tk, cols[ci].id, rows[ri]))) return; // let the input undo typing
      e.preventDefault(); undo(); return;
    }
    switch (e.key) {
      case 'Enter': move(e.shiftKey ? -1 : 1, 0); break;
      case 'Tab': move(0, e.shiftKey ? -1 : 1); break;
      case 'ArrowUp': move(-1, 0); break;
      case 'ArrowDown': move(1, 0); break;
      case 'ArrowLeft': if (e.shiftKey || full || inp.selectionEnd === 0) move(0, -1); break;
      case 'ArrowRight': if (e.shiftKey || full || inp.selectionStart === inp.value.length) move(0, 1); break;
      case 'Escape': inp.value = raw(getCell(m, tk, cols[ci].id, rows[ri])); inp.select(); break;
      case 'Delete':
      case 'Backspace':
        if (selSize() > 1) { e.preventDefault(); clearRange(); }
        break;
      default:
    }
  });
  table.addEventListener('mousedown', (e) => {
    if (!e.target.matches('.cell-in')) return;
    const { ri, ci } = pos(e.target);
    if (e.shiftKey) { extending = true; active = { r: ri, c: ci }; paintSel(); }
    dragging = true;
  });
  table.addEventListener('mouseover', (e) => {
    if (!dragging || !e.target.matches('.cell-in')) return;
    const { ri, ci } = pos(e.target);
    active = { r: ri, c: ci };
    paintSel();
  });
  stopDrag = () => { dragging = false; };

  table.addEventListener('copy', (e) => {
    if (selSize() <= 1) return;
    const s = rect();
    const lines = [];
    for (let ri = s.r0; ri <= s.r1; ri++) {
      const line = [];
      for (let ci = s.c0; ci <= s.c1; ci++) line.push(raw(getCell(m, tk, cols[ci].id, rows[ri])));
      lines.push(line.join('\t'));
    }
    e.clipboardData.setData('text/plain', lines.join('\n'));
    e.preventDefault();
    toast(`${selSize()}칸을 복사했습니다.`);
  });
  table.addEventListener('paste', (e) => {
    if (!e.target.matches('.cell-in')) return;
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\r/g, '').replace(/\n+$/, '');
    if (!/[\t\n]/.test(text)) return; // single value: normal paste into the cell
    e.preventDefault();
    const s = rect();
    const here = pos(e.target);
    const inSel = selSize() > 1 && here.ri >= s.r0 && here.ri <= s.r1 && here.ci >= s.c0 && here.ci <= s.c1;
    const r0 = inSel ? s.r0 : here.ri, c0 = inSel ? s.c0 : here.ci;
    pushUndo();
    let n = 0, outside = 0;
    text.split('\n').forEach((line, dr) => line.split('\t').forEach((cellText, dc) => {
      const ri = r0 + dr, ci = c0 + dc;
      if (ri >= rows.length || ci >= cols.length) { if (cellText.trim()) outside++; return; }
      setCell(m, tk, cols[ci].id, rows[ri], parseInput(cellText));
      n++;
    }));
    afterEdit('all');
    const t = inputs[r0][c0];
    t.value = raw(getCell(m, tk, cols[c0].id, rows[r0]));
    t.select();
    toast(`${n}칸 붙여넣기${outside ? ` · 표 밖 ${outside}칸은 제외` : ''}`, outside ? 'warn' : 'ok');
  });

  function clearRange() {
    const s = rect();
    pushUndo();
    for (let ri = s.r0; ri <= s.r1; ri++) for (let ci = s.c0; ci <= s.c1; ci++) setCell(m, tk, cols[ci].id, rows[ri], null);
    afterEdit('all');
    const t = inputs[active.r][active.c];
    t.value = '';
  }

  // ------------------------------------------------------------------- tool actions
  async function copyFromOther() {
    const others = conds.filter((c) => c.key !== cond.key);
    const sel = h('select', { class: 'inp' }, others.map((c) => h('option', { value: c.key }, `${c.area.name} · ${condName(c)}`)));
    const ok = await dialog('다른 조건에서 복사', h('div', null,
      h('label', { class: 'fld' }, h('span', null, `가져올 조건 (${winchTitle(m.settings.winches[winch])})`), sel),
      h('p', { class: 'muted' }, '현재 표의 내용은 지워지고 선택한 조건의 값으로 바뀝니다. [되돌리기]로 복구할 수 있습니다.')),
    [{ label: '취소', value: false }, { label: '복사', value: true, kind: 'primary' }]);
    if (!ok) return;
    pushUndo();
    const src = m.tables[tableKey(sel.value, winch)];
    if (src) m.tables[tk] = JSON.parse(JSON.stringify(src)); else delete m.tables[tk];
    afterEdit('all');
    toast('복사했습니다.', 'ok');
  }
  async function runAutoMarkers() {
    const ok = await confirmBox('최대반경 자동 표기', h('div', null,
      h('p', null, '초기 설정에 최대 작업반경이 입력된 열마다, 모든 조건의 표에서 기존 (x.x) 표기를 지우고 다시 배치합니다.'),
      h('ul', null,
        h('li', null, '위치: 마지막 하중 값 바로 아래 칸'),
        h('li', null, '하중이 최대 작업반경(소수점 버림) 행까지 이어지는 표에만 표기'),
        h('li', null, '최대 작업반경이 비어 있는 열은 그대로 둠')),
      h('p', { class: 'muted' }, '모든 조건에 적용되므로 [되돌리기]로는 현재 표만 복구됩니다.')), '적용');
    if (!ok) return;
    pushUndo();
    const res = autoMarkers(m);
    afterEdit('all');
    toast(`최대반경 표기 ${res.placed}개 배치 (기존 ${res.cleared}개 정리)`, 'ok');
  }
  async function clearTable() {
    if (!(await confirmBox('표 비우기', h('p', null, `${cond.area.name} · ${condName(cond)} · ${winchTitle(m.settings.winches[winch])} 표의 모든 값을 지웁니다. [되돌리기]로 복구할 수 있습니다.`), '비우기', true))) return;
    pushUndo();
    delete m.tables[tk];
    afterEdit('all');
  }

  // ------------------------------------------------------------------- mount
  paintSide();
  paintAll();
  el.append(h('div', { class: 'editor' }, side, h('div', { class: 'ed-main card' }, head, h('div', { class: 'ed-bar' }, tools), legend, wrap)));

  const f = app.ui.focus;
  if (f) {
    app.ui.focus = null;
    const ri = rows.findIndex((r) => rKey(r) === f.r);
    const ci = cols.findIndex((c) => c.id === f.col);
    if (ri >= 0 && ci >= 0) setTimeout(() => { inputs[ri][ci].focus(); inputs[ri][ci].scrollIntoView({ block: 'center', inline: 'center' }); }, 30);
  }
}
