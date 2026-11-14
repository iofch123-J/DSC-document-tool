// Model list (home).
import { h, toast, dialog, confirmBox, download, pickFile, fmtDate, safeName } from './dom.js';
import { newModel, clone, uid, SCHEMA } from '../core/model.js';
import { importTemplateXlsx } from '../core/importer.js';
import { validate } from '../core/validate.js';
import { PRODUCT_DB, keyOf, parseProductDb, dbStats } from '../core/catalog.js';
import { BRAND_LOGO, readLogoFile } from '../core/brand.js';
import { STAFF, securityOn } from '../core/security.js';

export async function renderHome(app, el) {
  const models = await app.store.list();

  const actions = h('div', { class: 'actions' },
    h('button', { class: 'btn primary', onclick: () => createModel(app) }, '＋ 새 기종'),
    h('button', { class: 'btn', onclick: () => importExcel(app) }, '엑셀 가져오기'),
    h('button', { class: 'btn', onclick: () => importBackup(app) }, '백업 파일 열기'),
  );

  el.append(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'sec-kicker' }, 'ADMINISTRATION'), h('h1', null, '기종 목록'), h('p', { class: 'sub' }, app.store.description)),
    actions,
  ));

  el.append(await productDbCard(app, models), await securityCard(app), await brandCard(app));

  if (!models.length) {
    el.append(h('div', { class: 'empty card' },
      h('h2', null, '아직 등록된 기종이 없습니다'),
      h('p', null, '새 기종을 만들어 초기 설정부터 시작하거나, 기존 정격하중표 엑셀 파일을 가져오세요.'),
      h('ol', { class: 'steps-mini' },
        h('li', null, h('b', null, '초기 설정'), ' — 기종명, 붐 길이, 보조윈치, 작업영역 등을 입력하면 입력 양식이 만들어집니다.'),
        h('li', null, h('b', null, '하중 입력'), ' — 표에 직접 입력하거나 엑셀에서 복사해 붙여넣습니다.'),
        h('li', null, h('b', null, '검증 → PDF'), ' — 자동 검증 결과를 확인하고 PDF 문서를 만듭니다.'),
      ),
    ));
    return;
  }

  const rows = models.map((m) => {
    let v;
    try { v = validate(m); } catch { v = { broken: true }; }   // a damaged record must not take the list down
    return h('tr', { class: 'click', onclick: (e) => { if (!e.target.closest('button')) app.go(`#/m/${m.id}/settings`); } },
      h('td', null, h('b', null, m.info?.name || '(이름 없음)')),
      h('td', null, m.info.docNo || h('span', { class: 'muted' }, '—')),
      h('td', null, `Rev.${m.info.rev || '00'}`),
      h('td', null, String(m.info.issueDate || '').replace(/-/g, '.')),
      h('td', null, v.broken ? h('span', { class: 'chip ng' }, '손상')
        : h('span', { class: `chip ${v.ng ? 'ng' : v.warn ? 'warn' : 'ok'}` }, v.ng ? `NG ${v.ng}` : v.warn ? `확인 ${v.warn}` : 'OK')),
      h('td', { class: 'muted' }, fmtDate(m.updatedAt)),
      h('td', { class: 'row-actions' },
        h('button', { class: 'btn sm', onclick: () => app.go(`#/m/${m.id}/pdf`) }, 'PDF'),
        h('button', { class: 'btn sm', onclick: () => duplicate(app, m) }, '복제'),
        h('button', { class: 'btn sm', onclick: () => exportBackup(m) }, '백업 저장'),
        h('button', { class: 'btn sm danger-text', onclick: () => remove(app, m) }, '삭제'),
      ),
    );
  });
  el.append(h('div', { class: 'card flush' }, h('table', { class: 'list' },
    h('thead', null, h('tr', null, ['기종', '문서번호', '개정', '발행일', '검증', '최근 수정', ''].map((t) => h('th', null, t)))),
    h('tbody', null, rows),
  )));
}

