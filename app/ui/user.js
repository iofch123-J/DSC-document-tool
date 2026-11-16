// 사용자 화면: 한 페이지에 제품 선택 → 조회 → PDF 생성을 아래로 이어서 보여 줍니다.
// 제품 구성이 확정되면 그 아래의 조회·PDF 생성 구역이 채워집니다.
import { h, clear, download, safeName } from './dom.js';
import { loadCatalog } from '../core/catalog.js';
import { applyVariant, variantLabel, variantFileTag, hasOption } from '../core/variant.js';
import {
  conditions, activeWinches, columns, radii, rKey, tableKey, getCell, cellKind, isHighFalls, lastUsedRowIndex, winchTitle,
} from '../core/model.js';
import { validate } from '../core/validate.js';
import { areaDiagram, outriggerDiagram, toSvg } from '../pdf/diagrams.js';
import { planPages } from '../pdf/render.js';
import { makePdf } from './pdfgen.js';
import { logEvent } from '../core/security.js';

const KEY = 'rlc-user-selection';
const norm = (s) => String(s || '').trim().toUpperCase();
let lastUrl = null;

function saveSel(U) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ category: U.category || null, product: U.product, subWinch: U.subWinch, subBoom: U.subBoom, query: U.query || '', viewed: U.viewed || null })); } catch { /* ignore */ }
}
function loadSel(U) {
  if (U.product) return;
  try { Object.assign(U, JSON.parse(sessionStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
}

// section heading: small English kicker + Korean title + one-line description
const secHead = (kicker, title, sub) => h('div', { class: 'sec-head' },
  h('div', { class: 'sec-kicker' }, kicker), h('h2', null, title), sub ? h('p', { class: 'sub' }, sub) : null);

export async function renderUser(app, main) {
  const U = app.user;
  loadSel(U);
  const models = await app.store.list();
  const catalog = await loadCatalog(app.store, models);
  const byName = new Map();
  for (const m of models) if (!byName.has(norm(m.info.name))) byName.set(norm(m.info.name), m); // newest first

  const chosen = () => !!(U.product && U.subWinch && U.subBoom);
  const model = () => (U.product ? byName.get(norm(U.product)) : null);
  // 조회 shows a configuration only after the '조회' button: U.viewed is the configuration it was pressed for
  const selKey = () => (chosen() ? [U.product, U.subWinch, U.subBoom].join('|') : null);

  const selSec = h('section', { class: 'u-sec', id: 'sec-select' });
  const viewSec = h('section', { class: 'u-sec', id: 'sec-view' });
  const issueSec = h('section', { class: 'u-sec', id: 'sec-issue' });
  main.append(selSec, viewSec, issueSec);

  // 조회 · PDF 생성 are rebuilt only when the viewed configuration changes; choosing another
  // configuration in the list clears them until '조회' is pressed again
  let shown = null;
  function paintLower() {
    if (U.viewed && U.viewed !== selKey()) { U.viewed = null; saveSel(U); }
    const on = !!U.viewed;
    const m = on ? model() : null;
    const key = m ? `${m.id}|${U.viewed}` : (on ? 'unregistered' : 'none');
    if (key === shown) return;
    shown = key;
    clear(viewSec);
    clear(issueSec);
    viewSec.append(secHead('RATED LOAD CHART', '조회', '작업영역 · 아우트리거 · 윈치 버튼을 누르면 해당 조건의 정격하중표가 나타납니다.'));
    issueSec.append(secHead('DOCUMENT ISSUE', 'PDF 생성', '외부 제공 · 내부용 PDF를 만듭니다. 지금 조회 중인 페이지만, 또는 선택한 제품 전체를 만들 수 있습니다.'));
    if (!m) {
      viewSec.append(h('div', { class: 'card sec-empty' }, on
        ? '선택한 제품은 정격하중 데이터가 등록되지 않았습니다. 관리자 화면에서 등록하세요.'
        : "위 목록에서 구성을 선택하고 '조회'를 누르면 여기에 정격하중표가 나타납니다."));
      issueSec.append(h('div', { class: 'card sec-empty' }, on
        ? '정격하중 데이터가 등록된 제품만 PDF를 만들 수 있습니다.'
        : '제품을 조회하면 PDF를 만들 수 있습니다.'));
      return;
    }
    const { model: vm, notes } = applyVariant(m, U);
    let issue = null;
    renderView(app, viewSec, vm, notes, U, () => issue?.syncView());   // the page button follows 조회
    issue = renderIssue(app, issueSec, vm, U);
    // 보안관리 이력: one entry per configuration opened in 조회
    logEvent(app.store, app.session, 'view', { product: U.product, subWinch: U.subWinch, subBoom: U.subBoom, rev: m.info.rev || '00' });
  }
  renderSelect(app, selSec, catalog, byName, U, {
    onChange: paintLower,
    onView: () => {
      if (!chosen()) return;
      U.viewed = selKey();
      saveSel(U);
      paintLower();
      viewSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
  paintLower();
}

// ------------------------------------------------------------------------ 제품 선택
// Search box + cascading "Excel filter" buttons: (분류) → 제품명 → Sub Winch → Sub Boom.
// Choosing a value opens the next filter; the list underneath shows the matching configurations.
const searchKey = (s) => String(s || '').toLowerCase().replace(/[\s\-_]/g, '');
const ICON_SEARCH = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';
const svgIcon = (paths) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ico');
  el.innerHTML = paths;
  return el;
};

const ICON_FILTER = '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>';

function renderSelect(app, main, catalog, byName, U, { onChange, onView }) {
  const products = catalog.products || [];
  const allRows = catalog.rows || [];
  const FILTERS = ['product', 'subWinch', 'subBoom'];
  const LABEL = { category: '분류', product: '제품명', subWinch: 'Sub Winch', subBoom: 'Sub Boom' };
  const ALL = '전체';
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  let openKey = null;

  main.append(secHead('PRODUCT SELECTION', '제품 선택', `제품명을 검색하거나 필터를 차례로 눌러 ${categories.length ? '(분류) → ' : ''}제품명 → Sub Winch → Sub Boom을 선택한 뒤 '조회'를 누르세요.`));

  if (!products.length) {
    main.append(h('div', { class: 'card empty' },
      h('h2', null, '제품 목록이 없습니다'),
      h('p', null, '관리자 화면에서 제품 DB를 가져오거나 정격하중 데이터를 등록하면 여기에 나타납니다.')));
    return;
  }
  if (U.category && !categories.includes(U.category)) U.category = null;

  // ---- data helpers
  const matchQuery = (name) => !U.query || searchKey(name).includes(searchKey(U.query));
  const inCategory = (cat) => !U.category || cat === U.category;
  const visibleProducts = () => products.filter((p) => matchQuery(p.name) && inCategory(p.category));
  const product = () => products.find((p) => p.name === U.product) || null;
  const winch = () => product()?.subWinches?.find((s) => s.label === U.subWinch) || null;
  const regOf = (name) => byName.get(norm(name)) || null;
  const regBadge = (name) => {
    const m = regOf(name);
    return m ? h('span', { class: 'chip ok' }, `데이터 Rev.${m.info.rev || '00'}`) : h('span', { class: 'chip' }, '미등록');
  };
  const optionsOf = (key) => {
    if (key === 'category') return [ALL, ...categories].map((c) => ({ value: c, badge: c === ALL ? null : h('span', { class: 'muted' }, `${products.filter((p) => p.category === c).length}`) }));
    if (key === 'product') return visibleProducts().map((p) => ({ value: p.name, badge: regBadge(p.name), sub: !U.category && p.category ? p.category : '' }));
    if (key === 'subWinch') return (product()?.subWinches || []).map((s) => ({ value: s.label }));
    const booms = winch()?.subBooms?.length ? winch().subBooms : ['없음'];
    return winch() ? booms.map((b) => ({ value: b })) : [];
  };
  const enabled = (key) => key === 'category' || key === 'product' || (key === 'subWinch' ? !!U.product : !!U.subWinch);
  const clearFrom = (i) => FILTERS.slice(i).forEach((k) => { U[k] = null; });

  // ---- state changes
  function set(key, value, { cascade = true } = {}) {
    openKey = null;
    U.cond = null;
    if (key === 'category') {
      U.category = !value || value === ALL ? null : value;
      if (U.product && !inCategory(product()?.category)) clearFrom(0);
      if (!U.product && U.category) openKey = 'product';
      saveSel(U);
      paint();
      return;
    }
    const i = FILTERS.indexOf(key);
    U[key] = value;
    clearFrom(i + 1);
    if (value && cascade) {
      // walk forward: auto-pick a filter that has only one option, otherwise open it
      for (const k of FILTERS.slice(i + 1)) {
        const opts = optionsOf(k);
        if (opts.length === 1) { U[k] = opts[0].value; continue; }
        if (opts.length > 1) openKey = k;
        break;
      }
    }
    saveSel(U);
    paint();
  }
  function setAll(r) {
    U.product = r.product; U.subWinch = r.subWinch; U.subBoom = r.subBoom; U.cond = null;
    openKey = null;
    saveSel(U);
    paint();
  }

  // ---- search
  const search = h('input', {
    type: 'search', class: 'search-inp', value: U.query || '', autocomplete: 'off', spellcheck: false,
    placeholder: '제품명 검색 (예: 2507)',
    title: 'Enter: 하나만 맞으면 바로 선택',
    oninput: (e) => {
      U.query = e.target.value;
      if (U.product && !matchQuery(U.product)) clearFrom(0);
      openKey = null;
      saveSel(U);
      paint();
    },
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      const hits = visibleProducts();
      if (hits.length === 1) set('product', hits[0].name);
      else if (hits.length > 1) { openKey = 'product'; paint(); }
    },
  });
  const searchBox = h('div', { class: 'search-row' },
    h('label', { class: 'search-box' }, svgIcon(ICON_SEARCH), search),
    h('button', { class: 'btn f-reset', title: '검색어와 필터를 모두 지웁니다', onclick: () => { U.query = ''; search.value = ''; U.category = null; set('product', null); } }, '초기화'));

  // ---- filter bar (Excel-filter style dropdowns): (분류) | ① 제품명 › ② Sub Winch › ③ Sub Boom
  const bar = h('div', { class: 'filter-bar' });
  const keys = () => [...(categories.length ? ['category'] : []), ...FILTERS];
  function chip(key, idx) {
    const on = enabled(key);
    const isCat = key === 'category';
    const value = isCat ? (U.category || ALL) : U[key];
    const isSet = isCat ? !!U.category : !!value;
    const isOpen = openKey === key && on;
    const wrap = h('div', { class: `fchip ${isCat ? 'cat' : ''} ${isSet ? 'set' : ''} ${on ? '' : 'off'} ${isOpen ? 'open' : ''}` });
    wrap.append(h('button', {
      class: 'fchip-btn', disabled: !on, 'aria-haspopup': 'listbox', 'aria-expanded': isOpen ? 'true' : 'false',
      'aria-label': isCat ? `${LABEL[key]}: ${value}` : null,
      onclick: () => { openKey = isOpen ? null : key; paintBar(); if (!isOpen) focusOption(); },
    },
    h('span', { class: 'f-no' }, isCat ? svgIcon(ICON_FILTER) : String(FILTERS.indexOf(key) + 1)),
    h('span', { class: 'f-text' },
      isCat ? null : h('small', null, LABEL[key]),   // 분류: the filter icon is label enough; value centred
      h('b', { title: on ? '' : '앞 단계를 먼저 선택하세요' }, value || (on ? '선택하세요' : '앞 단계 먼저'))),
    h('span', { class: 'f-caret' }, '▾')));
    if (isSet) wrap.append(h('button', { class: 'f-clear', title: `${LABEL[key]} 선택 해제`, onclick: () => set(key, null) }, '×'));
    if (isOpen) {
      const opts = optionsOf(key);
      const pop = h('div', { class: 'f-pop', role: 'listbox', 'aria-label': LABEL[key] },
        h('div', { class: 'f-pop-h' }, `${LABEL[key]} 선택`,
          key === 'product' && (U.query || U.category) ? h('span', { class: 'muted' }, ` · ${[U.category, U.query && `'${U.query}'`].filter(Boolean).join(' · ')}`) : null),
        opts.length ? opts.map((o) => h('button', {
          class: `f-opt ${o.value === value ? 'on' : ''}`, role: 'option', 'aria-selected': o.value === value ? 'true' : 'false',
          onclick: () => set(key, o.value),
        }, h('span', { class: 'f-check' }, o.value === value ? '✓' : ''), h('span', { class: 'f-val' }, o.value, o.sub ? h('small', { class: 'f-sub' }, o.sub) : null), o.badge || null))
          : h('div', { class: 'f-empty' }, '조건에 맞는 제품이 없습니다.'));
      pop.addEventListener('keydown', (e) => {
        const items = [...pop.querySelectorAll('.f-opt')];
        const at = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, at + 1)]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, at - 1)]?.focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); openKey = null; paintBar(); bar.querySelectorAll('.fchip-btn')[idx]?.focus(); }
      });
      wrap.append(pop);
    }
    return wrap;
  }
  function paintBar() {
    clear(bar);
    keys().forEach((key, idx) => {
      if (idx && key !== 'product') bar.append(h('span', { class: 'f-arrow' }, '›'));
      if (key === 'product' && idx) bar.append(h('span', { class: 'f-sep' }));
      bar.append(chip(key, idx));
    });
  }
  function focusOption() {
    requestAnimationFrame(() => {
      const pop = bar.querySelector('.fchip.open .f-pop');
      (pop?.querySelector('.f-opt.on') || pop?.querySelector('.f-opt'))?.focus();
    });
  }
  const onDocDown = (e) => {
    if (!bar.isConnected) { document.removeEventListener('mousedown', onDocDown); return; }
    if (openKey && !bar.contains(e.target)) { openKey = null; paintBar(); }
  };
  document.addEventListener('mousedown', onDocDown);

  // ---- matching configurations
  const results = h('div', { class: 'card flush results' });
  function paintResults() {
    clear(results);
    const rows = allRows.filter((r) => matchQuery(r.product) && inCategory(r.category)
      && (!U.product || r.product === U.product) && (!U.subWinch || r.subWinch === U.subWinch) && (!U.subBoom || r.subBoom === U.subBoom));
    const done = !!(U.product && U.subWinch && U.subBoom);
    results.append(h('div', { class: 'results-h' },
      h('b', null, U.subBoom ? '선택한 구성' : '조건에 맞는 구성'), h('span', { class: 'muted' }, `${rows.length}개`),
      h('button', { class: 'btn primary view-go', disabled: !done, title: done ? `${U.product} · ${variantLabel(U)} 조회` : '목록에서 구성을 선택하세요', onclick: onView }, '조회')));
    if (!rows.length) { results.append(h('div', { class: 'res-scroll empty' }, '조건에 맞는 구성이 없습니다.')); return; }   // same box size as a list
    let lastP = null;
    let lastCat = '';
    const showCat = categories.length > 0;
    const scroller = h('div', { class: 'res-scroll' });
    results.append(scroller);
    scroller.append(h('table', { class: 'res-table' },
      h('thead', null, h('tr', null,
        h('th', { class: 'no' }, 'No.'), showCat ? h('th', null, '분류') : null, h('th', null, '제품명'),
        h('th', null, 'Sub Winch'), h('th', null, 'Sub Boom'), h('th', null, '정격하중 데이터'), h('th', null, ''))),
      h('tbody', null, rows.map((r) => {
        const first = r.product !== lastP;
        lastP = r.product;
        if (first) lastCat = r.category;
        const isOn = U.product === r.product && U.subWinch === r.subWinch && U.subBoom === r.subBoom;
        // follow-on rows carry the group's 분류/제품명 hidden; the top visible row shows them while scrolling
        return h('tr', { class: `${first ? 'grp' : ''} ${isOn ? 'on' : ''}`, onclick: () => setAll(r) },
          h('td', { class: 'no' }, r.no),
          showCat ? h('td', { class: 'cat' }, first ? r.category : h('span', { class: 'ghost' }, r.category || lastCat)) : null,
          h('td', { class: 'p' }, first ? h('b', null, r.product) : h('span', { class: 'ghost' }, r.product)),
          h('td', null, r.subWinch),
          h('td', null, r.subBoom),
          h('td', null, first ? regBadge(r.product) : ''),
          h('td', { class: 'pick' }, isOn ? h('span', { class: 'chip ok' }, '선택됨') : h('span', { class: 'pick-btn' }, '선택')));
      }))));
    pinTopRow(scroller);
    scroller.addEventListener('scroll', () => pinTopRow(scroller), { passive: true });
  }

  /** While scrolled into a product's group, its first row is hidden — show the name on the top visible row. */
  function pinTopRow(scroller) {
    const head = scroller.querySelector('thead');
    const line = scroller.scrollTop + (head ? head.offsetHeight : 0);
    let top = null;
    for (const tr of scroller.querySelectorAll('tbody tr')) {
      if (tr.offsetTop + tr.offsetHeight / 2 > line) { top = tr; break; }
    }
    scroller.querySelector('tr.pin')?.classList.remove('pin');
    if (top && !top.classList.contains('grp') && scroller.scrollTop > 0) top.classList.add('pin');
  }

  function paint() {
    paintBar();
    paintResults();
    if (openKey) focusOption();
    onChange();
  }

  const src = catalog.source === 'db'
    ? `제품 DB: ${catalog.db.fileName || ''} (${catalog.db.rows.length}개 구성) · ${String(catalog.db.importedAt || '').slice(0, 10).replace(/-/g, '.')} 가져옴`
    : '※ 제품 DB가 없어 등록된 정격하중 데이터로 목록을 만들었습니다 (관리자 → 제품 DB 가져오기).';
  // search + filters, with the matching list (and its 조회 button) underneath
  main.append(
    h('div', { class: 'finder-grid' },
      h('div', { class: 'card finder' }, searchBox, bar),
      h('div', { class: 'res-col' }, results)),
    h('p', { class: 'hint' }, src),
  );
  paint();
  if (!U.product) search.focus({ preventScroll: true });
}

