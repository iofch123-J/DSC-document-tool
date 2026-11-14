// 관리자 → 보안관리: 사용자 명단 (사번 · 이름 · 관리자) and the access history.
import { h, clear, toast, dialog, confirmBox, download, pickFile, fmtDate } from './dom.js';
import {
  STAFF, DEFAULT_SUFFIX, LOG_TYPES, securityOn, rosterProblems, parseStaffXlsx, empNo, normEmp, choSeq, describeLog,
} from '../core/security.js';

export async function renderSecurity(app, main, onSaved) {
  const saved = (await app.store.getMeta(STAFF)) || null;
  const work = {
    suffix: saved?.suffix ?? DEFAULT_SUFFIX,
    people: (saved?.people || []).map((p) => ({ ...p })),
    fileName: saved?.fileName || '',
  };
  let dirty = false;

  main.append(h('div', { class: 'page-head' },
    h('div', null,
      h('div', { class: 'sec-kicker' }, 'ADMINISTRATION'),
      h('h1', null, '보안관리'),
      h('p', { class: 'sub' }, '사용자 명단에 있는 사람만 도구에 들어갈 수 있고, 관리자로 지정한 사람만 관리자 화면에 들어갈 수 있습니다. 명단과 이력은 이 브라우저에만 저장됩니다.')),
    h('a', { class: 'btn', href: '#/admin' }, '← 기종 목록')));

  // ---------------------------------------------------------------- roster
  const rosterCard = h('div', { class: 'card sec-card' });
  main.append(rosterCard);

  function setDirty() { dirty = true; paintRoster(); }

  async function importXlsx() {
    const file = await pickFile('.xlsx');
    if (!file) return;
    let res;
    try { res = await parseStaffXlsx(await file.arrayBuffer(), work.suffix); }
    catch (e) { await dialog('명단 가져오기 실패', h('p', null, e.message)); return; }
    const problems = rosterProblems(res.people);
    const ok = await dialog('명단 가져오기', h('div', null,
      h('table', { class: 'kv' },
        h('tr', null, h('th', null, '파일 / 시트'), h('td', null, `${file.name} / ${res.sheet}`)),
        h('tr', null, h('th', null, '인원'), h('td', null, `${res.people.length}명 (관리자 ${res.people.filter((p) => p.admin).length}명)`))),
      h('p', { class: 'muted' }, '지금 명단을 이 파일의 명단으로 바꿉니다. 저장을 눌러야 적용됩니다.'),
      problems.length ? h('div', { class: 'warnbox' }, h('ul', null, problems.map((p) => h('li', null, p)))) : null),
    [{ label: '취소', value: false }, { label: '명단 바꾸기', value: true, kind: 'primary' }]);
    if (!ok) return;
    work.people = res.people;
    work.fileName = file.name;
    setDirty();
  }

  async function save() {
    const problems = rosterProblems(work.people);
    if (problems.length) { await dialog('저장할 수 없습니다', h('ul', null, problems.map((p) => h('li', null, p)))); return; }
    const me = app.session;
    const stillAdmin = work.people.some((p) => me && p.empNo === me.empNo && p.name === me.name && p.admin);
    if (!stillAdmin) {
      const msg = securityOn(saved) && me
        ? `저장하면 ${me.empNo} ${me.name} 님은 관리자 권한이 없어져 이 화면에서 나가게 됩니다.`
        : '저장하면 보안관리가 켜집니다. 이 탭은 진입 화면으로 바뀌니, 관리자로 지정한 사번·이름으로 다시 들어오세요.';
      if (!(await confirmBox('명단 저장', h('p', null, msg), '저장'))) return;
    }
    work.suffix = normEmp(work.suffix) || DEFAULT_SUFFIX;
    await app.store.putMeta(STAFF, { suffix: work.suffix, people: work.people, fileName: work.fileName, updatedAt: new Date().toISOString() });
    dirty = false;
    toast(`사용자 명단을 저장했습니다 (${work.people.length}명).`, 'ok');
    onSaved();
  }

  async function removeAll() {
    if (!(await confirmBox('명단 삭제', h('p', null, '사용자 명단을 지우고 보안관리를 끕니다. 그 뒤로는 누구나 사번 확인 없이 도구와 관리자 화면에 들어갈 수 있습니다. 이력은 그대로 남습니다.'), '명단 삭제', true))) return;
    await app.store.removeMeta(STAFF);
    toast('사용자 명단을 지웠습니다. 보안관리가 꺼졌습니다.');
    onSaved();
  }

  function paintRoster() {
    clear(rosterCard);
    const on = securityOn(saved);
    const admins = work.people.filter((p) => p.admin).length;
    rosterCard.append(h('div', { class: 'pdb-h' },
      h('div', null,
        h('h2', null, '사용자 명단 ', h('span', { class: `chip ${on ? 'ok' : 'warn'}` }, on ? '보안관리 켜짐' : '보안관리 꺼짐')),
        h('p', { class: 'muted' }, '엑셀(개발 DATABASE 파일의 \'사용자\' 시트: 사번 · 이름 · 관리자 권한 O)에서 가져오거나 직접 추가합니다.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: importXlsx }, '엑셀에서 가져오기'),
        on ? h('button', { class: 'btn danger-text', onclick: removeAll }, '명단 삭제') : null)));

    rosterCard.append(h('div', { class: 'pdb-stats' },
      h('div', null, h('b', null, work.people.length), h('span', null, '명')),
      h('div', null, h('b', null, admins), h('span', null, '관리자')),
      h('label', { class: 'sec-suffix' }, h('span', null, '사번 기본 뒷자리'),
        h('input', { class: 'inp', value: work.suffix, maxlength: 6, oninput: (e) => { work.suffix = e.target.value; dirty = true; saveBtn.disabled = false; } }),
        h('small', { class: 'muted' }, '진입 화면에 미리 채워집니다 (예: 26000 + HA)')),
      work.fileName ? h('div', { class: 'pdb-file' }, h('span', null, work.fileName), h('small', null, saved?.updatedAt ? `저장 ${fmtDate(saved.updatedAt)}` : '저장 전')) : null));

    // add one person
    const nNum = h('input', { class: 'inp', placeholder: '사번 (예: 26011)', inputmode: 'text' });
    const nName = h('input', { class: 'inp', placeholder: '이름' });
    const nAdmin = h('input', { type: 'checkbox' });
    const add = () => {
      const raw = nNum.value.trim();
      const emp = /^\d+$/.test(raw) ? empNo(raw, work.suffix) : normEmp(raw);
      const name = nName.value.trim();
      if (!emp || !name) { toast('사번과 이름을 모두 입력하세요.', 'warn'); return; }
      if (work.people.some((p) => p.empNo === emp)) { toast(`사번 ${emp}은(는) 이미 명단에 있습니다.`, 'warn'); return; }
      work.people.push({ empNo: emp, name, admin: nAdmin.checked });
      setDirty();
    };
    rosterCard.append(h('div', { class: 'sec-add' }, nNum, nName,
      h('label', { class: 'chk' }, nAdmin, '관리자'), h('button', { class: 'btn', onclick: add }, '＋ 추가')));

    const rows = [...work.people].map((p, i) => ({ p, i })).sort((a, b) => a.p.empNo.localeCompare(b.p.empNo, 'ko', { numeric: true }));
    rosterCard.append(work.people.length
      ? h('div', { class: 'sec-scroll' }, h('table', { class: 'list sec-table' },
        h('thead', null, h('tr', null, ['사번', '이름', '확인용 초성', '관리자', ''].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map(({ p, i }) => h('tr', null,
          h('td', null, h('b', null, p.empNo)),
          h('td', null, p.name),
          h('td', { class: 'muted' }, choSeq(p.name).join(' ')),   // what this person types at the entry screen
          h('td', null, h('label', { class: 'chk' }, h('input', {
            type: 'checkbox', checked: p.admin ? true : null,
            onchange: (e) => { work.people[i].admin = e.target.checked; setDirty(); },
          }), p.admin ? '관리자' : '')),
          h('td', { class: 'row-actions' }, h('button', { class: 'btn sm danger-text', onclick: () => { work.people.splice(i, 1); setDirty(); } }, '빼기')))))))
      : h('p', { class: 'pdb-empty' }, '명단이 비어 있습니다. 명단이 없으면 보안관리가 꺼져 있어 누구나 들어올 수 있습니다.'));

    const saveBtn = h('button', { class: 'btn primary', disabled: dirty ? null : true, onclick: save }, '명단 저장');
    rosterCard.append(h('div', { class: 'sec-foot' },
      dirty ? h('span', { class: 'chip warn' }, '저장하지 않은 변경') : h('span', { class: 'muted' }, '변경 사항 없음'),
      saveBtn));
  }
  if (app.remote) paintSheetRoster(rosterCard, saved, app);   // web mode: the roster is edited in Google Sheets
  else paintRoster();

  // ---------------------------------------------------------------- history
  const logCard = h('div', { class: 'card sec-card' });
  main.append(logCard);
  const f = { q: '', type: '' };
  let logs = [];

  const fmtT = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const filtered = () => logs.filter((e) => (!f.type || e.type === f.type)
    && (!f.q || [e.empNo, e.name, LOG_TYPES[e.type], describeLog(e)].join(' ').toLowerCase().includes(f.q.toLowerCase())));

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['시각', '사번', '이름', '구분', '내용'].map(esc).join(',')]
      .concat(filtered().map((e) => [fmtT(e.t), e.empNo || '', e.name || '', LOG_TYPES[e.type] || e.type, describeLog(e)].map(esc).join(',')));
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    download(new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `접근이력_${stamp}.csv`);
  }

  async function clearLogs() {
    if (!(await confirmBox('이력 삭제', h('p', null, `이력 ${logs.length}건을 모두 지웁니다. 되돌릴 수 없으니 먼저 CSV로 내려받아 두세요.`), '모두 삭제', true))) return;
    await app.store.clearLogs();
    toast('이력을 지웠습니다.');
    await loadLogs();
  }

  const body = h('div');
  function paintLogs() {
    clear(body);
    const list = filtered();
    const shown = list.slice(0, 300);
    body.append(...[shown.length
      ? h('div', { class: 'sec-scroll tall' }, h('table', { class: 'list sec-table' },
        h('thead', null, h('tr', null, ['시각', '사번', '이름', '구분', '내용'].map((t) => h('th', null, t)))),
        h('tbody', null, shown.map((e) => h('tr', null,
          h('td', { class: 'nowrap' }, fmtT(e.t)),
          h('td', null, e.empNo || h('span', { class: 'muted' }, '—')),
          h('td', null, e.name || h('span', { class: 'muted' }, '—')),
          h('td', null, h('span', { class: `chip log-${e.type}` }, LOG_TYPES[e.type] || e.type)),
          h('td', null, describeLog(e)))))))
      : h('p', { class: 'pdb-empty' }, logs.length ? '조건에 맞는 이력이 없습니다.' : '아직 기록된 이력이 없습니다.'),
    list.length > shown.length ? h('p', { class: 'hint' }, `최근 ${shown.length}건만 표시합니다 (전체 ${list.length}건은 CSV로 내려받으세요).`) : null].filter(Boolean));
  }

  async function loadLogs() {
    logs = (await app.store.listLogs()).sort((a, b) => String(b.t).localeCompare(String(a.t)));
    const today = new Date().toDateString();
    clear(logCard);
    logCard.append(h('div', { class: 'pdb-h' },
      h('div', null, h('h2', null, '이력'),
        h('p', { class: 'muted' }, app.remote
          ? '진입 · 진입 실패 · 종료 · 제품 조회 · PDF 생성이 구글 시트 "이력" 탭에 기록됩니다 (최근 2000건 표시). 탭을 그냥 닫으면 종료는 남지 않습니다.'
          : '진입 · 종료 · 제품 조회 · PDF 생성이 사번·이름과 함께 기록됩니다. 탭을 그냥 닫으면 종료는 남지 않습니다.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: logs.length ? null : true, onclick: exportCsv }, 'CSV 내려받기'),
        app.remote ? null : h('button', { class: 'btn danger-text', disabled: logs.length ? null : true, onclick: clearLogs }, '이력 지우기'))));
    logCard.append(h('div', { class: 'pdb-stats' },
      h('div', null, h('b', null, logs.length), h('span', null, '전체')),
      h('div', null, h('b', null, logs.filter((e) => new Date(e.t).toDateString() === today).length), h('span', null, '오늘')),
      h('div', null, h('b', null, new Set(logs.map((e) => e.empNo).filter(Boolean)).size), h('span', null, '사용자')),
      h('div', null, h('b', null, logs.filter((e) => e.type === 'pdf').length), h('span', null, 'PDF 생성'))));
    logCard.append(h('div', { class: 'sec-filter' },
      h('input', { class: 'inp', type: 'search', placeholder: '사번 · 이름 · 제품 · 제공처로 찾기', value: f.q, oninput: (e) => { f.q = e.target.value; paintLogs(); } }),
      h('select', { class: 'inp', onchange: (e) => { f.type = e.target.value; paintLogs(); } },
        h('option', { value: '' }, '모든 구분'),
        Object.entries(LOG_TYPES).map(([k, v]) => h('option', { value: k, selected: f.type === k ? true : null }, v)))),
    body);
    paintLogs();
  }
  await loadLogs();
}

/** Web mode: the roster comes from the Google Sheet tab '사용자' (read-only here). */
function paintSheetRoster(card, staff, app) {
  const people = [...(staff?.people || [])].sort((a, b) => a.empNo.localeCompare(b.empNo, 'ko', { numeric: true }));
  card.append(h('div', { class: 'pdb-h' },
    h('div', null,
      h('h2', null, '사용자 명단 ', h('span', { class: 'chip ok' }, '구글 시트에서 관리')),
      h('p', { class: 'muted' }, "구글 시트 '사용자' 탭(사번 · 이름 · 관리자 권한 O)을 고치면 1분 안에 반영됩니다. 명단에서 빠진 사람은 다음 요청부터 들어올 수 없습니다.")),
    h('div', { class: 'actions' },
      staff?.sheetUrl ? h('a', { class: 'btn', href: staff.sheetUrl, target: '_blank', rel: 'noopener' }, '구글 시트 열기') : null,
      h('button', { class: 'btn', onclick: () => { app.store.refresh(); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, '새로고침'))));
  card.append(h('div', { class: 'pdb-stats' },
    h('div', null, h('b', null, people.length), h('span', null, '명')),
    h('div', null, h('b', null, people.filter((p) => p.admin).length), h('span', null, '관리자')),
    h('div', null, h('b', null, staff?.suffix || '—'), h('span', null, '사번 기본 뒷자리'))));
  card.append(people.length
    ? h('div', { class: 'sec-scroll' }, h('table', { class: 'list sec-table' },
      h('thead', null, h('tr', null, ['사번', '이름', '확인용 초성', '관리자'].map((t) => h('th', null, t)))),
      h('tbody', null, people.map((p) => h('tr', null,
        h('td', null, h('b', null, p.empNo)),
        h('td', null, p.name),
        h('td', { class: 'muted' }, choSeq(p.name).join(' ')),
        h('td', null, p.admin ? h('span', { class: 'chip who-admin' }, '관리자') : ''))))))
    : h('p', { class: 'pdb-empty' }, "구글 시트 '사용자' 탭에서 명단을 찾지 못했습니다."));
}