const reload = (app) => { if (location.hash === '#/admin') window.dispatchEvent(new HashChangeEvent('hashchange')); else app.go('#/admin'); };

// ---------------------------------------------------------------------------- 제품 DB
// Product master for the user screen (분류 · 제품명 · Sub Winch · Sub Boom), imported from Excel.
async function productDbCard(app, models) {
  const db = await app.store.getMeta(PRODUCT_DB);
  const registered = new Set(models.map((m) => keyOf(m.info.name)));
  const head = h('div', { class: 'pdb-h' },
    h('div', null,
      h('h2', null, '제품 DB'),
      h('p', { class: 'muted' }, '사용자 화면 제품 선택(분류 → 제품명 → Sub Winch → Sub Boom)의 기준 목록입니다. 엑셀(No. · 분류 · 제품명 · Sub Winch · Sub Boom)에서 가져옵니다.')),
    app.remote
      // web mode: the list lives in the Google Sheet — edit it there, then refresh
      ? h('div', { class: 'actions' },
        db?.sheetUrl ? h('a', { class: 'btn', href: db.sheetUrl, target: '_blank', rel: 'noopener' }, '구글 시트 열기') : null,
        h('button', { class: 'btn', onclick: () => { app.store.refresh(); reload(app); } }, '새로고침'))
      : h('div', { class: 'actions' },
      h('button', { class: `btn ${db ? '' : 'primary'}`, onclick: () => importProductDb(app) }, db ? '다시 가져오기' : '제품 DB 가져오기'),
      db ? h('button', { class: 'btn danger-text', onclick: async () => {
        if (!(await confirmBox('제품 DB 삭제', h('p', null, '제품 DB를 지웁니다. 사용자 화면은 등록된 정격하중 데이터 기준 목록으로 바뀝니다.'), '삭제', true))) return;
        await app.store.removeMeta(PRODUCT_DB); reload(app);
      } }, '삭제') : null));
  if (!db) {
    return h('div', { class: 'card pdb' }, head,
      h('p', { class: 'pdb-empty' }, '아직 가져온 제품 DB가 없습니다. 지금은 등록된 정격하중 데이터로 사용자 화면 목록을 만듭니다.'));
  }
  const st = dbStats(db);
  const withData = st.products.filter((p) => registered.has(keyOf(p.name))).length;
  const groups = [...st.byCat.keys()].map((cat) => h('div', { class: 'pdb-group' },
    h('span', { class: 'pdb-cat' }, cat),
    st.products.filter((p) => (p.category || '미분류') === cat).map((p) => h('span', {
      class: `pdb-chip ${registered.has(keyOf(p.name)) ? 'reg' : ''}`,
      title: registered.has(keyOf(p.name)) ? '정격하중 데이터 등록됨' : '정격하중 데이터 미등록',
    }, p.name))));
  return h('div', { class: 'card pdb' }, head,
    h('div', { class: 'pdb-stats' },
      h('div', null, h('b', null, st.configs), h('span', null, '구성')),
      h('div', null, h('b', null, st.products.length), h('span', null, '제품')),
      h('div', null, h('b', null, `${withData} / ${st.products.length}`), h('span', null, '정격하중 데이터 등록')),
      h('div', { class: 'pdb-file' }, h('span', null, db.fileName || '—'), h('small', null, `${db.sheet} · 가져온 시각 ${fmtDate(db.importedAt)}`))),
    groups,
    h('p', { class: 'hint' }, '■ 진한 칩 = 정격하중 데이터 등록됨 (기종명이 제품명과 같아야 연결됩니다)'));
}