// ------------------------------------------------------------------------ 조회
function chartTable(m, cond, winch) {
  const cfg = m.settings.winches[winch];
  const cols = columns(m, winch);
  const booms = cols.filter((c) => c.kind === 'boom');
  const jibs = cols.filter((c) => c.kind === 'jib');
  const all = radii(m);
  const rows = all.slice(0, Math.max(lastUsedRowIndex(m) + 1, Math.min(all.length, 10)));
  const tk = tableKey(cond.key, winch);
  return h('div', { class: 'ct' },
    h('div', { class: 'ct-title' }, h('b', null, winchTitle(cfg)), h('span', { class: 'en' }, cfg.labelEn || ''), h('span', { class: 'u' }, `정격하중 (${m.info.unit || 'kg'})`)),
    h('div', { class: 'ct-scroll' }, h('table', { class: 'chart' },
      h('thead', null,
        h('tr', null,
          h('th', { class: 'rad', rowspan: 2 }, '작업반경', h('br'), '(m)'),
          booms.length ? h('th', { class: 'grp', colspan: booms.length }, '붐 길이 (m)') : null,
          jibs.length ? h('th', { class: 'grp', colspan: jibs.length }, `${jibs[0].label || 'S/B'} (m)`) : null),
        h('tr', null, cols.map((c) => h('th', null, c.header)))),
      h('tbody', null, rows.map((r, ri) => h('tr', { class: Math.abs(r % 5) < 1e-9 ? 'r5' : '' },
        h('th', { class: 'rad' }, rKey(r)),
        cols.map((c) => {
          const k = cellKind(getCell(m, tk, c.id, r));
          if (k.type === 'num') return h('td', { class: `${isHighFalls(m, winch, k.v) ? 'hl' : ''} ${ri % 2 ? 'z' : ''}` }, k.v.toLocaleString('en-US'));
          if (k.type === 'mark') return h('td', { class: 'mark' }, `(${k.v.toFixed(1)})`);
          return h('td', { class: 'na' });
        })))))));
}