// ---------------------------------------------------------------------------- 보안관리 (summary → its own page)
async function securityCard(app) {
  const staff = await app.store.getMeta(STAFF);
  const on = app.remote || securityOn(staff);
  const logs = await app.store.listLogs();
  return h('div', { class: 'card sec-card' },
    h('div', { class: 'pdb-h' },
      h('div', null,
        h('h2', null, '보안관리 ', h('span', { class: `chip ${on ? 'ok' : 'warn'}` }, on ? '켜짐' : '꺼짐')),
        h('p', { class: 'muted' }, on
          ? `사용자 명단 ${staff.people.length}명 (관리자 ${staff.people.filter((p) => p.admin).length}명) · 이력 ${logs.length}건`
          : '사용자 명단이 없어 누구나 들어올 수 있습니다. 명단(개발 DATABASE의 "사용자" 시트)을 등록하면 사번 확인과 이력 기록이 시작됩니다.')),
      h('div', { class: 'actions' }, h('a', { class: `btn ${on ? '' : 'primary'}`, href: '#/admin/security' }, on ? '보안관리 열기' : '명단 등록하기'))));
}

// ---------------------------------------------------------------------------- 회사 로고 (CI)
// Shown at the top of every screen. Kept in this browser only — never in the (public) repository.
async function brandCard(app) {
  const b = await app.store.getMeta(BRAND_LOGO);
  const pick = async () => {
    const file = await pickFile('.png,.jpg,.jpeg,image/png,image/jpeg');
    if (!file) return;
    try {
      const rec = await readLogoFile(file);
      await app.store.putMeta(BRAND_LOGO, rec);
      app.brand = rec;
      toast('회사 로고를 저장했습니다.', 'ok');
      reload(app);
    } catch (e) {
      await dialog('로고 저장 실패', h('p', null, e.message));
    }
  };
  return h('div', { class: 'card brand-card' },
    h('div', { class: 'pdb-h' },
      h('div', null,
        h('h2', null, '회사 로고 (CI)'),
        h('p', { class: 'muted' }, '모든 화면 맨 위에 표시됩니다. 공개 저장소에는 올리지 않고 이 브라우저에만 저장합니다 (PNG/JPG).')),
      h('div', { class: 'actions' },
        h('button', { class: `btn ${b ? '' : 'primary'}`, onclick: pick }, b ? '변경' : '로고 이미지 선택'),
        b ? h('button', { class: 'btn danger-text', onclick: async () => {
          await app.store.removeMeta(BRAND_LOGO);
          app.brand = null;
          reload(app);
        } }, '삭제') : null)),
    b ? h('div', { class: 'brand-prev' },
      h('img', { src: b.dataUrl, alt: '회사 로고' }),
      h('span', { class: 'muted' }, `${b.fileName || ''} · ${b.width}×${b.height}px · ${fmtDate(b.updatedAt)} 등록`))
      : h('p', { class: 'pdb-empty' }, '등록된 로고가 없어 상단에 DY 글자 표시를 씁니다.'));
}

async function importProductDb(app) {
  const file = await pickFile('.xlsx');
  if (!file) return;
  let db;
  try {
    db = await parseProductDb(await file.arrayBuffer(), file.name);
  } catch (e) {
    await dialog('제품 DB 가져오기 실패', h('p', null, e.message));
    return;
  }
  const st = dbStats(db);
  const ok = await dialog('제품 DB 가져오기', h('div', { class: 'report' },
    h('table', { class: 'kv' },
      h('tr', null, h('th', null, '파일 / 시트'), h('td', null, `${db.fileName} / ${db.sheet}`)),
      h('tr', null, h('th', null, '구성'), h('td', null, `${st.configs}개`)),
      h('tr', null, h('th', null, '제품'), h('td', null, `${st.products.length}개 — ${[...st.byCat].map(([c, n]) => `${c} ${n}`).join(' · ')}`))),
    h('div', { class: 'pdb-preview' }, h('table', { class: 'mini' },
      h('thead', null, h('tr', null, ['No.', '분류', '제품명', 'Sub Winch', 'Sub Boom'].map((t) => h('th', null, t)))),
      h('tbody', null, db.rows.slice(0, 8).map((r) => h('tr', null, [r.no, r.category, r.product, r.subWinch, r.subBoom].map((t) => h('td', null, t))))))),
    db.rows.length > 8 ? h('p', { class: 'muted' }, `… 외 ${db.rows.length - 8}행`) : null,
    db.warnings.length ? h('div', { class: 'warnbox' }, h('b', null, '주의'), h('ul', null, db.warnings.map((w) => h('li', null, w)))) : null,
  ), [{ label: '취소', value: false }, { label: '저장', value: true, kind: 'primary' }]);
  if (!ok) return;
  await app.store.putMeta(PRODUCT_DB, db);
  toast(`제품 DB를 저장했습니다 (${st.configs}개 구성).`, 'ok');
  reload(app);
}

async function createModel(app) {
  const input = h('input', { type: 'text', class: 'inp', placeholder: '예: 모델명', autofocus: true });
  const ok = await dialog('새 기종', h('label', { class: 'fld' }, h('span', null, '기종명'), input),
    [{ label: '취소', value: false }, { label: '만들기', value: true, kind: 'primary' }]);
  if (!ok) return;
  const m = newModel(input.value.trim() || '새 기종');
  await app.store.put(m);
  app.go(`#/m/${m.id}/settings`);
}

async function importExcel(app) {
  const file = await pickFile('.xlsx');
  if (!file) return;
  let res;
  try {
    res = await importTemplateXlsx(await file.arrayBuffer(), file.name);
  } catch (e) {
    await dialog('가져오기 실패', h('p', null, e.message));
    return;
  }
  const { model, report } = res;
  const W = model.settings.winches;
  const fmtTh = (v) => (v === null || v === undefined ? '비움' : `${Number(v).toLocaleString('en-US')} kg 초과`);
  const nameInp = h('input', { type: 'text', class: 'inp', value: model.info.name });
  // one row per sheet: aux-winch capacity can be corrected before saving
  const capInputs = new Map();
  const sheetRows = report.sheets.map((s) => {
    const inp = s.key ? h('input', { type: 'text', class: 'inp', value: s.capacity, placeholder: '예: 4 ton' }) : null;
    if (inp) capInputs.set(s.key, inp);
    return h('tr', null,
      h('td', null, s.name),
      h('td', null, inp || h('span', { class: 'muted' }, '보조 윈치 표 없음')),
      h('td', { class: 'muted' }, s.key ? `${s.cells.toLocaleString('en-US')}칸 · 줄걸이 기준 ${fmtTh(report.thresholds[s.key])}` : ''));
  });
  const ok = await dialog('엑셀 가져오기 결과', h('div', { class: 'report' },
    h('label', { class: 'fld' }, h('span', null, '기종명'), nameInp),
    h('table', { class: 'kv' },
      h('tr', null, h('th', null, '표'), h('td', null, `${report.tables}개 · 값 ${report.cells.toLocaleString('en-US')}칸`)),
      h('tr', null, h('th', null, '작업영역'), h('td', null, model.settings.areas.map((a) => a.name).join(' · '))),
      h('tr', null, h('th', null, '아우트리거'), h('td', null, model.settings.outriggers.map((o) => o.name).join(' · '))),
      h('tr', null, h('th', null, '메인 윈치 줄걸이 기준'), h('td', null, `${fmtTh(report.thresholds.main)} (색칠에서 추정)`)),
    ),
    h('div', { class: 'sheet-tbl' },
      h('b', null, '시트별 보조 윈치 (Sub Winch)'),
      h('p', { class: 'muted' }, '시트 하나 = 보조 윈치 용량 하나입니다. 용량은 사용자 화면의 Sub Winch 선택지가 되니 확인해 주세요.'),
      h('table', { class: 'mini' },
        h('thead', null, h('tr', null, h('th', null, '시트'), h('th', null, '보조 윈치 용량'), h('th', null, ''))),
        h('tbody', null, sheetRows))),
    report.warnings.length ? h('div', { class: 'warnbox' }, h('b', null, '주의'), h('ul', null, report.warnings.map((w) => h('li', null, w)))) : null,
    h('p', { class: 'muted' }, '가져온 뒤 초기 설정(문서번호, 유의사항 등)을 확인하세요.'),
  ), [{ label: '취소', value: false }, { label: '저장하고 열기', value: true, kind: 'primary' }]);
  if (!ok) return;
  model.info.name = nameInp.value.trim() || model.info.name;
  for (const [key, inp] of capInputs) if (W[key]) W[key].capacity = inp.value.trim();

  // same model already registered? replace its data (keeping its document info) or add a copy
  const same = (await app.store.list()).find((x) => keyOf(x.info.name) === keyOf(model.info.name));
  if (same) {
    const choice = await dialog('같은 기종이 이미 있습니다',
      h('div', null,
        h('p', null, `'${same.info.name}' (Rev.${same.info.rev || '00'}, 최근 수정 ${fmtDate(same.updatedAt)})이 이미 등록되어 있습니다.`),
        h('ul', null,
          h('li', null, h('b', null, '데이터 교체'), ' — 붐·보조 윈치 설정과 하중 표를 엑셀 값으로 바꿉니다. 문서번호·유의사항 등 문서 정보는 그대로 둡니다.'),
          h('li', null, h('b', null, '새로 추가'), ' — 같은 이름으로 하나 더 만듭니다.'))),
      [{ label: '취소', value: null }, { label: '새로 추가', value: 'add' }, { label: '데이터 교체', value: 'replace', kind: 'primary' }]);
    if (!choice) return;
    if (choice === 'replace') {
      const keepInfo = { ...same.info, name: model.info.name };
      Object.assign(model, { id: same.id, createdAt: same.createdAt, info: keepInfo });
    }
  }
  await app.store.put(model);
  app.go(`#/m/${model.id}/checks`);
}