// 조회: three button groups (작업영역 · 아우트리거 · 윈치) pick ONE table.
const OR_CODES = ['MAX', 'MID', 'MIN'];
// boom tip with both hooks: the hook of the chosen winch in red, the other one greyed out
const WINCH_PIC = { main: 'img/winch-main.png', aux: 'img/winch-aux.png' };

function renderView(app, main, m, notes, U, onPaint) {
  const conds = conditions(m);
  const v = validate(m);
  const S = m.settings;
  const areas = S.areas;
  const ors = S.outriggers;
  const auxKey = activeWinches(m).find((k) => k !== 'main') || null;
  // Each time 조회 opens (a configuration is confirmed, or the page loads) it starts at
  // 후방 · MAX. · 메인 윈치 — falling back to the first area / the most-extended outrigger.
  const rear = areas.find((a) => a.name === '후방') || areas[0];
  const maxOr = ors.find((o) => o.code === 'MAX') || [...ors].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const sel = (U.view = { area: rear?.id, or: maxOr?.id, winch: 'main' });
  for (const src of Object.values(WINCH_PIC)) new Image().src = src;   // both ready, so switching winch doesn't flicker

  const orCode = (o, i) => o.code || (ors.length === 3 ? OR_CODES[i] : o.short || o.name);
  const curArea = () => areas.find((a) => a.id === sel.area);
  const curCond = () => {
    const a = curArea();
    return conds.find((c) => c.key === (a.perOutrigger ? `${a.id}|${sel.or}` : `${a.id}|all`));
  };
  const winchKey = () => (sel.winch === 'aux' && auxKey ? auxKey : 'main');
  // 'Sub Boom 4.5 m' when chosen; just 'Sub Boom', greyed, when the product goes without it
  const option = (label, v) => (hasOption(v)
    ? h('span', null, `${label} ${v}`)
    : h('span', { class: 'off', title: `${label} 없음` }, label));
  const ranges = (a) => (a.ranges || []).map(([p, q]) => `${p}°~${q}°`).join(' · ');

  const panel = h('div', { class: 'view-panel' });

  function vbtn({ on, disabled, icon, label, sub, title, onclick }) {
    return h('button', {
      class: `vbtn ${on ? 'on' : ''}`, disabled: !!disabled, 'aria-pressed': on ? 'true' : 'false', title: title || '',
      onclick: () => { onclick(); paint(); },
    },
    icon ? h('span', { class: 'vb-ico', html: icon }) : null,
    h('span', { class: 'vb-t' }, h('b', null, label), sub ? h('small', null, sub) : null));
  }

  function paint() {
    clear(panel);
    const a = curArea();
    const cond = curCond();
    const wk = winchKey();
    const cfg = S.winches[wk];
    const orIdx = ors.findIndex((o) => o.id === sel.or);
    const perOr = a.perOutrigger;

    // Like the printed chart: two pictures on top (working area · outrigger) with a caption,
    // each with its buttons underneath; the pictures follow the selection.
    const orCur = perOr ? ors[orIdx] : null;
    const picture = (svg, caption, sub) => h('div', { class: 'vp-pic' },
      h('div', { class: 'vp-frame', html: svg }),
      h('div', { class: 'vp-cap' }, h('b', null, caption), sub ? h('span', null, sub) : null));
    const groups = h('div', { class: 'card vp-wrap' },
      // picture (with its caption) on the left, its buttons stacked vertically on the right
      h('div', { class: 'vp-col' },
        h('div', { class: 'vb-label' }, '작업영역'),
        h('div', { class: 'vp-body' },
          picture(toSvg(areaDiagram(areas, a.id), 'width="100%" preserveAspectRatio="xMidYMid meet"'), `${a.name}영역`, ranges(a)),
          h('div', { class: 'vb-stack' }, areas.map((x) => vbtn({
            on: x.id === sel.area, label: x.name,
            onclick: () => { sel.area = x.id; },
          }))))),
      h('div', { class: 'vp-col' },
        h('div', { class: 'vb-label' }, '아우트리거', !perOr ? h('span', { class: 'vb-note' }, `${a.name}은 전 구간 공통`) : null),
        h('div', { class: 'vp-body' },
          picture(toSvg(outriggerDiagram(orCur ? orCur.pct ?? 1 : 'all'), 'width="100%" preserveAspectRatio="xMidYMid meet"'),
            orCur ? `${orCode(orCur, orIdx)}.` : '전 구간 공통', orCur ? orCur.name : '신장 상태 무관'),
          h('div', { class: 'vb-stack' }, ors.map((o, i) => vbtn({
            on: perOr && o.id === sel.or, disabled: !perOr, label: `${orCode(o, i)}.`,
            title: perOr ? o.name : `${a.name}은 아우트리거 신장 상태와 관계없이 표가 하나입니다`,
            onclick: () => { sel.or = o.id; },
          }))))),
      // winch: same layout as the other two — picture (to come) on the left, 메인 / 보조 on the right
      h('div', { class: 'vp-col vp-winch' },
        h('div', { class: 'vb-label' }, '윈치'),
        h('div', { class: 'vp-body' },
          h('div', { class: 'vp-pic tall' },
            h('div', { class: 'vp-frame pic' },
              h('img', { src: WINCH_PIC[wk === 'main' ? 'main' : 'aux'], alt: wk === 'main' ? '메인 후크 사용 (보조 후크는 흐리게)' : '보조 후크 사용 (메인 후크는 흐리게)' }))),
          h('div', { class: 'vb-stack' },
            vbtn({ on: wk === 'main', label: '메인', sub: S.winches.main.labelEn || 'MAIN WINCH', onclick: () => { sel.winch = 'main'; } }),
            vbtn({
              on: wk !== 'main', disabled: !auxKey, label: '보조',
              sub: auxKey ? (S.winches[auxKey].labelEn || 'AUX. WINCH') : 'Sub Winch 없음',
              title: auxKey ? (S.winches[auxKey].capacity ? `보조 윈치 ${S.winches[auxKey].capacity}` : '') : '선택한 제품 구성에 보조 윈치가 없습니다',
              onclick: () => { sel.winch = 'aux'; },
            })))));

    const fl = cfg.falls;
    const hasFalls = fl?.threshold !== null && fl?.threshold !== undefined && fl?.threshold !== '';
    const title = [a.name, perOr ? `${orCode(ors[orIdx], orIdx)}.` : '아우트리거 전 구간 공통', winchTitle(cfg)].join(' · ');
    const result = h('div', { class: 'card view-result' },
      h('div', { class: 'vr-head' },
        h('div', null,
          h('div', { class: 'vr-k' }, '조회 결과'),
          h('div', { class: 'vr-title' }, title)),
        h('div', { class: 'ed-legend cv-legend' },
          hasFalls ? h('span', { class: 'lg hl', title: `${fl.high} 걸이 구간 (그 외 ${fl.base})` }, fl.high) : null,
          h('span', { class: 'lg mark' }, '( ) 최대 작업반경'),
          h('span', { class: 'lg na-lg' }, '작업 불가'))),
      cond ? h('div', { class: 'vr-table' }, chartTable(m, cond, wk)) : h('p', { class: 'muted' }, '해당 조건의 표가 없습니다.'));

    panel.append(groups, result);
    sel.page = cond ? { condKey: cond.key, winch: wk, label: title } : null;   // what '조회 페이지만 생성' prints
    onPaint?.();
  }

  main.append(...[
    h('div', { class: 'card view-head' },
      h('div', { class: 'vh-k' }, '조회 중인 제품'),
      h('div', { class: 'vh-row' },
        h('div', { class: 'vh-name' }, m.info.name),
        h('div', { class: 'vh-variant' },
          option('Sub Winch', U.subWinch), h('span', { class: 'vh-sep' }, '·'), option('Sub Boom', U.subBoom)),
        h('div', { class: 'vh-rev' },
          h('span', null, '개정 / 발행일'),
          h('b', null, [`Rev.${m.info.rev || '00'}`, String(m.info.issueDate || '').replace(/-/g, '.')].filter(Boolean).join(' · '))))),
    notes.length ? h('div', { class: 'infobox col' }, notes.map((n) => h('div', null, n))) : null,
    v.ng ? h('div', { class: 'warnbox' }, `이 기종 데이터에 관리자 검증 NG ${v.ng}건이 있습니다. 배포 전에 관리자에게 확인하세요.`) : null,
    panel,
  ].filter(Boolean));   // Element.append would print a null as the text "null"
  paint();
}

// ------------------------------------------------------------------------ PDF 생성
// 외부 (default): 제공처 goes on every page. 내부: no 제공처 — the person viewing (사번 이름) instead.
// 관리번호 is issued automatically per generated file: DSC-YYYY-MM-NNN (the NNN-th file of that month).
// Two buttons: only the table shown in 조회 right now (one page, no cover), or the whole product
// as configured (cover + every condition of the chosen Sub Winch / Sub Boom).
function renderIssue(app, main, m, U) {
  const o = app.user.pdf;
  if (o.kind !== 'internal') o.kind = 'external';
  const v = validate(m);
  const pages = planPages(m);
  const viewer = app.session ? [app.session.empNo, app.session.name].filter(Boolean).join(' ') : '';
  const internal = () => o.kind === 'internal';

  const status = h('div', { class: 'pdf-status' });
  const result = h('div', { class: 'pdf-result' });
  const preview = h('div', { class: 'pdf-preview' }, h('div', { class: 'ph' },
    h('p', null, "'조회 페이지만 생성' 또는 '제품 전체 생성'을 누르세요."),
    h('p', { class: 'muted' }, `${m.info.name} · ${variantLabel(U)}`)));

  const toInp = h('input', { type: 'text', class: 'inp', value: o.to || '', oninput: (e) => { o.to = e.target.value; } });
  const ctrlBox = h('div', { class: 'inp ro ctrl-box', 'aria-live': 'polite' });
  const dateInp = h('input', { type: 'date', class: 'inp', value: o.date || '', oninput: (e) => { o.date = e.target.value; } });
  const hint = h('p', { class: 'hint' });
  const showCtrl = (ctrl) => {
    ctrlBox.textContent = ctrl || '생성할 때 자동 부여';
    ctrlBox.classList.toggle('set', !!ctrl);
  };
  showCtrl(null);

  const kindBtns = [['external', '외부'], ['internal', '내부']].map(([k, label]) => h('button', {
    type: 'button', 'aria-pressed': 'false', onclick: () => { o.kind = k; syncKind(); },
  }, label));
  function syncKind() {
    kindBtns.forEach((b, i) => {
      const on = (i === 1) === internal();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    toInp.disabled = internal();
    toInp.value = internal() ? '' : (o.to || '');
    toInp.placeholder = internal() ? '내부용 — 제공처 없음' : '예: ○○건설 ○○현장';
    hint.textContent = internal()
      ? `내부용: 조회자${viewer ? `(${viewer})` : ''}와 관리번호가 모든 페이지의 워터마크와 바닥글에 들어갑니다.`
      : '외부 제공: 제공처와 관리번호가 모든 페이지의 워터마크와 바닥글에 들어갑니다.';
  }

  let ack = !v.ng;
  let busy = false;
  const pageSub = h('small');
  const pageBtn = h('button', { class: 'btn gen-btn', onclick: () => generate('page') },
    h('b', null, '조회 페이지만 생성'), pageSub);
  const allBtn = h('button', { class: 'btn primary gen-btn', onclick: () => generate('all') },
    h('b', null, '제품 전체 생성'), h('small', null, `표지 1 + 조건별 ${pages.length - 1}페이지`));
  const syncBtns = () => {
    const pg = U.view?.page;
    pageBtn.disabled = busy || !ack || !pg?.condKey;
    allBtn.disabled = busy || !ack;
    pageSub.textContent = pg?.condKey ? `${pg.label} · 1페이지` : '조회 중인 표가 없습니다';
  };

  async function generate(scope) {
    const pg = U.view?.page;
    if (scope === 'page' && !pg?.condKey) return;
    busy = true;
    syncBtns();
    clear(result);
    try {
      const t0 = performance.now();
      status.textContent = '관리번호 받는 중…';
      const ctrl = await app.store.nextCtrl();
      showCtrl(ctrl);
      const to = internal() ? '' : String(o.to || '').trim();
      const dist = internal() ? { internal: true, viewer, ctrl, date: o.date } : { to, ctrl, date: o.date };
      const only = scope === 'page' ? { condKey: pg.condKey, winch: pg.winch } : null;
      const blob = await makePdf(m, { mode: 'customer', dist, only }, (t) => { status.textContent = t; });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      const n = scope === 'page' ? 1 : pages.length;
      const part = scope === 'page' ? pg.label.replace(/\s*·\s*/g, '_').replace(/\.(?=_|$)/g, '').replace(/\s+/g, '') : '정격하중표';
      const fname = `${[m.info.name, variantFileTag(U), part, `Rev${m.info.rev || '00'}`, internal() ? '내부용' : '', ctrl].filter(Boolean).map(safeName).join('_')}.pdf`;
      clear(preview);
      preview.append(h('iframe', { src: lastUrl, title: 'PDF 미리보기' }));
      status.textContent = `완료 — ${ctrl} · ${n}페이지 · ${(blob.size / 1024).toFixed(0)} KB · ${((performance.now() - t0) / 1000).toFixed(1)}초`;
      logEvent(app.store, app.session, 'pdf', {
        product: m.info.name, subWinch: U.subWinch, subBoom: U.subBoom, rev: m.info.rev || '00',
        mode: internal() ? 'internal' : 'customer', scope, page: scope === 'page' ? pg.label : undefined,
        to, ctrl, date: o.date, file: fname, pages: n,
      });
      result.append(
        h('button', { class: 'btn primary block', onclick: () => download(blob, fname) }, '내려받기'),
        h('a', { class: 'btn block link-btn', href: lastUrl, target: '_blank', rel: 'noopener' }, '새 탭에서 열기'),
        h('div', { class: 'muted fname' }, fname));
    } catch (e) {
      console.error(e);
      status.textContent = `PDF 생성 실패: ${e.message}`;
    } finally {
      busy = false;
      syncBtns();
    }
  }

  syncKind();
  syncBtns();
  main.append(h('div', { class: 'pdf-layout' },
    h('div', { class: 'card pdf-opts' },
      // two halves: details + fields | buttons + result (side by side on mid-width screens)
      h('div', { class: 'po-a' },
      h('h2', null, '배포 정보'),
      h('table', { class: 'kv' },
        h('tr', null, h('th', null, '기종'), h('td', null, h('b', null, m.info.name))),
        h('tr', null, h('th', null, '사양'), h('td', null, variantLabel(U))),
        h('tr', null, h('th', null, '개정'), h('td', null, `Rev.${m.info.rev || '00'} · ${String(m.info.issueDate || '').replace(/-/g, '.')}`))),
      h('div', { class: 'dist' },
        h('div', { class: 'fld' }, h('span', null, '제공처'),
          h('div', { class: 'to-row' }, h('div', { class: 'seg kind-seg', role: 'group', 'aria-label': '제공 구분' }, kindBtns), toInp)),
        h('div', { class: 'fld' }, h('span', null, '관리번호'), ctrlBox),
        h('label', { class: 'fld' }, h('span', null, '제공일'), dateInp),
        hint)),
      h('div', { class: 'po-b' },
      v.ng ? h('div', { class: 'warnbox' },
        h('p', null, `관리자 검증 NG ${v.ng}건이 남아 있는 데이터입니다.`),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: (e) => { ack = e.target.checked; syncBtns(); } }), '확인했으며 PDF를 만듭니다')) : null,
      h('div', { class: 'gen-btns' }, pageBtn, allBtn),
      status, result)),
    preview));
  return { syncView: syncBtns };
}