function exportBackup(m) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  download(new Blob([JSON.stringify(m, null, 1)], { type: 'application/json' }), `${safeName(m.info.name)}_백업_${stamp}.json`);
}

async function importBackup(app) {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  let m;
  try {
    m = JSON.parse(await file.text());
    if (!m || m.schema !== SCHEMA || !m.settings || !m.tables || !m.info) throw new Error('이 도구의 백업 파일이 아닙니다.');
  } catch (e) {
    await dialog('열기 실패', h('p', null, e.message));
    return;
  }
  const existing = await app.store.get(m.id);
  if (existing) {
    const choice = await dialog('같은 기종이 이미 있습니다',
      h('p', null, `'${existing.info.name}' (최근 수정 ${fmtDate(existing.updatedAt)})이 이미 있습니다. 어떻게 할까요?`),
      [{ label: '취소', value: null }, { label: '사본으로 추가', value: 'copy' }, { label: '덮어쓰기', value: 'over', kind: 'danger' }]);
    if (!choice) return;
    if (choice === 'copy') { m.id = uid('m'); m.info.name += ' (백업 사본)'; }
  }
  await app.store.put(m);
  toast(`'${m.info.name}' 백업을 열었습니다.`, 'ok');
  reload(app);
}

async function duplicate(app, m) {
  const c = clone(m);
  c.id = uid('m');
  c.info.name = `${m.info.name} (복사)`;
  c.createdAt = c.updatedAt = new Date().toISOString();
  await app.store.put(c);
  toast('복제했습니다.', 'ok');
  reload(app);
}

async function remove(app, m) {
  const ok = await confirmBox('기종 삭제', h('p', null, `'${m.info.name}'을(를) 이 브라우저에서 삭제합니다. 되돌릴 수 없으니 필요하면 먼저 '백업 저장'을 하세요.`), '삭제', true);
  if (!ok) return;
  await app.store.remove(m.id);
  toast('삭제했습니다.');
  reload(app);
}
